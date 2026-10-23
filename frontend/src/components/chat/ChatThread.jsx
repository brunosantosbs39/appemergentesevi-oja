import { Fragment, memo, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowLeft, Check, CheckCheck, Clock3, FileText, Loader2, MoreVertical, Plus, RotateCw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { brl } from "@/lib/constants";
import { useMe } from "@/context/MeContext";
import { UserAvatar } from "@/components/common/UserAvatar";
import { AudioRecorder } from "@/components/chat/AudioRecorder";
import { AudioMessage } from "@/components/chat/AudioMessage";
import { ProposalDialog } from "@/components/chat/ProposalDialog";
import { ApplyButton } from "@/components/requests/ApplyButton";

const time = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dayKey = (iso) => new Date(iso).toLocaleDateString("pt-BR");
const dayLabel = (iso) => {
  const date = dayKey(iso);
  if (date === dayKey(new Date())) return "Hoje";
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  return date === dayKey(yesterday) ? "Ontem" : date;
};
const saved = (key, fallback) => { try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const Bubble = memo(({ message: m, mine, readAt, onRespond, responding, onRetry }) => {
  if (m.system) return <div className="sj-system" data-testid="chat-system-message">{m.text}</div>;
  const read = mine && !m._state && readAt && readAt >= m.created_at;
  return <div className={`sj-message-row ${mine ? "mine" : ""}`} data-testid="chat-message">
    <div className={`sj-bubble ${m._state === "error" ? "failed" : ""}`}>
      {m.kind === "audio" ? <AudioMessage message={m} /> : m.kind === "proposal" ? <div className="sj-proposal">
        <div className="sj-proposal-title"><FileText size={18} /> Contraproposta</div>
        <p className="sj-message-text">{m.proposal.description}</p><strong className="sj-proposal-value">{brl(m.proposal.amount)}</strong>
        {m.proposal.deadline && <p>Prazo: {m.proposal.deadline}</p>}
        <p className="sj-proposal-status">{{ pending: "Aguardando resposta", accepted: "Contraproposta aceita", declined: "Contraproposta recusada" }[m.proposal.status]}</p>
        {!mine && m.proposal.status === "pending" && <div className="sj-proposal-actions"><button type="button" disabled={responding} onClick={() => onRespond(m.id, "accepted")}>Aceitar</button><button type="button" disabled={responding} onClick={() => onRespond(m.id, "declined")}>Recusar</button></div>}
      </div> : <p className="sj-message-text">{m.text}</p>}
      <div className="sj-message-meta"><time dateTime={m.created_at}>{time(m.created_at)}</time>{mine && <span title={m._state === "sending" ? "Enviando" : m._state === "error" ? "Não enviada" : read ? "Lida" : "Enviada"} aria-label={m._state === "sending" ? "Enviando" : m._state === "error" ? "Não enviada" : read ? "Lida" : "Enviada"}>{m._state === "sending" ? <Clock3 size={13} /> : m._state === "error" ? "!" : read ? <CheckCheck size={16} className="sj-read" /> : <Check size={15} />}</span>}</div>
      {m._state === "error" && <button type="button" className="sj-retry" onClick={() => onRetry(m)}><RotateCw size={13} /> Não enviada. Tentar novamente</button>}
    </div>
  </div>;
});

export const ChatThread = ({ id }) => {
  const api = useApi();
  const { me } = useMe();
  const draftKey = `sj-draft:${me.user_id}:${id}`;
  const outboxKey = `sj-outbox:${me.user_id}:${id}`;
  const [conv, setConv] = useState(null);
  const [msgs, setMsgs] = useState(() => saved(outboxKey, []).map((m) => ({ ...m, _state: "error" })));
  const [text, setText] = useState(() => saved(draftKey, ""));
  const [proposalOpen, setProposalOpen] = useState(false);
  const [responding, setResponding] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [audioActive, setAudioActive] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [away, setAway] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const nearBottom = useRef(true);
  const firstScroll = useRef(true);
  const typingTimer = useRef(null);
  const typingAt = useRef(0);
  const sendingIds = useRef(new Set());
  const pollRef = useRef(null);

  useEffect(() => { try { sessionStorage.setItem(draftKey, JSON.stringify(text)); } catch {} }, [draftKey, text]);
  useEffect(() => { try { sessionStorage.setItem(outboxKey, JSON.stringify(msgs.filter((m) => m._state))); } catch {} }, [outboxKey, msgs]);
  const merge = useCallback((data) => {
    setMsgs((previous) => {
      const clientIds = new Set(data.map((m) => m.client_id).filter(Boolean));
      const byId = new Map(previous.filter((m) => !(m._state && clientIds.has(m.client_id))).map((m) => [m.id, m]));
      data.forEach((m) => byId.set(m.id, m));
      return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    });
  }, []);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const [conversation, messages] = await Promise.all([api.get(`/conversations/${id}`), api.get(`/conversations/${id}/messages`, { params: { mark_read: nearBottom.current } })]);
        if (active) { setConv(conversation.data); merge(messages.data); setError(false); }
      } catch (err) { if (active) { setError(true); if (err.response?.status === 404) setConv(false); } }
      finally { inFlight = false; if (active) setLoading(false); }
    };
    pollRef.current = poll; poll();
    const timer = setInterval(poll, 2500);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("online", poll);
    return () => { active = false; clearInterval(timer); clearTimeout(typingTimer.current); document.removeEventListener("visibilitychange", poll); window.removeEventListener("online", poll); api.post(`/conversations/${id}/typing`, { typing: false }).catch(() => {}); };
  }, [api, id, merge]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (firstScroll.current || nearBottom.current) { list.scrollTo({ top: list.scrollHeight, behavior: firstScroll.current ? "instant" : "smooth" }); firstScroll.current = false; setAway(false); }
    else setAway(true);
  }, [msgs.length]);
  useEffect(() => { if (inputRef.current) { inputRef.current.style.height = "auto"; inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`; } }, [text]);

  const typing = (value) => {
    setText(value);
    clearTimeout(typingTimer.current);
    if (value.trim() && Date.now() - typingAt.current > 3000) { typingAt.current = Date.now(); api.post(`/conversations/${id}/typing`, { typing: true }).catch(() => {}); }
    typingTimer.current = setTimeout(() => api.post(`/conversations/${id}/typing`, { typing: false }).catch(() => {}), 2000);
  };
  const transmit = async (message) => {
    if (sendingIds.current.has(message.client_id)) return;
    sendingIds.current.add(message.client_id);
    setMsgs((previous) => previous.map((m) => m.client_id === message.client_id ? { ...m, _state: "sending" } : m));
    try {
      const { data } = await api.post(`/conversations/${id}/messages`, { text: message.text, client_id: message.client_id });
      merge([data]); window.dispatchEvent(new Event("conversations-changed"));
    } catch {
      setMsgs((previous) => previous.map((m) => m.client_id === message.client_id ? { ...m, _state: "error" } : m));
    } finally { sendingIds.current.delete(message.client_id); }
  };
  const send = (event) => {
    event?.preventDefault();
    if (!text.trim() || audioActive) return;
    const clientId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const message = { id: `local-${clientId}`, client_id: clientId, sender_id: me.user_id, text: text.trim(), created_at: new Date().toISOString(), _state: "sending" };
    nearBottom.current = true;
    setMsgs((previous) => [...previous, message]); setText("");
    api.post(`/conversations/${id}/typing`, { typing: false }).catch(() => {});
    clearTimeout(typingTimer.current); transmit(message); inputRef.current?.focus();
  };
  const respond = async (mid, status) => {
    if (responding) return;
    setResponding(true);
    try { const { data } = await api.patch(`/conversations/${id}/proposals/${mid}`, { status }); merge([data]); }
    catch (err) { toast.error(errMsg(err)); } finally { setResponding(false); }
  };
  const jump = () => { const list = listRef.current; if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" }); nearBottom.current = true; setAway(false); };
  if (conv === false) return <div className="sj-thread-empty"><p>Conversa não encontrada.</p><Link to="/chat">Voltar às conversas</Link></div>;
  if (!conv) return <div className="sj-thread-empty">{error ? <><p>Não foi possível abrir a conversa.</p><button type="button" onClick={() => pollRef.current?.()}>Tentar novamente</button><Link to="/chat">Voltar</Link></> : <Loader2 className="animate-spin" />}</div>;
  const canCounter = !conv.request || me.role === "profissional" && conv.request.client_id !== me.user_id && conv.request.status === "pendente" && (!conv.request.expires_at || new Date(conv.request.expires_at) > new Date());
  return <section className="sj-thread" data-testid="chat-thread" onKeyDown={(e) => { if (e.key === "Escape") setActionsOpen(false); }}>
    <header className="sj-thread-header">
      <Link to="/chat" className="sj-icon-button sj-mobile-back" aria-label="Voltar às conversas" data-testid="chat-back-button"><ArrowLeft size={22} /></Link>
      <Link to={`/perfil/${conv.other.user_id}`} className="sj-contact" data-testid="chat-header-profile-link"><UserAvatar user={conv.other} /><span><strong>{conv.other.name}</strong><small className={conv.other_typing ? "sj-typing" : ""}>{conv.other_typing ? "digitando..." : conv.other.is_online ? "on-line" : "off-line"}</small></span></Link>
      <button type="button" className="sj-icon-button" onClick={() => setActionsOpen((value) => !value)} aria-label="Opções da conversa" aria-expanded={actionsOpen}><MoreVertical size={22} /></button>
    </header>
    {conv.request && <details className="sj-job"><summary><span className="sj-job-dot" /><span>{conv.request.title}</span><strong>{brl(conv.request.budget)}</strong></summary><div className="sj-job-body"><Link to="/pedidos">Ver vaga e acompanhar serviço</Link><ApplyButton key={conv.request.id} request={conv.request} /></div></details>}
    {error && <button type="button" className="sj-connection" onClick={() => pollRef.current?.()}>Conexão interrompida. Tentando reconectar… Toque para tentar agora.</button>}
    <div className="sj-message-area">
      <div ref={listRef} className="sj-messages" data-testid="chat-messages-list" onScroll={() => { const list = listRef.current; nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 110; if (nearBottom.current) setAway(false); }}>
        <div className="sj-conversation-note">Combine os detalhes por aqui. Candidatura, aprovação e registros do serviço ficam vinculados à vaga.</div>
        {!msgs.length && !loading && <div className="sj-system">Diga olá para {conv.other.name?.split(" ")[0]} 👋</div>}
        {msgs.map((m, index) => <Fragment key={m.id}>{(index === 0 || dayKey(m.created_at) !== dayKey(msgs[index - 1].created_at)) && <div className="sj-date-divider">{dayLabel(m.created_at)}</div>}<Bubble message={m} mine={m.sender_id === me.user_id} readAt={conv.other_read_at} onRespond={respond} responding={responding} onRetry={transmit} /></Fragment>)}
        {conv.other_typing && <div className="sj-typing-bubble" aria-label="Digitando"><i /><i /><i /></div>}
      </div>
      {away && <button type="button" className="sj-jump" onClick={jump} aria-label="Ir para mensagens recentes"><ArrowDown size={20} /><span>Mensagens recentes</span></button>}
    </div>
    {actionsOpen && <div className="sj-actions"><Link to={`/perfil/${conv.other.user_id}`} onClick={() => setActionsOpen(false)}>Ver perfil</Link>{canCounter && <button type="button" onClick={() => { setProposalOpen(true); setActionsOpen(false); }}><FileText size={18} /> Enviar contraproposta</button>}{conv.request && <Link to="/pedidos">Ver vaga e check-in/check-out</Link>}</div>}
    <ProposalDialog open={proposalOpen} onOpenChange={setProposalOpen} conversationId={id} onSent={(data) => { nearBottom.current = true; merge([data]); }} />
    <form onSubmit={send} className={`sj-composer ${audioActive ? "audio-active" : ""}`}>
      {!audioActive && <button type="button" className="sj-icon-button" onClick={() => setActionsOpen((value) => !value)} aria-label={actionsOpen ? "Fechar opções" : "Mais opções"}>{actionsOpen ? <X size={24} /> : <Plus size={24} />}</button>}
      {!audioActive && <textarea ref={inputRef} value={text} onChange={(e) => typing(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia("(pointer: coarse)").matches) { e.preventDefault(); send(); } }} placeholder="Mensagem" aria-label="Escreva uma mensagem" rows={1} maxLength={2000} data-testid="chat-message-input" />}
      <AudioRecorder conversationId={id} compact hideTrigger={!!text.trim()} onStateChange={setAudioActive} onSent={(data) => { nearBottom.current = true; merge([data]); window.dispatchEvent(new Event("conversations-changed")); }} />
      {text.trim() && !audioActive && <button type="submit" className="sj-send" aria-label="Enviar mensagem" data-testid="chat-send-message-button"><Send size={20} /></button>}
    </form>
  </section>;
};
