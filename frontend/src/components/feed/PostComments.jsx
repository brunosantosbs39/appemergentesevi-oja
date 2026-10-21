import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/common/UserAvatar";

export const PostComments = ({ postId, onAdded }) => {
  const api = useApi();
  const [items, setItems] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/posts/${postId}/comments`).then((r) => setItems(r.data)).catch(() => setItems([]));
  }, [api, postId]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/posts/${postId}/comments`, { text });
      setItems((p) => [...(p || []), data]);
      setText("");
      onAdded?.();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3" data-testid="feed-post-comments">
      {items === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : (
        items.map((c) => (
          <div key={c.id} className="flex items-start gap-2" data-testid="feed-comment-item">
            <UserAvatar user={c.author} className="h-7 w-7" />
            <p className="text-sm text-slate-700">
              <Link to={`/perfil/${c.user_id}`} className="font-semibold text-slate-900 hover:text-emerald-700">
                {c.author?.name || "Usuário"}
              </Link>{" "}
              {c.text}
            </p>
          </div>
        ))
      )}
      <form onSubmit={send} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Adicione um comentário..."
          maxLength={500}
          className="rounded-full"
          data-testid="feed-post-comment-input"
        />
        <Button type="submit" size="sm" className="rounded-full" disabled={busy || !text.trim()} data-testid="feed-post-comment-submit">
          Enviar
        </Button>
      </form>
    </div>
  );
};
