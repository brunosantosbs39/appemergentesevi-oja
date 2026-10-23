import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useApi } from "@/lib/api";
import { catOf } from "@/lib/constants";
import { UserAvatar } from "@/components/common/UserAvatar";
import { RatingBadge } from "@/components/common/StarRating";

export const FeaturedPros = () => {
  const api = useApi();
  const [pros, setPros] = useState([]);
  useEffect(() => {
    api.get("/professionals", { params: { sort: "rating", limit: 6 } }).then((r) => setPros(r.data)).catch(() => {});
  }, [api]);
  return (
    <div className="sticky top-10 rounded-none border border-border bg-card p-5" data-testid="featured-pros">
      <p className="font-mono text-[10px] uppercase tracking-widest text-foreground">Bem avaliados</p>
      <h3 className="font-heading text-lg font-bold text-foreground">Profissionais em destaque</h3>
      <ul className="mt-4 space-y-1">
        {pros.map((p) => (
          <li key={p.user_id}>
            <Link to={`/perfil/${p.user_id}`} data-testid={`featured-pro-${p.user_id}`} className="flex items-center gap-3 rounded-none p-2 transition-colors hover:bg-card">
              <UserAvatar user={p} ring />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">{catOf(p.categories?.[0]).label}</p>
              </div>
              <RatingBadge avg={p.rating_avg} count={p.rating_count} />
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/mapa" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:text-foreground" data-testid="featured-pros-map-link">
        Ver todos no mapa <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
};
