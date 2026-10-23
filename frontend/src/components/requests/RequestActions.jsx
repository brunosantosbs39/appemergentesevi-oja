import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const active = ["aceito", "em_andamento"].includes(r.status);

  const run = async (status, label) => {
    setBusy(status);
    try {
      const { data } = await api.post(`/requests/${r.id}/status`, { status });
      onUpdated(data);
      toast.success(label);
      if (status === "concluido") onReview(data);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
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
      {otherId && r.status !== "pendente" && (
        <Button variant="outline" className="rounded-none" onClick={chat} data-testid="request-chat-button">
          <MessageCircle className="h-4 w-4" /> Chat
        </Button>
      )}
      {isPro && r.status === "aceito" && (
        <Button className="rounded-none bg-secondary hover:bg-secondary" onClick={() => run("em_andamento", "Serviço iniciado")} data-testid="start-service-button">
          {spin("em_andamento") || <Play className="h-4 w-4" />} Iniciar serviço
        </Button>
      )}
      {active && (
        <Button className="rounded-none" onClick={() => run("concluido", "Serviço concluído!")} data-testid="complete-service-button">
          {spin("concluido") || <CheckCircle2 className="h-4 w-4" />} Concluir
        </Button>
      )}
      {isPro && r.status === "aceito" && (
        <Button variant="ghost" className="rounded-none text-foreground" onClick={() => run("pendente", "Você desistiu do pedido")} data-testid="release-service-button">
          Desistir
        </Button>
      )}
      {isClient && ["pendente", "aceito", "em_andamento"].includes(r.status) && (
        <Button variant="ghost" className="rounded-none text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => run("cancelado", "Pedido cancelado")} data-testid="cancel-service-button">
          Cancelar
        </Button>
      )}
      {r.status === "concluido" && otherId && !reviewed && (
        <Button className="rounded-none bg-amber-500 text-black hover:bg-amber-600" onClick={() => onReview(r)} data-testid="rate-service-button">
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
