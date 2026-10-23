import logging
import math
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Literal, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

try:  # launched as `backend.server`
    from backend.clerk_auth import clerk_router, require_user
    from backend.storage import APP_NAME, get_object, init_storage, put_object
    from backend.seed import seed_demo
except ModuleNotFoundError:  # launched from inside backend/ as `server`
    from clerk_auth import clerk_router, require_user
    from storage import APP_NAME, get_object, init_storage, put_object
    from seed import seed_demo

mongo_url = os.environ.get("MONGO_URL") or os.environ.get("MONGODB_URI")
if not mongo_url:
    raise RuntimeError("Configure MONGO_URL or MONGODB_URI before starting the API")
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=10000)
db = client[os.environ.get("DB_NAME", "servicoja")]

app = FastAPI(title="ServiçoJá API")
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
async def current_member(user: dict = Depends(require_user)) -> dict:
    uid = user["user_id"]
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
    role: Optional[Literal["profissional", "contratante"]] = None
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
    image: str
    caption: str = Field("", max_length=2200)
    category: Optional[str] = None
    location_name: Optional[str] = Field(None, max_length=120)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)


class TextIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class ProposalIn(BaseModel):
    description: str = Field(..., min_length=3, max_length=2000)
    amount: float = Field(..., ge=0.01, le=1000000, allow_inf_nan=False)
    deadline: str = Field("", max_length=120)


class ProposalStatusIn(BaseModel):
    status: Literal["accepted", "declined"]


class RequestCreate(BaseModel):
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
    if not data.get("role") and not me.get("role"):
        raise HTTPException(400, "Escolha se você é Profissional ou Contratante")
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
async def professionals(lat: Optional[float] = None, lng: Optional[float] = None, radius_km: float = 0,
                        category: Optional[str] = None, q: Optional[str] = None, sort: str = "distance",
                        limit: int = 100, me: dict = Depends(onboarded)):
    query = {"role": "profissional", "user_id": {"$ne": me["user_id"]}}
    if category and category != "todos":
        query["categories"] = category
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"headline": rx}]
    docs = [with_presence(d) for d in await db.users.find(query, {**PUBLIC, "lat": 1, "lng": 1}).to_list(1000)]
    for d in docs:
        d["distance_km"] = distance_km(lat, lng, d.get("lat"), d.get("lng"))
    if radius_km > 0 and lat is not None and lng is not None:
        docs = [d for d in docs if d["distance_km"] is not None and d["distance_km"] <= radius_km]
    if sort == "rating":
        docs.sort(key=lambda d: (-(d.get("rating_avg") or 0), -(d.get("rating_count") or 0)))
    else:
        docs.sort(key=lambda d: d["distance_km"] if d["distance_km"] is not None else 1e9)
    return docs[: max(1, min(limit, 200))]


@api.get("/users/{uid}")
async def get_user(uid: str, me: dict = Depends(onboarded)):
    doc = await db.users.find_one({"user_id": uid}, {**PUBLIC, "lat": 1, "lng": 1})
    if not doc:
        raise HTTPException(404, "Usuário não encontrado")
    lat, lng = doc.pop("lat", None), doc.pop("lng", None)
    if doc.get("role") == "profissional":
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
async def list_posts(user_id: Optional[str] = None, category: Optional[str] = None, limit: int = 60,
                     me: dict = Depends(onboarded)):
    query = {}
    if user_id:
        query["user_id"] = user_id
    if category and category != "todos":
        query["category"] = category
    posts = await db.posts.find(query, {"_id": 0}).sort("created_at", -1).to_list(max(1, min(limit, 200)))
    return await enrich_posts(posts, me["user_id"])


@api.post("/posts")
async def create_post(body: PostCreate, me: dict = Depends(onboarded)):
    await check_image(body.image, me["user_id"])
    if body.category and body.category not in CATEGORIES:
        raise HTTPException(400, "Categoria inválida")
    doc = {"id": new_id(), "user_id": me["user_id"], **body.model_dump(), "likes": [], "comments_count": 0,
           "created_at": now_iso()}
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
    msg.update(extra)
    await db.messages.insert_one(dict(msg))
    inc = {f"unread.{p}": 1 for p in conv["participants"] if p != sender_id}
    await db.conversations.update_one({"id": conv["id"]}, {"$set": {"last_message": text[:140], "last_at": msg["created_at"]},
                                                           "$inc": inc})
    return msg


