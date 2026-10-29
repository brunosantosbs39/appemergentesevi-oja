import { requestPrice } from "@/components/map/requestMarkers.mjs";
import { ApplyButton } from "@/components/requests/ApplyButton";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Crosshair, Loader2, MapPinOff } from "lucide-react";
import { useApi } from "@/lib/api";
import { DEFAULT_POS, RADIUS_OPTIONS, brl, catOf, km } from "@/lib/constants";
import { useMe } from "@/context/MeContext";
import { useGeo } from "@/hooks/useGeo";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/common/Misc";
import { CategoryChips } from "@/components/common/CategoryChips";
import { UserAvatar } from "@/components/common/UserAvatar";
import { RatingBadge } from "@/components/common/StarRating";
import { MapView } from "@/components/map/MapView";
import { CreateRequestDialog } from "@/components/requests/CreateRequestDialog";

const ProPopup = ({ p, canHire, onHire }) => (
  <div className="w-56" data-testid="map-pro-popup">
    <div className="flex items-center gap-3">
      <UserAvatar user={p} ring />
      <div className="min-w-0">
        <p className="truncate font-heading text-sm font-bold text-foreground">{p.name}</p>
        <p className="truncate text-xs text-muted-foreground">{catOf(p.categories?.[0]).label} • {km(p.distance_km)}</p>
      </div>
    </div>
    <div className="mt-2 flex items-center justify-between">
      <RatingBadge avg={p.rating_avg} count={p.rating_count} />
      {p.hourly_rate != null && <span className="text-xs font-semibold text-foreground">{brl(p.hourly_rate)}/h</span>}
    </div>
    <div className="mt-3 flex gap-2">
      <Link to={`/perfil/${p.user_id}`} className="flex-1 rounded-none border border-border py-1.5 text-center text-xs font-semibold !text-foreground" data-testid="map-popup-profile-link">
        Ver perfil
      </Link>
      {canHire && (
        <button onClick={() => onHire(p)} className="flex-1 rounded-none bg-primary py-1.5 text-xs font-semibold text-primary-foreground" data-testid="map-popup-hire-button">
          Solicitar
        </button>
      )}
    </div>
  </div>
);

const ReqPopup = ({ r }) => (
  <div className="w-52" data-testid="map-request-popup">
    <p className="font-mono text-[10px] uppercase tracking-widest text-amber-700">{catOf(r.category).label} • {km(r.distance_km)}</p>
    <p className="mt-1 font-heading text-sm font-bold text-foreground">{r.title}</p>
    <p className="text-xs font-semibold text-foreground">{requestPrice(r)} <span className="font-normal text-muted-foreground">· valor total</span></p>
    {r.description && <p className="mt-2 text-xs text-foreground">{r.description}</p>}
    {r.billing_type === "hourly" && <p className="text-xs text-muted-foreground">Contratação por hora</p>}
    {r.billing_type === "daily" && <p className="text-xs text-muted-foreground">Contratação por diária</p>}
    <Link to="/pedidos" className="mt-2 block rounded-none bg-primary py-1.5 text-center text-xs font-semibold !text-primary-foreground" data-testid="map-popup-request-link">
      Ver pedido
    </Link>
    <ApplyButton request={r} />
  </div>
);

const ProListItem = ({ p }) => (
  <Link to={`/perfil/${p.user_id}`} data-testid={`map-pro-list-item-${p.user_id}`} className="flex items-center gap-3 rounded-none border border-border bg-card p-3 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/50">
    <UserAvatar user={p} ring />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-bold text-foreground">{p.name}</p>
      <p className="truncate text-xs text-muted-foreground">{p.headline || catOf(p.categories?.[0]).label}</p>
    </div>
    <div className="flex flex-col items-end gap-1">
      <RatingBadge avg={p.rating_avg} count={p.rating_count} />
      <span className="font-mono text-[10px] text-muted-foreground">{km(p.distance_km)}</span>
    </div>
  </Link>
);

