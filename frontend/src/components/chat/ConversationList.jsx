import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Loader2, MessageCircle } from "lucide-react";
import { useApi } from "@/lib/api";
import { ago } from "@/lib/constants";
import { UserAvatar } from "@/components/common/UserAvatar";
import { StatusBadge } from "@/components/common/Misc";
import { cn } from "@/lib/utils";

export const ConversationList = () => {
  const api = useApi();
  const [items, setItems] = useState(null);

  useEffect(() => {
    const load = () => api.get("/conversations").then((r) => setItems(r.data)).catch(() => setItems((p) => p || []));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [api]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-slate-900">Conversas</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-2" data-testid="chat-conversations-list">
        {items === null && <Loader2 className="mx-auto mt-8 h-5 w-5 animate-spin text-emerald-600" />}
        {items?.length === 0 && (
          <div className="px-6 py-12 text-center text-sm text-slate-500" data-testid="chat-empty-state">
            <MessageCircle className="mx-auto mb-3 h-6 w-6 text-slate-400" />
            Nenhuma conversa ainda. Aceite um pedido ou chame um profissional pelo perfil.
          </div>
        )}
        {items?.map((c) => (
          <NavLink
            key={c.id}
            to={`/chat/${c.id}`}
            data-testid={`chat-conversation-item-${c.id}`}
            className={({ isActive }) => cn("flex items-center gap-3 rounded-2xl p-3 transition-colors", isActive ? "bg-emerald-50" : "hover:bg-slate-50")}
          >
            <UserAvatar user={c.other} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-bold text-slate-900">{c.other?.name}</p>
                <span className="shrink-0 font-mono text-[10px] text-slate-400">{ago(c.last_at)}</span>
              </div>
              <p className={cn("truncate text-xs", c.unread ? "font-semibold text-slate-900" : "text-slate-500")}>{c.last_message || "Diga olá!"}</p>
              {c.request && (
                <div className="mt-1 flex items-center gap-1.5">
                  <StatusBadge status={c.request.status} testid="chat-item-status-badge" />
                  <span className="truncate text-[11px] text-slate-500">{c.request.title}</span>
                </div>
              )}
            </div>
            {c.unread > 0 && (
              <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white" data-testid="chat-item-unread-badge">
                {c.unread}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
};