async def notify_request(r: dict, text: str):
    if not r.get("professional_id"):
        return
    conv = await db.conversations.find_one({"pair_key": "|".join(sorted([r["client_id"], r["professional_id"]]))}, {"_id": 0})
    if conv:
        await add_message(conv, None, text, system=True)


# ---------- service requests ----------
async def enrich_requests(items: list, lat=None, lng=None) -> list:
    um = await users_map(x for r in items for x in (r.get("client_id"), r.get("professional_id"), r.get("target_pro_id")))
    for r in items:
        r["client"] = um.get(r.get("client_id"))
        r["professional"] = um.get(r.get("professional_id"))
        r["target_pro"] = um.get(r.get("target_pro_id"))
        r["distance_km"] = distance_km(lat, lng, r.get("lat"), r.get("lng"))
    return items


@api.post("/requests")
async def create_request(body: RequestCreate, me: dict = Depends(onboarded)):
    if me["role"] != "contratante":
        raise HTTPException(403, "Apenas contratantes podem publicar pedidos")
    if body.category not in CATEGORIES:
        raise HTTPException(400, "Categoria inválida")
    if body.target_pro_id:
        if body.target_pro_id == me["user_id"] or not await db.users.find_one(
                {"user_id": body.target_pro_id, "role": "profissional"}, {"_id": 1}):
            raise HTTPException(400, "Profissional inválido")
    await check_image(body.image, me["user_id"])
    doc = {"id": new_id(), "client_id": me["user_id"], "professional_id": None, **body.model_dump(),
           "status": "pendente", "client_reviewed": False, "pro_reviewed": False,
           "created_at": now_iso(), "updated_at": now_iso()}
    doc["title"] = doc["title"].strip()
    await db.requests.insert_one(dict(doc))
    return (await enrich_requests([doc]))[0]


@api.get("/requests/mine")
async def my_requests(me: dict = Depends(onboarded)):
    uid = me["user_id"]
    items = await db.requests.find({"$or": [{"client_id": uid}, {"professional_id": uid}]}, {"_id": 0}) \
        .sort("created_at", -1).to_list(500)
    return await enrich_requests(items, me.get("lat"), me.get("lng"))


@api.get("/requests/available")
async def available_requests(lat: Optional[float] = None, lng: Optional[float] = None, radius_km: float = 25,
                             category: Optional[str] = None, me: dict = Depends(onboarded)):
    if me["role"] != "profissional":
        raise HTTPException(403, "Apenas profissionais podem ver pedidos disponíveis")
    uid = me["user_id"]
    lat = lat if lat is not None else me.get("lat")
    lng = lng if lng is not None else me.get("lng")
    query = {"status": "pendente", "client_id": {"$ne": uid}, "$or": [{"target_pro_id": None}, {"target_pro_id": uid}]}
    if category and category != "todos":
        query["category"] = category
    items = await enrich_requests(await db.requests.find(query, {"_id": 0}).to_list(500), lat, lng)
    if radius_km > 0 and lat is not None:
        items = [r for r in items if r.get("target_pro_id") == uid
                 or (r["distance_km"] is not None and r["distance_km"] <= radius_km)]
    items.sort(key=lambda r: (r.get("target_pro_id") != uid,
                              r["distance_km"] if r["distance_km"] is not None else 1e9))
    return items


@api.get("/requests/{rid}")
async def get_request(rid: str, me: dict = Depends(onboarded)):
    uid = me["user_id"]
    r = await db.requests.find_one({"id": rid}, {"_id": 0})
    visible = r and (uid in (r["client_id"], r.get("professional_id")) or (
        r["status"] == "pendente" and me["role"] == "profissional" and r.get("target_pro_id") in (None, uid)))
    if not visible:
        raise HTTPException(404, "Pedido não encontrado")
    return (await enrich_requests([r], me.get("lat"), me.get("lng")))[0]


