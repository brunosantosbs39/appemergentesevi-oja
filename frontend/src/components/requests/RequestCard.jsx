import { ContactButton } from "@/components/chat/ContactButton";
import { ServiceAttendance } from "@/components/requests/ServiceAttendance";
import { Link } from "react-router-dom";
import { Clock, MapPin, Navigation, Target, Wallet } from "lucide-react";
import { imgUrl } from "@/lib/api";
import { ago, brl, catOf, km } from "@/lib/constants";
import { StatusBadge } from "@/components/common/Misc";
import { UserAvatar } from "@/components/common/UserAvatar";
import { RatingBadge } from "@/components/common/StarRating";

const Party = ({ user, label }) => (
  <Link to={`/perfil/${user.user_id}`} className="mt-4 flex items-center gap-3 rounded-none bg-card p-2.5 transition-colors hover:bg-card" data-testid="service-request-party-link">
    <UserAvatar user={user} className="h-9 w-9" />
    <div className="min-w-0 flex-1">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
    </div>
    <RatingBadge avg={user.rating_avg} count={user.rating_count} />
  </Link>
);

export const RequestCard = ({ request: r, me, children }) => {
  const cat = catOf(r.category);
  const Icon = cat.icon;
  const iAmClient = r.client_id === me.user_id;
  const other = iAmClient ? r.professional : r.client;
  return (
    <article
      data-testid={`service-request-${r.id}`}
      className="animate-fade-up rounded-none border border-border bg-card p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-lg"
    >
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-none bg-secondary text-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{cat.label}</span>
            <StatusBadge status={r.status} />
            {r.target_pro_id && r.status === "pendente" && (
              <span className="inline-flex items-center gap-1 rounded-none bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase text-black">
                <Target className="h-3 w-3" /> {iAmClient ? `Direto: ${r.target_pro?.name || "profissional"}` : "Direto para você"}
              </span>
            )}
          </div>
          <h3 className="mt-1 font-heading text-lg font-bold leading-snug text-foreground" data-testid="service-request-title">{r.title}</h3>
          {r.description && <p className="mt-1 line-clamp-3 text-sm text-foreground">{r.description}</p>}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-semibold text-foreground" data-testid="service-request-budget">
              <Wallet className="h-3.5 w-3.5 text-foreground" /> {brl(r.budget)}
            </span>
            {r.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.address}</span>}
            {r.distance_km != null && (
              <span className="inline-flex items-center gap-1" data-testid="service-request-distance">
                <Navigation className="h-3.5 w-3.5" /> {km(r.distance_km)}
              </span>
            )}
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {ago(r.created_at)}</span>
          </div>
        </div>
        {r.image && <img src={imgUrl(r.image)} alt="" className="hidden h-20 w-20 rounded-none object-cover sm:block" />}
      </div>
      {other ? (
        <Party user={other} label={iAmClient ? "Profissional" : "Contratante"} />
      ) : (
        iAmClient && r.status === "pendente" && (
          <p className="mt-4 flex items-center gap-2 rounded-none bg-amber-50 p-3 text-sm text-amber-800">
            <span className="radar-dot" /> Aguardando um profissional aceitar...
          </p>
        )
      )}
      {!iAmClient && r.status === "pendente" && <ContactButton userId={r.client_id} requestId={r.id} label="Conversar com o anunciante" className="mt-4 w-full" testid="vacancy-chat-button" />}
      <ServiceAttendance request={r} />
      {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
    </article>
  );
};
