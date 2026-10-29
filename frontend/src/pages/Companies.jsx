import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi, errMsg } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
const money=n=>((n||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const labels={planned:"Previsto",completed:"Concluído / a pagar",paid:"Pago informado",cancelled:"Cancelado"};
export default function Companies() {
  const api=useApi(), cache=useQueryClient(), {me}=useMe();
  const [company,setCompany]=useState(""),[branch,setBranch]=useState("");
  const [name,setName]=useState(""),[branchName,setBranchName]=useState(""),[city,setCity]=useState("");
  const [start,setStart]=useState(()=>localDate().slice(0,7)+"-01"),[end,setEnd]=useState(localDate);
  const [worker,setWorker]=useState(""),[day,setDay]=useState(localDate),[rate,setRate]=useState(""),[days,setDays]=useState("1"),[status,setStatus]=useState("planned"),[note,setNote]=useState("");
  const [billing,setBilling]=useState("daily");
  const [busy,setBusy]=useState(false), intent=useRef(null), lock=useRef(false);
  const list=useQuery({queryKey:["companies",me.user_id],queryFn:async()=>(await api.get("/companies")).data});
  const companies=list.data?.companies||[], branches=(list.data?.branches||[]).filter(b=>b.company_id===company);
  const dashboard=useQuery({queryKey:["company-dashboard",me.user_id,company,branch,start,end],enabled:!!company&&!!start&&!!end,
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
    const body={branch_id:branch||null,worker,service_date:day,daily_cents:Number(r)*100+Number(f.padEnd(2,"0")),billing_type:billing,unit_cents:Number(r)*100+Number(f.padEnd(2,"0")),quantity:billing==="fixed"?1:Number(days),status,note};
    const fingerprint=JSON.stringify({company,...body});
    if(intent.current&&intent.current.fingerprint!==fingerprint)throw new Error("Repita os dados anteriores para confirmar o lançamento antes de alterá-los.");
    if(!intent.current)intent.current={fingerprint,key:crypto.randomUUID()};
    await api.post(`/companies/${company}/daily`,{...body,idempotency_key:intent.current.key});
    intent.current=null;setWorker("");setRate("");setNote("");toast.success("Lançamento registrado");
  }
  const input="block mt-1 w-full border border-border bg-background p-3";
  const unit=id=>branches.find(b=>b.id===id)?.name||"Matriz";
  const data=dashboard.data;
  return <div className="space-y-6">
    <header><p className="text-sm text-muted-foreground">Gestão de custos</p><h1 className="text-3xl">Empresas e filiais</h1><p className="mt-2 text-sm">Controle os custos de cada unidade. Estes registros não movimentam dinheiro.</p></header>
    <form className="border border-border p-4 space-y-3" onSubmit={e=>{e.preventDefault();run(async()=>{const {data}=await api.post("/companies",{name});setCompany(data.id);setBranch("");setName("");});}}>
      <h2 className="text-xl">Criar empresa</h2><label className="block">Nome da empresa<input className={input} value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={100} required /></label>
      <Button disabled={busy}>Criar empresa e painel</Button>
    </form>
    {list.isPending&&<p role="status">Carregando empresas...</p>}
    {list.error&&<p role="alert">{errMsg(list.error)}</p>}
    {companies.length>0&&<label className="block">Empresa<select className={input} value={company} onChange={e=>{setCompany(e.target.value);setBranch("");}}><option value="">Selecione</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
    {company&&<>
      <form className="border border-border p-4 space-y-3" onSubmit={e=>{e.preventDefault();run(async()=>{await api.post(`/companies/${company}/branches`,{name:branchName,city});setBranchName("");setCity("");toast.success("Filial adicionada");});}}>
        <h2 className="text-xl">Adicionar filial</h2><div className="grid gap-3 sm:grid-cols-2"><label>Nome da filial<input className={input} value={branchName} onChange={e=>setBranchName(e.target.value)} minLength={2} maxLength={100} required /></label><label>Cidade<input className={input} value={city} onChange={e=>setCity(e.target.value)} maxLength={100}/></label></div><Button disabled={busy}>Adicionar filial</Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-3"><label>Unidade<select className={input} value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Todas / lançar na matriz</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>De<input className={input} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Até<input className={input} type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
      {dashboard.isFetching&&<p role="status">Atualizando painel...</p>}
      {dashboard.error&&<p role="alert">{errMsg(dashboard.error)}</p>}
      {data&&!dashboard.error&&<>
        <div className="grid gap-3 sm:grid-cols-3">{[["Previsto","planned_cents"],["Concluído / a pagar","completed_cents"],["Pago informado manualmente","paid_manual_cents"]].map(([label,key])=><section className="border border-border bg-card p-4" key={key}><h2 className="text-sm">{label}</h2><p className="mt-3 text-2xl">{money(data.totals[key])}</p></section>)}</div>
        <p className="text-xs text-muted-foreground">Os totais somam o orçamento total dos pedidos vinculados e valor unitário × quantidade (ou o total do orçamento fechado) nos lançamentos manuais. Cancelados ficam fora dos três totais. Pago informado é uma anotação do gestor, não confirmação bancária. Não lance manualmente uma diária já vinculada a um pedido.</p>
        {data.unpriced_count>0&&<p role="status">{data.unpriced_count} pedido(s) sem valor combinado, fora dos totais monetários.</p>}
        <section className="space-y-3"><h2 className="text-xl">Comparativo por unidade</h2>{data.by_branch.length===0?<p>Nenhum lançamento no período.</p>:data.by_branch.map(b=><div key={b.branch_id||"main"} className="border border-border p-4"><strong>{unit(b.branch_id)}</strong><p className="text-sm">Previsto: {money(b.planned_cents)} · Concluído: {money(b.completed_cents)} · Pago informado: {money(b.paid_manual_cents)}</p></div>)}</section>
      </>}
      <form className="border border-border p-4 space-y-3" onSubmit={e=>{e.preventDefault();run(addDaily);}}>
        <h2 className="text-xl">Lançar custo manualmente</h2><p className="text-sm">Unidade: {branch?unit(branch):"Matriz"}. Use para serviços fora dos pedidos do app.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Trabalhador<input className={input} value={worker} onChange={e=>setWorker(e.target.value)} minLength={2} maxLength={100} required /></label>
          <label>Data de competência<input className={input} type="date" value={day} onChange={e=>setDay(e.target.value)} required/></label>
          <label>Tipo de contratação<select className={input} value={billing} onChange={e=>{setBilling(e.target.value);setDays("1");}}><option value="daily">Diária</option><option value="hourly">Por hora</option><option value="fixed">Orçamento fechado</option></select></label><label>{billing==="daily"?"Valor da diária (R$)":billing==="hourly"?"Valor por hora (R$)":"Orçamento total (R$)"}<input className={input} inputMode="decimal" value={rate} onChange={e=>setRate(e.target.value)} required/></label>
          {billing!=="fixed"&&<label>{billing==="hourly"?"Quantidade de horas":"Quantidade de diárias"}<input className={input} type="number" min={billing==="hourly"?"0.01":"1"} max="10000" step={billing==="hourly"?"0.01":"1"} value={days} onChange={e=>setDays(e.target.value)} required/></label>}
          <label>Situação<select className={input} value={status} onChange={e=>setStatus(e.target.value)}>{["planned","completed","paid"].map(s=><option key={s} value={s}>{labels[s]}</option>)}</select></label>
          <label>Observação<input className={input} value={note} onChange={e=>setNote(e.target.value)} maxLength={500}/></label>
        </div><Button disabled={busy}>Registrar lançamento</Button>
      </form>
      <section className="space-y-3"><h2 className="text-xl">Lançamentos do período</h2>{!dashboard.error&&data?.rows.map(r=><article key={r.source+r.id} className="border border-border p-4"><strong>{r.worker}</strong><p>{r.service_date} · {unit(r.branch_id)} · {r.source==="manual"?"Manual":"Pedido do app"}</p><p className="text-sm">{({daily:"Diária",hourly:"Por hora",fixed:"Orçamento fechado"})[r.billing_type|| (r.source==="manual"?"daily":"fixed")]} · Quantidade: {r.quantity||r.days||1}</p><p>{r.unpriced?"A combinar":money(r.amount_cents)} · {labels[r.status]}</p>{r.note&&<p className="text-sm">{r.note}</p>}{r.source==="manual"&&<label className="block mt-2 text-sm">Atualizar situação<select className={input} value={r.status} disabled={busy} onChange={e=>run(()=>api.patch(`/companies/${company}/daily/${encodeURIComponent(r.id)}`,{status:e.target.value}))}>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>}</article>)}</section>
    </>}
  </div>;
}
