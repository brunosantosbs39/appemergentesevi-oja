"""Category-matched local opportunity alerts. No automatic hiring."""
import logging
import math
try:
    from backend.scaling import nearby_pipeline
    from backend.notifications import send_notice
except ModuleNotFoundError:
    from scaling import nearby_pipeline
    from notifications import send_notice

logger = logging.getLogger(__name__)
RADIUS_KM = 25

def recipient_pipeline(request):
    lat, lng = request.get("lat"), request.get("lng")
    if not all(isinstance(v, (float, int)) and not isinstance(v, bool) and math.isfinite(v) for v in (lat, lng)):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    query = {"user_id": {"$ne": request["client_id"]},
             "categories": request["category"],
             "role": {"$in": ["profissional", "contratante", "membro"]}}
    if request.get("target_pro_id"):
        query["user_id"] = {"$eq": request["target_pro_id"], "$ne": request["client_id"]}
    pipeline = nearby_pipeline(query, lat, lng, RADIUS_KM, "distance", 100)
    # Stream every local match in distance order, without truncating recipients.
    return [stage for stage in pipeline if "$skip" not in stage and "$limit" not in stage]

async def opportunity_batch(db, request):
    from datetime import datetime, timezone
    pipeline = recipient_pipeline(request)
    if pipeline is None or request["status"] != "pendente" or (
        request.get("expires_at") and request["expires_at"] <= datetime.now(timezone.utc).isoformat()):
        return True, {}
    job = request.get("alert_job", {})
    # Stable distance/user ordering; no OFFSET or ever-growing recipient arrays.
    pipeline = [stage for stage in pipeline if "$sort" not in stage]
    cursor = job.get("cursor")
    if cursor:
        pipeline.append({"$match": {"$or": [{"distance_km": {"$gt": cursor[0]}},
            {"distance_km": cursor[0], "user_id": {"$gt": cursor[1]}}]}})
    pipeline.extend([{"$sort": {"distance_km": 1, "user_id": 1}}, {"$limit": 51},
                     {"$project": {"user_id": 1, "distance_km": 1}}])
    users = await db.users.aggregate(pipeline, maxTimeMS=5000).to_list(51)
    for user in users[:50]:
        distance = user.get("distance_km")
        proximity = f" a {distance:.1f} km" if distance is not None else ""
        await send_notice(db, user["user_id"], "Novo pedido na sua área",
            f'{request["title"]}{proximity}. Candidate-se no feed; o contratante escolhe quem será contratado.',
            "/feed", dedup_key=f'opportunity:{request["id"]}:{user["user_id"]}', strict=True)
    return len(users) <= 50, ({"cursor": [users[49]["distance_km"], users[49]["user_id"]]} if len(users) > 50 else {})

async def notify_opportunity(db, request):
    # Compatibility entry point; new requests persist this state atomically.
    try:
        from backend.jobs import pending, safe_drain
    except ModuleNotFoundError:
        from jobs import pending, safe_drain
    await db.requests.update_one({"id": request["id"], "alert_job": {"$exists": False}},
        {"$set": {"alert_job": pending()}})
    await safe_drain(db)
