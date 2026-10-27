"""Sandbox-only wallet. Bounded atomic test ledger; NEVER a production custody model."""
import copy
import hashlib
import os
import re
import secrets
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Literal
import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

BASE = 'https://api-sandbox.asaas.com/v3'
CAPACITY = 200

def stamp(): return datetime.now(timezone.utc).isoformat()
def ident(value): return hashlib.sha256(value.encode()).hexdigest()[:32]
def enabled():
    return os.environ.get('VERCEL_ENV') == 'preview' and os.environ.get('ASAAS_SANDBOX_ENABLED') == 'true' and bool(os.environ.get('ASAAS_SANDBOX_API_KEY'))
def guard():
    if not enabled(): raise HTTPException(503, 'Pagamentos de teste ainda indisponíveis nesta versão')
def cents(value):
    try:
        v = Decimal(str(value)) * 100
        if not v.is_finite() or v != v.to_integral_value(): raise ValueError()
        return int(v)
    except (InvalidOperation, ValueError, TypeError): raise HTTPException(502, 'Valor inválido retornado pelo provedor')

class ProviderError(Exception):
    def __init__(self, definitive=False): self.definitive = definitive

def provider(method, path, body=None):
    guard()
    if not re.fullmatch(r'/[A-Za-z0-9_/-]+', path): raise ValueError('Invalid provider path')
    try:
        r = requests.request(method, BASE + path, json=body,
            headers={'access_token': os.environ['ASAAS_SANDBOX_API_KEY'], 'User-Agent': 'ServicoJa-Sandbox/1.0'},
            timeout=(3, 12), allow_redirects=False)
        if r.status_code >= 400:
            raise ProviderError(r.status_code in (400, 401, 403, 404, 422))
        if not 200 <= r.status_code < 300: raise ProviderError()
        data = r.json()
        if not isinstance(data, dict): raise ProviderError()
        return data
    except (requests.RequestException, ValueError): raise ProviderError()

async def call(method, path, body=None):
    return await run_in_threadpool(provider, method, path, body)

def initial(): return {'_id':'sandbox-v1', 'version':0, 'balances':{}, 'operations':{}, 'funds':{}, 'ledger':[]}

async def state(db):
    current = await db.sandbox_wallet_state.find_one({'_id':'sandbox-v1'})
    if current: return current
    try: await db.sandbox_wallet_state.insert_one(initial())
    except DuplicateKeyError: pass
    return await db.sandbox_wallet_state.find_one({'_id':'sandbox-v1'})

async def mutate(db, fn):
    # Every balance and its balanced journal entry commit in one MongoDB document.
    # Compare-and-swap prevents concurrent spending across serverless instances.
    for _ in range(12):
        before = await state(db)
        after = copy.deepcopy(before)
        result = fn(after)
        if after == before: return result
        after['version'] = before['version'] + 1
        written = await db.sandbox_wallet_state.replace_one({'_id':before['_id'], 'version':before['version']}, after)
        if written.modified_count: return result
    raise HTTPException(409, 'Outra movimentação está em andamento. Atualize a carteira.')

def balance(s, uid): return s['balances'].get(ident(uid), 0)
def post(s, uid, delta, counter, reference):
    key = ident(uid)
    if s['balances'].get(key, 0) + delta < 0: raise HTTPException(409, 'Saldo de teste insuficiente')
    s['balances'][key] = s['balances'].get(key, 0) + delta
    s['ledger'].append({'user_id':uid, 'amount_cents':delta, 'counter_amount_cents':-delta,
                        'counter_account':counter, 'reference':reference, 'created_at':stamp()})

def public_op(op):
    return {k:op[k] for k in ('id','kind','amount_cents','credited_cents','status','created_at') if k in op}

class AmountIn(BaseModel):
    amount_cents: int = Field(strict=True, ge=500, le=10000)
    idempotency_key: str = Field(min_length=16, max_length=80, pattern=r'^[A-Za-z0-9-]+$')
class WithdrawalIn(AmountIn):
    pix_key: str = Field(min_length=5, max_length=180)
    pix_type: Literal['CPF','CNPJ','EMAIL','PHONE','EVP']

