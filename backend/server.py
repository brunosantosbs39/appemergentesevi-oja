import hashlib
import logging
import math
import os
import re
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Literal, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile, Request, Query, Form
from fastapi.responses import Response, JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

try:  # launched as `backend.server`
    from backend.sandbox_wallet import build_router as wallet_router
    from backend.completion import confirm_completion
    from backend.e2ee import IdentityIn, Envelope, validate_identity, validate_envelope, public_identity
    from backend.clerk_auth import clerk_router, require_user
    from backend.storage import APP_NAME, get_object, init_storage, put_object
    from backend.seed import seed_demo
    from backend.scaling import page_cursor, parse_cursor, write_limit, nearby_pipeline, ReadBurstGuard
    from backend.notifications import send_notice, validate_subscription, notification_tasks
except ModuleNotFoundError:  # launched from inside backend/ as `server`
    from sandbox_wallet import build_router as wallet_router
    from completion import confirm_completion
    from e2ee import IdentityIn, Envelope, validate_identity, validate_envelope, public_identity
    from clerk_auth import clerk_router, require_user
    from storage import APP_NAME, get_object, init_storage, put_object
    from seed import seed_demo
    from scaling import page_cursor, parse_cursor, write_limit, nearby_pipeline, ReadBurstGuard
    from notifications import send_notice, validate_subscription, notification_tasks

mongo_url = os.environ.get("MONGO_URL") or os.environ.get("MONGODB_URI")
if not mongo_url:
    raise RuntimeError("Configure MONGO_URL or MONGODB_URI before starting the API")
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=10000,
    maxPoolSize=int(os.environ.get("MONGO_MAX_POOL_SIZE", "10")), minPoolSize=0,
    maxIdleTimeMS=60000, waitQueueTimeoutMS=5000, connectTimeoutMS=10000)
db = client[os.environ.get("DB_NAME", "servicoja")]

app = FastAPI(title="ServiçoJá API")
read_guard = ReadBurstGuard()

@app.exception_handler(PyMongoError)
async def database_unavailable(request: Request, exc: PyMongoError):
    logger.warning("Database request unavailable: %s", type(exc).__name__)
    return JSONResponse(status_code=503, content={"detail": "Serviço temporariamente ocupado. Tente novamente em instantes."}, headers={"Retry-After": "5"})

api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("servicoja")

CATEGORIES = {"eletricista", "encanador", "pintor", "pedreiro", "marceneiro", "diarista", "jardineiro", "beleza",
              "ti_design", "fotografo", "professor", "mecanico", "montador", "outros"}
STATUS_LABELS = {"pendente": "Pendente", "aceito": "Aceito", "em_andamento": "Em andamento",
                 "concluido": "Concluído", "cancelado": "Cancelado"}
MIME_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
            "image/heic": "heic", "image/heif": "heif"}
MAX_UPLOAD = 4 * 1024 * 1024
PUBLIC = {"_id": 0, "user_id": 1, "name": 1, "role": 1, "avatar": 1, "cover": 1, "headline": 1, "bio": 1, "categories": 1,
          "city": 1, "hourly_rate": 1, "rating_avg": 1, "rating_count": 1, "jobs_done": 1, "created_at": 1, "is_demo": 1, "last_seen": 1}
# who may move a request to each status, and from which statuses
TRANSITIONS = {
    "em_andamento": ("pro", ["aceito"]),
    "concluido": ("pro", ["em_andamento"]),
    "cancelado": ("client", ["pendente", "aceito", "em_andamento"]),
    "pendente": ("pro", ["aceito"]),
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def distance_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return None
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return round(2 * 6371.0 * math.asin(math.sqrt(a)), 2)


def with_presence(doc: dict) -> dict:
    try:
        elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(doc.get("last_seen") or "")).total_seconds()
        doc["is_online"] = 0 <= elapsed <= 75
    except (ValueError, TypeError):
        doc["is_online"] = False
    return doc


# ---------- auth ----------
async def current_member(request: Request, user: dict = Depends(require_user), _notifications=Depends(notification_tasks)) -> dict:
    uid = user["user_id"]
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        await write_limit(db, uid, request.url.path)
    else:
        read_guard.check(uid)
    doc = await db.users.find_one({"user_id": uid}, {"_id": 0})
    if doc is None:
        stub = {"user_id": uid, "name": "", "role": None, "avatar": None, "headline": "", "bio": "", "categories": [],
                "city": "", "lat": None, "lng": None, "hourly_rate": None, "rating_avg": 0.0, "rating_count": 0,
                "jobs_done": 0, "created_at": now_iso()}
        await db.users.update_one({"user_id": uid}, {"$setOnInsert": stub}, upsert=True)
        doc = await db.users.find_one({"user_id": uid}, {"_id": 0})
    return with_presence(doc)


async def onboarded(me: dict = Depends(current_member)) -> dict:
    if not me.get("role"):
        raise HTTPException(403, "Complete seu cadastro primeiro")
    return me


async def users_map(ids) -> dict:
    ids = list({i for i in ids if i})
    if not ids:
        return {}
    docs = await db.users.find({"user_id": {"$in": ids}}, PUBLIC).to_list(1000)
    return {d["user_id"]: with_presence(d) for d in docs}


async def check_image(path: Optional[str], uid: str):
    if not path:
        return None
    if not await db.files.find_one({"storage_path": path, "owner_id": uid, "is_deleted": False, "conversation_id": {"$exists": False}}):
        raise HTTPException(400, "Imagem inválida, envie novamente")
    return path


# ---------- models ----------
class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    role: Optional[Literal["profissional", "contratante", "membro"]] = None
    headline: Optional[str] = Field(None, max_length=120)
    bio: Optional[str] = Field(None, max_length=1000)
    categories: Optional[List[str]] = None
    city: Optional[str] = Field(None, max_length=80)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)
    hourly_rate: Optional[float] = Field(None, ge=0, le=100000)
    cover: Optional[str] = None
    avatar: Optional[str] = None


class PostCreate(BaseModel):
    intent: Optional[Literal["opportunity"]] = None
    kind: Literal["publication", "portfolio"] = "publication"
    expires_at: Optional[datetime] = None
    request_id: Optional[str] = None
    image: str
    caption: str = Field("", max_length=2200)
    category: Optional[str] = None
    location_name: Optional[str] = Field(None, max_length=120)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)


class TextIn(BaseModel):
    client_id: Optional[str] = Field(None, min_length=8, max_length=80)
    text: str = Field(..., min_length=1, max_length=2000)


