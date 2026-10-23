import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarInput } from "@/components/common/StarRating";
import { UserAvatar } from "@/components/common/UserAvatar";

const LABELS = ["", "Muito ruim", "Ruim", "Ok", "Muito bom", "Excelente!"];

export const ReviewDialog = ({ request, onClose, onDone }) => {
  const api = useApi();
  const { me } = useMe();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  if (!request) return null;
  const other = request.client_id === me.user_id ? request.professional : request.client;

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/requests/${request.id}/review`, { rating, comment });
      toast.success("Avaliação enviada. Obrigado!");
      onDone(request.id);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-none sm:max-w-md" data-testid="review-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl font-extrabold">Como foi o serviço?</DialogTitle>
          <DialogDescription>{request.title}</DialogDescription>
        </DialogHeader>
        {other && (
          <div className="flex items-center gap-3 rounded-none bg-card p-3">
            <UserAvatar user={other} />
            <p className="font-semibold text-foreground">{other.name}</p>
          </div>
        )}
        <div className="flex flex-col items-center gap-2 py-2">
          <StarInput value={rating} onChange={setRating} />
          <p className="text-sm font-semibold text-amber-700" data-testid="review-rating-label">{LABELS[rating]}</p>
        </div>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={500} placeholder="Deixe um comentário (opcional)" data-testid="review-comment-input" />
        <Button onClick={submit} disabled={busy} className="h-12 rounded-none text-base font-semibold" data-testid="review-submit-button">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Enviar avaliação
        </Button>
      </DialogContent>
    </Dialog>
  );
};
