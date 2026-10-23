import { mergeItems } from "@/lib/pagination";
import { Button } from "@/components/ui/button";
import { applicationLabel } from "@/components/requests/ApplicationsPanel";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Radar } from "lucide-react";
import { useApi } from "@/lib/api";
import { DEFAULT_POS, RADIUS_OPTIONS } from "@/lib/constants";
import { useMe } from "@/context/MeContext";
import { useGeo } from "@/hooks/useGeo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader } from "@/components/common/Misc";
import { RequestCard } from "@/components/requests/RequestCard";
import { ReviewDialog } from "@/components/requests/ReviewDialog";
import { useMyRequests } from "@/components/requests/useMyRequests";
import { RequestList } from "@/components/requests/ClientRequests";

const RadarBanner = ({ count }) => (
  <div className="legacy-radar-banner relative mb-5 flex items-center gap-4 overflow-hidden rounded-3xl bg-slate-950 p-5 text-white">
    <div className="radar-sweep relative grid h-14 w-14 shrink-0 place-items-center rounded-full border border-emerald-500/40">
      <Radar className="h-6 w-6 text-emerald-400" />
    </div>
    <div>
      <p className="font-heading text-lg font-bold">Procurando pedidos perto de você</p>
      <p className="text-sm text-slate-300" data-testid="pro-available-count">{count === null ? "Buscando..." : `${count} pedido${count === 1 ? "" : "s"} disponíve${count === 1 ? "l" : "is"}`}</p>
    </div>
  </div>
);

export const ProRequests = () => {
  const api = useApi();
  const { me } = useMe();
  const { pos, locate } = useGeo(me.lat != null ? { lat: me.lat, lng: me.lng } : DEFAULT_POS);
  const [radius, setRadius] = useState(25);
  const [tab, setTab] = useState("disponiveis");
  const [available, setAvailable] = useState(null);
  const availableOffset = useRef(0);
  const [moreAvailable, setMoreAvailable] = useState(false);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const loadMoreAvailable = async () => {
    if (loadingAvailable) return;
    setLoadingAvailable(true);
    try {
      const { data } = await api.get("/requests/available", { params: { lat: pos.lat, lng: pos.lng, radius_km: radius, limit: 50, offset: availableOffset.current } });
      setAvailable((previous) => mergeItems(previous, data)); availableOffset.current += data.length; setMoreAvailable(data.length === 50);
    } finally { setLoadingAvailable(false); }
  };
  const [reviewReq, setReviewReq] = useState(null);
  const { items, update, markReviewed, hasMore, loadMore, loadingMore } = useMyRequests();

  useEffect(() => {
    locate();
  }, [locate]);

  const loadAvailable = useCallback(async () => {
    const { data } = await api.get("/requests/available", { params: { lat: pos.lat, lng: pos.lng, radius_km: radius } });
    setAvailable((previous) => availableOffset.current > 50 ? mergeItems(previous, data).filter((r) => !r.expires_at || new Date(r.expires_at) > new Date()) : data);
    if (!availableOffset.current) { availableOffset.current = data.length; setMoreAvailable(data.length === 50); }
  }, [api, pos.lat, pos.lng, radius]);

  useEffect(() => {
    availableOffset.current = 0; setAvailable(null); setMoreAvailable(false);
    loadAvailable().catch(() => setAvailable([]));
    const t = setInterval(() => document.visibilityState === "visible" && loadAvailable().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [loadAvailable]);

  const applications = items?.filter((r) => r.my_application && r.professional_id !== me.user_id) ?? null;
  const mine = items?.filter((r) => r.professional_id === me.user_id) ?? null;
  const active = mine?.filter((r) => ["aceito", "em_andamento"].includes(r.status)) ?? null;
  const history = mine?.filter((r) => ["concluido", "cancelado"].includes(r.status)) ?? null;
  const props = { me, onUpdated: update, onReview: setReviewReq };

  return (
    <div>
      <PageHeader eyebrow="Profissional" title="Pedidos" subtitle="Candidate-se às vagas, aguarde aprovação e registre sua chegada e saída.">
        <Select value={String(radius)} onValueChange={(v) => setRadius(Number(v))}>
          <SelectTrigger className="w-44 rounded-none bg-card" data-testid="pro-radius-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RADIUS_OPTIONS.map((o) => <SelectItem key={o.v} value={String(o.v)}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </PageHeader>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start rounded-none bg-muted/70 p-1">
          <TabsTrigger value="disponiveis" className="rounded-none px-4" data-testid="pro-tab-available">Disponíveis</TabsTrigger>
          <TabsTrigger value="candidaturas" className="rounded-none px-3">Candidaturas {applications ? `(${applications.length})` : ""}</TabsTrigger>
          <TabsTrigger value="ativos" className="rounded-none px-4" data-testid="pro-tab-active">Meus serviços {active ? `(${active.length})` : ""}</TabsTrigger>
          <TabsTrigger value="historico" className="rounded-none px-4" data-testid="pro-tab-history">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="disponiveis" className="mt-6">
          <RadarBanner count={available?.length ?? null} />
          {available === null && <Loader2 className="mx-auto h-6 w-6 animate-spin text-foreground" />}
          {available?.length === 0 && <EmptyState icon={Radar} title="Nenhum pedido neste raio" text="Aumente o raio de busca ou volte daqui a pouco." testid="pro-available-empty" />}
          <div className="grid gap-4 lg:grid-cols-2">
            {available?.map((r) => (
              <RequestCard key={r.id} request={r} me={me} />
            ))}
          </div>
          {moreAvailable && <Button type="button" variant="outline" disabled={loadingAvailable} className="mt-5" onClick={() => loadMoreAvailable().catch(() => {})}>{loadingAvailable ? "Carregando..." : "Carregar mais oportunidades"}</Button>}
        </TabsContent>
        <TabsContent value="candidaturas" className="mt-6">
          {applications === null ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : applications.length === 0 ? <EmptyState icon={CheckCircle2} title="Nenhuma candidatura ainda" text="Candidate-se a uma vaga na aba Disponíveis." /> : <div className="grid gap-4 lg:grid-cols-2">{applications.map((r) => <RequestCard key={r.id} request={r} me={me}><p className="text-sm font-semibold">{applicationLabel(r.my_application.status)}</p></RequestCard>)}</div>}
        </TabsContent>
        <TabsContent value="ativos" className="mt-6">
          <RequestList items={active} {...props} empty={<EmptyState icon={CheckCircle2} title="Nenhum serviço em andamento" text="Após o contratante aprovar sua candidatura, o serviço aparecerá aqui com check-in liberado." testid="pro-active-empty" />} />
        </TabsContent>
        <TabsContent value="historico" className="mt-6">
          <RequestList items={history} {...props} empty={<EmptyState icon={CheckCircle2} title="Sem histórico ainda" testid="pro-history-empty" />} />
        </TabsContent>
      </Tabs>
      {hasMore && <Button type="button" variant="outline" disabled={loadingMore} className="mt-5" onClick={() => loadMore().catch(() => {})}>{loadingMore ? "Carregando..." : "Carregar mais pedidos e histórico"}</Button>}
      <ReviewDialog key={reviewReq?.id} request={reviewReq} onClose={() => setReviewReq(null)} onDone={(id) => markReviewed(id, "pro_reviewed")} />
    </div>
  );
};
