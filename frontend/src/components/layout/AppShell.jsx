import { LogoutButton } from "@/components/auth/LogoutButton";
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
    <span data-testid="nav-unread-badge" className={cn("grid min-w-[18px] place-items-center rounded-none bg-rose-500 px-1 text-[10px] font-bold leading-[18px] text-white", className)}>
      {n > 9 ? "9+" : n}
    </span>
  ) : null;

const Sidebar = ({ me, unread }) => (
  <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-border bg-card px-5 py-7 lg:flex">
    <Logo to="/feed" />
    <nav className="mt-10 space-y-1">
      {NAV.map(({ to, label, icon: Icon, id }) => (
        <NavLink
          key={id}
          to={to}
          data-testid={`sidebar-nav-${id}`}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-none px-4 py-3 text-[15px] font-semibold transition-colors duration-200",
              isActive ? "bg-secondary text-white" : "text-foreground hover:bg-card hover:text-foreground",
            )
          }
        >
          <Icon className="h-5 w-5" />
          {label}
          {id === "chat" && <Dot n={unread} className="ml-auto" />}
        </NavLink>
      ))}
    </nav>
    <div className="mt-auto flex items-center gap-3 rounded-none border border-border bg-card p-3">
      <UserAvatar user={me} ring={me.role === "profissional"} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground" data-testid="sidebar-user-name">{me.name}</p>
        <p className="font-mono text-[10px] uppercase tracking-widest text-foreground" data-testid="sidebar-user-role">
          {me.role === "profissional" ? "Profissional" : "Contratante"}
        </p>
      </div>
      <UserButton />
    </div>
    <LogoutButton className="mt-3 w-full" />
  </aside>
);

const MobileTop = () => (
  <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur-xl lg:hidden">
    <Logo to="/feed" />
    <div className="flex items-center gap-3"><LogoutButton /><UserButton /></div>
  </header>
);

const BottomNav = ({ unread }) => (
  <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-none border border-border/60 bg-card/85 p-1.5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] backdrop-blur-xl lg:hidden">
    {NAV.map(({ to, label, icon: Icon, id }) => (
      <NavLink
        key={id}
        to={to}
        data-testid={`bottom-nav-${id}`}
        className={({ isActive }) =>
          cn(
            "relative flex flex-col items-center gap-0.5 rounded-none py-2 text-[10px] font-semibold transition-colors duration-200",
            isActive ? "bg-secondary text-white" : "text-muted-foreground",
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
    <div className="min-h-screen bg-background">
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
