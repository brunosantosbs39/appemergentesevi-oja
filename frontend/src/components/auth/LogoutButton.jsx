import { useCrypto } from "@/context/CryptoContext";
import { useApi } from "@/lib/api";
import { useState } from "react";
import { useClerk } from "@clerk/react";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const LogoutButton = ({ className }) => {
  const { signOut } = useClerk();
  const api = useApi();
  const protection = useCrypto();
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      try {
        const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
        const subscription = await registration?.pushManager?.getSubscription();
        if (subscription) {
          await api.delete("/push/subscriptions", { data: subscription.toJSON(), timeout: 4000 }).catch(() => {});
          await subscription.unsubscribe();
        }
      } catch { /* Sign-out remains available when the device is offline. */ }
      if (protection) { try { await protection.lock(); } catch { toast.error("Não foi possível remover as chaves locais. Limpe os dados deste site se o aparelho for compartilhado."); } }
      await signOut({ redirectUrl: "/" });
    } catch {
      toast.error("Não foi possível sair. Tente novamente.");
      setBusy(false);
    }
  };
  return <Button type="button" variant="outline" onClick={logout} disabled={busy} className={className} data-testid="logout-button" aria-label="Sair da conta">
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
    {busy ? "Saindo..." : "Sair"}
  </Button>;
};