async def reserve_operation(db, uid, body, kind):
    oid = ident(uid + ':' + body.idempotency_key)
    fingerprint = ident(kind + ':' + str(body.model_dump(exclude={'idempotency_key'})))
    def apply(s):
        old = s['operations'].get(oid)
        if old:
            if old['fingerprint'] != fingerprint: raise HTTPException(409, 'Solicitação repetida com dados diferentes')
            return old, False
        if len(s['operations']) >= CAPACITY: raise HTTPException(409, 'Limite desta rodada de testes atingido')
        if any(o['user_id']==uid and o['kind']==kind and o['status'] in ('creating','pending','uncertain') for o in s['operations'].values()):
            raise HTTPException(409, 'Aguarde a movimentação anterior antes de iniciar outra')
        op={'id':oid,'user_id':uid,'kind':kind,'fingerprint':fingerprint,'amount_cents':body.amount_cents,'status':'creating','created_at':stamp()}
        s['operations'][oid]=op
        if kind=='withdrawal': post(s,uid,-body.amount_cents,'withdrawal-hold',oid)
        return op, True
    return await mutate(db,apply)

async def patch_op(db, oid, changes):
    def apply(s):
        op=s['operations'][oid]
        if op['status'] not in ('done','failed','review'):
            op.update(changes)
        return op
    return await mutate(db,apply)

async def reconcile(db, oid):
    op=(await state(db))['operations'].get(oid)
    if not op or not op.get('provider_id'): return
    if op['status'] in ('done','failed','review'): return
    path='/payments/' if op['kind']=='deposit' else '/transfers/'
    record=await call('GET',path+op['provider_id'])
    if record.get('id')!=op['provider_id'] or record.get('externalReference')!=oid or cents(record.get('value'))!=op['amount_cents']:
        await patch_op(db,oid,{'status':'review'});return
    if op['kind']=='deposit' and record.get('customer')!=op.get('customer_id'):
        await patch_op(db,oid,{'status':'review'});return
    def apply(s):
        current=s['operations'][oid]
        if current['status'] in ('done','failed','review'): return
        current['provider_status']=record.get('status')
        if current['kind']=='deposit' and record.get('status')=='RECEIVED':
            amount=cents(record.get('netValue'))
            if amount <= 0 or amount > current['amount_cents']:
                current['status']='review';return
            post(s,current['user_id'],amount,'asaas-sandbox',oid)
            current.update(status='done',credited_cents=amount)
        elif current['kind']=='withdrawal' and record.get('status')=='DONE':
            current['status']='done'
            s['ledger'].append({'user_id':current['user_id'],'amount_cents':0,'counter_amount_cents':0,'counter_account':'withdrawal-completed','reference':oid,'created_at':stamp()})
        elif record.get('status') in ('FAILED','CANCELLED','REFUNDED','DELETED'):
            if current['kind']=='withdrawal': post(s,current['user_id'],current['amount_cents'],'withdrawal-hold',oid)
            current['status']='failed'
        else: current['status']='pending'
    await mutate(db,apply)

async def fund_service(db, rid, uid, amount):
    r=await db.requests.find_one({'id':rid,'client_id':uid,'status':{'$in':['aceito','em_andamento']}},{'_id':0})
    if not r or not r.get('professional_id') or r['professional_id']==uid: raise HTTPException(409,'Escolha um serviço aceito por outra pessoa')
    key=ident(rid)
    def apply(s):
        if key in s['funds']:
            if s['funds'][key]['amount_cents']!=amount: raise HTTPException(409,'O serviço já possui outro valor reservado')
            return
        if len(s['funds'])>=100: raise HTTPException(409,'Limite de serviços de teste atingido')
        post(s,uid,-amount,'service-reserve',rid)
        s['funds'][key]={'request_id':rid,'client_id':uid,'professional_id':r['professional_id'],'amount_cents':amount,'status':'reserved','title':r.get('title','Serviço'),'confirmations':[],'created_at':stamp()}
    await mutate(db,apply)

