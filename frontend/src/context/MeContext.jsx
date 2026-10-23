import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useApi } from "@/lib/api";
import { Button } from "@/components/ui/button";

const MeContext = createContext(null);

const FullScreenState = ({ error, onRetry }) => (
  <div className="grid min-h-screen place-items-center bg-background" data-testid="me-loading-state">
    {error ? (
      <div className="text-center">
        <p className="font-heading text-lg font-bold text-foreground">Não foi possível carregar seu perfil</p>
        <Button className="mt-4 rounded-none" onClick={onRetry} data-testid="me-retry-button">Tentar novamente</Button>
      </div>
    ) : (
      <Loader2 className="h-7 w-7 animate-spin text-foreground" />
    )}
  </div>
);

export function MeProvider({ children }) {
  const api = useApi();
  const [me, setMe] = useState(null);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    const { data } = await api.get("/me");
    setMe(data);
    return data;
  }, [api]);
  useEffect(() => {
    refresh().catch(() => setError(true));
  }, [refresh]);
  const retry = () => {
    setError(false);
    refresh().catch(() => setError(true));
  };
  if (!me) return <FullScreenState error={error} onRetry={retry} />;
  return <MeContext.Provider value={{ me, setMe, refresh }}>{children}</MeContext.Provider>;
}

export const useMe = () => useContext(MeContext);
