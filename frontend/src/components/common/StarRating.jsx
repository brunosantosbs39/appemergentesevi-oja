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
    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-100 px-3 py-1 text-sm font-bold text-amber-950 shadow-sm dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
  >
    <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
    {count ? Number(avg).toFixed(1).replace(".", ",") : "Novo"}
    {count ? <span className="text-xs font-semibold text-amber-800/80 dark:text-amber-200/80">({count})</span> : null}
  </span>
);
