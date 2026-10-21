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
    <div className="sticky top-10 rounded-3xl border border-slate-200 bg-white p-5" data-testid="featured-pros">
      <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-700">Bem avaliados</p>
      <h3 className="font-heading text-lg font-bold text-slate-900">Profissionais em destaque</h3>
      <ul className="mt-4 space-y-1">
        {pros.map((p) => (
          <li key={p.user_id}>
            <Link to={`/perfil/${p.user_id}`} data-testid={`featured-pro-${p.user_id}`} className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-slate-50">
              <UserAvatar user={p} ring />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="truncate text-xs text-slate-500">{catOf(p.categories?.[0]).label}</p>
              </div>
              <RatingBadge avg={p.rating_avg} count={p.rating_count} />
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/mapa" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800" data-testid="featured-pros-map-link">
        Ver todos no mapa <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
};
