"""Service attestations only: never authorize or move funds."""
from fastapi import HTTPException
from pymongo import ReturnDocument


async def confirm_completion(requests, rid, uid, timestamp):
    party = {"id": rid, "$or": [{"client_id": uid}, {"professional_id": uid}]}
    eligible = {**party, "status": "concluido", "check_out_at": {"$type": "string"},
                "professional_id": {"$type": "string"},
                "$expr": {"$ne": ["$client_id", "$professional_id"]}}
    result = await requests.find_one_and_update(eligible, [
        {"$set": {"completion_confirmations": {"$setUnion": [
            {"$ifNull": ["$completion_confirmations", []]}, {"$literal": [uid]}
        ]}}},
        {"$set": {"completion_confirmed_at": {"$cond": [
            {"$setIsSubset": [["$client_id", "$professional_id"], "$completion_confirmations"]},
            {"$ifNull": ["$completion_confirmed_at", {"$literal": timestamp}]},
            "$$REMOVE"
        ]}}}
    ], projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if result:
        return result
    if not await requests.find_one(party, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Pedido não encontrado")
    raise HTTPException(409, "A confirmação exige um serviço concluído com check-out e duas pessoas distintas")
