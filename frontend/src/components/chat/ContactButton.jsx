import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { Button } from "@/components/ui/button";

export const ContactButton = ({ userId, requestId, className, label = "Conversar", testid = "contact-user-button" }) => {
  const api = useApi();
  const { me } = useMe();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!userId || userId === me.user_id) return null;
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("/conversations", { user_id: userId, ...(requestId ? { request_id: requestId } : {}) });
      window.dispatchEvent(new Event("conversations-changed"));
      navigate(`/chat/${data.id}`);
    } catch (err) { toast.error(errMsg(err)); }
    finally { setBusy(false); }
  };
  return <Button type="button" onClick={open} disabled={busy} className={className} data-testid={testid}>
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}{busy ? "Abrindo conversa..." : label}
  </Button>;
};
