import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import { Crosshair, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { DEFAULT_POS } from "@/lib/constants";
import { useMe } from "@/context/MeContext";
import { Logo } from "@/components/common/Misc";
import { CategoryChips } from "@/components/common/CategoryChips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function Onboarding() {
  const { me, setMe } = useMe();
  const { user } = useUser();
  const api = useApi();
  const navigate = useNavigate();
  const role = "membro";
  const [name, setName] = useState(user?.fullName || user?.firstName || "");
  const [city, setCity] = useState("");
  const [cats, setCats] = useState([]);
  const [headline, setHeadline] = useState("");
  const [rate, setRate] = useState("");
  const [bio, setBio] = useState("");
  const [pos, setPos] = useState(null);
  const [busy, setBusy] = useState(false);

  if (me.role) return <Navigate to="/feed" replace />;

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => toast.error("Não foi possível obter sua localização. Usaremos São Paulo como padrão."),
      { enableHighAccuracy: true, timeout: 8000 },
    );

  const submit = async (e) => {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Informe seu nome");
    setBusy(true);
    const p = pos || DEFAULT_POS;
    const body = { role, name: name.trim(), city, lat: p.lat, lng: p.lng };
    Object.assign(body, { categories: cats, headline, bio, hourly_rate: rate === "" ? null : Number(rate) });
    try {
      const { data } = await api.put("/me", body);
      setMe(data);
      toast.success("Cadastro concluído!");
      navigate("/feed", { replace: true });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10" data-testid="onboarding-page">
      <form onSubmit={submit} className="mx-auto max-w-2xl space-y-8">
        <div className="flex items-center justify-between gap-4"><Logo /><div className="flex items-center gap-2"><ThemeToggle compact /><LogoutButton /></div></div>
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-foreground">Bem-vindo(a)</p>
          <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Complete seu perfil</h1>
          <p className="mt-2 text-muted-foreground">Uma única conta para contratar e trabalhar. Os dados dos serviços que você oferece são opcionais e podem ser preenchidos depois.</p>
        </div>
        
        {role && (
          <div className="animate-fade-up space-y-5 rounded-none border border-border bg-card p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Seu nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} data-testid="onboarding-name-input" />
              </div>
              <div className="space-y-1.5">
                <Label>Bairro / cidade</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} placeholder="Ex.: Moema, São Paulo" data-testid="onboarding-city-input" />
              </div>
            </div>
            {(
              <>
                <div className="space-y-2">
                  <Label>Serviços que você oferece (opcional)</Label>
                  <CategoryChips value={cats} onChange={setCats} includeAll={false} multiple testid="onboarding-category" />
                </div>
                <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                  <div className="space-y-1.5">
                    <Label>Título profissional</Label>
                    <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} placeholder="Ex.: Eletricista residencial • NR10" data-testid="onboarding-headline-input" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor/hora (R$)</Label>
                    <Input type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Opcional" data-testid="onboarding-rate-input" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Sobre você</Label>
                  <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={1000} placeholder="Experiência, especialidades, região de atendimento..." data-testid="onboarding-bio-input" />
                </div>
              </>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-none bg-card p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Sua localização</p>
                <p className="text-xs text-muted-foreground" data-testid="onboarding-location-status">
                  {pos ? "Localização capturada" : "Usada para mostrar profissionais e pedidos próximos"}
                </p>
              </div>
              <Button type="button" variant="outline" className="rounded-none" onClick={locate} data-testid="onboarding-locate-button">
                <Crosshair className="h-4 w-4" /> {pos ? "Atualizar" : "Usar minha localização"}
              </Button>
            </div>
          </div>
        )}
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-none text-base font-semibold" data-testid="onboarding-submit-button">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Concluir cadastro
        </Button>
      </form>
    </div>
  );
}
