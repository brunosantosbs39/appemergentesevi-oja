"""Mongo-backed bounded work. Leases survive instance death; cron or traffic resumes."""
import asyncio
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

log = logging.getLogger(__name__)
def now():
    return datetime.now(timezone.utc)

def pending():
    return {"state": "ready", "available_at": now(), "attempts": 0}

async def indexes(db):
    for name, field in (("requests", "alert_job"), ("notifications", "delivery"), ("pix_deposits", "sync_job")):
        await db[name].create_index([(field + ".state", 1), (field + ".available_at", 1)])
        await db[name].create_index([(field + ".state", 1), (field + ".lease_until", 1)])

async def claim(collection, field):
    token = uuid4().hex
    doc = await collection.find_one_and_update(
        {"$or": [{field + ".state": "ready", field + ".available_at": {"$lte": now()}},
                 {field + ".state": "running", field + ".lease_until": {"$lte": now()}}]},
        {"$set": {field + ".state": "running", field + ".token": token,
                  field + ".lease_until": now() + timedelta(seconds=90)}},
        sort=[(field + ".available_at", 1), ("_id", 1)], return_document=ReturnDocument.AFTER)
    return doc

async def process_one(db, name, field, handler):
    collection = db[name]
    doc = await claim(collection, field)
    if not doc:
        return False
    job = doc[field]
    fence = {"_id": doc["_id"], field + ".state": "running", field + ".token": job["token"]}
    try:
        async with asyncio.timeout(20):
            done, checkpoint = await handler(db, doc)
        update = {field + ".state": "done" if done else "ready",
                  field + ".attempts": 0, field + ".available_at": now() + timedelta(seconds=30),
                  field + ".updated_at": now()}
        update.update({field + "." + k: v for k, v in checkpoint.items()})
        await collection.update_one(fence, {"$set": update, "$unset": {field + ".last_error": ""}})
    except Exception as error:
        attempts = job.get("attempts", 0) + 1
        await collection.update_one(fence, {"$set": {
            field + ".state": "failed" if attempts >= 12 else "ready",
            field + ".attempts": attempts,
            field + ".available_at": now() + timedelta(seconds=min(3600, 15 * 2 ** min(attempts, 8))),
            field + ".last_error": type(error).__name__, field + ".updated_at": now()}})
        log.warning("Job retry scheduled: %s %s", name, type(error).__name__)
    return True

async def reconcile_job(db, doc):
    try:
        from backend import production_wallet as wallet
    except ModuleNotFoundError:
        import production_wallet as wallet
    if not wallet.enabled():
        raise RuntimeError("PaymentsNotConfigured")
    await wallet.reconcile(db, doc["_id"])
    latest = await db.pix_deposits.find_one({"_id": doc["_id"]})
    return latest["status"] in ("paid", "failed", "expired"), {}

async def drain(db, maximum=6):
    # Shared gate prevents one worker per polling request. No secret or personal
    # data in logs; the actual work retains per-item leases and fencing tokens.
    try:
        await db.job_control.insert_one({"_id": "drain", "next_at": now()})
    except DuplicateKeyError:
        pass
    token = uuid4().hex
    lease = await db.job_control.find_one_and_update(
        {"_id": "drain", "next_at": {"$lte": now()}},
        {"$set": {"next_at": now() + timedelta(seconds=150), "token": token}},
        return_document=ReturnDocument.AFTER)
    if not lease:
        return {"processed": 0}
    try:
        try:
            from backend.opportunities import opportunity_batch
            from backend.notifications import push_job
        except ModuleNotFoundError:
            from opportunities import opportunity_batch
            from notifications import push_job
        processed = 0
        # Round robin: fan-out cannot starve push or payment reconciliation.
        handlers = [("requests", "alert_job", opportunity_batch),
                    ("notifications", "delivery", push_job),
                    ("pix_deposits", "sync_job", reconcile_job)]
        for _ in range(maximum // 3):
            for args in handlers:
                processed += int(await process_one(db, *args))
        return {"processed": processed}
    finally:
        await db.job_control.update_one({"_id": "drain", "token": token},
            {"$set": {"next_at": now() + timedelta(seconds=5)}})

async def safe_drain(db):
    try:
        return await drain(db)
    except Exception:
        log.exception("Work remains persisted; worker temporarily unavailable")

def build_router(db):
    router = APIRouter()
    @router.get("/api/internal/jobs")
    async def scheduled(request: Request):
        secret = os.environ.get("CRON_SECRET", "")
        supplied = request.headers.get("authorization", "")
        if not secret or len(secret) < 32 or not secrets.compare_digest(supplied, "Bearer " + secret):
            raise HTTPException(401, "Não autorizado")
        return await drain(db)
    return router
