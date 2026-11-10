import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import PixWithdrawal, { withdrawalLabels } from "./PixWithdrawal";
import { Copy, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useApi, errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";

const money = n => ((n || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const labels = { pending: "Aguardando pagamento", paid: "Pagamento recebido", expired: "Pix expirado", failed: "Não concluído", review: "Em análise" };
export default function ProductionWallet({ wallet, userId }) {
  const { hash } = useLocation();
  const area = ["#sacar-saldo", "#extrato"].includes(hash) ? hash : "#adicionar-saldo";
  const api = useApi();
  const cache = useQueryClient();
  const [amount, setAmount] = useState("25,00");
  const [document, setDocument] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const storageKey = "pix-intent:" + userId;
  const active = wallet.operations.find(o => ["pending", "review"].includes(o.status));
  const [clock, setClock] = useState(Date.now);
  const refreshing = useRef(false);
  const timed = active?.timed && active.status === "pending" ? active : null;
  const timedId = timed?.id;
  useEffect(() => {
    if (!timedId) return;
    setClock(Date.now());
    const tick = setInterval(() => setClock(Date.now()), 500);
    return () => clearInterval(tick);
  }, [timedId]);
  const slotEnd = timed ? Date.parse(timed.expires_at || timed.created_at) : Infinity;
  const remaining = Math.max(0, Math.ceil((slotEnd - clock) / 1000));
  const sessionEnd = timed ? Date.parse(timed.created_at) + 180000 : Infinity;
  useEffect(() => {
    if (!timedId || remaining > 0 || refreshing.current) return;
    let cancelled = false;
    const refresh = async () => {
      if (refreshing.current || cancelled) return;
      refreshing.current = true;
      try {
        await api.post("/wallet/deposits/" + timedId + "/code");
        await cache.invalidateQueries({queryKey:["wallet",userId]});
      } catch { /* Retry the same server slot after connectivity returns. */ }
      finally { refreshing.current = false; }
    };
    refresh();
    const retry = setInterval(refresh, 3000);
    return () => { cancelled = true; clearInterval(retry); };
  }, [api, cache, userId, timedId, remaining]);
  const validAmount = /^\d{1,3}([.,]\d{1,2})?$/.test(amount);
  const depositCents = validAmount ? Math.round(Number(amount.replace(",", ".")) * 100) : 0;
  const lastFee = wallet.deposit_fee_estimate_cents;
  const hasFeeHistory = Number.isInteger(lastFee) && lastFee >= 0;
  const estimatedFee = hasFeeHistory ? lastFee : 199;
  const input = "mt-2 w-full border border-border bg-background p-3 text-foreground";
  async function deposit(event) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      if (!/^\d{1,3}([.,]\d{1,2})?$/.test(amount)) throw new Error("Informe um valor entre R$ 5 e R$ 100.");
      const [whole, fraction = ""] = amount.replace(",", ".").split(".");
      const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
      if (cents < 500 || cents > 10000) throw new Error("Informe um valor entre R$ 5 e R$ 100.");
      // Persist intent across reloads. Never store CPF/CNPJ or credentials in browser storage.
      let intent = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (intent && intent.amount !== cents) throw new Error("Repita o valor anterior para recuperar o Pix já solicitado.");
      if (!intent) {
        intent = { key: crypto.randomUUID(), amount: cents };
        sessionStorage.setItem(storageKey, JSON.stringify(intent));
      }
      const { data } = await api.post("/wallet/deposits", { amount_cents: cents, cpf_cnpj: document, idempotency_key: intent.key });
      sessionStorage.removeItem(storageKey);
      setDocument("");
      await cache.invalidateQueries({ queryKey: ["wallet", userId] });
      if (data.status === "pending") toast.success("Pix gerado. O saldo será atualizado após o recebimento.");
      else toast.info(labels[data.status] || "Atualizando pagamento");
    } catch (error) {
      if (error.response?.status === 503 || error.response?.status === 409) sessionStorage.removeItem(storageKey);
      toast.error(error.response ? errMsg(error) : error.message);
    } finally {
      setBusy(false); lock.current = false;
    }
  }
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); toast.success("Pix Copia e Cola copiado"); }
    catch { toast.error("Selecione e copie o código no campo abaixo."); }
  }
  return <div className="space-y-6" data-testid="wallet-production">
    <header><p className="text-sm text-muted-foreground">Seus pagamentos</p><h1 className="text-3xl">Carteira</h1></header>
    <section className="border border-border bg-card p-5">
      <p>Saldo disponível</p><p className="mt-3 text-3xl">{money(wallet.available_cents)}</p>
      {wallet.pending_cents > 0 && <p className="mt-3">A receber pelos serviços: {money(wallet.pending_cents)}</p>}
    </section>
    <nav aria-label="Áreas da carteira" className="grid grid-cols-3 gap-2">
      {Object.entries({"#adicionar-saldo":"Depositar", "#sacar-saldo":"Sacar", "#extrato":"Extrato"}).map(([to, name]) =>
        <Link key={to} to={to} aria-current={area === to ? "page" : undefined}
          className={"flex min-h-12 items-center justify-center border p-2 font-semibold " + (area === to ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}>{name}</Link>)}
    </nav>
    {area === "#adicionar-saldo" && <>
    {!wallet.enabled ? <p role="status">Depósitos Pix temporariamente indisponíveis.</p> : <form onSubmit={deposit} id="adicionar-saldo" className="space-y-4 border border-border bg-card p-5">
      <h2 className="text-xl">Adicionar saldo via Pix</h2>
      <label className="block">Valor em reais<input aria-label="Valor do depósito" inputMode="decimal" className={input} value={amount} onChange={e => setAmount(e.target.value)} disabled={busy || (!!active && clock < sessionEnd)} required /></label>
      <label className="block">Seu CPF ou CNPJ<input aria-label="CPF ou CNPJ" autoComplete="off" inputMode="numeric" maxLength={20} className={input} value={document} onChange={e => setDocument(e.target.value)} disabled={busy || (!!active && clock < sessionEnd)} required /></label>
      <p className="text-sm text-muted-foreground">Deposite entre R$ 5 e R$ 100. A tarifa de recebimento do Asaas é descontada quando o Pix é pago, mesmo se você sacar o saldo sem contratar um serviço.</p>
      {depositCents >= 500 && depositCents <= 10000 && <div className="space-y-1 border-l-2 border-primary pl-3" role="status">
        <p>Valor do Pix: {money(depositCents)}</p>
        <p>Tarifa estimada de recebimento: {money(Math.min(depositCents, estimatedFee))}</p>
        <strong>Saldo estimado a receber: {money(Math.max(0, depositCents - estimatedFee))}</strong>
        <p className="text-sm text-muted-foreground">{hasFeeHistory ? "Estimativa baseada na última cobrança paga." : "Estimativa pela tarifa padrão do Asaas."} O extrato mostrará a tarifa efetiva após a confirmação.</p>
      </div>}
      <Button type="submit" className="min-h-12 w-full sm:w-auto" disabled={busy || (!!active && clock < sessionEnd)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}Adicionar saldo</Button>
      {active && <p role="status" className="text-sm">Acompanhe o depósito abaixo antes de gerar outro.</p>}
    </form>}
    <section className="space-y-4" aria-live="polite">
      {wallet.operations.filter(op => ["pending","review"].includes(op.status)).map(op => <article key={op.id} className="space-y-3 border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap justify-between gap-3"><strong>{money(op.amount_cents)}</strong><span>{op.timed && op.status==="pending" && clock >= sessionEnd ? labels.expired : labels[op.status]}</span></div>
        <p className="text-sm text-muted-foreground">Criado em {new Date(op.created_at).toLocaleString("pt-BR")}</p>
        {op.credited_cents !== undefined && <p>Creditado: {money(op.credited_cents)}</p>}
        {op.status === "pending" && (!op.timed || (remaining > 0 && clock < sessionEnd)) && op.pix_copy_paste && <>
          {Number.isInteger(op.quoted_net_cents) && <p>Tarifa prevista pelo Asaas: {money(op.amount_cents - op.quoted_net_cents)} · Saldo previsto: {money(op.quoted_net_cents)}</p>}
          <p className="text-sm">{op.timed ? `Código ${op.slot + 1} de 3 · Pague em ${remaining}s` : "Validade: " + op.expires_at}</p>
          <img src={"data:image/png;base64," + op.qr_image} alt={"QR Code Pix de " + money(op.amount_cents)} className="mx-auto h-auto w-64 max-w-full bg-white p-3" />
          <label className="block text-sm">Pix Copia e Cola<textarea readOnly value={op.pix_copy_paste} className={input + " break-all"} rows={4} onFocus={e => e.target.select()} /></label>
          <Button type="button" className="min-h-12 w-full sm:w-auto" onClick={() => copy(op.pix_copy_paste)}><Copy className="h-4 w-4" />Copiar código Pix</Button>
          <p className="text-sm text-muted-foreground">Aguardando pagamento. Esta tela atualiza automaticamente a cada 15 segundos.</p>
        </>}
        {op.status === "pending" && clock < sessionEnd && (!op.pix_copy_paste || (op.timed && remaining === 0)) && <p role="status">Preparando o Pix. Aguarde a atualização automática.</p>}
        {op.status === "review" && <p>Estamos verificando este pagamento. Não repita o depósito; entre em contato com o suporte se persistir.</p>}
      </article>)}
    </section>
    </>}
    {area === "#sacar-saldo" && <PixWithdrawal wallet={wallet} userId={userId} />}
    {area === "#extrato" && <section className="space-y-3" aria-labelledby="titulo-extrato">
      <h2 id="titulo-extrato" className="text-xl">Extrato de movimentações</h2>
      {!wallet.operations.length && !wallet.withdrawals?.length && !wallet.service_entries?.length && <p>Nenhuma movimentação.</p>}
      {[...wallet.operations.map(op => ({...op, type:"Depósito", label:labels[op.status]})),
        ...(wallet.withdrawals || []).map(op => ({...op, type:"Saque", label:withdrawalLabels[op.status]})),
        ...(wallet.service_entries || []).map(op => ({...op, id:op._id, type:({service_income:"Serviço recebido",service_refund:"Reserva devolvida",service_reserve:"Valor reservado"})[op.kind], label:"Registrado"}))]
        .sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        .map(op => <article key={op.type + op.id} className="space-y-2 border border-border bg-card p-4">
          <div className="flex justify-between gap-2"><strong>{op.type}</strong><span>{money(op.amount_cents)}</span></div>
          <p>{op.label}</p>
          {op.credited_cents !== undefined && <p>Tarifa de recebimento: {money(op.amount_cents - op.credited_cents)} · Creditado: {money(op.credited_cents)}</p>}
          <time dateTime={op.created_at}>{new Date(op.created_at).toLocaleString("pt-BR")}</time>
        </article>)}
    </section>}
  </div>;
}
