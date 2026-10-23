import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const NotificationCenter = () => {
  const api = useApi();
  const { me } = useMe();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(false);
  const [config, setConfig] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const load = useCallback(() => api.get("/notifications").then(({ data }) => { setItems(data); setError(false); }).catch(() => setError(true)), [api]);
  useEffect(() => {
    load(); const timer = setInterval(load, 15000);
    api.get("/notifications/config").then(({ data }) => setConfig(data)).catch(() => {});
    if (supported) navigator.serviceWorker.register("/sw.js").then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && Notification.permission === "granted") {
        await api.post("/push/subscriptions", subscription.toJSON()); setEnabled(true);
      }
    }).catch(() => {});
    return () => clearInterval(timer);
  }, [api, load, supported, me.user_id]);
  const enable = async () => {
    if (!supported || ios && !installed) return;
    // iOS requires the permission prompt directly inside the button's user gesture.
    const permissionPromise = Notification.requestPermission();
    setBusy(true);
    try {
      if (await permissionPromise !== "granted") return toast.error("Permita as notificações nas configurações do navegador para receber avisos.");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const encoded = config.public_key.replace(/-/g, "+").replace(/_/g, "/");
        const key = Uint8Array.from(atob(encoded + "=".repeat((4 - encoded.length % 4) % 4)), (c) => c.charCodeAt(0));
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      await api.post("/push/subscriptions", subscription.toJSON()); setEnabled(true); toast.success("Notificações ativadas neste aparelho");
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) { await api.delete("/push/subscriptions", { data: subscription.toJSON() }); await subscription.unsubscribe(); }
      setEnabled(false); toast.success("Notificações desativadas neste aparelho");
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const visit = async (item) => {
    try {
      await api.post(`/notifications/${item.id}/read`);
      setItems((previous) => previous.map((n) => n.id === item.id ? { ...n, read: true } : n));
      setOpen(false);
      if (item.url?.startsWith("/") && !item.url.startsWith("//")) navigate(item.url);
    } catch (err) { toast.error(errMsg(err)); }
  };
  const unread = items.filter((n) => !n.read).length;
  return <><Button type="button" variant="outline" onClick={() => setOpen(true)} aria-label={`Notificações, ${unread} não lidas`} className="relative"><Bell className="h-4 w-4" /> Notificações {unread > 0 && <span className="rounded-full bg-red-500 px-2 text-xs text-white">{unread}</span>}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Notificações</DialogTitle><DialogDescription>Mensagens, candidaturas, respostas e registros dos seus serviços.</DialogDescription></DialogHeader>
      <div className="space-y-2 border border-border p-3">
        {ios && !installed ? <p className="text-sm">No iPhone: abra o endereço do app no Safari, toque em Compartilhar → Adicionar à Tela de Início. Depois abra pelo ícone e ative as notificações aqui.</p> : !supported ? <p className="text-sm">Este navegador não oferece notificações push. Seus avisos continuam disponíveis nesta tela.</p> : <Button type="button" onClick={enabled ? disable : enable} disabled={busy || !config?.enabled || !config?.public_key}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}{enabled ? "Desativar neste aparelho" : "Ativar notificações no celular"}</Button>}
        {supported && !config?.enabled && <p className="text-xs text-muted-foreground">Configurando o envio de notificações...</p>}
      </div>
      {error && <button type="button" onClick={load} className="text-sm underline">Falha ao carregar. Tentar novamente</button>}
      {!error && !items.length && <p className="text-sm text-muted-foreground">Você ainda não tem notificações.</p>}
      <div className="space-y-2">{items.map((n) => <button key={n.id} type="button" onClick={() => visit(n)} className={`block w-full border border-border p-3 text-left ${n.read ? "opacity-60" : "bg-muted"}`}><p className="font-semibold">{n.title}</p><p className="text-sm">{n.body}</p><time className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")}</time></button>)}</div>
    </DialogContent></Dialog>
  </>;
};
