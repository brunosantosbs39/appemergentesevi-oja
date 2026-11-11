import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { errMsg, useApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const format = cents => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const withdrawalLabels = { pending: "Processando", review: "Em análise", done: "Pix enviado", failed: "Saque não realizado · valor devolvido" };
const keyTypes = { CPF: "CPF", CNPJ: "CNPJ", EMAIL: "E-mail", PHONE: "Telefone com DDD", EVP: "Chave aleatória" };

export default function PixWithdrawal({ wallet, userId }) {
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [keyType, setKeyType] = useState("EVP");
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
        amount_cents: cents, pix_key: destination.trim(), pix_type: keyType, idempotency_key: id
      });
      sessionStorage.removeItem(storageKey);
      setMessage(withdrawalLabels[data.status]);
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
        <label className="block">Tipo de chave Pix
          <select className="block w-full border bg-background p-3" disabled={confirmation} value={keyType} onChange={e => { setKeyType(e.target.value); setDestination(""); setMessage(""); }}>
            {Object.entries(keyTypes).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select>
        </label>
        <label className="block">{keyTypes[keyType]}
          <input className="block w-full border bg-background p-3" required readOnly={confirmation} type={keyType === "EMAIL" ? "email" : "text"} inputMode={({CPF:"numeric", CNPJ:"numeric", PHONE:"tel", EMAIL:"email"})[keyType] || "text"} autoComplete="off" maxLength={254} value={destination} onChange={e => setDestination(e.target.value)} />
        </label>
        {confirmation && <p>Confirme o envio de {format(cents)} para a chave acima.</p>}
        <Button disabled={busy || wallet.available_cents <= 0} type="submit">{confirmation ? "Confirmar saque" : "Revisar saque"}</Button>
        {confirmation && <Button variant="outline" type="button" disabled={busy} onClick={() => setConfirmation(false)}>Editar</Button>}
      </form> : <p>{pending ? "Acompanhe seu saque em andamento no extrato." : "Saque temporariamente indisponível."}</p>}
    <p role="status">{message}</p>
  </section>;
}
