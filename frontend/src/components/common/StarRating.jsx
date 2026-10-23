import { Star } from "lucide-react";

export const StarInput = ({ value, onChange, size = 32, testid = "star-rating-input" }) => (
  <div className="flex items-center gap-1.5" data-testid={testid}>
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        onClick={() => onChange(n)}
        data-testid={`${testid}-${n}`}
        aria-label={`${n} estrelas`}
        className="transition-transform duration-150 hover:scale-110 active:scale-95"
      >
        <Star style={{ width: size, height: size }} className={n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground"} />
      </button>
    ))}
  </div>
);

export const Stars = ({ value = 0, size = 14 }) => (
  <span className="inline-flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} style={{ width: size, height: size }} className={n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"} />
    ))}
  </span>
);

export const RatingBadge = ({ avg, count, testid }) => (
  <span
    data-testid={testid}
    className="inline-flex shrink-0 items-center gap-1 rounded-none border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800"
  >
    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
    {count ? Number(avg).toFixed(1).replace(".", ",") : "Novo"}
    {count ? <span className="font-normal text-amber-700/80">({count})</span> : null}
  </span>
);
