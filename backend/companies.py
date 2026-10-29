"""Owner-scoped companies, branches and daily workforce expense reporting."""
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

class CompanyIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
class BranchIn(CompanyIn):
    city: str = Field(default="", max_length=100)
class DailyIn(BaseModel):
    branch_id: Optional[str] = None
    worker: str = Field(min_length=2, max_length=100)
    service_date: date
    daily_cents: int = Field(strict=True, ge=1, le=100000000)
    days: int = Field(strict=True, ge=1, le=366)
    status: Literal["planned", "completed", "paid"] = "planned"
    note: str = Field(default="", max_length=500)
    idempotency_key: str = Field(min_length=16, max_length=80, pattern=r"^[a-zA-Z0-9-]+$")
class DailyStatus(BaseModel):
    status: Literal["planned", "completed", "paid", "cancelled"]

async def owned(db, company_id, uid, branch_id=None):
    company = await db.companies.find_one({"_id": company_id, "owner_id": uid})
    if not company:
        raise HTTPException(404, "Empresa não encontrada")
    if branch_id and not await db.company_branches.find_one({"_id": branch_id, "company_id": company_id, "owner_id": uid}):
        raise HTTPException(404, "Filial não encontrada nesta empresa")
    return company

def totals(rows):
    result = {"planned_cents": 0, "completed_cents": 0, "paid_manual_cents": 0, "cancelled_cents": 0}
    for row in rows:
        key = {"planned":"planned_cents", "completed":"completed_cents", "paid":"paid_manual_cents", "cancelled":"cancelled_cents"}[row["status"]]
        result[key] += row["amount_cents"]
    return result

def request_row(r):
    status = "cancelled" if r["status"] == "cancelado" else "completed" if r["status"] == "concluido" else "planned"
    return {"id":r["id"], "source":"request", "branch_id":r.get("branch_id"), "worker":r.get("title", "Pedido"),
        "service_date":r.get("service_date") or r["created_at"][:10], "days":r.get("daily_count", 1),
        "amount_cents":int((Decimal(str(r.get("budget") or 0))*100).quantize(Decimal("1"))),
        "unpriced":r.get("budget") is None, "status":status}

def build_router(db, onboarded):
    router=APIRouter(prefix="/api/companies")
    @router.get("")
    async def listing(me=Depends(onboarded)):
        companies=await db.companies.find({"owner_id":me["user_id"]}).sort("name",1).to_list(201)
        branches=await db.company_branches.find({"owner_id":me["user_id"]}).sort("name",1).to_list(2001)
        return {"companies":[{**c,"id":c["_id"]} for c in companies[:200]],
                "branches":[{**b,"id":b["_id"]} for b in branches[:2000]]}

    @router.post("")
    async def create(body:CompanyIn, me=Depends(onboarded)):
        name=body.name.strip()
        if len(name)<2: raise HTTPException(400,"Informe o nome da empresa")
        doc={"_id":str(uuid4()),"owner_id":me["user_id"],"name":name,"created_at":datetime.now(timezone.utc).isoformat()}
        await db.companies.insert_one(dict(doc))
        return {**doc,"id":doc["_id"]}

    @router.post("/{cid}/branches")
    async def branch(cid:str, body:BranchIn, me=Depends(onboarded)):
        await owned(db,cid,me["user_id"])
        if len(body.name.strip())<2: raise HTTPException(400,"Informe o nome da filial")
        doc={"_id":str(uuid4()),"company_id":cid,"owner_id":me["user_id"],"name":body.name.strip(),"city":body.city.strip()}
        await db.company_branches.insert_one(dict(doc))
        return {**doc,"id":doc["_id"]}

    @router.post("/{cid}/daily")
    async def daily(cid:str, body:DailyIn, me=Depends(onboarded)):
        await owned(db,cid,me["user_id"],body.branch_id)
        if len(body.worker.strip())<2: raise HTTPException(400,"Informe o trabalhador")
        data=body.model_dump(exclude={"idempotency_key"})
        data["service_date"]=body.service_date.isoformat()
        data["worker"]=body.worker.strip()
        ident=me["user_id"]+":"+body.idempotency_key
        old=await db.company_daily.find_one({"_id":ident})
        if old:
            if old["company_id"]!=cid or old["original"]!=data: raise HTTPException(409,"Solicitação já utilizada")
            return {"id":old["_id"]}
        doc={**data,"_id":ident,"original":data,"company_id":cid,"owner_id":me["user_id"],
             "amount_cents":body.daily_cents*body.days,"source":"manual","created_at":datetime.now(timezone.utc).isoformat()}
        try: await db.company_daily.insert_one(doc)
        except DuplicateKeyError:
            old=await db.company_daily.find_one({"_id":ident})
            if old["company_id"]!=cid or old["original"]!=data: raise HTTPException(409,"Solicitação já utilizada")
        return {"id":ident}

    @router.patch("/{cid}/daily/{did}")
    async def change(cid:str,did:str,body:DailyStatus,me=Depends(onboarded)):
        await owned(db,cid,me["user_id"])
        result=await db.company_daily.update_one({"_id":did,"company_id":cid,"owner_id":me["user_id"]},
            {"$set":{"status":body.status,"updated_at":datetime.now(timezone.utc).isoformat()}})
        if not result.matched_count: raise HTTPException(404,"Lançamento não encontrado")
        return {"ok":True}

    @router.get("/{cid}/dashboard")
    async def dashboard(cid:str,start:date,end:date,branch_id:Optional[str]=None,me=Depends(onboarded)):
        await owned(db,cid,me["user_id"],branch_id)
        if end<start or (end-start).days>366: raise HTTPException(400,"Escolha um período de até 367 dias")
        base={"company_id":cid,"owner_id":me["user_id"]}
        rq={"company_id":cid,"client_id":me["user_id"]}
        if branch_id:
            base["branch_id"]=branch_id;rq["branch_id"]=branch_id
        base["service_date"]={"$gte":start.isoformat(),"$lte":end.isoformat()}
        rq["$or"]=[{"service_date":{"$gte":start.isoformat(),"$lte":end.isoformat()}},
            {"service_date":None,"created_at":{"$gte":start.isoformat(),"$lt":end.isoformat()+"T99"}}]
        manual=await db.company_daily.find(base).sort("service_date",-1).to_list(5001)
        requests=await db.requests.find(rq).sort("created_at",-1).to_list(5001)
        if len(manual)>5000 or len(requests)>5000:
            raise HTTPException(422,"Há muitos registros. Reduza o período para obter totais completos.")
        rows=[{**{k:v for k,v in r.items() if k not in ("_id","original","owner_id")},"id":r["_id"]} for r in manual]+[request_row(r) for r in requests]
        units={}
        for row in rows: units.setdefault(row.get("branch_id") or "",[]).append(row)
        return {"totals":totals(rows),"by_branch":[{"branch_id":key or None,**totals(value),"count":len(value)} for key,value in units.items()],
            "rows":sorted(rows,key=lambda r:r["service_date"],reverse=True),"unpriced_count":sum(bool(r.get("unpriced")) for r in rows)}
    return router
