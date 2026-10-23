import { brl } from "@/lib/constants";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ContactButton } from "@/components/chat/ContactButton";

export const applicationLabel = (status) => ({ pending: "Aguardando aceite do contratante", approved: "Candidatura aprovada", declined: "Candidatura recusada", not_selected: "Vaga encerrada ou outro profissional selecionado", withdrawn: "Você desistiu deste serviço" }[status] || status);
export const ApplicationsPanel = ({ request, onUpdated }) => {
  const api = useApi();
  const [busy, setBusy] = useState(null);
  const decide = async (professionalId, status) => {
    if (busy) return;
    setBusy(professionalId);
    try {
      const { data } = await api.post(`/requests/${request.id}/applications/${professionalId}`, { status });
      onUpdated(data);
      toast.success(status === "approved" ? "Candidatura aprovada. Check-in liberado para este profissional." : "Candidatura recusada");
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(null); }
  };
  if (!request.applications?.length) return <p className="text-sm text-muted-foreground">Nenhuma candidatura recebida ainda.</p>;
  return <section className="w-full space-y-3 border-t border-border pt-4" aria-label="Candidaturas recebidas">
    <h4 className="font-bold">Candidaturas ({request.applications.length})</h4>
    {request.applications.map((a) => <div key={a.professional_id} className="space-y-2 border border-border p-3">
      <Link to={`/perfil/${a.professional_id}`} className="font-semibold underline">{a.professional?.name || "Ver perfil do candidato"}</Link>
      <p className="text-xs text-muted-foreground">{applicationLabel(a.status)}</p>
      <p className="text-sm">{a.negotiated_budget != null ? `Valor negociado: ${brl(a.negotiated_budget)}` : `Valor anunciado: ${brl(request.budget)}`}</p>
      <div className="flex flex-wrap gap-2">
        <ContactButton userId={a.professional_id} label="Conversar" />
        {request.status === "pendente" && !request.is_expired && a.status === "pending" && <><Button type="button" disabled={!!busy} onClick={() => decide(a.professional_id, "approved")}>Aprovar candidato</Button><Button type="button" variant="outline" disabled={!!busy} onClick={() => decide(a.professional_id, "declined")}>Recusar</Button></>}
      </div>
    </div>)}
  </section>;
};
