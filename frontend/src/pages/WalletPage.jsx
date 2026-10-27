import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Wallet, ArrowDownToLine, ArrowUpRight, ShieldCheck, AlertCircle } from "lucide-react";
import { useApi, errMsg } from "@/lib/api";
import { useMe } from "@/context/MeContext";
import { PageHeader } from "@/components/common/Misc";
import { Button } from "@/components/ui/button";

export default function WalletPage() {
  const api = useApi();
  const { me } = useMe();
  const { data: requests = [], isPending, error, refetch } = useQuery({
    queryKey: ["wallet-services", me.user_id],
    queryFn: async () => (await api.get("/requests/mine")).data,
  });
  const active = requests.filter(r => (r.client_id === me.user_id || r.professional_id === me.user_id) && (["aceito", "em_andamento"].includes(r.status) || (r.status === "concluido" && r.check_out_at)));
  return <div data-testid="wallet-page" className="space-y-6">
    <PageHeader eyebrow="Seus pagamentos" title="Carteira" subtitle="Acompanhe a preparação do pagamento por serviço." />
    <div role="status" className="border border-border bg-card p-5">
      <div className="flex items-center gap-3"><AlertCircle className="h-5 w-5 shrink-0" /><h2 className="font-heading text-lg">Pagamentos em configuração</h2></div>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">O ServiçoJá ainda não recebe depósitos, guarda saldo ou realiza saques. A integração financeira está em preparação. As confirmações abaixo registram somente a conclusão do serviço; não movimentam dinheiro.</p>
    </div>
    <div className="grid gap-4 md:grid-cols-3">
      {["Saldo disponível", "Reservado em serviços", "Pendente de liberação"].map(label => <section key={label} className="border border-border bg-card p-6"><p className="text-sm text-muted-foreground">{label}</p><p className="my-4 text-3xl" aria-label="Saldo indisponível">—</p><p className="text-xs text-muted-foreground">Disponível após ativação dos pagamentos</p></section>)}
    </div>
    <div className="flex flex-wrap gap-3" aria-describedby="wallet-unavailable">
      <Button disabled><Wallet className="h-4 w-4" /> Adicionar saldo</Button>
      <Button disabled variant="outline"><ArrowDownToLine className="h-4 w-4" /> Solicitar saque</Button>
    </div>
    <p id="wallet-unavailable" className="text-xs text-muted-foreground">Depósitos e saques serão habilitados após a integração e verificação das contas.</p>
    <section className="border border-border p-6">
      <h2 className="flex items-center gap-3 font-heading text-xl"><ShieldCheck className="h-5 w-5" /> Fluxo planejado</h2>
      <ol className="mt-5 grid gap-5 text-sm md:grid-cols-4">{[
        ["01", "Depósito confirmado", "O provedor confirma o recebimento antes de disponibilizar saldo."],
        ["02", "Valor reservado", "Ao contratar, o valor fica vinculado ao serviço e não pode ser gasto novamente."],
        ["03", "Chegada e execução", "Após a confirmação de presença, o profissional acompanha o valor pendente, ainda sem saque."],
        ["04", "Confirmação dos dois", "A liberação depende dos dois confirmarem a conclusão, sem contestação, e da disponibilidade no provedor."],
      ].map(([n,title,description]) => <li key={n}><span className="text-xs text-muted-foreground">{n}</span><h3 className="my-2 font-semibold">{title}</h3><p className="leading-relaxed text-muted-foreground">{description}</p></li>)}</ol>
    </section>
    <section><h2 className="mb-4 font-heading text-xl">Confirmações de serviços</h2><p className="mb-4 text-xs text-muted-foreground">Exibindo serviços entre os 100 pedidos mais recentes. Confirme a conclusão nos detalhes do pedido após o check-out.</p>
      {isPending ? <p role="status">Carregando serviços...</p> : error ? <div role="alert"><p>{errMsg(error)}</p><Button onClick={() => refetch()} variant="outline" className="mt-3">Tentar novamente</Button></div> : !active.length ? <p className="border border-border p-6 text-sm text-muted-foreground">Nenhum serviço aguardando conclusão.</p> : <div className="space-y-3">{active.map(r => <article key={r.id} className="flex flex-wrap items-center justify-between gap-4 border border-border bg-card p-5"><div><h3 className="font-semibold">{r.title}</h3><p className="mt-2 text-sm text-muted-foreground">Sua confirmação: {(r.completion_confirmations || []).includes(me.user_id) ? "registrada" : "aguardando"} · Outra parte: {(r.completion_confirmations || []).includes(r.client_id === me.user_id ? r.professional_id : r.client_id) ? "registrada" : "aguardando"}</p><p className="mt-1 text-xs text-muted-foreground">Sem pagamento reservado pelo app.</p></div><Link to="/pedidos" className="inline-flex items-center gap-2 text-sm underline underline-offset-4">Ver pedido <ArrowUpRight className="h-4 w-4" /></Link></article>)}</div>}
    </section>
    <section className="border-t border-border pt-6"><h2 className="font-heading text-xl">Extrato</h2><p className="mt-3 text-sm text-muted-foreground">Ainda não há movimentações financeiras processadas pelo ServiçoJá.</p></section>
  </div>;
}

