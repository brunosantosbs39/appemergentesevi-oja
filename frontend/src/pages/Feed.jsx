import { mergeItems } from "@/lib/pagination";
import { Link } from "react-router-dom";
import { RequestCard } from "@/components/requests/RequestCard";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { useApi } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/common/Misc";
import { CategoryChips } from "@/components/common/CategoryChips";
import { PostCard } from "@/components/feed/PostCard";
import { CreatePostDialog } from "@/components/feed/CreatePostDialog";
import { FeaturedPros } from "@/components/feed/FeaturedPros";
import { CreateRequestDialog } from "@/components/requests/CreateRequestDialog";

export default function Feed() {
  const api = useApi();
  const { me } = useMe();
  const [cat, setCat] = useState("todos");
  const [posts, setPosts] = useState(null);
  const [vacancies, setVacancies] = useState([]);
  const [vacancyCursor, setVacancyCursor] = useState(null);
  const [vacancyBusy, setVacancyBusy] = useState(false);
  const [vacancyError, setVacancyError] = useState(false);
  const vacancyPages = useRef(1);
  const vacancyLoading = useRef(false);
  const [open, setOpen] = useState(false);
  const [hire, setHire] = useState(null);
  const catRef = useRef(cat);
  catRef.current = cat;
  const cursor = useRef(null);
  const initialized = useRef(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMore = async () => {
    if (!cursor.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data, headers } = await api.get("/posts", { params: { ...(cat !== "todos" ? { category: cat } : {}), before: cursor.current } });
      if (catRef.current !== cat) return;
      setPosts((previous) => mergeItems(previous, data));
      cursor.current = headers["x-next-cursor"] || null; setHasMore(!!cursor.current);
    } finally { setLoadingMore(false); }
  };

  const load = useCallback(async () => {
    const { data, headers } = await api.get("/posts", { params: cat !== "todos" ? { category: cat } : {} });
    if (catRef.current !== cat) return;
    setPosts((previous) => {
      const next = headers["x-next-cursor"];
      const boundary = next ? JSON.parse(atob(next.replace(/-/g, "+").replace(/_/g, "/"))) : null;
      const older = boundary ? (previous || []).filter((post) => post.created_at < boundary[0] || post.created_at === boundary[0] && post.id < boundary[1]) : [];
      return mergeItems(older, data).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).filter((post) => !post.expires_at || new Date(post.expires_at) > new Date());
    });
    if (!initialized.current) { initialized.current = true; cursor.current = headers["x-next-cursor"] || null; setHasMore(!!cursor.current); }
  }, [api, cat]);

  useEffect(() => {
    cursor.current = null; initialized.current = false; setHasMore(false); setPosts(null);
    load().catch(() => setPosts([]));
    const timer = setInterval(() => document.visibilityState === "visible" && load().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const moreVacancies = async () => {
    if (!vacancyCursor || vacancyBusy || vacancyLoading.current) return;
    vacancyLoading.current = true;
    setVacancyBusy(true);
    try {
      const {data} = await api.get("/requests/feed", {params:{before:vacancyCursor, ...(cat!=="todos"?{category:cat}:{})}});
      if(catRef.current!==cat)return;
      setVacancies(previous=>mergeItems(previous,data.items));setVacancyCursor(data.next_cursor);vacancyPages.current++;
    } catch { setVacancyError(true); }
    finally { vacancyLoading.current = false; setVacancyBusy(false); }
  };
  useEffect(() => {
    let active=true; vacancyPages.current=1;setVacancies([]);setVacancyCursor(null);setVacancyError(false);
    const loadVacancies = async () => {
      if(vacancyLoading.current)return;
      vacancyLoading.current=true;
      try {
        let all=[], next=null;
        for(let page=0;page<vacancyPages.current;page++){
          const {data}=await api.get("/requests/feed",{params:{...(cat!=="todos"?{category:cat}:{}),...(next?{before:next}:{})}});
          if(!active)return;
          all=mergeItems(all,data.items);next=data.next_cursor;
          if(!next)break;
        }
        setVacancies(all);setVacancyCursor(next);setVacancyError(false);
      } catch { if(active)setVacancyError(true); }
      finally { vacancyLoading.current=false; }
    };
    loadVacancies();
    const timer=setInterval(()=>document.visibilityState==="visible"&&loadVacancies(),15000);
    return ()=>{active=false;clearInterval(timer);};
  }, [api,cat]);

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0">
        <PageHeader eyebrow={`Olá, ${me.name?.split(" ")[0] || ""}`} title="Feed" subtitle="Pedidos públicos para se candidatar e publicações da comunidade.">
          <Button onClick={() => setOpen(true)} className="rounded-none" data-testid="create-post-trigger-button">
            <ImagePlus className="h-4 w-4" /> Nova postagem
          </Button>
        </PageHeader>
        <CategoryChips value={cat} onChange={setCat} testid="feed-category-chip" />
        <div data-testid="instagram-feed-container" className="mt-6 max-w-xl space-y-6">
          {vacancies.length > 0 && <section className="space-y-4" aria-label="Vagas abertas"><div className="flex items-center justify-between"><h2 className="font-heading text-xl font-bold">Vagas abertas</h2><Link to="/pedidos" className="text-sm underline">Vagas das minhas categorias</Link></div>{vacancies.map((r) => <RequestCard key={r.id} request={r} me={me} />)}{vacancyCursor && <Button variant="outline" disabled={vacancyBusy} onClick={moreVacancies}>{vacancyBusy?"Carregando...":"Ver mais pedidos"}</Button>}</section>}
          {vacancyError && <p role="alert">Não foi possível atualizar os pedidos. Tentaremos novamente automaticamente.</p>}
          {posts === null && <Loader2 className="mx-auto h-6 w-6 animate-spin text-foreground" />}
          {posts?.length === 0 && (
            <EmptyState icon={ImagePlus} title="Nada por aqui ainda" text="Seja o primeiro a publicar nesta categoria." testid="feed-empty-state" />
          )}
          {posts?.map((p) => (
            <PostCard key={p.id} post={p} onHire={setHire} onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))} />
          ))}
          {hasMore && <Button variant="outline" disabled={loadingMore} onClick={() => loadMore().catch(() => {})}>{loadingMore ? "Carregando..." : "Carregar publicações anteriores"}</Button>}
        </div>
      </section>
      <aside className="hidden xl:block">
        <FeaturedPros />
      </aside>
      <CreatePostDialog open={open} onOpenChange={setOpen} onCreated={(p) => setPosts((prev) => [p, ...(prev || [])])} />
      <CreateRequestDialog open={!!hire} onOpenChange={(o) => !o && setHire(null)} targetPro={hire} />
    </div>
  );
}
