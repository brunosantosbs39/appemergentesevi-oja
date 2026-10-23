import { Link } from "react-router-dom";
import { STATUS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Logo = ({ to = "/" }) => (
  <Link to={to} className="brand-wordmark" data-testid="brand-logo">SERVIÇOJÁ</Link>
);

export const StatusBadge = ({ status, testid = "service-status-badge" }) => {
  const s = STATUS[status] || STATUS.pendente;
  return (
    <span
      data-testid={testid}
      className={cn("inline-flex items-center rounded-none border px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider", s.cls)}
    >
      {s.label}
    </span>
  );
};

export const EmptyState = ({ icon: Icon, title, text, action, testid }) => (
  <div data-testid={testid} className="flex flex-col items-center justify-center rounded-none border border-dashed border-border bg-card px-6 py-14 text-center">
    {Icon && (
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-none bg-muted text-foreground">
        <Icon className="h-6 w-6" />
      </div>
    )}
    <p className="font-heading text-lg font-bold text-foreground">{title}</p>
    {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const PageHeader = ({ eyebrow, title, subtitle, children }) => (
  <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      {eyebrow && <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-foreground">{eyebrow}</p>}
      <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </header>
);
