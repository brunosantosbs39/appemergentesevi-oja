import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { errMsg, useApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const format = cents => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const labels = { pending: "Processando", review: "Em análise", done: "Pix enviado", failed: "Saque não realizado · valor devolvido" };

export default function PixWithdrawal({ wallet, userId }) {
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const api = useApi();
  const cache = useQueryClient();
  const withdrawals = wallet.withdrawals || [];
  const pending = withdrawals.some(op => ["pending", "review"].includes(op.status));
  const cents = Math.round(Number(amount.replace(",", ".")) * 100);
  const storageKey = "pix-withdraw:" + userId;
  async function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    if (!/^\d{1,3}([.,]\d{1,2})?$/.test(amount) || cents <= 0 || cents > 10000 || cents > wallet.available_cents) {
      setMessage("Informe um valor dentro do saldo disponível, até R$ 100.");
      return;
    }
    if (!confirmation) {
      setMessage("");
      setConfirmation(true);
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const id = sessionStorage.getItem(storageKey) || crypto.randomUUID();
      sessionStorage.setItem(storageKey, id);
      const { data } = await api.post("/wallet/withdrawals", {
        amount_cents: cents, pix_key: destination.trim(), idempotency_key: id
      });
      sessionStorage.removeItem(storageKey);
      setMessage(labels[data.status]);
      setConfirmation(false);
      setDestination("");
      setAmount("");
    } catch (error) {
      setMessage(error.response ? errMsg(error) : "Resposta indisponível. Confira o histórico antes de repetir.");
    } finally {
      await cache.invalidateQueries({ queryKey: ["wallet", userId] });
      setBusy(false);
      lock.current = false;
    }
  }
  return <section id="sacar-saldo" className="scroll-mt-24 space-y-4 border border-border bg-card p-5">
    <h2 className="text-xl">Sacar via Pix</h2>
    <p>Saldo disponível: {format(wallet.available_cents)}</p>
    {wallet.withdrawals_enabled && !pending ?
      <form onSubmit={submit} className="space-y-3">
        {!wallet.available_cents && <p>O saque fica disponível quando houver saldo confirmado.</p>}
        <label className="block">Valor do saque (R$)
          <input className="block w-full border bg-background p-3" inputMode="decimal" required readOnly={confirmation} value={amount} onChange={e => setAmount(e.target.value)} />
        </label>
        <label className="block">Sua chave Pix aleatória
          <input className="block w-full border bg-background p-3" required readOnly={confirmation} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" autoComplete="off" value={destination} onChange={e => setDestination(e.target.value)} />
        </label>
        {confirmation && <p>Confirme o envio de {format(cents)} para a chave acima.</p>}
        <Button disabled={busy || wallet.available_cents <= 0} type="submit">{confirmation ? "Confirmar saque" : "Revisar saque"}</Button>
        {confirmation && <Button variant="outline" type="button" disabled={busy} onClick={() => setConfirmation(false)}>Editar</Button>}
      </form> : <p>{pending ? "Acompanhe seu saque em andamento abaixo." : wallet.withdrawals_enabled ? "O saque fica disponível quando houver saldo confirmado." : "Saque temporariamente indisponível."}</p>}
    <p role="status">{message}</p>
    {withdrawals.map(op => <p key={op.id}>{format(op.amount_cents)} · {labels[op.status]} · {new Date(op.created_at).toLocaleString("pt-BR")}</p>)}
  </section>;
}