async def confirm_fund(db, rid, uid):
    r=await db.requests.find_one({'id':rid,'status':'concluido'},{'_id':0})
    if not r or not r.get('check_out_at'): raise HTTPException(409,'Aguarde o check-out para confirmar o pagamento')
    def apply(s):
        f=s['funds'].get(ident(rid))
        if not f or uid not in (f['client_id'],f['professional_id']): raise HTTPException(404,'Reserva não encontrada')
        if r['client_id']!=f['client_id'] or r.get('professional_id')!=f['professional_id']: raise HTTPException(409,'Os participantes mudaram. Solicite revisão.')
        if f['status']=='released': return
        if f['status']!='reserved': raise HTTPException(409,'Pagamento em contestação')
        f['confirmations']=list(set(f['confirmations'])|{uid})
        if set(f['confirmations'])=={f['client_id'],f['professional_id']}:
            post(s,f['professional_id'],f['amount_cents'],'service-reserve',rid)
            f.update(status='released',released_at=stamp())
    await mutate(db,apply)

async def dispute_fund(db,rid,uid):
    def apply(s):
        f=s['funds'].get(ident(rid))
        if not f or uid not in (f['client_id'],f['professional_id']): raise HTTPException(404,'Reserva não encontrada')
        if f['status']=='released': raise HTTPException(409,'Valor já liberado; contate o suporte')
        f['status']='disputed'
    await mutate(db,apply)

async def snapshot(db,uid):
    s=await state(db)
    funds=[f for f in s['funds'].values() if uid in (f['client_id'],f['professional_id'])]
    for f in funds:
        r=await db.requests.find_one({'id':f['request_id']},{'_id':0,'status':1,'check_in_at':1,'check_out_at':1})
        f['service_status']=(r or {}).get('status')
        f['arrived']=bool((r or {}).get('check_in_at'))
    return {'enabled':True,'sandbox':True,'available_cents':balance(s,uid),
            'reserved_cents':sum(f['amount_cents'] for f in funds if f['client_id']==uid and f['status'] in ('reserved','disputed')),
            'pending_cents':sum(f['amount_cents'] for f in funds if f['professional_id']==uid and f['status'] in ('reserved','disputed') and f['arrived']),
            'operations':[public_op(o) for o in s['operations'].values() if o['user_id']==uid][-50:][::-1],
            'funds':funds,'ledger':[e for e in s['ledger'] if e['user_id']==uid][-50:][::-1]}

