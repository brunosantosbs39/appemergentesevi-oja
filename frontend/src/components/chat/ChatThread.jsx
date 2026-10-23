import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Send, FileText } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { brl, catOf } from "@/lib/constants";
import { useMe } from "@/context/MeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/common/UserAvatar";
import { AudioRecorder } from "@/components/chat/AudioRecorder";
import { AudioMessage } from "@/components/chat/AudioMessage";
import { ProposalDialog } from "@/components/chat/ProposalDialog";
import { PresenceBadge } from "@/components/common/PresenceBadge";
import { StatusBadge } from "@/components/common/Misc";
import { cn } from "@/lib/utils";

const time = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const Bubble = ({ m, mine, onRespond, responding }) => {
  if (m.system)
    return (
      <div className="flex justify-center" data-testid="chat-system-message">
        <p className="max-w-[85%] rounded-none bg-card px-4 py-1.5 text-center text-xs text-foreground">{m.text}</p>
      </div>
    );
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")} data-testid="chat-message">
      <div className={cn("max-w-[78%] rounded-none px-4 py-2.5 text-sm", mine ? "rounded-br-md bg-secondary text-white" : "rounded-bl-md border border-border bg-card text-foreground")}>
        {m.kind === "audio" ? <AudioMessage message={m} /> : m.kind === "proposal" ? (
          <div className="space-y-2">
            <p className="font-bold">Proposta de serviço</p>
            <p className="whitespace-pre-wrap break-words">{m.proposal.description}</p>
            <p className="text-lg font-bold">{brl(m.proposal.amount)}</p>
            {m.proposal.deadline && <p>Prazo: {m.proposal.deadline}</p>}
            <p role="status">{{ pending: "Aguardando resposta", accepted: "Proposta aceita", declined: "Proposta recusada" }[m.proposal.status]}</p>
            {!mine && m.proposal.status === "pending" && <div className="flex flex-wrap gap-2"><Button type="button" disabled={responding} onClick={() => onRespond(m.id, "accepted")}>Aceitar</Button><Button type="button" variant="outline" disabled={responding} onClick={() => onRespond(m.id, "declined")}>Recusar</Button></div>}
          </div>
        ) : <p className="whitespace-pre-wrap break-words">{m.text}</p>}
        <p className={cn("mt-1 text-right font-mono text-[10px]", mine ? "text-foreground" : "text-muted-foreground")}>{time(m.created_at)}</p>
      </div>
    </div>
  );
};

const ThreadHeader = ({ conv }) => (
  <div className="border-b border-border px-4 py-3">
    <div className="flex items-center gap-3">
      <Link to="/chat" className="rounded-none p-1.5 hover:bg-card lg:hidden" data-testid="chat-back-button"><ArrowLeft className="h-5 w-5" /></Link>
      <Link to={`/perfil/${conv.other.user_id}`} className="flex min-w-0 items-center gap-3" data-testid="chat-header-profile-link">
        <UserAvatar user={conv.other} ring={conv.other.role === "profissional"} />
        <div className="min-w-0">
          <p className="truncate font-heading font-bold text-foreground">{conv.other.name}</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{conv.other.role === "profissional" ? "Profissional" : "Contratante"}</p>
          <PresenceBadge user={conv.other} />
        </div>
      </Link>
    </div>
    {conv.request && (
      <Link to="/pedidos" className="mt-3 flex items-center gap-2 rounded-none bg-card px-3 py-2 text-xs" data-testid="chat-request-banner">
        <StatusBadge status={conv.request.status} />
        <span className="truncate font-semibold text-foreground">{conv.request.title}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">{catOf(conv.request.category).label} • {brl(conv.request.budget)}</span>
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
  const [proposalOpen, setProposalOpen] = useState(false);
  const [responding, setResponding] = useState(false);
  const endRef = useRef(null);

  const merge = useCallback((data) => {
    if (!data.length) return;
    setMsgs((previous) => {
      const byId = new Map(previous.map((m) => [m.id, m]));
      data.forEach((m) => byId.set(m.id, m));
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  useEffect(() => {
    api.get(`/conversations/${id}`).then((r) => setConv(r.data)).catch(() => setConv(false));
    const poll = () => {
      api.get(`/conversations/${id}/messages`).then((r) => merge(r.data)).catch(() => {});
      api.get(`/conversations/${id}`).then((r) => setConv(r.data)).catch(() => {});
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [api, id, merge]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const respond = async (mid, status) => {
    if (responding) return;
    setResponding(true);
    try { const { data } = await api.patch(`/conversations/${id}/proposals/${mid}`, { status }); merge([data]); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setResponding(false); }
  };

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
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

  if (conv === false) return <p className="m-auto text-sm text-muted-foreground" data-testid="chat-not-found">Conversa não encontrada.</p>;
  if (!conv) return <Loader2 className="m-auto h-6 w-6 animate-spin text-foreground" />;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-none border border-border bg-card" data-testid="chat-thread">
      <ThreadHeader conv={conv} />
      <div className="flex-1 space-y-3 overflow-y-auto bg-background px-4 py-5" data-testid="chat-messages-list">
        {msgs.length === 0 && <p className="text-center text-sm text-muted-foreground">Envie a primeira mensagem para {conv.other.name}.</p>}
        {msgs.map((m) => <Bubble key={m.id} m={m} mine={m.sender_id === me.user_id} onRespond={respond} responding={responding} />)}
        <div ref={endRef} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 pt-3">
        <AudioRecorder conversationId={id} onSent={(data) => merge([data])} />
        <Button type="button" variant="outline" onClick={() => setProposalOpen(true)}><FileText className="h-4 w-4" /> Proposta</Button>
      </div>
      <ProposalDialog open={proposalOpen} onOpenChange={setProposalOpen} conversationId={id} onSent={(data) => merge([data])} />
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma mensagem..." maxLength={2000} className="h-11 rounded-none" data-testid="chat-message-input" />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-none" disabled={sending || !text.trim()} data-testid="chat-send-message-button" aria-label="Enviar">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
};
