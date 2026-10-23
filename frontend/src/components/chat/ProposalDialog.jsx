import { useState } from "react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const ProposalDialog = ({ open, onOpenChange, conversationId, onSent }) => {
  const api = useApi();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/conversations/${conversationId}/proposals`, { description: description.trim(), amount: Number(amount), deadline });
      onSent(data); onOpenChange(false); setDescription(""); setAmount(""); setDeadline("");
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Enviar contraproposta</DialogTitle><DialogDescription>Não concorda com o valor anunciado? Sugira outro valor e explique sua contraproposta. Após o aceite, o contratante confirma a candidatura em Pedidos.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-2"><span>Descrição do serviço</span><Textarea required minLength={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label className="block space-y-2"><span>Novo valor sugerido (R$)</span><Input required type="number" min="0.01" max="1000000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="block space-y-2"><span>Prazo ou data combinada (opcional)</span><Input maxLength={120} value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="Ex.: até sexta-feira" /></label>
      <Button type="submit" disabled={busy || description.trim().length < 3} className="w-full">{busy ? "Enviando..." : "Enviar contraproposta"}</Button>
    </form>
  </DialogContent></Dialog>;
};
