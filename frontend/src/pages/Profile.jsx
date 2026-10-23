import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Grid3x3, Heart, Loader2, Star, UserX } from "lucide-react";
import { toast } from "sonner";
import { errMsg, imgUrl, useApi } from "@/lib/api";
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
          <span className="absolute inset-0 flex items-center justify-center gap-1 bg-secondary/50 text-sm font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
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
  const navigate = useNavigate();
  const uid = id === "me" ? me.user_id : id;
  const isMe = uid === me.user_id;
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [hireOpen, setHireOpen] = useState(false);
  const [viewPost, setViewPost] = useState(null);

  const load = useCallback(async () => {
    const [u, p, r] = await Promise.all([api.get(`/users/${uid}`), api.get("/posts", { params: { user_id: uid } }), api.get(`/users/${uid}/reviews`)]);
    setUser(u.data);
    setPosts(p.data);
    setReviews(r.data);
  }, [api, uid]);

  useEffect(() => {
    setUser(null);
    load().catch(() => setUser(false));
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      api.get(`/users/${uid}`).then(({ data }) => setUser(data)).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [api, uid]);

  const openChat = async () => {
    try {
      const { data } = await api.post("/conversations", { user_id: uid });
      navigate(`/chat/${data.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  if (user === false) return <EmptyState icon={UserX} title="Perfil não encontrado" testid="profile-not-found" />;
  if (!user) return <Loader2 className="mx-auto mt-16 h-6 w-6 animate-spin text-foreground" />;
  const isPro = user.role === "profissional";

  return (
    <div className="mx-auto max-w-4xl space-y-6" data-testid="profile-page">
      <ProfileHeader user={user} isMe={isMe} canHire={isPro && me.role === "contratante"} onEdit={() => setEditOpen(true)} onChat={openChat} onHire={() => setHireOpen(true)} />
      {user.bio && (
        <section className="rounded-none border border-border bg-card p-6" data-testid="profile-bio">
          <p className="font-mono text-[10px] uppercase tracking-widest text-foreground">Sobre</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">{user.bio}</p>
        </section>
      )}
      <Tabs defaultValue="posts">
        <TabsList className="rounded-none bg-muted/70 p-1">
          <TabsTrigger value="posts" className="rounded-none px-5" data-testid="profile-tab-posts">{isPro ? "Portfólio" : "Postagens"}</TabsTrigger>
          <TabsTrigger value="reviews" className="rounded-none px-5" data-testid="profile-tab-reviews">Avaliações ({reviews.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="posts" className="mt-5"><PostsGrid posts={posts} onOpen={setViewPost} /></TabsContent>
        <TabsContent value="reviews" className="mt-5"><ReviewsList reviews={reviews} /></TabsContent>
      </Tabs>
      <Dialog open={!!viewPost} onOpenChange={(o) => !o && setViewPost(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-lg" data-testid="profile-post-dialog">
          <DialogTitle className="sr-only">Postagem</DialogTitle>
          {viewPost && <PostCard post={viewPost} onDeleted={(pid) => { setPosts((p) => p.filter((x) => x.id !== pid)); setViewPost(null); }} />}
        </DialogContent>
      </Dialog>
      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} onSaved={() => load().catch(() => {})} />
      <CreateRequestDialog open={hireOpen} onOpenChange={setHireOpen} targetPro={user} />
    </div>
  );
}
