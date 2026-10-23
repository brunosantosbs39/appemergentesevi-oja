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
        <button onClick={() => onHire(p)} className="flex-1 rounded-none bg-secondary py-1.5 text-xs font-semibold text-white" data-testid="map-popup-hire-button">
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
    <p className="text-xs font-semibold text-foreground">{brl(r.budget)}</p>
    <Link to="/pedidos" className="mt-2 block rounded-none bg-secondary py-1.5 text-center text-xs font-semibold !text-white" data-testid="map-popup-request-link">
      Ver pedido
    </Link>
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
  const fromLink = params.has("lat");
  const initial = fromLink ? { lat: Number(params.get("lat")), lng: Number(params.get("lng")) } : me.lat != null ? { lat: me.lat, lng: me.lng } : DEFAULT_POS;
  const { pos, status, locate } = useGeo(initial);
  const [cat, setCat] = useState("todos");
  const [radius, setRadius] = useState(25);
  const [pros, setPros] = useState(null);
  const [reqs, setReqs] = useState([]);
  const [hire, setHire] = useState(null);
  const isPro = me.role === "profissional";

  useEffect(() => {
    if (!fromLink) locate();
  }, [fromLink, locate]);

  useEffect(() => {
    const params = { lat: pos.lat, lng: pos.lng, radius_km: radius, ...(cat !== "todos" ? { category: cat } : {}) };
    api.get("/professionals", { params }).then((r) => setPros(r.data)).catch(() => setPros([]));
    if (isPro) api.get("/requests/available", { params }).then((r) => setReqs(r.data)).catch(() => setReqs([]));
  }, [api, pos.lat, pos.lng, cat, radius, isPro]);

  return (
    <div>
      <PageHeader eyebrow="Radar" title="Profissionais no mapa" subtitle={isPro ? "Veja colegas e pedidos abertos (R$) perto de você." : "Encontre quem pode te atender agora."}>
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
      {status === "denied" && (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="map-location-denied">Não conseguimos acessar sua localização — mostrando a partir do seu perfil ou de São Paulo.</p>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <MapView
          center={pos}
          radiusKm={radius}
          pros={pros || []}
          requests={reqs}
          className="h-[420px] sm:h-[560px]"
          renderProPopup={(p) => <ProPopup p={p} canHire={me.role === "contratante"} onHire={setHire} />}
          renderRequestPopup={(r) => <ReqPopup r={r} />}
        />
        <div className="space-y-3 lg:max-h-[560px] lg:overflow-y-auto lg:pr-1" data-testid="map-pros-list">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground" data-testid="map-results-count">
            {pros === null ? "Buscando..." : `${pros.length} profissionais${isPro ? ` • ${reqs.length} pedidos` : ""}`}
          </p>
          {pros?.length === 0 && (
            <div className="rounded-none border border-dashed border-border bg-card p-6 text-center" data-testid="map-empty-state">
              <MapPinOff className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold text-foreground">Ninguém neste raio</p>
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
