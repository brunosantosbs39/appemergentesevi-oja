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