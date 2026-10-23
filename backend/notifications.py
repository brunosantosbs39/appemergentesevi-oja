"""Persistent in-app notifications and optional encrypted Web Push delivery."""
import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

from contextvars import ContextVar
from fastapi import HTTPException, BackgroundTasks
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger("servicoja.notifications")


_request_tasks = ContextVar("notification_background_tasks", default=None)

async def notification_tasks(tasks: BackgroundTasks):
    token = _request_tasks.set(tasks)
    try:
        yield
    finally:
        _request_tasks.reset(token)


def validate_subscription(subscription):
    try:
        parsed = urlparse(subscription.get("endpoint", ""))
        port = parsed.port
        host = parsed.hostname or ""
    except ValueError:
        raise HTTPException(400, "Endereço de notificações inválido")
    allowed = host in {"fcm.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com"} or host.endswith(".push.apple.com") or host.endswith(".notify.windows.com")
    if parsed.scheme != "https" or port not in (None, 443) or parsed.username or parsed.password or not allowed:
        raise HTTPException(400, "Serviço de notificações não suportado")
    import base64
    try:
        keys = subscription["keys"]
        public = base64.urlsafe_b64decode(keys["p256dh"] + "=" * (-len(keys["p256dh"]) % 4))
        auth = base64.urlsafe_b64decode(keys["auth"] + "=" * (-len(keys["auth"]) % 4))
        if len(public) != 65 or public[0] != 4 or len(auth) != 16:
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, "Inscrição de notificações inválida")


async def send_notice(db, user_id, title, body, url):
    """Store first; push-provider failures must never roll back the user action."""
    notice = {"id": str(uuid.uuid4()), "user_id": user_id, "title": title, "body": body[:240],
              "url": url, "read": False, "created_at": datetime.now(timezone.utc).isoformat()}
    try:
        await db.notifications.insert_one(dict(notice))
        if not os.environ.get("VAPID_PRIVATE_KEY"):
            return
        tasks = _request_tasks.get()
        if tasks is not None:
            tasks.add_task(deliver_notice, db, user_id, notice)
        else:
            await deliver_notice(db, user_id, notice)

    except Exception:
        logger.exception("Notification delivery unavailable")


async def deliver_notice(db, user_id, notice):
    """Best-effort Web Push; the durable inbox remains available on failure."""
    title, body, url = notice["title"], notice["body"], notice["url"]
    try:
        subscriptions = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(10)
        async def deliver(record):
            from pywebpush import webpush, WebPushException
            try:
                await run_in_threadpool(webpush, subscription_info=record["subscription"],
                    data=json.dumps({"id": notice["id"], "title": title, "body": body[:240], "url": url}),
                    vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
                    vapid_claims={"sub": os.environ.get("VAPID_SUBJECT", "mailto:bruno.santos.bs39@gmail.com")},
                    ttl=3600, timeout=5)
            except WebPushException as exc:
                if exc.response is not None and exc.response.status_code in (404, 410):
                    await db.push_subscriptions.delete_one({"endpoint": record["endpoint"], "user_id": user_id})
                else:
                    logger.warning("Push provider did not accept notification")
            except Exception:
                logger.warning("Push delivery unavailable")
        await asyncio.gather(*(deliver(s) for s in subscriptions))
    except Exception:
        logger.exception("Push delivery unavailable")
