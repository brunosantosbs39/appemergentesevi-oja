import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useApi } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { UserAvatar } from "@/components/common/UserAvatar";

export function FeaturedPros() {
  const api = useApi();
  const { me } = useMe();
  const online = useQuery({queryKey:["online-users",me.user_id],
    queryFn:async ()=>(await api.get("/presence/online")).data, refetchInterval:30000});
  return <section aria-label="Usuários online" className="sticky top-10 border border-border bg-card p-5">
    <h2 className="font-heading text-lg font-bold">Usuários online</h2>
    {online.isLoading && <p role="status">Buscando usuários…</p>}
    {online.isError && <p role="status">Não foi possível atualizar a lista.</p>}
    {online.data?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Ninguém online no momento.</p>}
    <ul className="mt-3 space-y-2">{online.data?.map(user => <li key={user.user_id}>
      <Link className="flex items-center gap-2" to={'/perfil/'+user.user_id}>
        <UserAvatar user={user} className="h-9 w-9" /><span className="truncate">{user.name}</span>
        <span aria-label="Online" className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
      </Link></li>)}</ul>
  </section>;
}
