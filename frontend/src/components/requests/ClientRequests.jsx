import { useState } from "react";
import { ClipboardList, Loader2, Plus } from "lucide-react";
import { useMe } from "@/context/MeContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader } from "@/components/common/Misc";
import { RequestCard } from "@/components/requests/RequestCard";
import { RequestActions } from "@/components/requests/RequestActions";
import { ReviewDialog } from "@/components/requests/ReviewDialog";
import { CreateRequestDialog } from "@/components/requests/CreateRequestDialog";
import { useMyRequests } from "@/components/requests/useMyRequests";

export const RequestList = ({ items, empty, onUpdated, onReview, me }) => {
  if (items === null) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-foreground" />;
  if (items.length === 0) return empty;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((r) => (
        <RequestCard key={r.id} request={r} me={me}>
          <RequestActions request={r} onUpdated={onUpdated} onReview={onReview} />
        </RequestCard>
      ))}
    </div>
  );
};

export const ClientRequests = () => {
  const { me } = useMe();
  const { items, setItems, update, markReviewed } = useMyRequests();
  const [open, setOpen] = useState(false);
  const [reviewReq, setReviewReq] = useState(null);
  const mine = items?.filter((r) => r.client_id === me.user_id) ?? null;
  const active = mine?.filter((r) => ["pendente", "aceito", "em_andamento"].includes(r.status)) ?? null;
  const history = mine?.filter((r) => ["concluido", "cancelado"].includes(r.status)) ?? null;
  const newBtn = (
    <Button onClick={() => setOpen(true)} className="rounded-none" data-testid="create-service-request-button">
      <Plus className="h-4 w-4" /> Novo pedido
    </Button>
  );
  const props = { me, onUpdated: update, onReview: setReviewReq };

  return (
    <div>
      <PageHeader eyebrow="Contratante" title="Meus pedidos" subtitle="Publique um pedido e profissionais próximos aceitam na hora.">{newBtn}</PageHeader>
      <Tabs defaultValue="ativos">
        <TabsList className="rounded-none bg-muted/70 p-1">
          <TabsTrigger value="ativos" className="rounded-none px-5" data-testid="client-tab-active">Ativos {active ? `(${active.length})` : ""}</TabsTrigger>
          <TabsTrigger value="historico" className="rounded-none px-5" data-testid="client-tab-history">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="ativos" className="mt-6">
          <RequestList items={active} {...props} empty={<EmptyState icon={ClipboardList} title="Nenhum pedido ativo" text="Precisa de um eletricista, diarista ou designer? Publique agora." action={newBtn} testid="client-requests-empty" />} />
        </TabsContent>
        <TabsContent value="historico" className="mt-6">
          <RequestList items={history} {...props} empty={<EmptyState icon={ClipboardList} title="Sem histórico ainda" testid="client-history-empty" />} />
        </TabsContent>
      </Tabs>
      <CreateRequestDialog open={open} onOpenChange={setOpen} onCreated={(r) => setItems((prev) => [r, ...(prev || [])])} />
      <ReviewDialog key={reviewReq?.id} request={reviewReq} onClose={() => setReviewReq(null)} onDone={(id) => markReviewed(id, "client_reviewed")} />
    </div>
  );
};
