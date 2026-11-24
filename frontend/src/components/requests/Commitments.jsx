import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { useMe } from "@/context/MeContext";
import { useMyRequests } from "@/components/requests/useMyRequests";
import { RequestList } from "@/components/requests/ClientRequests";
import { ReviewDialog } from "@/components/requests/ReviewDialog";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/common/Misc";

export const Commitments = () => {
  const { me } = useMe();
  const { items, error, reload, update, markReviewed, hasMore, loadMore, loadingMore } = useMyRequests();
  const [history, setHistory] = useState(false);
  const [review, setReview] = useState(null);
  const commitments = items?.filter(r => !r.staffing_version && r.professional_id &&
    (r.client_id === me.user_id || r.professional_id === me.user_id));
  const visible = commitments?.filter(r => (history ? ["cancelado", "concluido"] : ["aceito", "em_andamento"]).includes(r.status)) ?? null;
  useEffect(() => {
    if (review) return;
    const pending = items?.find(r => r.status === "concluido" && r.check_out_at &&
      (r.client_id === me.user_id ? !r.client_reviewed : r.professional_id === me.user_id && !r.pro_reviewed) &&
      !sessionStorage.getItem("review-prompt:" + me.user_id + ":" + r.id));
    if (pending) {
      sessionStorage.setItem("review-prompt:" + me.user_id + ":" + pending.id, "1");
      setReview(pending);
    }
  }, [items, me.user_id, review]);
  return <section>
    <PageHeader eyebrow="Meus pedidos" title="Compromissos" />
    <div className="mb-5 flex flex-wrap gap-2">
      <Button variant={history ? "outline" : "default"} aria-pressed={!history} onClick={() => setHistory(false)}>Próximos e em andamento</Button>
      <Button variant={history ? "default" : "outline"} aria-pressed={history} onClick={() => setHistory(true)}>Finalizados e cancelados</Button>
    </div>
    {error && <div role="alert" className="mb-4"><p>Não foi possível atualizar os compromissos.</p><Button variant="outline" onClick={reload}>Tentar novamente</Button></div>}
    <RequestList items={visible} me={me} onUpdated={r => { update(r); reload(); }} onReview={setReview}
      empty={<EmptyState icon={CalendarCheck} title={history ? "Sem histórico de compromissos" : "Nenhum compromisso ativo"} text="Ao aceitar uma contratação, o compromisso aparece aqui para as duas pessoas." />} />
    {hasMore && <Button className="mt-5" variant="outline" disabled={loadingMore} onClick={() => loadMore().catch(() => {})}>{loadingMore ? "Carregando..." : "Carregar mais compromissos"}</Button>}
    <ReviewDialog key={review?.id} request={review} onClose={() => setReview(null)} onDone={id => markReviewed(id, review.client_id === me.user_id ? "client_reviewed" : "pro_reviewed")} />
  </section>;
};
