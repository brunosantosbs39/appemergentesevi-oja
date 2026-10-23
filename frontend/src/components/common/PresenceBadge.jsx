export const PresenceBadge = ({ user }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
    <span className={`h-2 w-2 rounded-full ${user?.is_online ? "bg-emerald-500" : "bg-slate-400"}`} />
    {user?.is_online ? "On-line" : "Off-line"}
  </span>
);
