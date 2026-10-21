import { Link } from "react-router-dom";
import { Navigation } from "lucide-react";
import { STATUS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Logo = ({ dark = false, to = "/" }) => (
  <Link to={to} className="flex items-center gap-2" data-testid="brand-logo">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white shadow-[0_8px_24px_-8px_rgba(5,150,105,0.8)]">
      <Navigation className="h-4 w-4 rotate-45 fill-white" />
    </span>
    <span className={cn("font-heading text-xl font-extrabold tracking-tight", dark ? "text-white" : "text-slate-900")}>
      Serviço<span className="text-emerald-500">Já</span>
    </span>
  </Link>
);

export const StatusBadge = ({ status, testid = "service-status-badge" }) => {
  const s = STATUS[status] || STATUS.pendente;
  return (
    <span
      data-testid={testid}
      className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider", s.cls)}
    >
      {s.label}
    </span>
  );
};

export const EmptyState = ({ icon: Icon, title, text, action, testid }) => (
  <div data-testid={testid} className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
    {Icon && (
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
        <Icon className="h-6 w-6" />
      </div>
    )}
    <p className="font-heading text-lg font-bold text-slate-900">{title}</p>
    {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const PageHeader = ({ eyebrow, title, subtitle, children }) => (
  <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      {eyebrow && <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-emerald-700">{eyebrow}</p>}
      <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500 sm:text-base">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </header>
);
