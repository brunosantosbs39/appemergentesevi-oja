import { useState } from "react";
import { useClerk } from "@clerk/react";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const LogoutButton = ({ className }) => {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    if (busy) return;
    setBusy(true);
    try {
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
