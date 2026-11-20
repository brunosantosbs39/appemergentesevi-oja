export const Stars = ({ value = 0, size = 14 }) => {
  const rating = Math.min(5, Math.max(0, Number(value) || 0));
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.min(1, Math.max(0, rating - (n - 1)));
        return (
          <span key={n} className="relative inline-block shrink-0" style={{ width: size, height: size }}>
            <Star style={{ width: size, height: size }} className="fill-transparent text-muted-foreground/50" />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star style={{ width: size, height: size }} className="fill-amber-400 text-amber-500" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
};

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
