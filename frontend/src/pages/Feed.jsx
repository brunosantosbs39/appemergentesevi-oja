import { useCallback, useEffect, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const [hire, setHire] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/posts", { params: cat !== "todos" ? { category: cat } : {} });
    setPosts(data);
  }, [api, cat]);

  useEffect(() => {
    setPosts(null);
    load().catch(() => setPosts([]));
  }, [load]);

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0">
        <PageHeader eyebrow={`Olá, ${me.name?.split(" ")[0] || ""}`} title="Feed" subtitle="Trabalhos recentes de profissionais perto de você.">
          <Button onClick={() => setOpen(true)} className="rounded-full" data-testid="create-post-trigger-button">
            <ImagePlus className="h-4 w-4" /> Nova postagem
          </Button>
        </PageHeader>
        <CategoryChips value={cat} onChange={setCat} testid="feed-category-chip" />
        <div data-testid="instagram-feed-container" className="mt-6 max-w-xl space-y-6">
          {posts === null && <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" />}
          {posts?.length === 0 && (
            <EmptyState icon={ImagePlus} title="Nada por aqui ainda" text="Seja o primeiro a publicar nesta categoria." testid="feed-empty-state" />
          )}
          {posts?.map((p) => (
            <PostCard key={p.id} post={p} onHire={setHire} onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))} />
          ))}
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
