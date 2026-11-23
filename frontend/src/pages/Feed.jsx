import { FeaturedPros } from "@/components/feed/FeaturedPros";
import { RequestCard } from "@/components/requests/RequestCard";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, Loader2 } from "lucide-react";
import { useApi } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/common/Misc";
import { CategoryChips } from "@/components/common/CategoryChips";
import { PostCard } from "@/components/feed/PostCard";
import { CreatePostDialog } from "@/components/feed/CreatePostDialog";
import { CreateRequestDialog } from "@/components/requests/CreateRequestDialog";

export default function Feed() {
  const api = useApi();
  const { me } = useMe();
  const [cat, setCat] = useState("todos");
  const [open, setOpen] = useState(false);
  const [hire, setHire] = useState(null);
  const timeline = useInfiniteQuery({
    queryKey: ["regional-feed", me.user_id, me.lat, me.lng, cat],
    initialPageParam: null,
    queryFn: async ({pageParam, signal}) => (await api.get("/feed/regional", {signal, params:{
      category:cat === "todos" ? undefined : cat, before:pageParam || undefined
    }})).data,
    getNextPageParam: page => page.next_cursor || undefined,
    refetchInterval: 30000
  });
  const items = timeline.data?.pages.flatMap(page => page.items) || [];
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(190px,28%)]">
      <section className="min-w-0">
        <PageHeader eyebrow={`Olá, ${me.name?.split(" ")[0] || ""}`} title="Feed" subtitle="Publicações e vagas em um raio de 25 km da sua localização cadastrada.">
          <Button onClick={() => setOpen(true)} className="rounded-none" data-testid="create-post-trigger-button">
            <ImagePlus className="h-4 w-4" /> Nova postagem
          </Button>
        </PageHeader>
        <CategoryChips searchOnly value={cat} onChange={setCat} testid="feed-category-chip" />
        <div data-testid="instagram-feed-container" className="mt-6 space-y-6">
          {timeline.isLoading && <Loader2 aria-label="Carregando feed" className="animate-spin" />}
          {timeline.isError && <div role="alert" className="space-y-3 border border-border p-4"><p>Não foi possível atualizar o feed.{items.length > 0 && " As publicações anteriores continuam visíveis."}</p><Button variant="outline" disabled={timeline.isFetching} onClick={() => timeline.refetch()}>{timeline.isFetching ? "Tentando novamente…" : "Tentar novamente"}</Button></div>}
          {timeline.isSuccess && !items.length && <EmptyState icon={ImagePlus} title="Nenhuma publicação ou vaga por aqui" text={timeline.data.pages[0].needs_location ? "Informe sua localização para encontrar oportunidades próximas." : "Tente outra categoria ou volte mais tarde."} action={timeline.data.pages[0].needs_location ? <Button asChild variant="outline"><Link to="/perfil/me">Atualizar localização</Link></Button> : cat !== "todos" ? <Button variant="outline" onClick={()=>setCat("todos")}>Limpar filtro</Button> : <Button variant="outline" onClick={()=>setOpen(true)}>Criar publicação</Button>} />}
          {items.map(({type,item}) => type === "request"
            ? <RequestCard key={"vaga-"+item.id} request={item} me={me} />
            : <PostCard key={"post-"+item.id} post={item} onHire={setHire} onDeleted={() => timeline.refetch()} />)}
          {timeline.hasNextPage && <Button variant="outline" disabled={timeline.isFetching} onClick={() => timeline.fetchNextPage()}>{timeline.isFetchingNextPage ? "Carregando…" : "Carregar anteriores"}</Button>}
        </div>
      </section>
      <aside className="order-first lg:order-none"><FeaturedPros /></aside>
      <CreatePostDialog open={open} onOpenChange={setOpen} onCreated={() => timeline.refetch()} />
      <CreateRequestDialog open={!!hire} onOpenChange={(o) => !o && setHire(null)} targetPro={hire} />
    </div>
  );
}
