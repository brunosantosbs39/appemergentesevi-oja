import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { brl } from "@/lib/constants";
import { useMe } from "@/context/MeContext";
import { Button } from "@/components/ui/button";

export const ApplyButton = ({ request, onApplied }) => {
  const { me } = useMe();
  const api = useApi();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  if (request.client_id === me.user_id || request.status !== "pendente" || request.is_expired || request.expires_at && new Date(request.expires_at) <= new Date()) return null;
  const apply = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/requests/${request.id}/apply`);
      setApplied(true); onApplied?.(data.request);
      toast.success("Candidatura enviada pelo valor anunciado. Aguarde aprovação do contratante.");
      navigate(`/chat/${data.conversation_id}`);
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return <Button type="button" disabled={busy || applied || !!request.my_application} onClick={apply} className="mt-3 h-auto min-h-11 w-full whitespace-normal" data-testid="vacancy-apply-button">
    {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
    {applied || request.my_application ? "Candidatura enviada" : `Candidatar-se${request.budget != null ? ` por ${brl(request.budget)}` : " à vaga"}`}
  </Button>;
};
