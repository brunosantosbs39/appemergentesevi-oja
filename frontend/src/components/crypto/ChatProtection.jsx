import { useEffect, useState } from "react";
import { useCrypto } from "@/context/CryptoContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function EncryptedText({ message }) {
  const protection = useCrypto();
  const [value, setValue] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setValue(null); setError("");
    if (protection.ready) protection.decryptMessage(message).then((data) => { if (active) setValue(data.text); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [message, protection.ready, protection.decryptMessage]);
  if (!protection.ready) return <button type="button" onClick={protection.showSetup}>🔒 Recuperar chaves para ler</button>;
  return <p className="sj-message-text">{error || value || "Abrindo mensagem protegida…"}</p>;
}

export function ChatProtection({ peerId, onReady }) {
  const protection = useCrypto();
  const [peer, setPeer] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [verifyOpen, setVerifyOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setPeer(false); onReady(false); setError("");
    if (!protection.ready) return;
    const check = async () => {
      try { const value = !!await protection.getPeer(peerId); if (active) { setPeer(value); onReady(value); setError(""); } }
      catch (e) { if (active) { setPeer(false); onReady(false); setError(e.message); } }
    };
    check(); const timer = setInterval(check, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [peerId, protection.ready, protection.getPeer, onReady]);
  const verify = async () => {
    setVerifyOpen(true); setCode("");
    try { setCode(await protection.codeFor(peerId)); } catch (e) { setCode(e.message); }
  };
  return <>
    <div className="px-4 py-2 text-xs border-b border-border bg-muted/40" role="status">
      {!protection.ready ? <button type="button" className="underline" onClick={protection.showSetup}>🔒 {protection.status === "loading" ? "Verificando proteção…" : "Ativar ou recuperar proteção do chat"}</button> : error ? <span>{error}</span> : !peer ? <span>A outra pessoa precisa abrir o chat e ativar a proteção para receber textos e áudios.</span> : <button type="button" className="underline" onClick={verify}>🔒 Textos e áudios com proteção ponta a ponta · Conferir código</button>}
      <p className="mt-1 opacity-75">Propostas e avisos do serviço são processados pelo sistema. O histórico antigo continua sem esta proteção.</p>
    </div>
    <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}><DialogContent><DialogHeader><DialogTitle>Código de segurança da conversa</DialogTitle><DialogDescription>Compare este código pessoalmente ou em outro canal com seu contato. Os dois aparelhos devem mostrar o mesmo código para confirmar as identidades.</DialogDescription></DialogHeader><p className="font-mono break-words select-all leading-8">{code || "Carregando…"}</p><button type="button" className="underline text-sm" onClick={protection.showSetup}>Gerenciar proteção e recuperação</button></DialogContent></Dialog>
  </>;
}
