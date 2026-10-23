"""Bounded queries and shared write limits, compatible with existing coordinates."""
import base64
import json
import math
import time
from datetime import datetime, timezone
from fastapi import HTTPException
from pymongo import ReturnDocument


def page_cursor(stamp, ident):
    return base64.urlsafe_b64encode(json.dumps([stamp, ident], separators=(",", ":")).encode()).decode()


def parse_cursor(value):
    try:
        if not isinstance(value, str) or len(value) > 512:
            raise ValueError()
        stamp, ident = json.loads(base64.urlsafe_b64decode(value.encode()))
        if not isinstance(stamp, str) or not isinstance(ident, str) or len(value) > 512:
            raise ValueError()
        datetime.fromisoformat(stamp)
        return stamp, ident
    except (ValueError, TypeError, KeyError, UnicodeError, AttributeError):
        raise HTTPException(400, "Cursor de paginação inválido")


async def write_limit(db, uid, path):
    """Atomic per-account budgets shared by every serverless instance."""
    if path.endswith("/typing"):
        bucket, maximum = "typing", 60
    elif path.endswith("/presence"):
        bucket, maximum = "presence", 12
    elif path.endswith(("/audio", "/encrypted-audio", "/upload")):
        bucket, maximum = "uploads", 12
    elif path.endswith(("/messages", "/encrypted-messages")):
        bucket, maximum = "messages", 60
    else:
        bucket, maximum = "actions", 60
    epoch = int(time.time())
    window = epoch // 60
    result = await db.rate_limits.find_one_and_update(
        {"_id": f"{uid}:{bucket}:{window}"},
        {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": datetime.fromtimestamp((window + 2) * 60, timezone.utc)}},
        upsert=True, return_document=ReturnDocument.AFTER)
    if result["count"] > maximum:
        raise HTTPException(429, "Muitas tentativas. Aguarde um momento e tente novamente.", headers={"Retry-After": str(60 - epoch % 60)})


def nearby_pipeline(query, lat, lng, radius, sort, limit, offset=0, target_uid=None):
    """Filter using indexed latitude/longitude; calculate and sort BEFORE paging.

    Works with existing profiles, without a destructive GeoJSON backfill.
    Handles the antimeridian and poles, using exact spherical distance.
    """
    pipeline = []
    if lat is not None and lng is not None:
        spatial = {"lat": {"$gte": -90, "$lte": 90}, "lng": {"$gte": -180, "$lte": 180}}
        if radius > 0:
            delta = math.degrees(radius / 6371)
            low, high = max(-90, lat - delta), min(90, lat + delta)
            spatial["lat"] = {"$gte": low, "$lte": high}
            if low > -90 and high < 90:
                width = math.degrees(math.asin(min(1, math.sin(radius / 6371) / math.cos(math.radians(lat))))) if radius < 10000 else 180
                left, right = lng - width, lng + width
                if left < -180:
                    spatial["$or"] = [{"lng": {"$gte": left + 360}}, {"lng": {"$lte": right}}]
                elif right > 180:
                    spatial["$or"] = [{"lng": {"$gte": left}}, {"lng": {"$lte": right - 360}}]
                else:
                    spatial["lng"] = {"$gte": left, "$lte": right}
        match = {"$and": [query, {"$or": [spatial, {"target_pro_id": target_uid}]} if target_uid else spatial]} if radius > 0 else query
        pipeline.append({"$match": match})
        phi = {"$degreesToRadians": "$lat"}
        theta = {"$degreesToRadians": {"$subtract": ["$lng", lng]}}
        cosine = {"$add": [{"$multiply": [math.sin(math.radians(lat)), {"$sin": phi}]}, {"$multiply": [math.cos(math.radians(lat)), {"$cos": phi}, {"$cos": theta}]}]}
        pipeline.append({"$set": {"distance_km": {"$cond": [{"$and": [{"$isNumber": "$lat"}, {"$isNumber": "$lng"}]}, {"$multiply": [6371, {"$acos": {"$min": [1, {"$max": [-1, cosine]}]}}]}, None]}}})
        if radius > 0:
            within = {"distance_km": {"$ne": None, "$lte": radius}}
            pipeline.append({"$match": {"$or": [within, {"target_pro_id": target_uid}]} if target_uid else within})
    else:
        pipeline.extend([{"$match": query}, {"$set": {"distance_km": None}}])
    pipeline.append({"$set": {"_distance": {"$ifNull": ["$distance_km", 1e20]}, "_direct": {"$cond": [{"$eq": ["$target_pro_id", target_uid]}, 0, 1]} if target_uid else 1}})
    ordering = {"rating_avg": -1, "rating_count": -1, "user_id": 1} if sort == "rating" else {"_direct": 1, "_distance": 1, "created_at": -1, "id": 1, "user_id": 1}
    pipeline.extend([{"$sort": ordering}, {"$skip": offset}, {"$limit": limit}, {"$project": {"_id": 0, "_distance": 0, "_direct": 0}}])
    return pipeline


class ReadBurstGuard:
    """Bounded, per-instance read burst guard; writes use shared Mongo counters."""
    def __init__(self, maximum=180, capacity=10000):
        self.maximum, self.capacity = maximum, capacity
        self.windows = {}

    def check(self, uid):
        now = int(time.monotonic())
        window = now // 60
        previous, count = self.windows.get(uid, (window, 0))
        count = count + 1 if previous == window else 1
        if len(self.windows) >= self.capacity and uid not in self.windows:
            self.windows = {key: value for key, value in self.windows.items() if value[0] == window}
            if len(self.windows) >= self.capacity:
                raise HTTPException(429, "Servidor ocupado. Tente novamente em instantes.", headers={"Retry-After": "10"})
        self.windows[uid] = (window, count)
        if count > self.maximum:
            raise HTTPException(429, "Muitas consultas. Aguarde um momento.", headers={"Retry-After": str(60 - now % 60)})