def build_router(db, onboarded):
    router=APIRouter(prefix='/api/wallet')
    @router.get('')
    async def wallet(me=Depends(onboarded)):
        if not enabled(): return {'enabled':False,'sandbox':True}
        return await snapshot(db,me['user_id'])

    @router.post('/deposits')
    async def deposit(body:AmountIn,me=Depends(onboarded)):
        guard();uid=me['user_id']
        op,created=await reserve_operation(db,uid,body,'deposit')
        if not created: return public_op(op)
        try:
            customer=await call('POST','/customers',{'name':'ServicoJa Teste','cpfCnpj':'24971563792','notificationDisabled':True,'externalReference':op['id']})
            await patch_op(db,op['id'],{'customer_id':customer['id']})
            payment=await call('POST','/payments',{'customer':customer['id'],'billingType':'PIX','value':body.amount_cents/100,'dueDate':datetime.now(timezone.utc).date().isoformat(),'externalReference':op['id'],'description':'ServicoJa - deposito simulado, sem dinheiro real'})
            await patch_op(db,op['id'],{'provider_id':payment['id'],'status':'pending'})
            # Sandbox-only provider action: does not initiate a bank Pix.
            await call('POST','/sandbox/payment/'+payment['id']+'/confirm',{})
            await reconcile(db,op['id'])
        except (ProviderError, KeyError) as exc:
            current=(await state(db))['operations'][op['id']]
            status='pending' if current.get('provider_id') else 'failed' if isinstance(exc,ProviderError) and exc.definitive else 'uncertain'
            await patch_op(db,op['id'],{'status':status})
        return public_op((await state(db))['operations'][op['id']])

    @router.post('/withdrawals')
    async def withdraw(body:WithdrawalIn,me=Depends(onboarded)):
        guard();uid=me['user_id']
        op,created=await reserve_operation(db,uid,body,'withdrawal')
        if not created: return public_op(op)
        try:
            record=await call('POST','/transfers',{'value':body.amount_cents/100,'operationType':'PIX','pixAddressKey':body.pix_key.strip(),'pixAddressKeyType':body.pix_type,'externalReference':op['id'],'description':'ServicoJa - saque simulado'})
            await patch_op(db,op['id'],{'provider_id':record['id'],'status':'pending'})
            await reconcile(db,op['id'])
        except (ProviderError, KeyError) as exc:
            current=(await state(db))['operations'][op['id']]
            if isinstance(exc,ProviderError) and exc.definitive and not current.get('provider_id'):
                def undo(s):
                    o=s['operations'][op['id']]
                    if o['status']=='creating':
                        post(s,uid,o['amount_cents'],'withdrawal-hold',o['id']);o['status']='failed'
                await mutate(db,undo)
            else: await patch_op(db,op['id'],{'status':'pending' if current.get('provider_id') else 'uncertain'})
        return public_op((await state(db))['operations'][op['id']])

    @router.post('/sync')
    async def sync(me=Depends(onboarded)):
        guard();uid=me['user_id']
        ops=(await state(db))['operations']
        for o in list(ops.values()):
            if o['user_id']==uid and o['status']=='pending':
                try: await reconcile(db,o['id'])
                except ProviderError: pass
        return await snapshot(db,uid)

    @router.post('/services/{rid}/reserve')
    async def reserve(rid:str,body:AmountIn,me=Depends(onboarded)):
        guard();await fund_service(db,rid,me['user_id'],body.amount_cents)
        return await snapshot(db,me['user_id'])

    @router.post('/services/{rid}/confirm')
    async def confirm(rid:str,me=Depends(onboarded)):
        guard();await confirm_fund(db,rid,me['user_id'])
        return await snapshot(db,me['user_id'])

    @router.post('/services/{rid}/cancel')
    async def cancel(rid:str,me=Depends(onboarded)):
        guard();uid=me['user_id']
        r=await db.requests.find_one({'id':rid,'client_id':uid,'status':'cancelado'})
        if not r: raise HTTPException(409,'Cancele o serviço antes de devolver a reserva')
        def apply(s):
            f=s['funds'].get(ident(rid))
            if not f or f['client_id']!=uid: raise HTTPException(404,'Reserva não encontrada')
            if f['status']=='cancelled': return
            if f['status']!='reserved': raise HTTPException(409,'Reserva bloqueada ou já liberada')
            post(s,uid,f['amount_cents'],'service-reserve',rid)
            f['status']='cancelled'
        await mutate(db,apply)
        return await snapshot(db,uid)

    @router.post('/services/{rid}/dispute')
    async def dispute(rid:str,me=Depends(onboarded)):
        guard();await dispute_fund(db,rid,me['user_id'])
        return await snapshot(db,me['user_id'])

    @router.post('/webhook')
    async def webhook(request:Request):
        guard()
        token=os.environ.get('ASAAS_SANDBOX_WEBHOOK_TOKEN','')
        received=request.headers.get('asaas-access-token','')
        if not token or not secrets.compare_digest(token.encode('utf-8'),received.encode('utf-8')): raise HTTPException(401,'Não autorizado')
        body=bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body)>65536: raise HTTPException(413,'Evento muito grande')
        import json
        try: event=json.loads(body)
        except (ValueError,UnicodeError): raise HTTPException(400,'Evento inválido')
        if not isinstance(event,dict): raise HTTPException(400,'Evento inválido')
        record=event.get('payment') or event.get('transfer') or {}
        if not isinstance(record,dict): raise HTTPException(400,'Evento inválido')
        oid=record.get('externalReference')
        op=(await state(db))['operations'].get(oid) if isinstance(oid,str) else None
        if op and op.get('provider_id')==record.get('id'):
            try: await reconcile(db,oid)
            except ProviderError: raise HTTPException(503,'Tente novamente')
        return {'received':True}
    return router
