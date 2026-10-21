import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { brl, catOf } from "@/lib/constants";
import { useMe } from "@/context/MeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/common/UserAvatar";
import { StatusBadge } from "@/components/common/Misc";
import { cn } from "@/lib/utils";

const time = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const Bubble = ({ m, mine }) => {
  if (m.system)
    return (
      <div className="flex justify-center" data-testid="chat-system-message">
        <p className="max-w-[85%] rounded-full bg-slate-100 px-4 py-1.5 text-center text-xs text-slate-600">{m.text}</p>
      </div>
    );
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")} data-testid="chat-message">
      <div className={cn("max-w-[78%] rounded-3xl px-4 py-2.5 text-sm", mine ? "rounded-br-md bg-emerald-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800")}>
        <p className="whitespace-pre-wrap break-words">{m.text}</p>
        <p className={cn("mt-1 text-right font-mono text-[10px]", mine ? "text-emerald-100" : "text-slate-400")}>{time(m.created_at)}</p>
      </div>
    </div>
  );
};

const ThreadHeader = ({ conv }) => (
  <div className="border-b border-slate-100 px-4 py-3">
    <div className="flex items-center gap-3">
      <Link to="/chat" className="rounded-full p-1.5 hover:bg-slate-100 lg:hidden" data-testid="chat-back-button"><ArrowLeft className="h-5 w-5" /></Link>
      <Link to={`/perfil/${conv.other.user_id}`} className="flex min-w-0 items-center gap-3" data-testid="chat-header-profile-link">
        <UserAvatar user={conv.other} ring={conv.other.role === "profissional"} />
        <div className="min-w-0">
          <p className="truncate font-heading font-bold text-slate-900">{conv.other.name}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{conv.other.role === "profissional" ? "Profissional" : "Contratante"}</p>
        </div>
      </Link>
    </div>
    {conv.request && (
      <Link to="/pedidos" className="mt-3 flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs" data-testid="chat-request-banner">
        <StatusBadge status={conv.request.status} />
        <span className="truncate font-semibold text-slate-900">{conv.request.title}</span>
        <span className="ml-auto shrink-0 text-slate-500">{catOf(conv.request.category).label} • {brl(conv.request.budget)}</span>
      </Link>
    )}
  </div>
);

export const ChatThread = ({ id }) => {
  const api = useApi();
  const { me } = useMe();
  const [conv, setConv] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const lastRef = useRef(null);
  const endRef = useRef(null);

  const merge = useCallback((data) => {
    if (!data.length) return;
    lastRef.current = data[data.length - 1].created_at;
    setMsgs((m) => [...m, ...data.filter((d) => !m.some((x) => x.id === d.id))]);
  }, []);

  useEffect(() => {
    api.get(`/conversations/${id}`).then((r) => setConv(r.data)).catch(() => setConv(false));
    const poll = () => api.get(`/conversations/${id}/messages`, { params: lastRef.current ? { after: lastRef.current } : {} }).then((r) => merge(r.data)).catch(() => {});
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [api, id, merge]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      const { data } = await api.post(`/conversations/${id}/messages`, { text: t });
      merge([data]);
      setText("");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSending(false);
    }
  };

  if (conv === false) return <p className="m-auto text-sm text-slate-500" data-testid="chat-not-found">Conversa não encontrada.</p>;
  if (!conv) return <Loader2 className="m-auto h-6 w-6 animate-spin text-emerald-600" />;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white" data-testid="chat-thread">
      <ThreadHeader conv={conv} />
      <div className="flex-1 space-y-3 overflow-y-auto bg-[#F8FAFC] px-4 py-5" data-testid="chat-messages-list">
        {msgs.length === 0 && <p className="text-center text-sm text-slate-400">Envie a primeira mensagem para {conv.other.name}.</p>}
        {msgs.map((m) => <Bubble key={m.id} m={m} mine={m.sender_id === me.user_id} />)}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma mensagem..." maxLength={2000} className="h-11 rounded-full" data-testid="chat-message-input" />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full" disabled={sending || !text.trim()} data-testid="chat-send-message-button" aria-label="Enviar">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
};
