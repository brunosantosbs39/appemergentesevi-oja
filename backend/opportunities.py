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

async def notify_opportunity(db, request):
    pipeline = recipient_pipeline(request)
    if pipeline is None:
        return
    try:
        async for user in db.users.aggregate(pipeline, maxTimeMS=15000):
            # A delayed task must not notify about a closed or expired vacancy.
            from datetime import datetime, timezone
            current = await db.requests.find_one({"id": request["id"], "status": "pendente",
                "$or": [{"expires_at": None}, {"expires_at": {"$gt": datetime.now(timezone.utc).isoformat()}}]}, {"_id": 1})
            if not current:
                return
            distance = user.get("distance_km")
            proximity = f" a {distance:.1f} km" if distance is not None else ""
            await send_notice(db, user["user_id"], "Novo pedido na sua área",
                f'{request["title"]}{proximity}. Candidate-se no feed; o contratante escolhe quem será contratado.',
                "/feed", dedup_key=f'opportunity:{request["id"]}:{user["user_id"]}')
    except Exception:
        logger.exception("Opportunity notification delivery unavailable")
