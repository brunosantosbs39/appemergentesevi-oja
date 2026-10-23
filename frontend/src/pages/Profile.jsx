import { mergeItems } from "@/lib/pagination";
import { CreatePostDialog } from "@/components/feed/CreatePostDialog";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Grid3x3, Heart, Loader2, Star, UserX } from "lucide-react";
import { imgUrl, useApi } from "@/lib/api";
import { ago, catOf } from "@/lib/constants";
import { useMe } from "@/context/MeContext";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/Misc";
import { UserAvatar } from "@/components/common/UserAvatar";
import { Stars } from "@/components/common/StarRating";
import { PostCard } from "@/components/feed/PostCard";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";
import { CreateRequestDialog } from "@/components/requests/CreateRequestDialog";

const PostsGrid = ({ posts, onOpen }) =>
  posts.length === 0 ? (
    <EmptyState icon={Grid3x3} title="Nenhuma postagem ainda" testid="profile-posts-empty" />
  ) : (
    <div className="grid grid-cols-3 gap-1.5 sm:gap-3" data-testid="profile-posts-grid">
      {posts.map((p) => (
        <button key={p.id} onClick={() => onOpen(p)} className="group relative aspect-square overflow-hidden rounded-none bg-card sm:rounded-none" data-testid={`profile-post-thumb-${p.id}`}>
          <img src={imgUrl(p.image)} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
          <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 text-sm font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Heart className="h-4 w-4 fill-white" /> {p.likes_count}
          </span>
        </button>
      ))}
    </div>
  );

const ReviewsList = ({ reviews }) =>
  reviews.length === 0 ? (
    <EmptyState icon={Star} title="Sem avaliações ainda" testid="profile-reviews-empty" />
  ) : (
    <div className="space-y-3" data-testid="profile-reviews-list">
      {reviews.map((r) => (
        <div key={r.id} className="rounded-none border border-border bg-card p-5" data-testid="profile-review-item">
          <div className="flex items-center gap-3">
            <UserAvatar user={r.author} className="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <Link to={`/perfil/${r.from_id}`} className="text-sm font-bold text-foreground hover:text-foreground">{r.author?.name || "Usuário"}</Link>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{catOf(r.category).label} • {ago(r.created_at)}</p>
            </div>
            <Stars value={r.rating} />
          </div>
          {r.comment && <p className="mt-3 text-sm leading-relaxed text-foreground">{r.comment}</p>}
        </div>
      ))}
    </div>
  );

export default function Profile() {
  const { id } = useParams();
  const { me } = useMe();
  const api = useApi();
  const uid = id === "me" ? me.user_id : id;
  const isMe = uid === me.user_id;
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [postCursors, setPostCursors] = useState({});
  const [loadingPage, setLoadingPage] = useState(null);
  const loadPostPage = async (kind) => {
    if (loadingPage || !postCursors[kind]) return;
    setLoadingPage(kind);
    try {
      const { data, headers } = await api.get("/posts", { params: { user_id: uid, kind, before: postCursors[kind] } });
      (kind === "portfolio" ? setPortfolio : setPosts)((old) => mergeItems(old, data));
      setPostCursors((old) => ({ ...old, [kind]: headers["x-next-cursor"] || null }));
    } finally { setLoadingPage(null); }
  };
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [hireOpen, setHireOpen] = useState(false);
  const [viewPost, setViewPost] = useState(null);

  const load = useCallback(async () => {
    const [u, p, r, works] = await Promise.all([api.get(`/users/${uid}`), api.get("/posts", { params: { user_id: uid } }), api.get(`/users/${uid}/reviews`), api.get("/posts", { params: { user_id: uid, kind: "portfolio" } })]);
    setUser(u.data);
    setPosts(p.data);
    setPortfolio(works.data);
    setPostCursors({ publication: p.headers["x-next-cursor"], portfolio: works.headers["x-next-cursor"] });
    setReviews(r.data);
  }, [api, uid]);

  useEffect(() => {
    setUser(null);
    load().catch(() => setUser(false));
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      api.get(`/users/${uid}`).then(({ data }) => setUser(data)).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [api, uid]);

  if (user === false) return <EmptyState icon={UserX} title="Perfil não encontrado" testid="profile-not-found" />;
  if (!user) return <Loader2 className="mx-auto mt-16 h-6 w-6 animate-spin text-foreground" />;
  const isPro = user.role === "profissional";

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="profile-page">
      <ProfileHeader user={user} isMe={isMe} canHire={isPro && !isMe} onEdit={() => setEditOpen(true)} onHire={() => setHireOpen(true)} />
      {user.bio && (
        <section className="rounded-none border border-border bg-card p-6" data-testid="profile-bio">
          <p className="font-mono text-[10px] uppercase tracking-widest text-foreground">Sobre</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">{user.bio}</p>
        </section>
      )}
      <Tabs defaultValue={isPro ? "portfolio" : "posts"}>
        <TabsList className="h-auto flex-wrap rounded-none bg-muted/70 p-1">
          {isPro && <TabsTrigger value="portfolio" className="rounded-none px-4">Portfólio ({portfolio.length})</TabsTrigger>}
          <TabsTrigger value="posts" className="rounded-none px-5" data-testid="profile-tab-posts">Publicações</TabsTrigger>
          <TabsTrigger value="reviews" className="rounded-none px-5" data-testid="profile-tab-reviews">Avaliações ({reviews.length})</TabsTrigger>
        </TabsList>
        {isPro && <TabsContent value="portfolio" className="mt-5 space-y-4">
          <p className="text-sm text-muted-foreground">Trabalhos realizados para conhecer a qualidade do serviço.</p>
          {isMe && <Button type="button" onClick={() => setPortfolioOpen(true)}>Adicionar trabalho ao portfólio</Button>}
          <PostsGrid posts={portfolio} onOpen={setViewPost} />
          {postCursors.portfolio && <Button variant="outline" disabled={!!loadingPage} onClick={() => loadPostPage("portfolio").catch(() => {})}>Carregar mais trabalhos</Button>}
        </TabsContent>}
        <TabsContent value="posts" className="mt-5"><PostsGrid posts={posts} onOpen={setViewPost} />{postCursors.publication && <Button className="mt-4" variant="outline" disabled={!!loadingPage} onClick={() => loadPostPage("publication").catch(() => {})}>Carregar mais publicações</Button>}</TabsContent>
        <TabsContent value="reviews" className="mt-5"><ReviewsList reviews={reviews} /></TabsContent>
      </Tabs>
      <Dialog open={!!viewPost} onOpenChange={(o) => !o && setViewPost(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-lg" data-testid="profile-post-dialog">
          <DialogTitle className="sr-only">Postagem</DialogTitle>
          {viewPost && <PostCard post={viewPost} onDeleted={(pid) => { setPosts((p) => p.filter((x) => x.id !== pid)); setPortfolio((p) => p.filter((x) => x.id !== pid)); setViewPost(null); }} />}
        </DialogContent>
      </Dialog>
      <CreatePostDialog kind="portfolio" open={portfolioOpen} onOpenChange={setPortfolioOpen} onCreated={(post) => setPortfolio((previous) => [post, ...previous])} />
      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} onSaved={() => load().catch(() => {})} />
      <CreateRequestDialog open={hireOpen} onOpenChange={setHireOpen} targetPro={user} />
    </div>
  );
}