class ProposalIn(BaseModel):
    description: str = Field(..., min_length=3, max_length=2000)
    amount: float = Field(..., ge=0.01, le=1000000, allow_inf_nan=False)
    deadline: str = Field("", max_length=120)


class ProposalStatusIn(BaseModel):
    status: Literal["accepted", "declined"]


class RequestCreate(BaseModel):
    expires_at: Optional[datetime] = None
    category: str
    title: str = Field(..., min_length=3, max_length=100)
    description: str = Field("", max_length=2000)
    budget: Optional[float] = Field(None, ge=0, le=1000000)
    address: str = Field("", max_length=200)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    image: Optional[str] = None
    target_pro_id: Optional[str] = None


class StatusIn(BaseModel):
    status: Literal["em_andamento", "concluido", "cancelado", "pendente"]


class ReviewIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field("", max_length=500)


class ConversationIn(BaseModel):
    user_id: str
    request_id: Optional[str] = None


def expiration_iso(value):
    if value is None:
        return None
    if value.tzinfo is None:
        raise HTTPException(400, "Informe o fuso horário da validade")
    if value <= datetime.now(timezone.utc):
        raise HTTPException(400, "A validade precisa estar no futuro")
    return value.astimezone(timezone.utc).isoformat()


def vacancy_open_query():
    return {"$or": [{"expires_at": None}, {"expires_at": {"$gt": now_iso()}}]}


class PushSubscriptionIn(BaseModel):
    endpoint: str = Field(..., max_length=4096)
    keys: dict


@api.get("/notifications/config")
async def notification_config(me: dict = Depends(current_member)):
    return {"public_key": os.environ.get("VAPID_PUBLIC_KEY", ""), "enabled": bool(os.environ.get("VAPID_PRIVATE_KEY"))}


