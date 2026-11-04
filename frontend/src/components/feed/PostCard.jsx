import { ContactButton } from "@/components/chat/ContactButton";
import { useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Heart, MapPin, MessageCircle, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { errMsg, imgUrl, useApi } from "@/lib/api";
import { ago, catOf } from "@/lib/constants";
import { useMe } from "@/context/MeContext";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/common/UserAvatar";
import { PostComments } from "@/components/feed/PostComments";
import { cn } from "@/lib/utils";

const PostHeader = ({ post, mine, onDelete }) => {
  const a = post.author || {};
  const isPro = a.role === "profissional";
  return (
    <header className="flex items-center gap-3 p-4">
      <Link to={`/perfil/${post.user_id}`}>
        <UserAvatar user={a} ring={isPro} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/perfil/${post.user_id}`} className="flex items-center gap-1 font-heading font-bold text-foreground hover:text-foreground" data-testid="feed-post-author-link">
          <span className="truncate">{a.name || "Usuário"}</span>
          {isPro && <BadgeCheck className="h-4 w-4 shrink-0 text-foreground" />}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {post.category && <span>{catOf(post.category).label}</span>}
          {post.location_name && (
            <span className="inline-flex items-center gap-0.5" data-testid="feed-post-location">
              <MapPin className="h-3 w-3" />
              {post.location_name}
            </span>
          )}
        </div>
      </div>
      {mine && (
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-none p-2 text-muted-foreground hover:bg-card" data-testid="feed-post-menu-button">
            <MoreHorizontal className="h-5 w-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onDelete} className="text-rose-600" data-testid="feed-post-delete-button">
              <Trash2 className="mr-2 h-4 w-4" /> Excluir postagem
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
};

export const PostCard = ({ post, onDeleted, onHire }) => {
  const api = useApi();
  const { me } = useMe();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes_count);
  const [showComments, setShowComments] = useState(false);
  const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);
  const [burst, setBurst] = useState(false);
  const a = post.author || {};
  const mine = post.user_id === me.user_id;
  const canHire = !!a.role && !mine;

  const toggleLike = async () => {
    setLiked(!liked);
    setLikes((l) => l + (liked ? -1 : 1));
    try {
      const { data } = await api.post(`/posts/${post.id}/like`);
      setLiked(data.liked);
      setLikes(data.likes_count);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const onDouble = () => {
    if (!liked) toggleLike();
    setBurst(true);
    setTimeout(() => setBurst(false), 700);
  };
  const remove = async () => {
    try {
      await api.delete(`/posts/${post.id}`);
      onDeleted?.(post.id);
      toast.success("Postagem removida");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <article data-testid={`feed-post-${post.id}`} className="animate-fade-up overflow-hidden rounded-none border border-border bg-card shadow-sm">
      {post.intent === "opportunity" && <p className="border-b border-border px-4 py-2 text-sm font-semibold">Busco uma oportunidade</p>}
      <PostHeader post={post} mine={mine} onDelete={remove} />
      <div className="relative aspect-square select-none bg-card" onDoubleClick={onDouble}>
        <img src={imgUrl(post.image)} alt={post.caption?.slice(0, 60) || "Postagem"} className="h-full w-full object-cover" loading="lazy" />
        {burst && <Heart className="pointer-events-none absolute inset-0 m-auto h-24 w-24 animate-like-burst fill-white text-white drop-shadow-xl" />}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-1">
          <button onClick={toggleLike} data-testid="feed-post-like-button" aria-label="Curtir" className="rounded-none p-2 transition-transform duration-150 hover:bg-card active:scale-90">
            <Heart className={cn("h-6 w-6", liked ? "fill-rose-500 text-rose-500" : "text-foreground")} />
          </button>
          <button onClick={() => setShowComments((s) => !s)} data-testid="feed-post-comment-button" aria-label="Comentar" className="rounded-none p-2 hover:bg-card">
            <MessageCircle className="h-6 w-6 text-foreground" />
          </button>
          {post.lat != null && (
            <Link to={`/mapa?lat=${post.lat}&lng=${post.lng}`} data-testid="feed-post-map-link" aria-label="Ver no mapa" className="rounded-none p-2 hover:bg-card">
              <MapPin className="h-6 w-6 text-foreground" />
            </Link>
          )}
          {canHire && (
            <Button onClick={() => onHire?.(a)} className="ml-auto rounded-none" size="sm" data-testid="feed-post-hire-button">
              Contratar
            </Button>
          )}
        </div>
        {!mine && <ContactButton userId={post.user_id} label="Conversar com quem publicou" className="mt-3 w-full" testid="feed-post-chat-button" />}
        <p className="mt-1 text-sm font-bold text-foreground" data-testid="feed-post-likes-count">
          {likes} curtida{likes === 1 ? "" : "s"}
        </p>
        {post.caption && (
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            <span className="font-semibold text-foreground">{a.name}</span> {post.caption}
          </p>
        )}
        <button onClick={() => setShowComments((s) => !s)} className="mt-1 text-sm text-muted-foreground hover:text-foreground" data-testid="feed-post-view-comments">
          {commentsCount ? `Ver ${commentsCount} comentário${commentsCount === 1 ? "" : "s"}` : "Seja o primeiro a comentar"}
        </button>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{ago(post.created_at)}</p>
        {showComments && <PostComments postId={post.id} onAdded={() => setCommentsCount((c) => c + 1)} />}
      </div>
    </article>
  );
};
