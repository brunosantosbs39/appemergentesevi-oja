import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, MessageCircle, Search, X } from "lucide-react";
import { useApi } from "@/lib/api";
import { UserAvatar } from "@/components/common/UserAvatar";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

const normalize = (value) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const shortTime = (iso) => {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};
const mergePage = (old, page) => [...new Map([...(old || []), ...page].map((c) => [c.id, c])).values()].sort((a, b) => b.last_at.localeCompare(a.last_at) || b.id.localeCompare(a.id));

export const ConversationList = () => {
  const api = useApi();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { id } = useParams();
  const pageRef = useRef(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMore = async () => {
    if (loadingMore || !pageRef.current) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get("/conversations", { params: { before: pageRef.current, limit: 50 } });
      setItems((old) => mergePage(old, data)); setHasMore(data.length === 50);
      if (data.length) { const last = data[data.length - 1]; pageRef.current = btoa(JSON.stringify([last.last_at, last.id])).replace(/\+/g, "-").replace(/\//g, "_"); }
    } catch { setError(true); } finally { setLoadingMore(false); }
  };
  useEffect(() => {
    let active = true;
    let loading = false;
    const load = async () => {
      if (loading || document.visibilityState !== "visible") return;
      loading = true;
      try { const { data } = await api.get("/conversations"); if (active) { setItems((old) => mergePage(old, data));
        if (!pageRef.current) { setHasMore(data.length === 50); if (data.length) { const last = data[data.length - 1]; pageRef.current = btoa(JSON.stringify([last.last_at, last.id])).replace(/\+/g, "-").replace(/\//g, "_"); } }
        setError(false); } }
      catch { if (active) setError(true); }
      finally { loading = false; }
    };
    load(); const timer = setInterval(load, 15000);
    window.addEventListener("conversations-changed", load); window.addEventListener("online", load); document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(timer); window.removeEventListener("conversations-changed", load); window.removeEventListener("online", load); document.removeEventListener("visibilitychange", load); };
  }, [api, id, attempt]);
  const filtered = items?.filter((c) => (!unreadOnly || c.unread > 0) && normalize(`${c.other?.name} ${c.last_message} ${c.request?.title || ""}`).includes(normalize(search))) || [];
  const unread = items?.filter((c) => c.unread > 0).length || 0;
  return <section className="sj-inbox">
    <header className="sj-inbox-header"><Link to="/feed" className="sj-icon-button sj-mobile-back" aria-label="Voltar ao feed"><ArrowLeft size={21} /></Link><h1>Conversas</h1><ThemeToggle compact /><NotificationCenter compact /></header>
    <div className="sj-inbox-tools">
      <label className="sj-search"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversa" aria-label="Buscar conversa por nome ou mensagem" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca"><X size={16} /></button>}</label>
      <div className="sj-inbox-filters"><button type="button" className={!unreadOnly ? "active" : ""} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>Todas</button><button type="button" className={unreadOnly ? "active" : ""} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Não lidas {unread > 0 && <span>{unread}</span>}</button></div>
    </div>
    <div className="sj-conversations" data-testid="chat-conversations-list">
      {!items && !error && <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin" />}
      {error && <button type="button" className="sj-inbox-error" onClick={() => setAttempt((n) => n + 1)}>Não foi possível atualizar. Toque para tentar novamente.</button>}
      {items && !filtered.length && <div className="sj-inbox-empty"><MessageCircle size={38} /><strong>{search ? "Nenhuma conversa encontrada" : unreadOnly ? "Tudo em dia" : "Suas conversas começam aqui"}</strong><p>{search ? "Tente outro nome ou trecho de mensagem." : unreadOnly ? "Você não tem conversas não lidas." : "Abra um perfil ou uma vaga e toque em Conversar."}</p>{!search && !unreadOnly && <Link to="/feed">Encontrar pessoas e vagas</Link>}</div>}
      {filtered.map((c) => <NavLink key={c.id} to={`/chat/${c.id}`} data-testid={`chat-conversation-item-${c.id}`} className={({ isActive }) => `sj-conversation ${isActive ? "active" : ""}`}>
        <div className="sj-list-avatar"><UserAvatar user={c.other} className="h-12 w-12" />{c.other?.is_online && <span title="On-line" />}</div>
        <div className="sj-conversation-content"><div className="sj-conversation-top"><strong>{c.other?.name || "Usuário"}</strong><time className={c.unread ? "unread" : ""}>{shortTime(c.last_at)}</time></div><div className="sj-conversation-preview"><p className={c.other_typing ? "sj-typing" : c.unread ? "unread" : ""}>{c.other_typing ? "digitando..." : c.last_message || "Conversa iniciada. Diga olá!"}</p>{c.unread > 0 && <span className="sj-unread" aria-label={`${c.unread} mensagens não lidas`}>{c.unread > 99 ? "99+" : c.unread}</span>}</div>{c.request && <span className="sj-conversation-job">{c.request.title}</span>}</div>
      </NavLink>)}
      {hasMore && <button type="button" className="sj-history-button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Carregando..." : "Carregar mais conversas"}</button>}
    </div>
  </section>;
};
