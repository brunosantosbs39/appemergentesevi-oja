import { ApplicationsPanel } from "@/components/requests/ApplicationsPanel";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, MessageCircle, Play, Star } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { Button } from "@/components/ui/button";

export const RequestActions = ({ request: r, onUpdated, onReview }) => {
  const api = useApi();
  const { me } = useMe();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const isClient = r.client_id === me.user_id;
  const isPro = r.professional_id === me.user_id;
  const otherId = isClient ? r.professional_id : r.client_id;
  const reviewed = isClient ? r.client_reviewed : r.pro_reviewed;

  const run = async (status, label) => {
    if (busy) return;
    setBusy(status);
    try {
      const action = status === "em_andamento" ? "check-in" : status === "concluido" ? "check-out" : "status";
      const { data } = await api.post(`/requests/${r.id}/${action}`, action === "status" ? { status } : {});
      onUpdated(data);
      toast.success(label);
      if (status === "concluido") onReview(data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  const confirm = async () => {
    if (busy) return;
    setBusy("confirm");
    try {
      const { data } = await api.post(`/requests/${r.id}/confirm-completion`, {});
      onUpdated(data);
      toast.success("Sua confirmação foi registrada. Nenhum pagamento foi movimentado.");
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(null); }
  };
  const chat = async () => {
    try {
      const { data } = await api.post("/conversations", { user_id: otherId, request_id: r.id });
      navigate(`/chat/${data.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const spin = (s) => busy === s && <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <>
      {(isClient || isPro) && ["aceito", "em_andamento", "concluido"].includes(r.status) && <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto" data-testid="request-wallet-button"><Link to={`/carteira?servico=${encodeURIComponent(r.id)}#reservar-pagamento`}>{isClient && r.status !== "concluido" ? "Adicionar saldo e reservar pagamento" : "Ver pagamento na carteira"}</Link></Button>}
      {isClient && <ApplicationsPanel request={r} onUpdated={onUpdated} />}
      {otherId && r.status !== "pendente" && (
        <Button disabled={!!busy} variant="outline" className="rounded-none" onClick={chat} data-testid="request-chat-button">
          <MessageCircle className="h-4 w-4" /> Chat
        </Button>
      )}
      {isPro && r.status === "aceito" && <p className="w-full text-sm text-emerald-600">Serviço aprovado pelo contratante. Faça check-in ao chegar ao local.</p>}
      {isPro && r.status === "aceito" && (
        <Button disabled={!!busy} className="rounded-none bg-secondary hover:bg-secondary" onClick={() => run("em_andamento", "Check-in registrado: serviço iniciado")} data-testid="start-service-button">
          {spin("em_andamento") || <Play className="h-4 w-4" />} Check-in · Iniciar serviço
        </Button>
      )}
      {isPro && r.status === "em_andamento" && (
        <Button disabled={!!busy} className="rounded-none" onClick={() => run("concluido", "Check-out registrado: serviço finalizado!")} data-testid="complete-service-button">
          {spin("concluido") || <CheckCircle2 className="h-4 w-4" />} Check-out · Finalizar
        </Button>
      )}
      {isPro && r.status === "aceito" && (
        <Button disabled={!!busy} variant="ghost" className="rounded-none text-foreground" onClick={() => run("pendente", "Você desistiu do pedido")} data-testid="release-service-button">
          Desistir
        </Button>
      )}
      {isClient && ["pendente", "aceito", "em_andamento"].includes(r.status) && (
        <Button disabled={!!busy} variant="ghost" className="rounded-none text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => run("cancelado", "Pedido cancelado")} data-testid="cancel-service-button">
          Cancelar
        </Button>
      )}
      {r.status === "concluido" && r.check_out_at && (isClient || isPro) && (
        <div className="w-full border border-border bg-card p-4 space-y-3">
          <p className="text-sm">{r.completion_confirmed_at ? "Conclusão confirmada pelos dois." : "A conclusão precisa da confirmação das duas pessoas."}</p>
          {(r.completion_confirmations || []).includes(me.user_id)
            ? <p className="text-sm text-muted-foreground">Sua confirmação já foi registrada.</p>
            : <Button disabled={!!busy} variant="outline" onClick={confirm} data-testid="confirm-completion-button">{spin("confirm")} Confirmar conclusão</Button>}
          <p className="text-xs text-muted-foreground">Esta confirmação registra a conclusão do serviço. Na carteira de testes, os dois também confirmam a liberação do saldo simulado. Nenhum dinheiro real é movimentado.</p>
        </div>
      )}
      {r.status === "concluido" && otherId && !reviewed && (
        <Button disabled={!!busy} className="rounded-none bg-amber-500 text-black hover:bg-amber-600" onClick={() => onReview(r)} data-testid="rate-service-button">
          <Star className="h-4 w-4" /> Avaliar
        </Button>
      )}
      {r.status === "concluido" && reviewed && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700" data-testid="service-reviewed-label">
          <CheckCircle2 className="h-4 w-4" /> Você já avaliou
        </span>
      )}
    </>
  );
};