@api.post("/requests/{rid}/accept")
async def accept_request(rid: str, me: dict = Depends(onboarded)):
    if me["role"] != "profissional":
        raise HTTPException(403, "Apenas profissionais podem aceitar pedidos")
    uid = me["user_id"]
    r = await db.requests.find_one_and_update(
        {"id": rid, "status": "pendente", "client_id": {"$ne": uid},
         "$or": [{"target_pro_id": None}, {"target_pro_id": uid}]},
        {"$set": {"status": "aceito", "professional_id": uid, "accepted_at": now_iso(), "updated_at": now_iso()}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not r:
        raise HTTPException(409, "Este pedido não está mais disponível")
    conv = await get_or_create_conversation(r["client_id"], uid, rid)
    await add_message(conv, None, f"{me.get('name') or 'O profissional'} aceitou o pedido \"{r['title']}\". Combinem os detalhes por aqui.", system=True)
    return {"request": (await enrich_requests([r], me.get("lat"), me.get("lng")))[0], "conversation_id": conv["id"]}


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
    return (await enrich_requests([r], me.get("lat"), me.get("lng")))[0]


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


# ---------- conversations ----------
async def conv_summaries(convs: list, uid: str) -> list:
    um = await users_map(p for c in convs for p in c["participants"] if p != uid)
    rids = [c["request_id"] for c in convs if c.get("request_id")]
    rm = {}
    if rids:
        docs = await db.requests.find({"id": {"$in": rids}}, {"_id": 0, "id": 1, "title": 1, "category": 1,
                                                               "status": 1, "budget": 1}).to_list(1000)
        rm = {d["id"]: d for d in docs}
    out = []
    for c in convs:
        other = next((p for p in c["participants"] if p != uid), uid)
        out.append({"id": c["id"], "other": um.get(other) or {"user_id": other, "name": "Usuário"},
                    "last_message": c.get("last_message", ""), "last_at": c.get("last_at"),
                    "unread": (c.get("unread") or {}).get(uid, 0), "request": rm.get(c.get("request_id"))})
    return out


async def my_conversation(cid: str, uid: str) -> dict:
    conv = await db.conversations.find_one({"id": cid, "participants": uid}, {"_id": 0})
    if not conv:
        raise HTTPException(404, "Conversa não encontrada")
    return conv


@api.get("/conversations")
async def list_conversations(me: dict = Depends(onboarded)):
    convs = await db.conversations.find({"participants": me["user_id"]}, {"_id": 0}).sort("last_at", -1).to_list(200)
    return await conv_summaries(convs, me["user_id"])


@api.get("/conversations/unread-count")
async def unread_count(me: dict = Depends(onboarded)):
    convs = await db.conversations.find({"participants": me["user_id"]}, {"_id": 0, "unread": 1}).to_list(500)
    return {"count": sum((c.get("unread") or {}).get(me["user_id"], 0) for c in convs)}


@api.post("/conversations")
async def start_conversation(body: ConversationIn, me: dict = Depends(onboarded)):
    if body.user_id == me["user_id"]:
        raise HTTPException(400, "Você não pode conversar consigo mesmo")
    if not await db.users.find_one({"user_id": body.user_id}, {"_id": 1}):
        raise HTTPException(404, "Usuário não encontrado")
    request_id = None
    if body.request_id and await db.requests.find_one(
            {"id": body.request_id, "$or": [{"client_id": me["user_id"]}, {"professional_id": me["user_id"]}]}, {"_id": 1}):
        request_id = body.request_id
    conv = await get_or_create_conversation(me["user_id"], body.user_id, request_id)
    return {"id": conv["id"]}


@api.get("/conversations/{cid}")
async def get_conversation(cid: str, me: dict = Depends(onboarded)):
    return (await conv_summaries([await my_conversation(cid, me["user_id"])], me["user_id"]))[0]


@api.get("/conversations/{cid}/messages")
async def list_messages(cid: str, after: Optional[str] = None, me: dict = Depends(onboarded)):
    conv = await my_conversation(cid, me["user_id"])
    query = {"conversation_id": cid}
    if after:
        query["created_at"] = {"$gt": after}
    msgs = await db.messages.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    msgs.reverse()
    if (conv.get("unread") or {}).get(me["user_id"], 0):
        await db.conversations.update_one({"id": cid}, {"$set": {f"unread.{me['user_id']}": 0}})
    return msgs


@api.post("/conversations/{cid}/messages")
async def send_message(cid: str, body: TextIn, me: dict = Depends(onboarded)):
    conv = await my_conversation(cid, me["user_id"])
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Mensagem vazia")
    return await add_message(conv, me["user_id"], text)


@api.post("/conversations/{cid}/audio")
async def send_audio(cid: str, file: UploadFile = File(...), me: dict = Depends(onboarded)):
    conv = await my_conversation(cid, me["user_id"])
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    formats = {"audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav"}
    if content_type not in formats:
        raise HTTPException(400, "Formato de áudio não suportado")
    data = await file.read(MAX_UPLOAD + 1)
    if not data or len(data) > MAX_UPLOAD:
        raise HTTPException(400, "Envie um áudio de até 4 MB")
    path = f"{APP_NAME}/audio/{me['user_id']}/{new_id()}.{formats[content_type]}"
    result = await run_in_threadpool(put_object, path, data, content_type)
    await db.files.insert_one({"id": new_id(), "storage_path": result["path"], "owner_id": me["user_id"],
                               "conversation_id": cid, "content_type": content_type, "is_deleted": False, "created_at": now_iso()})
    return await add_message(conv, me["user_id"], "Mensagem de áudio", kind="audio", audio_path=result["path"])


@api.get("/conversations/{cid}/messages/{mid}/audio")
async def read_audio(cid: str, mid: str, me: dict = Depends(onboarded)):
    await my_conversation(cid, me["user_id"])
    msg = await db.messages.find_one({"id": mid, "conversation_id": cid, "kind": "audio"}, {"_id": 0})
    if not msg:
        raise HTTPException(404, "Áudio não encontrado")
    data, content_type = await run_in_threadpool(get_object, msg["audio_path"])
    return Response(content=data, media_type=content_type, headers={"Cache-Control": "private, no-store"})


@api.post("/conversations/{cid}/proposals")
async def send_proposal(cid: str, body: ProposalIn, me: dict = Depends(onboarded)):
    conv = await my_conversation(cid, me["user_id"])
    if len(body.description.strip()) < 3:
        raise HTTPException(400, "Descreva o serviço da proposta")
    return await add_message(conv, me["user_id"], "Proposta de serviço", kind="proposal",
                             proposal={"description": body.description.strip(), "amount": round(body.amount, 2),
                                       "deadline": body.deadline.strip(), "status": "pending"})


@api.patch("/conversations/{cid}/proposals/{mid}")
async def respond_proposal(cid: str, mid: str, body: ProposalStatusIn, me: dict = Depends(onboarded)):
    await my_conversation(cid, me["user_id"])
    msg = await db.messages.find_one_and_update(
        {"id": mid, "conversation_id": cid, "kind": "proposal", "sender_id": {"$ne": me["user_id"]}, "proposal.status": "pending"},
        {"$set": {"proposal.status": body.status, "proposal.responded_at": now_iso(), "proposal.responded_by": me["user_id"]}},
        projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not msg:
        raise HTTPException(409, "Esta proposta já foi respondida ou não pode ser alterada por você")
    return msg


app.include_router(api)
app.include_router(clerk_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("user_id", unique=True)
    await db.posts.create_index("id", unique=True)
    await db.posts.create_index([("created_at", -1)])
    await db.requests.create_index("id", unique=True)
    await db.conversations.create_index("pair_key", unique=True)
    await db.conversations.create_index("id", unique=True)
    await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
    await db.comments.create_index([("post_id", 1), ("created_at", 1)])
    await db.reviews.create_index("to_id")
    await db.files.create_index("storage_path")
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