@api.get("/notifications")
async def list_notifications(me: dict = Depends(current_member)):
    return await db.notifications.find({"user_id": me["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@api.post("/notifications/{nid}/read")
async def read_notification(nid: str, me: dict = Depends(current_member)):
    await db.notifications.update_one({"id": nid, "user_id": me["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/push/subscriptions")
async def subscribe_push(body: PushSubscriptionIn, me: dict = Depends(current_member)):
    subscription = body.model_dump()
    validate_subscription(subscription)
    await db.push_subscriptions.update_one({"endpoint": body.endpoint}, {"$set": {"endpoint": body.endpoint, "subscription": subscription, "user_id": me["user_id"], "updated_at": now_iso()}}, upsert=True)
    return {"ok": True}


@api.delete("/push/subscriptions")
async def unsubscribe_push(body: PushSubscriptionIn, me: dict = Depends(current_member)):
    await db.push_subscriptions.delete_one({"endpoint": body.endpoint, "user_id": me["user_id"]})
    return {"ok": True}


# ---------- end-to-end identity (public keys + client-encrypted recovery only) ----------
@api.get("/crypto/identity")
async def own_crypto_identity(me: dict = Depends(onboarded)):
    identity = await db.e2ee_identities.find_one({"user_id": me["user_id"]}, {"_id": 0, "proof": 0})
    return {"identity": identity}


@api.post("/crypto/identity")
async def register_crypto_identity(body: IdentityIn, me: dict = Depends(onboarded)):
    uid = me["user_id"]
    key_id = validate_identity(body, uid)
    doc = {"user_id": uid, "public": body.public.model_dump(), "key_id": key_id,
           "backup": body.backup.model_dump(), "created_at": now_iso()}
    record = await db.e2ee_identities.find_one_and_update({"user_id": uid}, {"$setOnInsert": doc},
        upsert=True, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if record["key_id"] != key_id:
        raise HTTPException(409, "Esta conta já tem uma chave. Use o código de recuperação; a chave não será substituída.")
    return public_identity(record)


@api.get("/crypto/users/{uid}")
async def contact_crypto_identity(uid: str, me: dict = Depends(onboarded)):
    if uid != me["user_id"] and not await db.conversations.find_one({"participants": {"$all": [uid, me["user_id"]]}}, {"_id": 1}):
        raise HTTPException(404, "Contato não encontrado")
    identity = await db.e2ee_identities.find_one({"user_id": uid}, {"_id": 0, "backup": 0, "proof": 0})
    return {"identity": public_identity(identity) if identity else None}


# ---------- profile ----------
@api.get("/")
async def root():
    return {"message": "ServiçoJá API"}


@api.get("/me")
async def get_me(me: dict = Depends(current_member)):
    return me


@api.post("/me/presence")
async def heartbeat(me: dict = Depends(current_member)):
    stamp = now_iso()
    await db.users.update_one({"user_id": me["user_id"]}, {"$set": {"last_seen": stamp}})
    return {"is_online": True, "last_seen": stamp}


@api.put("/me")
async def update_me(body: ProfileUpdate, me: dict = Depends(current_member)):
    data = body.model_dump(exclude_unset=True)
    if "categories" in data:
        cats = [c for c in dict.fromkeys(data["categories"] or []) if c in CATEGORIES]
        data["categories"] = cats[:5]
    if data.get("cover"):
        await check_image(data["cover"], me["user_id"])
    if data.get("avatar"):
        await check_image(data["avatar"], me["user_id"])
    # Legacy role values remain readable; all completed profiles have both capabilities.
    data["role"] = "membro"
    if data:
        await db.users.update_one({"user_id": me["user_id"]}, {"$set": data})
    return await db.users.find_one({"user_id": me["user_id"]}, {"_id": 0})


# ---------- files ----------
@api.post("/upload")
async def upload(file: UploadFile = File(...), me: dict = Depends(current_member)):
    ctype = (file.content_type or "").lower()
    if ctype not in MIME_EXT:
        raise HTTPException(400, "Envie apenas imagens")
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(400, "A imagem deve ter até 4 MB")
    path = f"{APP_NAME}/uploads/{me['user_id']}/{new_id()}.{MIME_EXT.get(ctype, 'jpg')}"
    result = await run_in_threadpool(put_object, path, data, ctype)
    await db.files.insert_one({"id": new_id(), "storage_path": result["path"], "owner_id": me["user_id"],
                               "original_filename": file.filename, "content_type": ctype, "size": result.get("size"),
                               "is_deleted": False, "created_at": now_iso()})
    return {"path": result["path"]}


@api.get("/files/{path:path}")
async def download(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not record or record.get("conversation_id"):
        raise HTTPException(404, "Arquivo não encontrado")
    data, ctype = await run_in_threadpool(get_object, path)
    return Response(content=data, media_type=record.get("content_type") or ctype,
                    headers={"Cache-Control": "public, max-age=86400"})


# ---------- professionals & users ----------
@api.get("/professionals")
async def professionals(lat: Optional[float] = Query(None, ge=-90, le=90), lng: Optional[float] = Query(None, ge=-180, le=180), radius_km: float = Query(0, ge=0, le=20000),
                        category: Optional[str] = None, q: Optional[str] = Query(None, max_length=100), sort: str = "distance",
                        limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0, le=10000), me: dict = Depends(onboarded)):
    query = {"role": {"$in": ["profissional", "contratante", "membro"]}, "categories.0": {"$exists": True}, "user_id": {"$ne": me["user_id"]}}
    if category and category != "todos":
        query["categories"] = category
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"headline": rx}]
    pipeline = nearby_pipeline(query, lat, lng, radius_km, sort, limit, offset)
    # Public projection prevents private profile fields from reaching the client.
    pipeline.append({"$project": {**PUBLIC, "lat": 1, "lng": 1, "distance_km": 1}})
    return [with_presence(d) for d in await db.users.aggregate(pipeline, maxTimeMS=5000).to_list(limit)]


@api.get("/users/{uid}")
async def get_user(uid: str, me: dict = Depends(onboarded)):
    doc = await db.users.find_one({"user_id": uid}, {**PUBLIC, "lat": 1, "lng": 1})
    if not doc:
        raise HTTPException(404, "Usuário não encontrado")
    lat, lng = doc.pop("lat", None), doc.pop("lng", None)
    if doc.get("role"):
        doc["distance_km"] = distance_km(me.get("lat"), me.get("lng"), lat, lng)
    doc["posts_count"] = await db.posts.count_documents({"user_id": uid})
    doc["requests_count"] = await db.requests.count_documents({"client_id": uid})
    return with_presence(doc)


@api.get("/users/{uid}/reviews")
async def user_reviews(uid: str, me: dict = Depends(onboarded)):
    items = await db.reviews.find({"to_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(50)
    um = await users_map(r["from_id"] for r in items)
    for r in items:
        r["author"] = um.get(r["from_id"])
    return items


# ---------- posts ----------
async def enrich_posts(posts: list, uid: str) -> list:
    um = await users_map(p["user_id"] for p in posts)
    for p in posts:
        likes = p.pop("likes", []) or []
        p["author"] = um.get(p["user_id"])
        p["likes_count"] = len(likes)
        p["liked"] = uid in likes
    return posts


@api.get("/posts")
async def list_posts(user_id: Optional[str] = None, category: Optional[str] = None, limit: int = 60, kind: Literal["publication", "portfolio"] = "publication",
                     me: dict = Depends(onboarded), before: Optional[str] = None, response: Response = None):
    query = {"kind": "portfolio"} if kind == "portfolio" else {"kind": {"$ne": "portfolio"}, "$and": [vacancy_open_query()]}
    if user_id:
        query["user_id"] = user_id
    if category and category != "todos":
        query["category"] = category
    if before:
        stamp, ident = parse_cursor(before)
        query.setdefault("$and", []).append({"$or": [{"created_at": {"$lt": stamp}}, {"created_at": stamp, "id": {"$lt": ident}}]})
    posts = await db.posts.find(query, {"_id": 0}).sort([("created_at", -1), ("id", -1)]).to_list(max(1, min(limit, 200)))
    if response is not None and len(posts) == max(1, min(limit, 200)):
        response.headers["X-Next-Cursor"] = page_cursor(posts[-1]["created_at"], posts[-1]["id"])
    if kind == "publication":
        linked = [p["request_id"] for p in posts if p.get("request_id")]
        closed = set()
        if linked:
            requests = await db.requests.find({"id": {"$in": linked}}, {"_id": 0, "id": 1, "status": 1, "expires_at": 1, "check_in_at": 1}).to_list(200)
            closed = {r["id"] for r in requests if r.get("check_in_at") or r["status"] in ("concluido", "cancelado") or r.get("expires_at") and r["expires_at"] <= now_iso()}
        posts = [p for p in posts if p.get("request_id") not in closed]
    return await enrich_posts(posts, me["user_id"])


@api.post("/posts")
async def create_post(body: PostCreate, me: dict = Depends(onboarded)):
    await check_image(body.image, me["user_id"])
    if body.category and body.category not in CATEGORIES:
        raise HTTPException(400, "Categoria inválida")
    if body.request_id and not await db.requests.find_one({"id": body.request_id, "client_id": me["user_id"]}):
        raise HTTPException(400, "Escolha uma vaga publicada por você")
    expiry = expiration_iso(body.expires_at) if body.kind == "publication" else None
    doc = {"id": new_id(), "user_id": me["user_id"], **body.model_dump(), "likes": [], "comments_count": 0,
           "created_at": now_iso()}
    doc["expires_at"] = expiry
    await db.posts.insert_one(dict(doc))
    return (await enrich_posts([doc], me["user_id"]))[0]


@api.delete("/posts/{pid}")
async def delete_post(pid: str, me: dict = Depends(onboarded)):
    res = await db.posts.delete_one({"id": pid, "user_id": me["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Postagem não encontrada")
    await db.comments.delete_many({"post_id": pid})
    return {"ok": True}


@api.post("/posts/{pid}/like")
async def toggle_like(pid: str, me: dict = Depends(onboarded)):
    post = await db.posts.find_one({"id": pid}, {"_id": 0, "likes": 1})
    if not post:
        raise HTTPException(404, "Postagem não encontrada")
    liked = me["user_id"] in (post.get("likes") or [])
    op = {"$pull": {"likes": me["user_id"]}} if liked else {"$addToSet": {"likes": me["user_id"]}}
    updated = await db.posts.find_one_and_update({"id": pid}, op, projection={"_id": 0, "likes": 1},
                                                 return_document=ReturnDocument.AFTER)
    return {"liked": not liked, "likes_count": len(updated.get("likes") or [])}


@api.get("/posts/{pid}/comments")
async def list_comments(pid: str, me: dict = Depends(onboarded)):
    items = await db.comments.find({"post_id": pid}, {"_id": 0}).sort("created_at", 1).to_list(500)
    um = await users_map(c["user_id"] for c in items)
    for c in items:
        c["author"] = um.get(c["user_id"])
    return items


@api.post("/posts/{pid}/comments")
async def add_comment(pid: str, body: TextIn, me: dict = Depends(onboarded)):
    text = body.text.strip()[:500]
    if not text:
        raise HTTPException(400, "Comentário vazio")
    if not await db.posts.find_one({"id": pid}, {"_id": 1}):
        raise HTTPException(404, "Postagem não encontrada")
    doc = {"id": new_id(), "post_id": pid, "user_id": me["user_id"], "text": text, "created_at": now_iso()}
    await db.comments.insert_one(dict(doc))
    await db.posts.update_one({"id": pid}, {"$inc": {"comments_count": 1}})
    doc["author"] = (await users_map([me["user_id"]])).get(me["user_id"])
    return doc


# ---------- conversations helpers ----------
async def get_or_create_conversation(a: str, b: str, request_id: Optional[str] = None) -> dict:
    pair = sorted([a, b])
    key = "|".join(pair)
    insert = {"id": new_id(), "pair_key": key, "participants": pair, "last_message": "", "last_at": now_iso(),
              "unread": {}, "created_at": now_iso()}
    update = {"$setOnInsert": insert}
    if request_id:
        update["$set"] = {"request_id": request_id}
    else:
        insert["request_id"] = None
    return await db.conversations.find_one_and_update({"pair_key": key}, update, upsert=True, projection={"_id": 0},
                                                      return_document=ReturnDocument.AFTER)


async def add_message(conv: dict, sender_id: Optional[str], text: str, system: bool = False, **extra) -> dict:
    msg = {"id": new_id(), "conversation_id": conv["id"], "sender_id": sender_id, "text": text, "system": system,
           "created_at": now_iso()}
    msg["updated_at"] = msg["created_at"]
    msg.update(extra)
    await db.messages.insert_one(dict(msg))
    inc = {f"unread.{p}": 1 for p in conv["participants"] if p != sender_id}
    await db.conversations.update_one({"id": conv["id"]}, {"$set": {"last_message": text[:140], "last_at": msg["created_at"]},
                                                           "$inc": inc})
    for participant in conv["participants"]:
        if participant != sender_id:
            title = "Atualização do serviço" if system else "Nova mensagem no ServiçoJá"
            body = text if system else "Você recebeu uma contraproposta." if extra.get("kind") == "proposal" else "Você recebeu uma mensagem de áudio." if extra.get("kind") == "audio" else "Você recebeu uma nova mensagem."
            await send_notice(db, participant, title, body, f"/chat/{conv['id']}")
    return msg


async def notify_request(r: dict, text: str):
    if not r.get("professional_id"):
        return
    conv = await db.conversations.find_one({"pair_key": "|".join(sorted([r["client_id"], r["professional_id"]]))}, {"_id": 0})
    if conv:
        await add_message(conv, None, text, system=True)


# ---------- service requests ----------
async def enrich_requests(items: list, lat=None, lng=None, viewer_id=None) -> list:
    ids = [uid for r in items for uid in (r.get("client_id"), r.get("professional_id"), r.get("target_pro_id"))]
    ids += [a["professional_id"] for r in items if r.get("client_id") == viewer_id for a in r.get("applications", [])]
    um = await users_map(ids)
    for r in items:
        r["is_expired"] = bool(r.get("expires_at") and r["expires_at"] <= now_iso())
        r["client"] = um.get(r.get("client_id"))
        r["professional"] = um.get(r.get("professional_id"))
        r["target_pro"] = um.get(r.get("target_pro_id"))
        r["distance_km"] = distance_km(lat, lng, r.get("lat"), r.get("lng"))
        applications = r.pop("applications", [])
        for application in applications:
            if application["status"] == "pending" and (r["status"] != "pendente" or r["is_expired"]):
                application["status"] = "not_selected"
            if application["status"] == "approved" and r.get("professional_id") != application["professional_id"]:
                application["status"] = "withdrawn"
        r["my_application"] = next((a for a in applications if a["professional_id"] == viewer_id), None)
        if r["client_id"] == viewer_id:
            r["applications"] = [{**a, "professional": um.get(a["professional_id"])} for a in applications]
    return items


@api.post("/requests")
async def create_request(body: RequestCreate, me: dict = Depends(onboarded)):
    if body.category not in CATEGORIES:
        raise HTTPException(400, "Categoria inválida")
    if body.target_pro_id:
        if body.target_pro_id == me["user_id"] or not await db.users.find_one(
                {"user_id": body.target_pro_id, "role": {"$in": ["profissional", "contratante", "membro"]}}, {"_id": 1}):
            raise HTTPException(400, "Profissional inválido")
    await check_image(body.image, me["user_id"])
    doc = {"id": new_id(), "client_id": me["user_id"], "professional_id": None, **body.model_dump(),
           "status": "pendente", "client_reviewed": False, "pro_reviewed": False,
           "created_at": now_iso(), "updated_at": now_iso()}
    doc["title"] = doc["title"].strip()
    doc["expires_at"] = expiration_iso(body.expires_at)
    await db.requests.insert_one(dict(doc))
    return (await enrich_requests([doc], viewer_id=me["user_id"]))[0]


@api.get("/requests/mine")
async def my_requests(me: dict = Depends(onboarded), before: Optional[str] = None, limit: int = 100):
    uid = me["user_id"]
    query = {"$or": [{"client_id": uid}, {"professional_id": uid}, {"applications.professional_id": uid}]}
    if before:
        stamp, ident = parse_cursor(before)
        query["$and"] = [{"$or": [{"created_at": {"$lt": stamp}}, {"created_at": stamp, "id": {"$lt": ident}}]}]
    items = await db.requests.find(query, {"_id": 0}).sort([("created_at", -1), ("id", -1)]).to_list(max(1, min(limit, 100)))
    return await enrich_requests(items, me.get("lat"), me.get("lng"), viewer_id=uid)


@api.get("/requests/available")
async def available_requests(lat: Optional[float] = Query(None, ge=-90, le=90), lng: Optional[float] = Query(None, ge=-180, le=180), radius_km: float = Query(25, ge=0, le=20000),
                             category: Optional[str] = None, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0, le=10000), me: dict = Depends(onboarded)):
    uid = me["user_id"]
    lat = lat if lat is not None else me.get("lat")
    lng = lng if lng is not None else me.get("lng")
    query = {"status": "pendente", "$and": [vacancy_open_query()], "client_id": {"$ne": uid}, "$or": [{"target_pro_id": None}, {"target_pro_id": uid}]}
    if category and category != "todos":
        query["category"] = category
    pipeline = nearby_pipeline(query, lat, lng, radius_km, "distance", limit, offset, target_uid=uid)
    items = await db.requests.aggregate(pipeline, maxTimeMS=5000).to_list(limit)
    return await enrich_requests(items, lat, lng, viewer_id=uid)


@api.get("/requests/{rid}")
async def get_request(rid: str, me: dict = Depends(onboarded)):
    uid = me["user_id"]
    r = await db.requests.find_one({"id": rid}, {"_id": 0})
    visible = r and (uid in (r["client_id"], r.get("professional_id")) or any(a["professional_id"] == uid for a in r.get("applications", [])) or (
        r["status"] == "pendente" and r.get("target_pro_id") in (None, uid)))
    if not visible:
        raise HTTPException(404, "Pedido não encontrado")
    return (await enrich_requests([r], me.get("lat"), me.get("lng"), viewer_id=me["user_id"]))[0]


@api.post("/requests/{rid}/accept")
@api.post("/requests/{rid}/apply")
async def accept_request(rid: str, me: dict = Depends(onboarded)):
    uid = me["user_id"]
    application = {"professional_id": uid, "status": "pending", "applied_at": now_iso()}
    r = await db.requests.find_one_and_update(
        {"id": rid, "status": "pendente", "$and": [vacancy_open_query()], "client_id": {"$ne": uid},
         "$or": [{"target_pro_id": None}, {"target_pro_id": uid}],
         "applications.professional_id": {"$ne": uid}},
        {"$push": {"applications": application}, "$set": {"updated_at": now_iso()}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not r:
        raise HTTPException(409, "Você já se candidatou ou esta vaga não está disponível")
    conv = await get_or_create_conversation(r["client_id"], uid, rid)
    await add_message(conv, None, f"{me.get('name') or 'Um profissional'} se candidatou à vaga \"{r['title']}\". Aguardando aceite do contratante.", system=True)
    return {"request": (await enrich_requests([r], me.get("lat"), me.get("lng"), viewer_id=uid))[0], "conversation_id": conv["id"]}


class ApplicationDecision(BaseModel):
    status: Literal["approved", "declined"]


@api.post("/requests/{rid}/applications/{professional_id}")
async def decide_application(rid: str, professional_id: str, body: ApplicationDecision, me: dict = Depends(onboarded)):
    stamp = now_iso()
    changes = {"applications.$.status": body.status, "applications.$.responded_at": stamp, "updated_at": stamp}
    if body.status == "approved":
        current = await db.requests.find_one({"id": rid, "client_id": me["user_id"]}, {"_id": 0})
        candidate = next((a for a in (current or {}).get("applications", []) if a["professional_id"] == professional_id), {})
        changes["agreed_budget"] = candidate.get("negotiated_budget", (current or {}).get("budget"))
        changes.update({"status": "aceito", "professional_id": professional_id, "accepted_at": stamp, "approved_by": me["user_id"]})
    selection_query = {"id": rid, "$and": [vacancy_open_query()], "client_id": me["user_id"], "status": "pendente",
                       "applications": {"$elemMatch": {"professional_id": professional_id, "status": "pending"}}}
    if body.status == "approved" and current:
        selection_query["updated_at"] = current.get("updated_at")
    r = await db.requests.find_one_and_update(
        selection_query,
        {"$set": changes}, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not r:
        raise HTTPException(409, "Candidatura indisponível ou ação não autorizada")
    conv = await get_or_create_conversation(r["client_id"], professional_id, rid)
    text = "Candidatura aprovada. O profissional poderá fazer check-in ao chegar e check-out ao sair." if body.status == "approved" else "O contratante recusou esta candidatura."
    await add_message(conv, None, text, system=True)
    return (await enrich_requests([r], me.get("lat"), me.get("lng"), viewer_id=me["user_id"]))[0]


@api.post("/requests/{rid}/status")
async def change_status(rid: str, body: StatusIn, me: dict = Depends(onboarded)):
    uid = me["user_id"]
    actor, allowed_from = TRANSITIONS[body.status]
    query = {"id": rid, "status": {"$in": allowed_from}}
    if actor == "pro":
        query["professional_id"] = uid
    elif actor == "client":
        query["client_id"] = uid
    else:
        query["$or"] = [{"client_id": uid}, {"professional_id": uid}]
    stamp = now_iso()
    update = {"status": body.status, "updated_at": stamp}
    before = await db.requests.find_one(query, {"_id": 0})
    if body.status == "em_andamento":
        update.update({"check_in_at": stamp, "check_in_by": uid})
    if body.status == "concluido":
        update.update({"completed_at": stamp, "check_out_at": stamp, "check_out_by": uid})
        if before and before.get("check_in_at"):
            update["service_duration_seconds"] = max(0, int((datetime.fromisoformat(stamp) - datetime.fromisoformat(before["check_in_at"])).total_seconds()))
    if body.status == "pendente":
        update.update({"professional_id": None, "target_pro_id": None})
    r = await db.requests.find_one_and_update(query, {"$set": update}, projection={"_id": 0},
                                              return_document=ReturnDocument.AFTER)
    if not r:
        exists = await db.requests.find_one({"id": rid, "$or": [{"client_id": uid}, {"professional_id": uid}]}, {"_id": 1})
        if not exists:
            raise HTTPException(404, "Pedido não encontrado")
        raise HTTPException(409, "Ação não permitida no status atual do pedido")
    if body.status == "concluido":
        await db.users.update_one({"user_id": r["professional_id"]}, {"$inc": {"jobs_done": 1}})
    if body.status == "pendente":
        await notify_request(before, "O profissional desistiu do pedido. Ele voltou para a fila de pedidos.")
    elif body.status in ("em_andamento", "concluido"):
        event = "Check-in registrado: serviço iniciado" if body.status == "em_andamento" else "Check-out registrado: serviço finalizado"
        await notify_request(r, f"{event}. Horário registrado: {stamp} (UTC). Consulte os detalhes no pedido.")
    else:
        await notify_request(r, f"Status do pedido atualizado: {STATUS_LABELS[body.status]}.")
    return (await enrich_requests([r], me.get("lat"), me.get("lng"), viewer_id=me["user_id"]))[0]


@api.post("/requests/{rid}/review")
async def review_request(rid: str, body: ReviewIn, me: dict = Depends(onboarded)):
    uid = me["user_id"]
    r = await db.requests.find_one({"id": rid, "$or": [{"client_id": uid}, {"professional_id": uid}]}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Pedido não encontrado")
    if r["status"] != "concluido":
        raise HTTPException(409, "Só é possível avaliar serviços concluídos")
    is_client = r["client_id"] == uid
    side = "client_reviewed" if is_client else "pro_reviewed"
    target = r["professional_id"] if is_client else r["client_id"]
    res = await db.requests.update_one({"id": rid, side: False}, {"$set": {side: True}})
    if res.modified_count == 0:
        raise HTTPException(409, "Você já avaliou este serviço")
    review = {"id": new_id(), "request_id": rid, "from_id": uid, "to_id": target, "rating": body.rating,
              "comment": body.comment.strip(), "category": r["category"], "created_at": now_iso()}
    await db.reviews.insert_one(dict(review))
    agg = await db.reviews.aggregate([{"$match": {"to_id": target}},
                                      {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}}]).to_list(1)
    if agg:
        await db.users.update_one({"user_id": target}, {"$set": {"rating_avg": round(agg[0]["avg"], 2),
                                                                 "rating_count": agg[0]["n"]}})
    return review


@api.post("/requests/{rid}/check-in")
async def check_in_service(rid: str, me: dict = Depends(onboarded)):
    return await change_status(rid, StatusIn(status="em_andamento"), me)


@api.post("/requests/{rid}/check-out")
async def check_out_service(rid: str, me: dict = Depends(onboarded)):
    return await change_status(rid, StatusIn(status="concluido"), me)


@api.post("/requests/{rid}/confirm-completion")
async def confirm_service_completion(rid: str, me: dict = Depends(onboarded)):
    result = await confirm_completion(db.requests, rid, me["user_id"], now_iso())
    return (await enrich_requests([result], viewer_id=me["user_id"]))[0]


# ---------- conversations ----------
async def conv_summaries(convs: list, uid: str) -> list:
    um = await users_map(p for c in convs for p in c["participants"] if p != uid)
    rids = [c["request_id"] for c in convs if c.get("request_id")]
    rm = {}
    if rids:
        docs = await db.requests.find({"id": {"$in": rids}}, {"_id": 0, "id": 1, "title": 1, "category": 1,
                                                               "status": 1, "budget": 1, "client_id": 1, "professional_id": 1, "applications": 1, "expires_at": 1}).to_list(1000)
        for doc in docs:
            applications = doc.pop("applications", [])
            doc["my_application"] = next((a for a in applications if a["professional_id"] == uid), None)
        rm = {d["id"]: d for d in docs}
    out = []
    for c in convs:
        other = next((p for p in c["participants"] if p != uid), uid)
        out.append({"id": c["id"], "other": um.get(other) or {"user_id": other, "name": "Usuário"},
                    "last_message": c.get("last_message", ""), "last_at": c.get("last_at"),
                    "other_read_at": (c.get("read_at") or {}).get(other), "other_typing": bool(((c.get("typing_until") or {}).get(other) or "") > now_iso()),
                    "unread": (c.get("unread") or {}).get(uid, 0), "request": rm.get(c.get("request_id"))})
    return out


async def my_conversation(cid: str, uid: str) -> dict:
    conv = await db.conversations.find_one({"id": cid, "participants": uid}, {"_id": 0})
    if not conv:
        raise HTTPException(404, "Conversa não encontrada")
    return conv


@api.get("/conversations")
async def list_conversations(me: dict = Depends(onboarded), before: Optional[str] = None, limit: int = 50):
    query = {"participants": me["user_id"]}
    if before:
        stamp, ident = parse_cursor(before)
        query["$or"] = [{"last_at": {"$lt": stamp}}, {"last_at": stamp, "id": {"$lt": ident}}]
    convs = await db.conversations.find(query, {"_id": 0}).sort([("last_at", -1), ("id", -1)]).to_list(max(1, min(limit, 100)))
    return await conv_summaries(convs, me["user_id"])


@api.get("/conversations/unread-count")
async def unread_count(me: dict = Depends(onboarded)):
    uid = me["user_id"]
    totals = await db.conversations.aggregate([{"$match": {"participants": uid}},
        {"$group": {"_id": None, "count": {"$sum": {"$ifNull": [f"$unread.{uid}", 0]}}}}], maxTimeMS=5000).to_list(1)
    return {"count": totals[0]["count"] if totals else 0}


@api.post("/conversations")
async def start_conversation(body: ConversationIn, me: dict = Depends(onboarded)):
    if body.user_id == me["user_id"]:
        raise HTTPException(400, "Você não pode conversar consigo mesmo")
    if not await db.users.find_one({"user_id": body.user_id}, {"_id": 1}):
        raise HTTPException(404, "Usuário não encontrado")
    request_id = None
    if body.request_id:
        request = await db.requests.find_one({"id": body.request_id}, {"_id": 0})
        uid = me["user_id"]
        visible = request and (uid in (request["client_id"], request.get("professional_id")) or (
            request["status"] == "pendente" and request.get("target_pro_id") in (None, uid)))
        matching_pair = request and (body.user_id == request["client_id"] or (
            uid == request["client_id"] and body.user_id == request.get("professional_id")))
        if not visible or not matching_pair:
            raise HTTPException(404, "Pedido não encontrado para esta conversa")
        request_id = body.request_id
    conv = await get_or_create_conversation(me["user_id"], body.user_id, request_id)
    return {"id": conv["id"]}


@api.get("/conversations/{cid}")
async def get_conversation(cid: str, me: dict = Depends(onboarded)):
    return (await conv_summaries([await my_conversation(cid, me["user_id"])], me["user_id"]))[0]


@api.get("/conversations/{cid}/sync")
async def sync_conversation(cid: str, after: Optional[str] = None, mark_read: bool = True, me: dict = Depends(onboarded)):
    started = now_iso()
    watermark = (datetime.fromisoformat(started) - timedelta(seconds=5)).isoformat()
    uid = me["user_id"]
    conv = await my_conversation(cid, uid)
    more = False
    if after:
        stamp, ident = parse_cursor(after)
        pipeline = [
            {"$match": {"conversation_id": cid, "$or": [{"updated_at": {"$gte": stamp}}, {"created_at": {"$gte": stamp}}]}},
            {"$set": {"_changed": {"$ifNull": ["$updated_at", "$created_at"]}}},
            {"$match": {"$or": [{"_changed": {"$gt": stamp}}, {"_changed": stamp, "id": {"$gt": ident}}]}},
            {"$sort": {"_changed": 1, "id": 1}}, {"$limit": 101}, {"$project": {"_id": 0}}]
        messages = await db.messages.aggregate(pipeline, maxTimeMS=5000).to_list(101)
        more = len(messages) > 100
        messages = messages[:100]
        cursor = page_cursor(messages[-1]["_changed"], messages[-1]["id"]) if more else page_cursor(watermark, "")
        # Never move behind a message observed after this request started.
        if more and messages and messages[-1]["_changed"] >= started:
            cursor = page_cursor(messages[-1]["_changed"], messages[-1]["id"])
        for message in messages:
            message.pop("_changed", None)
    else:
        messages = await db.messages.find({"conversation_id": cid}, {"_id": 0}).sort([("created_at", -1), ("id", -1)]).to_list(50)
        messages.reverse()
        cursor = page_cursor(watermark, "")
    if mark_read and (conv.get("unread") or {}).get(uid, 0):
        # Clear only the snapshot that was actually observed, never a concurrent send.
        seen = max([conv.get("last_at") or started, *(m["created_at"] for m in messages)])
        if not more:
            await db.conversations.update_one({"id": cid, "last_at": conv.get("last_at")},
                {"$set": {f"unread.{uid}": 0}, "$max": {f"read_at.{uid}": seen}})
    summary = (await conv_summaries([conv], uid))[0]
    return {"conversation": summary, "messages": messages, "cursor": cursor, "has_more": more,
            "history_cursor": page_cursor(messages[0]["created_at"], messages[0]["id"]) if messages and not after else None,
            "has_history": not after and len(messages) == 50}


@api.get("/conversations/{cid}/messages")
async def list_messages(cid: str, after: Optional[str] = None, mark_read: bool = True, before: Optional[str] = None, limit: int = 50, me: dict = Depends(onboarded)):
    limit = max(1, min(limit, 100))
    conv = await my_conversation(cid, me["user_id"])
    query = {"conversation_id": cid}
    if after:
        query["created_at"] = {"$gt": after}
    if before:
        stamp, ident = parse_cursor(before)
        query["$or"] = [{"created_at": {"$lt": stamp}}, {"created_at": stamp, "id": {"$lt": ident}}]
    msgs = await db.messages.find(query, {"_id": 0}).sort([("created_at", -1), ("id", -1)]).to_list(limit)
    msgs.reverse()
    if mark_read and not before and (conv.get("unread") or {}).get(me["user_id"], 0):
        # Do not clear a new message that arrived after the conversation snapshot.
        seen = msgs[-1]["created_at"] if msgs else now_iso()
        await db.conversations.update_one({"id": cid, "last_at": conv.get("last_at")},
            {"$set": {f"unread.{me['user_id']}": 0, f"read_at.{me['user_id']}": seen}})
    return msgs


@api.post("/conversations/{cid}/messages")
async def send_message(cid: str, body: TextIn, me: dict = Depends(onboarded)):
    await my_conversation(cid, me["user_id"])
    raise HTTPException(426, "Atualize o app e ative a proteção para enviar mensagens criptografadas.")


async def save_encrypted_message(conv, me, envelope, audio_path=None):
    wire = envelope.model_dump()
    dedupe = {"conversation_id": conv["id"], "sender_id": me["user_id"], "client_id": envelope.header.client_id}
    existing = await db.messages.find_one(dedupe, {"_id": 0})
    if existing:
        if existing.get("e2ee") != wire:
            raise HTTPException(409, "Identificador já usado por outra mensagem")
        return existing
    try:
        is_audio = envelope.header.kind == "audio"
        return await add_message(conv, me["user_id"], "Áudio protegido" if is_audio else "Mensagem protegida",
            kind="encrypted_audio" if is_audio else "encrypted_text", e2ee=wire, client_id=envelope.header.client_id,
            **({"audio_path": audio_path} if audio_path else {}))
    except DuplicateKeyError:
        existing = await db.messages.find_one(dedupe, {"_id": 0})
        if not existing or existing.get("e2ee") != wire:
            raise HTTPException(409, "Identificador já usado por outra mensagem")
        return existing


@api.post("/conversations/{cid}/encrypted-messages")
async def send_encrypted_message(cid: str, body: Envelope, me: dict = Depends(onboarded)):
    conv = await my_conversation(cid, me["user_id"])
    await validate_envelope(db, conv, me["user_id"], body, "text")
    return await save_encrypted_message(conv, me, body)


@api.post("/conversations/{cid}/encrypted-audio")
async def send_encrypted_audio(cid: str, envelope: str = Form(..., max_length=20000), file: UploadFile = File(...), me: dict = Depends(onboarded)):
    conv = await my_conversation(cid, me["user_id"])
    try:
        body = Envelope.model_validate_json(envelope)
    except ValueError:
        raise HTTPException(400, "Mensagem criptografada inválida")
    await validate_envelope(db, conv, me["user_id"], body, "audio")
    existing = await db.messages.find_one({"conversation_id": cid, "sender_id": me["user_id"], "client_id": body.header.client_id}, {"_id": 0})
    if existing:
        if existing.get("e2ee") != body.model_dump():
            raise HTTPException(409, "Identificador já usado por outra mensagem")
        return existing
    data = await file.read(MAX_UPLOAD + 17)
    if len(data) != body.attachment.size or len(data) > MAX_UPLOAD + 16 or hashlib.sha256(data).hexdigest() != body.attachment.sha256:
        raise HTTPException(400, "Áudio criptografado incompleto ou alterado")
    path = f"{APP_NAME}/audio/{me['user_id']}/{new_id()}.encrypted"
    result = await run_in_threadpool(put_object, path, data, "application/octet-stream")
    await db.files.insert_one({"id": new_id(), "storage_path": result["path"], "owner_id": me["user_id"],
        "conversation_id": cid, "content_type": "application/octet-stream", "e2ee": True, "is_deleted": False, "created_at": now_iso()})
    return await save_encrypted_message(conv, me, body, result["path"])


class TypingIn(BaseModel):
    typing: bool


@api.post("/conversations/{cid}/typing")
async def update_typing(cid: str, body: TypingIn, me: dict = Depends(onboarded)):
    await my_conversation(cid, me["user_id"])
    expires = (datetime.now(timezone.utc) + timedelta(seconds=5)).isoformat() if body.typing else ""
    await db.conversations.update_one({"id": cid}, {"$set": {f"typing_until.{me['user_id']}": expires}})
    return {"ok": True}


@api.post("/conversations/{cid}/audio")
async def send_audio(cid: str, file: UploadFile = File(...), me: dict = Depends(onboarded)):
    await my_conversation(cid, me["user_id"])
    raise HTTPException(426, "Atualize o app para enviar áudio com proteção de ponta a ponta.")


@api.get("/conversations/{cid}/messages/{mid}/audio")
async def read_audio(cid: str, mid: str, me: dict = Depends(onboarded)):
    await my_conversation(cid, me["user_id"])
    msg = await db.messages.find_one({"id": mid, "conversation_id": cid, "kind": {"$in": ["audio", "encrypted_audio"]}}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Áudio não encontrado")
    data, content_type = await run_in_threadpool(get_object, msg["audio_path"])
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "private, no-store"})


@api.post("/conversations/{cid}/proposals")
async def send_proposal(cid: str, body: ProposalIn, me: dict = Depends(onboarded)):
    conv = await my_conversation(cid, me["user_id"])
    if len(body.description.strip()) < 3:
        raise HTTPException(400, "Descreva o serviço da proposta")
    if conv.get("request_id"):
        request = await db.requests.find_one({"id": conv["request_id"], "status": "pendente", "$and": [vacancy_open_query()]}, {"_id": 0})
        if not request or request["client_id"] == me["user_id"] or request["client_id"] not in conv["participants"]:
            raise HTTPException(409, "A contraproposta deve ser enviada pelo trabalhador para uma vaga aberta")
    return await add_message(conv, me["user_id"], "Contraproposta de valor", kind="proposal",
                             request_id=conv.get("request_id"), proposal={"description": body.description.strip(), "amount": round(body.amount, 2),
                                       "deadline": body.deadline.strip(), "status": "pending"})


@api.patch("/conversations/{cid}/proposals/{mid}")
async def respond_proposal(cid: str, mid: str, body: ProposalStatusIn, me: dict = Depends(onboarded)):
    await my_conversation(cid, me["user_id"])
    proposal_message = await db.messages.find_one({"id": mid, "conversation_id": cid, "kind": "proposal"}, {"_id": 0})
    if proposal_message and proposal_message.get("request_id") and body.status == "accepted":
        if proposal_message.get("sender_id") == me["user_id"] or proposal_message["proposal"]["status"] != "pending":
            raise HTTPException(409, "Esta contraproposta não pode ser aceita por você")
        rid = proposal_message["request_id"]
        request = await db.requests.find_one({"id": rid, "client_id": me["user_id"], "status": "pendente", "$and": [vacancy_open_query()]}, {"_id": 0})
        if not request:
            raise HTTPException(409, "Apenas o contratante pode aceitar um novo valor enquanto a vaga estiver aberta")
        applicant = proposal_message["sender_id"]
        amount = proposal_message["proposal"]["amount"]
        application = next((a for a in request.get("applications", []) if a["professional_id"] == applicant), None)
        query = {"id": rid, "client_id": me["user_id"], "status": "pendente", "$and": [vacancy_open_query()]}
        if application:
            query["applications"] = {"$elemMatch": {"professional_id": applicant, "status": "pending"}}
            change = {"$set": {"applications.$.negotiated_budget": amount, "updated_at": now_iso()}}
        else:
            query["applications.professional_id"] = {"$ne": applicant}
            change = {"$push": {"applications": {"professional_id": applicant, "status": "pending", "applied_at": now_iso(), "negotiated_budget": amount}}, "$set": {"updated_at": now_iso()}}
        result = await db.requests.update_one(query, change)
        if result.matched_count == 0:
            raise HTTPException(409, "A vaga ou candidatura mudou. Atualize a conversa.")
    msg = await db.messages.find_one_and_update(
        {"id": mid, "conversation_id": cid, "kind": "proposal", "sender_id": {"$ne": me["user_id"]}, "proposal.status": "pending"},
        {"$set": {"proposal.status": body.status, "proposal.responded_at": now_iso(), "proposal.responded_by": me["user_id"], "updated_at": now_iso()}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not msg:
        raise HTTPException(409, "Esta proposta já foi respondida ou não pode ser alterada por você")
    await send_notice(db, msg["sender_id"], "Resposta à contraproposta", "Sua contraproposta foi aceita." if body.status == "accepted" else "Sua contraproposta foi recusada.", f"/chat/{cid}")
    return msg


# Never let identity backups, messages or authenticated responses enter browser/CDN caches.
@app.middleware("http")
async def private_api_cache(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(("/api/crypto/", "/api/conversations", "/api/wallet")):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Vary"] = "Authorization, Cookie"
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response


app.include_router(wallet_router(db, onboarded))
app.include_router(api)
app.include_router(clerk_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Next-Cursor", "Retry-After"],
)


@app.on_event("startup")
async def startup():
    await db.e2ee_identities.create_index("user_id", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.posts.create_index("id", unique=True)
    await db.posts.create_index([("created_at", -1)])
    await db.requests.create_index("id", unique=True)
    await db.conversations.create_index("pair_key", unique=True)
    await db.conversations.create_index("id", unique=True)
    await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
    await db.messages.create_index([("conversation_id", 1), ("sender_id", 1), ("client_id", 1)], unique=True,
                                   partialFilterExpression={"client_id": {"$type": "string"}})
    await db.requests.create_index("applications.professional_id")
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.push_subscriptions.create_index("endpoint", unique=True)
    await db.push_subscriptions.create_index("user_id")
    await db.comments.create_index([("post_id", 1), ("created_at", 1)])
    await db.reviews.create_index("to_id")
    await db.files.create_index("storage_path")
    await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
    await db.users.create_index([("role", 1), ("lat", 1), ("lng", 1)])
    await db.users.create_index([("role", 1), ("categories", 1), ("lat", 1)])
    await db.requests.create_index([("status", 1), ("lat", 1), ("lng", 1)])
    await db.requests.create_index([("client_id", 1), ("created_at", -1)])
    await db.requests.create_index([("professional_id", 1), ("created_at", -1)])
    await db.conversations.create_index([("participants", 1), ("last_at", -1), ("id", -1)])
    await db.messages.create_index([("conversation_id", 1), ("created_at", -1), ("id", -1)])
    await db.messages.create_index([("conversation_id", 1), ("updated_at", 1), ("id", 1)])
    await db.posts.create_index([("user_id", 1), ("kind", 1), ("created_at", -1)])
    await db.posts.create_index([("category", 1), ("created_at", -1)])
    if os.environ.get("SEED_DEMO", "false").lower() == "true":
        await seed_demo(db)
    try:
        await run_in_threadpool(init_storage)
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

