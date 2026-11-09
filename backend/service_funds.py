from uuid import uuid4
from fastapi import HTTPException
from pymongo import ReturnDocument


async def change_balance(db, uid, delta, session):
    if not delta:
        return
    query = {"_id": uid}
    if delta < 0:
        query["available_cents"] = {"$gte": -delta}
    result = await db.pix_balances.update_one(query, {"$inc": {"available_cents": delta}},
                                              upsert=delta > 0, session=session)
    if delta < 0 and not result.modified_count:
        raise HTTPException(409, "Adicione saldo à carteira para aprovar esta candidatura.")


async def entry(db, fund, kind, uid, amount, timestamp, session):
    await db.pix_ledger.insert_one({"_id": fund["id"] + ":" + kind, "user_id": uid,
        "request_id": fund["request_id"], "kind": kind, "amount_cents": amount,
        "counter_amount_cents": -amount, "created_at": timestamp}, session=session)


async def approve(db, query, changes, gross, net, timestamp):
    if gross <= 0 or not 0 <= net <= gross:
        raise HTTPException(409, "Combine o valor pelo chat antes de aprovar a candidatura.")
    fund = {"id": str(uuid4()), "request_id": query["id"], "gross": gross, "net": net, "status": "reserved"}
    async def reserve(session):
        result = await db.requests.find_one_and_update(query, {"$set": {**changes, "service_fund": fund}},
            projection={"_id": 0}, return_document=ReturnDocument.AFTER, session=session)
        if not result:
            raise HTTPException(409, "A candidatura mudou. Atualize os pedidos.")
        uid = result["client_id"]
        if await db.pix_deposits.find_one({"user_id": uid, "status": "review",
                "credited_cents": {"$exists": True}}, session=session):
            raise HTTPException(409, "Aguarde a revisão do saldo antes de reservar.")
        await change_balance(db, uid, -gross, session)
        await entry(db, fund, "service_reserve", uid, -gross, timestamp, session)
        return result
    async with await db.client.start_session() as session:
        return await session.with_transaction(reserve)


async def refund(db, query, changes, timestamp):
    async def reverse(session):
        result = await db.requests.find_one_and_update({**query, "service_fund.status": "reserved"},
            {"$set": {**changes, "service_fund.status": "refunded"}, "$unset": {"agreed_net_cents":"", "agreed_budget":""}},
            projection={"_id":0}, return_document=ReturnDocument.AFTER, session=session)
        if result:
            fund = result["service_fund"]
            await change_balance(db, result["client_id"], fund["gross"], session)
            await entry(db, fund, "service_refund", result["client_id"], fund["gross"], timestamp, session)
        return result
    async with await db.client.start_session() as session:
        return await session.with_transaction(reverse)


async def settle(db, rid, uid, timestamp, confirm):
    async def finish(session):
        result = await confirm(db.requests, rid, uid, timestamp, session=session)
        fund = result.get("service_fund", {})
        if result.get("completion_confirmed_at") and fund.get("status") == "reserved":
            pro = result["professional_id"]
            await change_balance(db, pro, fund["net"], session)
            await entry(db, fund, "service_income", pro, fund["net"], timestamp, session)
            await entry(db, fund, "platform_commission", None, fund["gross"] - fund["net"], timestamp, session)
            await db.requests.update_one({"id": rid}, {"$set": {"service_fund.status":"released"}}, session=session)
            fund["status"] = "released"
        return result
    async with await db.client.start_session() as session:
        return await session.with_transaction(finish)
