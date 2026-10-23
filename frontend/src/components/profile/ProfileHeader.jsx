import { BadgeCheck, Briefcase, ClipboardList, Grid3x3, MapPin, MessageCircle, Navigation, Pencil, Send } from "lucide-react";
import { brl, catOf, km } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/common/UserAvatar";
import { RatingBadge } from "@/components/common/StarRating";

const Stat = ({ icon: Icon, value, label, testid }) => (
  <div className="rounded-none border border-border bg-card px-4 py-3" data-testid={testid}>
    <p className="flex items-center gap-1.5 font-heading text-xl font-extrabold text-foreground"><Icon className="h-4 w-4 text-foreground" />{value}</p>
    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
  </div>
);

export const ProfileHeader = ({ user, isMe, canHire, onEdit, onChat, onHire }) => {
  const isPro = user.role === "profissional";
  return (
    <section className="overflow-hidden rounded-[2rem] border border-border bg-card">
      <div className="bg-grid relative h-32 bg-secondary sm:h-40">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-secondary/30 blur-3xl" />
      </div>
      <div className="px-5 pb-6 sm:px-8">
        <div className="-mt-14 flex flex-wrap items-end justify-between gap-4">
          <UserAvatar user={user} className="h-28 w-28 border-4 border-white text-2xl shadow-lg" ring={isPro} testid="user-profile-avatar" />
          <div className="flex flex-wrap gap-2">
            {isMe ? (
              <Button variant="outline" className="rounded-full" onClick={onEdit} data-testid="profile-edit-button"><Pencil className="h-4 w-4" /> Editar perfil</Button>
            ) : (
              <>
                <Button variant="outline" className="rounded-full" onClick={onChat} data-testid="profile-action-chat-button"><MessageCircle className="h-4 w-4" /> Chamar no chat</Button>
                {canHire && <Button className="rounded-full" onClick={onHire} data-testid="profile-action-hire-button"><Send className="h-4 w-4" /> Solicitar serviço</Button>}
              </>
            )}
          </div>
        </div>
        <div className="mt-4">
          <h1 className="flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl" data-testid="profile-name">
            {user.name || "Sem nome"} {isPro && <BadgeCheck className="h-6 w-6 text-foreground" />}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="rounded-full bg-secondary px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-foreground" data-testid="profile-role-badge">{isPro ? "Profissional" : "Contratante"}</span>
            {user.headline && <span className="font-medium text-foreground">{user.headline}</span>}
            {user.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{user.city}</span>}
            {user.distance_km != null && !isMe && <span className="inline-flex items-center gap-1"><Navigation className="h-3.5 w-3.5" />{km(user.distance_km)} de você</span>}
          </div>
          {isPro && user.categories?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {user.categories.map((c) => {
                const { label, icon: Icon } = catOf(c);
                return <span key={c} className="inline-flex items-center gap-1 rounded-full border border-foreground bg-muted px-3 py-1 text-xs font-semibold text-foreground"><Icon className="h-3.5 w-3.5" />{label}</span>;
              })}
            </div>
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col justify-center rounded-none border border-border bg-card px-4 py-3">
            <RatingBadge avg={user.rating_avg} count={user.rating_count} testid="user-profile-rating-badge" />
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Avaliação</p>
          </div>
          {isPro ? (
            <Stat icon={Briefcase} value={user.jobs_done || 0} label="Serviços feitos" testid="profile-stat-jobs" />
          ) : (
            <Stat icon={ClipboardList} value={user.requests_count || 0} label="Pedidos" testid="profile-stat-requests" />
          )}
          <Stat icon={Grid3x3} value={user.posts_count || 0} label="Postagens" testid="profile-stat-posts" />
          {isPro && user.hourly_rate != null && <Stat icon={Briefcase} value={brl(user.hourly_rate)} label="Por hora" testid="profile-stat-rate" />}
        </div>
      </div>
    </section>
  );
};