export default function MapPage() {
  const api = useApi();
  const { me } = useMe();
  const [params] = useSearchParams();
  const valid = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const fromLink = params.has("lat") && params.has("lng") && valid(Number(params.get("lat")), Number(params.get("lng")));
  const initial = fromLink ? { lat: Number(params.get("lat")), lng: Number(params.get("lng")) } : valid(me.lat, me.lng) ? { lat: me.lat, lng: me.lng } : DEFAULT_POS;
  const { pos, status, locate, accuracy, updatedAt } = useGeo(initial);
  const [cat, setCat] = useState("todos");
  const [radius, setRadius] = useState(25);
  const [pros, setPros] = useState(null);
  const [reqs, setReqs] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [mapError, setMapError] = useState(false);
  const [hire, setHire] = useState(null);
  const isPro = true;

  useEffect(() => {
    if (!fromLink) locate();
  }, [fromLink, locate]);

  useEffect(() => {
    const params = { lat: pos.lat, lng: pos.lng, radius_km: radius, ...(cat !== "todos" ? { category: cat } : {}) };
    let current = true; setPros(null); setReqs([]); setMapError(false);
    let loading = false;
    const refresh = async () => {
      if(loading)return;
      loading = true;
      try {
        const [p,r] = await Promise.all([api.get("/professionals", {params}), api.get("/requests/available", {params})]);
        if(current){setPros(p.data);setReqs(r.data);setMapError(false);setLastRefresh(Date.now());}
      } catch { if(current){setPros(previous=>previous || []);setMapError(true);} }
      finally {loading=false;}
    };
    refresh();
    const interval = setInterval(()=>{if(document.visibilityState==="visible")refresh();},15000);
    const visible = ()=>{if(document.visibilityState==="visible")refresh();};
    document.addEventListener("visibilitychange",visible);
    return () => { current = false;clearInterval(interval);document.removeEventListener("visibilitychange",visible); };
  }, [api, pos.lat, pos.lng, cat, radius, isPro]);

  return (
    <div>
      <PageHeader eyebrow="Radar" title="Oportunidades no mapa" subtitle="Pontos pulsantes mostram vagas abertas. Toque no valor para ver os detalhes e se candidatar.">
        <Select value={String(radius)} onValueChange={(v) => setRadius(Number(v))}>
          <SelectTrigger className="w-44 rounded-none bg-card" data-testid="map-radius-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RADIUS_OPTIONS.map((o) => <SelectItem key={o.v} value={String(o.v)}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" className="rounded-none bg-card" onClick={locate} data-testid="map-locate-me-button">
          {status === "locating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Minha localização
        </Button>
      </PageHeader>
      <CategoryChips value={cat} onChange={setCat} testid="map-category-chip" />
      {["denied","timeout","unavailable","unsupported"].includes(status) && (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="map-location-denied">Não foi possível obter sua localização atual. O mapa está usando o local salvo ou uma região inicial. Ative a localização no aparelho e tente novamente.</p>
      )}
      <p className="mt-3 text-xs text-muted-foreground" role="status">{accuracy != null ? `Localização do aparelho: precisão aproximada de ${Math.round(accuracy)} m · atualizada às ${new Date(updatedAt).toLocaleTimeString("pt-BR")}` : fromLink ? "Centro definido pelo link; não representa sua localização atual." : "Centro do perfil ou região inicial; use Minha localização para atualizar."} As distâncias são em linha reta. Os profissionais aparecem no local cadastrado.</p>
      {mapError && <p role="alert">Não foi possível carregar os resultados. Altere o raio ou tente atualizar sua localização.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground" aria-label="Legenda do mapa">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-foreground" /> Vagas abertas · valor total</span>
        <span>Fotos: profissionais</span>
        {lastRefresh && <span>Atualizado às {new Date(lastRefresh).toLocaleTimeString("pt-BR")} · atualização a cada 15 s</span>}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <MapView
          center={pos}
          accuracyMeters={accuracy}
          showMe={accuracy != null}
          radiusKm={radius}
          pros={pros || []}
          requests={reqs}
          className="h-[60svh] min-h-[360px] sm:h-[560px]"
          renderProPopup={(p) => <ProPopup p={p} canHire={true} onHire={setHire} />}
          renderRequestPopup={(r) => <ReqPopup r={r} />}
        />
        <div className="space-y-3 lg:max-h-[560px] lg:overflow-y-auto lg:pr-1" data-testid="map-pros-list">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground" data-testid="map-results-count">
            {pros === null ? "Buscando..." : `${pros.length} profissionais${isPro ? ` • ${reqs.length} pedidos` : ""}`}
          </p>
          {pros?.length === 0 && reqs.length === 0 && !mapError && (
            <div className="rounded-none border border-dashed border-border bg-card p-6 text-center" data-testid="map-empty-state">
              <MapPinOff className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold text-foreground">Nenhuma vaga ou profissional neste raio</p>
              {radius > 0 && (
                <Button variant="outline" size="sm" className="mt-3 rounded-none" onClick={() => setRadius(0)} data-testid="map-show-all-button">
                  Ver todos
                </Button>
              )}
            </div>
          )}
          {pros?.map((p) => <ProListItem key={p.user_id} p={p} />)}
        </div>
      </div>
      <CreateRequestDialog open={!!hire} onOpenChange={(o) => !o && setHire(null)} targetPro={hire} />
    </div>
  );
}
