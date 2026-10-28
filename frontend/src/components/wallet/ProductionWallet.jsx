import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useApi, errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";

const money = n => ((n || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const labels = { pending: "Aguardando pagamento", paid: "Pagamento recebido", expired: "Pix expirado", failed: "Não concluído", review: "Em análise" };
export default function ProductionWallet({ wallet, userId }) {
  const api = useApi();
  const cache = useQueryClient();
  const [amount, setAmount] = useState("25,00");
  const [document, setDocument] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const storageKey = "pix-intent:" + userId;
  const active = wallet.operations.find(o => ["pending", "review"].includes(o.status));
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
      <p className="mt-3 text-sm text-muted-foreground">Saques ainda não estão disponíveis. Os pagamentos de serviços com saldo real serão liberados em uma próxima etapa.</p>
    </section>
    {!wallet.enabled ? <p role="status">Depósitos Pix temporariamente indisponíveis.</p> : <form onSubmit={deposit} id="adicionar-saldo" className="space-y-4 border border-border bg-card p-5">
      <h2 className="text-xl">Adicionar saldo via Pix</h2>
      <label className="block">Valor em reais<input aria-label="Valor do depósito" inputMode="decimal" className={input} value={amount} onChange={e => setAmount(e.target.value)} disabled={busy || !!active} required /></label>
      <label className="block">Seu CPF ou CNPJ<input aria-label="CPF ou CNPJ" autoComplete="off" inputMode="numeric" maxLength={20} className={input} value={document} onChange={e => setDocument(e.target.value)} disabled={busy || !!active} required /></label>
      <p className="text-sm text-muted-foreground">Entre R$ 5 e R$ 100 por depósito. Será creditado o valor líquido recebido, descontadas eventuais tarifas do Asaas. Criar o Pix não adiciona saldo.</p>
      <Button type="submit" className="min-h-12 w-full sm:w-auto" disabled={busy || !!active}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}Adicionar saldo</Button>
      {active && <p role="status" className="text-sm">Acompanhe o depósito abaixo antes de gerar outro.</p>}
    </form>}
    <section className="space-y-4" aria-live="polite">
      <h2 className="text-xl">Depósitos</h2>
      {!wallet.operations.length && <p>Nenhum depósito.</p>}
      {wallet.operations.map(op => <article key={op.id} className="space-y-3 border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap justify-between gap-3"><strong>{money(op.amount_cents)}</strong><span>{labels[op.status]}</span></div>
        <p className="text-sm text-muted-foreground">Criado em {new Date(op.created_at).toLocaleString("pt-BR")}</p>
        {op.credited_cents !== undefined && <p>Creditado: {money(op.credited_cents)}</p>}
        {op.status === "pending" && op.pix_copy_paste && <>
          <p className="text-sm">Validade: {op.expires_at} (horário informado pelo Asaas)</p>
          <img src={"data:image/png;base64," + op.qr_image} alt={"QR Code Pix de " + money(op.amount_cents)} className="mx-auto h-auto w-64 max-w-full bg-white p-3" />
          <label className="block text-sm">Pix Copia e Cola<textarea readOnly value={op.pix_copy_paste} className={input + " break-all"} rows={4} onFocus={e => e.target.select()} /></label>
          <Button type="button" className="min-h-12 w-full sm:w-auto" onClick={() => copy(op.pix_copy_paste)}><Copy className="h-4 w-4" />Copiar código Pix</Button>
          <p className="text-sm text-muted-foreground">Aguardando pagamento. Esta tela atualiza automaticamente a cada 15 segundos.</p>
        </>}
        {op.status === "pending" && !op.pix_copy_paste && <p role="status">Preparando o Pix. Aguarde a atualização automática.</p>}
        {op.status === "review" && <p>Estamos verificando este pagamento. Não repita o depósito; entre em contato com o suporte se persistir.</p>}
      </article>)}
    </section>
  </div>;
}
