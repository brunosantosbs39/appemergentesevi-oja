import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useClerk } from "@clerk/react";
import { ClipboardList, Home, Map, MessageCircle, User, Wallet, Building2 } from "lucide-react";
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
  { to: "/carteira", label: "Carteira", icon: Wallet, id: "carteira" },
  { to: "/empresas", label: "Empresas", icon: Building2, id: "empresas" },
  { to: "/perfil/me", label: "Perfil", icon: User, id: "perfil" },
];

function AccountMenu() {
  const { me } = useMe();
  const clerk = useClerk();
  return <DropdownMenu><DropdownMenuTrigger asChild>
    <button type="button" aria-label="Abrir menu da conta"><UserAvatar user={me} className="h-8 w-8" /></button>
  </DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuItem asChild><Link to="/perfil/me">Meu perfil</Link></DropdownMenuItem>
    <DropdownMenuItem onSelect={()=>clerk.openUserProfile()}>Gerenciar conta</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>;
}

const Dot = ({ n, className }) =>
  n > 0 ? (
    <span data-testid="nav-unread-badge" className={cn("grid min-w-[18px] place-items-center rounded-none bg-rose-500 px-1 text-[10px] font-bold leading-[18px] text-white", className)}>
      {n > 9 ? "9+" : n}
    </span>
  ) : null;

const Sidebar = ({ me, unread }) => (
  <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-border bg-card px-5 py-7 lg:flex">
    <div className="flex items-center justify-between gap-2"><Logo to="/feed" /><ThemeToggle compact /></div>
    <nav aria-label="Navegação principal" className="sj-sidebar-nav mt-10 space-y-1">
      {NAV.map(({ to, label, icon: Icon, id }) => (
        <NavLink
          key={id}
          to={to}
          data-testid={`sidebar-nav-${id}`}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-none px-4 py-3 text-[15px] font-semibold transition-colors duration-200",
              isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
      <UserAvatar user={me} ring={false} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground" data-testid="sidebar-user-name">{me.name}</p>
        <p className="font-mono text-[10px] uppercase tracking-widest text-foreground" data-testid="sidebar-user-role">
          Conta única
        </p>
      </div>
      <AccountMenu />
    </div>
    <LogoutButton className="mt-3 w-full" />
  </aside>
);

function WalletShortcut({userId}) {
  const api = useApi();
  const balance = useQuery({queryKey:["wallet-balance",userId], queryFn:async ()=>(await api.get("/wallet/balance")).data,
    refetchInterval:15000});
  const cents = balance.data?.available_cents;
  const amount = Number.isInteger(cents) ? (cents / 100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}) : null;
  return <Link to="/carteira#adicionar-saldo" data-testid="mobile-wallet-button" className="mr-auto flex min-h-11 items-center gap-2 border border-border px-3 text-sm font-semibold">
    <Wallet className="h-4 w-4" aria-hidden="true" />
    {amount === null ? (balance.isError ? "Consultar saldo" : "Carregando saldo…") : cents === 0 ? amount + " · Adicionar saldo" : "Saldo " + amount}
  </Link>;
}

function VersionNotice() {
  const [updated,setUpdated] = useState(false);
  useEffect(()=>{
    const loaded = Array.from(document.scripts).map(s=>s.src).find(src=>src.includes("/static/js/main."));
    if (!loaded) return;
    let active = true;
    async function check(){
      if(document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/asset-manifest.json",{cache:"no-store"});
        if(!res.ok) return;
        const manifest = await res.json();
        const main = manifest.files?.["main.js"];
        if(active && main && new URL(main,location.origin).pathname !== new URL(loaded).pathname) setUpdated(true);
      } catch { /* A later focus or interval will retry. */ }
    }
    document.addEventListener("visibilitychange",check);
    const timer=setInterval(check,60000);
    check();
    return ()=>{active=false;clearInterval(timer);document.removeEventListener("visibilitychange",check);};
  },[]);
  return updated ? <div role="status" className="flex items-center justify-between border bg-card p-3">Nova versão disponível.<button className="underline" onClick={()=>window.location.reload()}>Atualizar agora</button></div> : null;
}

const MobileTop = () => (
  <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur-xl lg:hidden">
    <Logo to="/feed" />
    <div className="flex items-center gap-2"><ThemeToggle compact /><LogoutButton /><AccountMenu /></div>
  </header>
);

const BottomNav = ({ unread }) => (
  <nav aria-label="Navegação principal no celular" className="fixed inset-x-2 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid grid-cols-7 rounded-none border border-border/60 bg-card/85 p-1.5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] backdrop-blur-xl lg:hidden">
    {NAV.map(({ to, label, icon: Icon, id }) => (
      <NavLink
        key={id}
        to={to}
        data-testid={`bottom-nav-${id}`}
        className={({ isActive }) =>
          cn(
            "relative flex min-h-12 min-w-0 flex-col items-center gap-0.5 rounded-none py-2 text-[10px] font-semibold transition-colors duration-200",
            isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
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

function AttendanceNotice() {
  const api = useApi();
  const { me } = useMe();
  const { data } = useQuery({ queryKey: ["attendance", me.user_id], queryFn: async () => (await api.get("/me/attendance")).data, refetchInterval: 30000 });
  const until = data?.attendance_blocked_until;
  if (!until || new Date(until) <= new Date()) return null;
  return <div role="status" className="mb-4 border border-border bg-card p-4 text-sm">
    <p className="font-semibold">Publicações e candidaturas temporariamente bloqueadas</p>
    <p>Faltas registradas: {data.attendance_absences}. Liberação: {new Date(until).toLocaleString("pt-BR")}.</p>
    <p>Você ainda pode acompanhar serviços já aceitos, conversar e acessar sua carteira.</p>
  </div>;
}

export default function AppShell() {
  const { me } = useMe();
  const unread = useUnread();
  const pathname = useLocation().pathname;
  const isChat = pathname.startsWith("/chat");
  if (!me.registration_complete) return <Navigate to="/onboarding" replace />;
  return (
    <div className="sj-app min-h-screen bg-background" data-page={pathname.split("/")[1]}>
      <Sidebar me={me} unread={unread} />
      {!isChat && <MobileTop />}
      <main className={isChat ? "fixed inset-0 lg:left-72" : "pb-28 lg:pb-10 lg:pl-72"}>
        <div className={isChat ? "h-full" : "mx-auto max-w-6xl px-4 pt-5 sm:px-6 lg:px-10 lg:pt-10"}>
          {["/feed", "/carteira"].includes(pathname) && <div className="mb-4 flex items-center justify-end gap-3"><WalletShortcut userId={me.user_id} />{pathname === "/feed" && <NotificationCenter />}</div>}
          <VersionNotice />
          {!isChat && <AttendanceNotice />}
          <Outlet />
        </div>
      </main>
      {!isChat && <BottomNav unread={unread} />}
    </div>
  );
}
