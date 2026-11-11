import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import UnitForm from "@/components/UnitForm";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi, errMsg } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { PageHeader } from "@/components/common/Misc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
const money=n=>((n||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const localDate=(d=new Date())=>{return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const labels={planned:"Previsto",completed:"Concluído / a pagar",paid:"Pago informado",cancelled:"Cancelado"};
export default function Companies() {
  const api=useApi(), cache=useQueryClient(), {me}=useMe();
  const [company,setCompany]=useState(""),[branch,setBranch]=useState("");
  const [modal,setModal]=useState(null),[kind,setKind]=useState("company"),[parent,setParent]=useState("");
  const [editing,setEditing]=useState(null);
  const [rowFilter,setRowFilter]=useState("all");
  const [start,setStart]=useState(()=>localDate().slice(0,7)+"-01"),[end,setEnd]=useState(()=>{const d=new Date();return localDate(new Date(d.getFullYear(),d.getMonth()+1,0));});
  const [worker,setWorker]=useState(""),[day,setDay]=useState(localDate),[rate,setRate]=useState(""),[days,setDays]=useState("1"),[status,setStatus]=useState("planned"),[note,setNote]=useState("");
  const [billing,setBilling]=useState("daily");
  const [busy,setBusy]=useState(false), intent=useRef(null), lock=useRef(false);
  const list=useQuery({queryKey:["companies",me.user_id],queryFn:async()=>(await api.get("/companies")).data});
  const companies=list.data?.companies||[], branches=(list.data?.branches||[]).filter(b=>b.company_id===company);
  useEffect(()=>{
    if(!company && list.data?.companies.length) setCompany(list.data.companies[0].id);
  },[company,list.data]);
  const dashboard=useQuery({queryKey:["company-dashboard",me.user_id,company,branch,start,end],enabled:!!company&&!!start&&!!end,refetchInterval:30000,
    queryFn:async()=>(await api.get(`/companies/${company}/dashboard`,{params:{start,end,...(branch?{branch_id:branch}:{})}})).data});
  async function run(fn) {
    if(lock.current)return;lock.current=true;setBusy(true);
    try{await fn();await cache.invalidateQueries({queryKey:["companies",me.user_id]});await cache.invalidateQueries({queryKey:["company-dashboard",me.user_id]});}
    catch(e){toast.error(e.response?errMsg(e):e.message);}
    finally{lock.current=false;setBusy(false);}
  }
  async function addDaily() {
    if(!/^\d{1,7}([.,]\d{1,2})?$/.test(rate))throw new Error("Informe o valor com até duas casas decimais.");
    const [r,f=""]=rate.replace(",",".").split(".");
    const body={branch_id:branch==="matrix"?null:branch||null,worker,service_date:day,daily_cents:Number(r)*100+Number(f.padEnd(2,"0")),billing_type:billing,unit_cents:Number(r)*100+Number(f.padEnd(2,"0")),quantity:billing==="fixed"?1:Number(days),status,note};
    const fingerprint=JSON.stringify({company,...body});
    if(intent.current&&intent.current.fingerprint!==fingerprint)throw new Error("Repita os dados anteriores para confirmar o lançamento antes de alterá-los.");
    if(!intent.current)intent.current={fingerprint,key:crypto.randomUUID()};
    await api.post(`/companies/${company}/daily`,{...body,idempotency_key:intent.current.key});
    intent.current=null;setWorker("");setRate("");setNote("");setModal(null);toast.success("Lançamento registrado");
  }
  const input="block mt-1 w-full border border-border bg-background p-3";
  const unit=id=>branches.find(b=>b.id===id)?.name||"Matriz";
  const data=dashboard.data;
  const total=b=>b.planned_cents+b.completed_cents+b.paid_manual_cents+(b.paid_app_cents||0);
  return <div className="space-y-6">
    <PageHeader eyebrow="Gestão de custos" title="Empresas e filiais" subtitle="Controle os custos de cada unidade. Estes registros não movimentam dinheiro." />
    <div className="flex flex-wrap gap-2">
      <Button onClick={()=>{setKind("company");setParent(company || companies[0]?.id || "");setModal("unit");}}>Criar empresa ou filial</Button>
      {company && <Button variant="outline" onClick={()=>setModal("cost")}>Lançar custo</Button>}
    </div>
    <Dialog open={modal==="unit"} onOpenChange={open=>{if(!open && !busy)setModal(null);}}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogTitle>Criar empresa ou filial</DialogTitle>
        <label>Tipo de unidade<select className={input} value={kind} onChange={e=>setKind(e.target.value)}>
          <option value="company">Empresa (matriz)</option><option value="branch" disabled={!companies.length}>Filial</option>
        </select></label>
        {kind==="branch" && <label>Empresa da filial<select className={input} value={parent} onChange={e=>setParent(e.target.value)}>
          {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <UnitForm title="Salvar cadastro" busy={busy} onSave={body=>run(async()=>{
          const isBranch=kind==="branch";
          const {data}=await api.post(isBranch?`/companies/${parent}/branches`:"/companies",body);
          setCompany(isBranch?parent:data.id);setBranch(isBranch?data.id:"");setModal(null);
          toast.success(isBranch?"Filial cadastrada":"Empresa cadastrada");
        })}/>
      </DialogContent>
    </Dialog>
    {list.isPending&&<p role="status">Carregando empresas...</p>}
    {list.error&&<p role="alert">{errMsg(list.error)}</p>}
    {companies.length>0&&<label className="block">Escolher empresa<select className={input} value={company} onChange={e=>{setCompany(e.target.value);setBranch("");}}><option value="">Selecione</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    {company&&<>
      <div className="grid gap-3 sm:grid-cols-3"><label>Unidade<select className={input} value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Todas as unidades</option><option value="matrix">Somente matriz</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>De<input className={input} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Até<input className={input} type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
      <div className="flex justify-end"><Button variant="outline" onClick={()=>{
        const selectedBranch=branch && branch!=="matrix" ? branches.find(b=>b.id===branch) : null;
        setEditing({companyId:company,branchId:selectedBranch?.id || null,unit:selectedBranch || companies.find(c=>c.id===company)});
        setModal("edit");
      }}>{branch && branch!=="matrix" ? "Editar filial" : "Editar empresa"}</Button></div>
      <Dialog open={modal==="edit"} onOpenChange={open=>{if(!open && !busy){setModal(null);setEditing(null);}}}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>{editing?.branchId ? "Editar filial" : "Editar empresa"}</DialogTitle>
          <DialogDescription>Atualize os dados de {editing?.unit?.name}. O endereço salvo estará disponível ao selecionar esta unidade em novos pedidos.</DialogDescription>
          {editing && <UnitForm key={editing.unit.id} title="Salvar alterações" initial={editing.unit} busy={busy} edit onSave={body=>run(async()=>{
            await api.patch(`/companies/${editing.companyId}/address`,body,{params:editing.branchId?{branch_id:editing.branchId}:{}});
            setModal(null);setEditing(null);toast.success("Cadastro atualizado");
          })}/>}
        </DialogContent>
      </Dialog>
      {dashboard.isFetching&&<p role="status">Atualizando painel...</p>}
      {dashboard.error&&<p role="alert">{errMsg(dashboard.error)}</p>}
      {data&&!dashboard.error&&<>
        <h2 className="font-heading text-xl">Custos de {branch?unit(branch):companies.find(c=>c.id===company)?.name}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Previsto","planned_cents"],["Concluído a pagar","completed_cents"],["Pago pelo app","paid_app_cents"],["Pago manualmente","paid_manual_cents"]].map(([label,key])=><section className="border border-border bg-card p-4" key={key}><h3 className="text-sm">{label}</h3><p className="mt-2 text-xl font-semibold">{money(data.totals[key])}</p></section>)}</div>
        <p className="text-sm text-muted-foreground">Cada vaga entra pelo orçamento anunciado. Ao aprovar um candidato, o painel passa a usar o valor combinado.</p>
        {data.unpriced_count>0&&<p role="status">{data.unpriced_count} pedido(s) sem valor combinado, fora dos totais monetários.</p>}
        <section className="space-y-3"><h2 className="font-heading text-xl">Comparativo por unidade</h2>{data.by_branch.length===0?<p>Nenhum lançamento no período.</p>:[...data.by_branch].sort((a,b)=>total(b)-total(a)).map(b=><div key={b.branch_id||"main"} className="border border-border p-4"><div className="flex justify-between"><button type="button" className="font-semibold underline" aria-label={"Filtrar movimentações de "+unit(b.branch_id)} onClick={()=>setBranch(b.branch_id || "matrix")}>{unit(b.branch_id)}</button><span>{money(total(b))} · {total(data.totals) ? Math.round(100*total(b)/total(data.totals)) : 0}%</span></div><progress aria-label={"Participação de "+unit(b.branch_id)} className="my-2 h-2 w-full" max={total(data.totals)||1} value={total(b)}/><p className="text-sm">Previsto: {money(b.planned_cents)} · Concluído: {money(b.completed_cents)} · Pago: {money((b.paid_app_cents||0)+b.paid_manual_cents)}</p></div>)}</section>
      </>}
      <Dialog open={modal==="cost"} onOpenChange={open=>{if(!open && !busy)setModal(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogTitle>Lançar custo</DialogTitle>
      <form className="space-y-3" onSubmit={e=>{e.preventDefault();run(addDaily);}}>
        <p className="text-sm">Unidade: {branch?unit(branch):"Matriz"}. Use para serviços fora dos pedidos do app.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Trabalhador<input className={input} value={worker} onChange={e=>setWorker(e.target.value)} minLength={2} maxLength={100} required /></label>
          <label>Data de competência<input className={input} type="date" value={day} onChange={e=>setDay(e.target.value)} required/></label>
          <label>Tipo de contratação<select className={input} value={billing} onChange={e=>{setBilling(e.target.value);setDays("1");}}><option value="daily">Diária</option><option value="hourly">Por hora</option><option value="fixed">Orçamento fechado</option></select></label><label>{billing==="daily"?"Valor da diária (R$)":billing==="hourly"?"Valor por hora (R$)":"Orçamento total (R$)"}<input className={input} inputMode="decimal" value={rate} onChange={e=>setRate(e.target.value)} required/></label>
          {billing!=="fixed"&&<label>{billing==="hourly"?"Quantidade de horas":"Quantidade de diárias"}<input className={input} type="number" min={billing==="hourly"?"0.01":"1"} max="10000" step={billing==="hourly"?"0.01":"1"} value={days} onChange={e=>setDays(e.target.value)} required/></label>}
          <label>Situação<select className={input} value={status} onChange={e=>setStatus(e.target.value)}>{["planned","completed","paid"].map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label>
          <label>Observação<input className={input} value={note} onChange={e=>setNote(e.target.value)} maxLength={500}/></label>
        </div><Button disabled={busy}>Registrar lançamento</Button>
      </form></DialogContent></Dialog>
      <section className="space-y-3"><h2 className="font-heading text-xl">Movimentações do período</h2><label>Mostrar<select className={input} value={rowFilter} onChange={e=>setRowFilter(e.target.value)}><option value="all">Todos os lançamentos</option><option value="request">Vagas do app</option><option value="manual">Custos manuais</option></select></label>{data && !data.rows.some(r=>rowFilter==="all" || r.source===rowFilter) && <p className="text-muted-foreground">Nenhuma movimentação para este filtro.</p>}{!dashboard.error&&data?.rows.filter(r=>rowFilter==="all" || r.source===rowFilter).map(r=><article key={r.source+r.id} className="border border-border p-4"><strong>{r.worker}</strong><p>{r.service_date} · {unit(r.branch_id)} · {r.source==="manual"?"Manual":"Pedido do app"}</p><p className="text-sm">{({daily:"Diária",hourly:"Por hora",fixed:"Orçamento fechado"})[r.billing_type|| (r.source==="manual"?"daily":"fixed")]} · Quantidade: {r.quantity||r.days||1}</p><p>{r.unpriced?"A combinar":money(r.amount_cents)} · {r.settled?"Pago pelo app":labels[r.status]}</p>{r.note&&<p className="text-sm">{r.note}</p>}{r.source==="manual"&&<label className="block mt-2 text-sm">Atualizar situação<select className={input} value={r.status} disabled={busy} onChange={e=>run(()=>api.patch(`/companies/${company}/daily/${encodeURIComponent(r.id)}`,{status:e.target.value}))}>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>}</article>)}</section>
    </>}
  </div>;
}
