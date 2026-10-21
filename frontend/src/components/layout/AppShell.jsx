import { Navigate, NavLink, Outlet } from "react-router-dom";
import { UserButton } from "@clerk/react";
import { ClipboardList, Home, Map, MessageCircle, User } from "lucide-react";
import { useMe } from "@/context/MeContext";
import { useUnread } from "@/hooks/useUnread";
import { Logo } from "@/components/common/Misc";
import { UserAvatar } from "@/components/common/UserAvatar";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/feed", label: "Feed", icon: Home, id: "feed" },
  { to: "/mapa", label: "Mapa", icon: Map, id: "mapa" },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList, id: "pedidos" },
  { to: "/chat", label: "Chat", icon: MessageCircle, id: "chat" },
  { to: "/perfil/me", label: "Perfil", icon: User, id: "perfil" },
];

const Dot = ({ n, className }) =>
  n > 0 ? (
    <span data-testid="nav-unread-badge" className={cn("grid min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-[18px] text-white", className)}>
      {n > 9 ? "9+" : n}
    </span>
  ) : null;

const Sidebar = ({ me, unread }) => (
  <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-slate-200 bg-white px-5 py-7 lg:flex">
    <Logo to="/feed" />
    <nav className="mt-10 space-y-1">
      {NAV.map(({ to, label, icon: Icon, id }) => (
        <NavLink
          key={id}
          to={to}
          data-testid={`sidebar-nav-${id}`}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold transition-colors duration-200",
              isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )
          }
        >
          <Icon className="h-5 w-5" />
          {label}
          {id === "chat" && <Dot n={unread} className="ml-auto" />}
        </NavLink>
      ))}
    </nav>
    <div className="mt-auto flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <UserAvatar user={me} ring={me.role === "profissional"} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900" data-testid="sidebar-user-name">{me.name}</p>
        <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-700" data-testid="sidebar-user-role">
          {me.role === "profissional" ? "Profissional" : "Contratante"}
        </p>
      </div>
      <UserButton />
    </div>
  </aside>
);

const MobileTop = () => (
  <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/60 bg-white/80 px-4 py-3 backdrop-blur-xl lg:hidden">
    <Logo to="/feed" />
    <UserButton />
  </header>
);

const BottomNav = ({ unread }) => (
  <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-3xl border border-slate-200/60 bg-white/85 p-1.5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] backdrop-blur-xl lg:hidden">
    {NAV.map(({ to, label, icon: Icon, id }) => (
      <NavLink
        key={id}
        to={to}
        data-testid={`bottom-nav-${id}`}
        className={({ isActive }) =>
          cn(
            "relative flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-semibold transition-colors duration-200",
            isActive ? "bg-slate-900 text-white" : "text-slate-500",
          )
        }
      >
        <Icon className="h-5 w-5" />
        {label}
        {id === "chat" && <Dot n={unread} className="absolute right-3 top-1" />}
      </NavLink>
    ))}
  </nav>
);

export default function AppShell() {
  const { me } = useMe();
  const unread = useUnread();
  if (!me.role) return <Navigate to="/onboarding" replace />;
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Sidebar me={me} unread={unread} />
      <MobileTop />
      <main className="pb-28 lg:pb-10 lg:pl-72">
        <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 lg:px-10 lg:pt-10">
          <Outlet />
        </div>
      </main>
      <BottomNav unread={unread} />
    </div>
  );
}
