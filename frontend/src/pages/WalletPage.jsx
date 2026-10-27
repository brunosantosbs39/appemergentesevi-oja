import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, ArrowDownToLine, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useApi, errMsg } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { PageHeader } from "@/components/common/Misc";
import { Button } from "@/components/ui/button";

const money = value => ((value || 0) / 100).toLocaleString("pt-BR", {style:"currency",currency:"BRL"});
const statusLabel = {creating:"Processando",pending:"Aguardando confirmação",uncertain:"Em análise — não repita a solicitação",review:"Em análise",done:"Concluído",failed:"Não concluído",reserved:"Reservado",released:"Liberado",disputed:"Em contestação",cancelled:"Reserva devolvida"};
const parseAmount = value => {
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(value)) throw new Error("Informe um valor entre R$ 5 e R$ 100, com até duas casas decimais.");
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (amount < 500 || amount > 10000) throw new Error("Use entre R$ 5 e R$ 100 por teste.");
  return amount;
};
export default function WalletPage() {
  const api = useApi();
  const { me } = useMe();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [amount, setAmount] = useState("25,00");
  const [pixKey, setPixKey] = useState("");
  const [pixType, setPixType] = useState("EMAIL");
  const [requestId, setRequestId] = useState("");
  const [reserveAmount, setReserveAmount] = useState("10,00");
  const intent = useRef(null);
  const lock = useRef(false);
  const wallet = useQuery({queryKey:["wallet",me.user_id],queryFn:async ()=>(await api.get("/wallet")).data,refetchInterval:15000});
  const jobs = useQuery({queryKey:["wallet-services",me.user_id],queryFn:async ()=>(await api.get("/requests/mine")).data});
  const w = wallet.data;
  const availableJobs=(jobs.data || []).filter(r => r.client_id===me.user_id && r.professional_id && ["aceito","em_andamento"].includes(r.status) && !(w?.funds || []).some(f=>f.request_id===r.id));
  const run=async (name, fn) => {
    if(lock.current) return;
    lock.current=true;setBusy(name);
    try { await fn(); await cache.invalidateQueries({queryKey:["wallet",me.user_id]}); }
    catch(e) { toast.error(e.response ? errMsg(e) : e.message || "Não foi possível concluir"); }
    finally { lock.current=false;setBusy(null); }
  };
  const financial=async kind=> {
    const body={amount_cents:parseAmount(amount)};
    if(kind==="withdrawals") {if(!pixKey.trim()) throw new Error("Informe uma chave Pix de testes.");body.pix_key=pixKey.trim();body.pix_type=pixType;}
    const fingerprint=JSON.stringify({kind,...body});
    if(intent.current && intent.current.fingerprint!==fingerprint) throw new Error("Primeiro repita a solicitação anterior com os mesmos dados para verificar o resultado.");
    if(!intent.current) intent.current={fingerprint,key:crypto.randomUUID()};
    const {data}=await api.post(`/wallet/${kind}`,{...body,idempotency_key:intent.current.key});
    intent.current=null;
    if(data.status==="done") toast.success(kind==="deposits" ? "Depósito de teste confirmado" : "Saque de teste concluído");
    else if(data.status==="failed") toast.error("O provedor não concluiu a operação. Nenhum dinheiro real foi movimentado.");
    else toast.info(statusLabel[data.status] || "Operação em processamento");
  };
  const input="mt-2 w-full border border-border bg-background px-3 py-3 text-sm text-foreground";
  if(wallet.isPending) return <p role="status">Carregando carteira...</p>;
  if(wallet.error) return <div role="alert"><p>{errMsg(wallet.error)}</p><Button onClick={()=>wallet.refetch()}>Tentar novamente</Button></div>;
  return <div className="space-y-6" data-testid="wallet-page">
    <PageHeader eyebrow="Seus pagamentos" title="Carteira" subtitle="Saldo, pagamentos por serviço e movimentações." />
    <div className="border border-border bg-card p-5" role="status">
      <h2 className="flex items-center gap-2 font-heading text-lg"><ShieldCheck className="h-5 w-5" />{w?.enabled ? "Ambiente de testes — sem dinheiro real" : "Pagamentos em preparação"}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{w?.enabled ? "Depósitos e saques são simulados. Não envie Pix real. Os valores desta carteira só existem nesta rodada de testes." : "Depósitos e saques ainda não estão disponíveis nesta versão."}</p>
    </div>
    <div className="grid gap-4 md:grid-cols-3">{[["Disponível",w?.available_cents],["Reservado em serviços",w?.reserved_cents],["Pendente de liberação",w?.pending_cents]].map(([label,value])=><section className="border border-border bg-card p-6" key={label}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-3xl">{w?.enabled ? money(value) : "—"}</p></section>)}</div>
    {w?.enabled && <>
      <section className="space-y-4 border border-border bg-card p-5">
        <h2 className="font-heading text-xl">Movimentar saldo de teste</h2>
        <label className="block text-sm">Valor em reais<input className={input} inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} disabled={!!busy} aria-label="Valor da movimentação" /></label>
        <p className="text-xs text-muted-foreground">Entre R$ 5 e R$ 100 por operação. O depósito credita o valor líquido confirmado pelo provedor, após eventuais tarifas de teste.</p>
        <Button disabled={!!busy} onClick={()=>run("deposit",()=>financial("deposits"))}>{busy==="deposit" ? <Loader2 className="h-4 w-4 animate-spin"/> : <Wallet className="h-4 w-4"/>}Adicionar saldo de teste</Button>
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3"><label className="text-sm">Tipo de chave<select className={input} value={pixType} onChange={e=>setPixType(e.target.value)} disabled={!!busy}>{["EMAIL","CPF","CNPJ","PHONE","EVP"].map(v=><option key={v} value={v}>{({EMAIL:"E-mail",PHONE:"Telefone",EVP:"Aleatória"})[v] || v}</option>)}</select></label><label className="text-sm sm:col-span-2">Chave Pix de outra conta Sandbox<input className={input} value={pixKey} onChange={e=>setPixKey(e.target.value)} disabled={!!busy} autoComplete="off" aria-label="Chave Pix de testes" /></label></div>
        <Button variant="outline" disabled={!!busy || !pixKey.trim()} onClick={()=>run("withdraw",()=>financial("withdrawals"))}><ArrowDownToLine className="h-4 w-4"/>Solicitar saque de teste</Button>
      </section>
      <section className="border border-border p-5 space-y-4"><h2 className="font-heading text-xl">Reservar pagamento de um serviço</h2>
        <p className="text-sm text-muted-foreground">A reserva é descontada do seu saldo. Após o check-in ela aparece pendente para o profissional. Após o check-out, os dois precisam confirmar o pagamento aqui.</p>
        {jobs.error ? <p role="alert">Não foi possível carregar os pedidos.</p> : availableJobs.length ? <><label className="block text-sm">Serviço<select className={input} value={requestId} onChange={e=>setRequestId(e.target.value)}><option value="">Selecione um serviço</option>{availableJobs.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label><label className="block text-sm">Valor combinado<input className={input} inputMode="decimal" value={reserveAmount} onChange={e=>setReserveAmount(e.target.value)} /></label><Button disabled={!!busy || !requestId} onClick={()=>run("reserve",async()=>{await api.post(`/wallet/services/${requestId}/reserve`,{amount_cents:parseAmount(reserveAmount),idempotency_key:crypto.randomUUID()});toast.success("Valor de teste reservado");})}>Reservar valor de teste</Button></> : <p className="text-sm text-muted-foreground">Nenhum serviço aceito disponível para reservar entre os 100 pedidos mais recentes. <Link to="/pedidos" className="underline">Ver pedidos</Link></p>}
      </section>
      <section className="space-y-3"><h2 className="font-heading text-xl">Pagamentos por serviço</h2>{!(w.funds || []).length && <p className="text-sm text-muted-foreground">Nenhum pagamento reservado.</p>}{(w.funds || []).map(f=><article key={f.request_id} className="space-y-3 border border-border bg-card p-5"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{f.title}</h3><span>{money(f.amount_cents)} · {statusLabel[f.status]}</span></div><p className="text-sm text-muted-foreground">{f.arrived ? "Check-in registrado" : "Aguardando check-in"} · {f.confirmations.length}/2 confirmações de pagamento</p>{f.status==="reserved" && <div className="flex flex-wrap gap-3">{f.service_status==="concluido" && !f.confirmations.includes(me.user_id) && <Button disabled={!!busy} onClick={()=>run("confirm",async()=>{await api.post(`/wallet/services/${f.request_id}/confirm`,{});toast.success("Confirmação registrada");})}>Confirmar pagamento de teste</Button>}<Button variant="outline" disabled={!!busy} onClick={()=>run("dispute",async()=>{await api.post(`/wallet/services/${f.request_id}/dispute`,{});toast.info("Liberação bloqueada para revisão");})}>Contestar serviço</Button>{f.client_id===me.user_id && f.service_status==="cancelado" && <Button variant="outline" disabled={!!busy} onClick={()=>run("cancel",async()=>{await api.post(`/wallet/services/${f.request_id}/cancel`,{});toast.success("Reserva devolvida ao saldo de teste");})}>Devolver reserva</Button>}</div>}{f.status==="disputed" && <p className="text-sm">Valor bloqueado. A resolução de contestações será feita pelo suporte nesta rodada de testes.</p>}</article>)}</section>
      <section className="space-y-4 border-t border-border pt-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-heading text-xl">Movimentações</h2><Button variant="outline" disabled={!!busy} onClick={()=>run("sync",async()=>{const {data}=await api.post("/wallet/sync",{});cache.setQueryData(["wallet",me.user_id],data);})}>{busy==="sync" ? "Atualizando..." : "Atualizar movimentações"}</Button></div>{!(w.operations || []).length && <p className="text-sm text-muted-foreground">Nenhuma movimentação de teste.</p>}{(w.operations || []).map(o=><div key={o.id} className="flex flex-wrap justify-between gap-3 border-b border-border py-3"><div><p>{o.kind==="deposit" ? "Depósito de teste" : "Saque de teste"}</p><p className="text-xs text-muted-foreground">{statusLabel[o.status]} · {new Date(o.created_at).toLocaleString("pt-BR")}</p></div><div className="text-right"><p>{money(o.amount_cents)}</p>{o.credited_cents!==undefined && <p className="text-xs text-muted-foreground">Creditado: {money(o.credited_cents)}</p>}</div></div>)}</section>
    </>}
  </div>;
}
