import { useState } from "react";
import { Copy, Download, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CryptoSetupDialog({ open, onOpenChange, status, error, pending, onPrepare, onActivate, onRecover, onRetry, onLock }) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [forget, setForget] = useState(false);
  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    try { await action(); setCode(""); setForget(false); }
    catch (e) { toast.error(e.response ? errMsg(e) : e.message); }
    finally { setBusy(false); }
  };
  const download = () => {
    const blob = new Blob([`ServiçoJá — código de recuperação das conversas\n\n${pending.recoveryCode}\n\nGuarde em local seguro. Não compartilhe com ninguém. Quem tem este código e acesso à sua conta pode recuperar suas conversas. O ServiçoJá não guarda o código e não consegue recuperá-lo.\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = "servicoja-codigo-recuperacao.txt"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) { onOpenChange(value); setCode(""); setSaved(false); setForget(false); } }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5" /> Proteção das conversas</DialogTitle><DialogDescription>Textos e áudios novos são criptografados no aparelho. O servidor recebe apenas o conteúdo protegido. Propostas, valores e avisos do serviço continuam sendo processados pelo aplicativo.</DialogDescription></DialogHeader>
    {status === "loading" && <p role="status">Conferindo as chaves deste aparelho...</p>}
    {status === "error" && <div className="space-y-3"><p role="alert">{error}</p><Button disabled={busy} onClick={() => run(onRetry)}>Tentar novamente</Button><label className="flex gap-2 text-sm"><input type="checkbox" checked={forget} onChange={(e) => setForget(e.target.checked)} />Tenho o código da identidade original e quero remover as chaves locais conflitantes para recuperá-la.</label><Button variant="outline" disabled={busy || !forget} onClick={() => run(async () => { await onLock(); await onRetry(); })}>Remover chaves locais e tentar recuperação</Button></div>}
    {status === "new" && !pending && <div className="space-y-4"><p className="text-sm">Você vai receber um código de recuperação. Ele permite abrir as conversas em outro aparelho ou depois de sair da conta e remover as chaves locais.</p><p className="text-sm font-semibold">Sem o código e sem as chaves do aparelho, o histórico protegido não poderá ser recuperado pelo ServiçoJá.</p><Button disabled={busy} className="w-full" onClick={() => run(async () => { setSaved(false); await onPrepare(); })}>{busy ? "Gerando..." : "Gerar código de recuperação"}</Button></div>}
    {pending && <div className="space-y-4"><p className="text-sm font-semibold">Guarde este código antes de continuar. Ele não será enviado ao servidor.</p><code className="block break-all rounded-lg border border-border bg-muted p-4 font-mono text-sm select-all" data-testid="crypto-recovery-code">{pending.recoveryCode}</code><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(pending.recoveryCode).then(() => toast.success("Código copiado")).catch(() => toast.error("Selecione e copie o código acima."))}><Copy className="h-4 w-4" /> Copiar</Button><Button type="button" variant="outline" onClick={download}><Download className="h-4 w-4" /> Baixar código</Button></div><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-1" />Guardei o código em local seguro e entendi que ele é necessário para recuperar minhas conversas.</label><Button disabled={busy || !saved} className="w-full" onClick={() => run(onActivate)}>{busy ? "Ativando..." : "Ativar proteção neste aparelho"}</Button></div>}
    {status === "locked" && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => onRecover(code)); }}><p className="text-sm">Esta conta já tem proteção. Digite o código que você guardou para recuperar as mesmas chaves neste aparelho. A senha do login não substitui esse código.</p><label className="block space-y-2"><span>Código de recuperação</span><Input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="SJ1-..." required data-testid="crypto-recover-input" /></label><Button type="submit" disabled={busy || !code.trim()} className="w-full">{busy ? "Recuperando..." : "Recuperar conversas neste aparelho"}</Button><p className="text-xs text-muted-foreground">Não existe redefinição automática da chave. Se perdeu o código, preserve o aparelho onde suas conversas ainda abrem.</p></form>}
    {status === "ready" && <div className="space-y-4"><p className="text-sm">Este aparelho tem suas chaves. Nas conversas, use “Código de segurança” para comparar o código com a outra pessoa por uma ligação ou pessoalmente.</p><p className="text-xs text-muted-foreground">O histórico anterior à ativação continua sem esta proteção. Datas, participantes e registros de contratação são visíveis ao sistema.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={forget} onChange={(e) => setForget(e.target.checked)} className="mt-1" />Tenho meu código guardado e quero remover o acesso deste aparelho.</label><Button variant="outline" disabled={busy || !forget} onClick={() => run(onLock)}>Esquecer as chaves deste aparelho</Button></div>}
  </DialogContent></Dialog>;
}
