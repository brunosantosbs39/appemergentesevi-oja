import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useApi, errMsg } from "@/lib/api";
import { createIdentity, recoverIdentity, fingerprint, openMessage, sealMessage, securityCode } from "@/lib/e2ee/protocol.mjs";
import { readIdentity, saveIdentity, pinContact, forgetIdentity, clearChatCache } from "@/lib/e2ee/deviceStore.mjs";
import { CryptoSetupDialog } from "@/components/crypto/CryptoSetupDialog";

const CryptoContext = createContext(null);
export function CryptoProvider({ userId, enabled, children }) {
  const api = useApi();
  const [status, setStatus] = useState("loading");
  const [keys, setKeys] = useState(null);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const peers = useRef(new Map());
  const load = useCallback(async () => {
    if (!enabled) { setStatus("off"); return; }
    setStatus("loading"); setError("");
    try {
      const [{ data }, local] = await Promise.all([api.get("/crypto/identity"), readIdentity(userId)]);
      const identity = data.identity;
      if (identity && (identity.user_id !== userId || await fingerprint(identity.public) !== identity.key_id)) throw new Error("A identidade recebida não confere com esta conta.");
      setRecord(identity);
      if (local && identity && local.key_id !== identity.key_id) throw new Error("A chave da conta mudou. O envio foi bloqueado para proteger suas conversas.");
      if (!identity && local?.registration) {
        const { data: registered } = await api.post("/crypto/identity", local.registration);
        if (registered.key_id !== local.key_id) throw new Error("A chave da conta não confere.");
        setRecord({ ...registered, backup: local.registration.backup }); setKeys(local); setStatus("ready"); return;
      }
      setRecord(identity);
      setKeys(identity && local ? local : null);
      setStatus(identity ? local ? "ready" : "locked" : "new");
    } catch (e) { setKeys(null); setStatus("error"); setError(e.response ? errMsg(e) : e.message); }
  }, [api, userId, enabled]);
  useEffect(() => { const cache = peers.current; load(); return () => cache.clear(); }, [load]);
  const prepare = useCallback(async () => { const value = await createIdentity(userId); setPending(value); }, [userId]);
  const activate = useCallback(async () => {
    if (!pending) throw new Error("Gere e guarde seu código primeiro.");
    try {
      await saveIdentity(pending.local);
      const { data } = await api.post("/crypto/identity", pending.registration);
      if (data.key_id !== pending.local.key_id) throw new Error("A chave da conta não confere.");
      setRecord({ ...data, backup: pending.registration.backup }); setKeys(pending.local); setStatus("ready"); setPending(null); setOpen(false);
    } catch (e) {
      setPending(null); setKeys(null); setStatus("error"); setError(e.response ? errMsg(e) : e.message);
      throw e;
    }
  }, [api, pending]);
  const recover = useCallback(async (code) => {
    if (!record) throw new Error("Não existe uma cópia de recuperação nesta conta.");
    const local = await recoverIdentity(userId, record, code);
    await saveIdentity(local); setKeys(local); setStatus("ready"); setOpen(false);
  }, [userId, record]);
  const lock = useCallback(async () => {
    try { await forgetIdentity(userId); }
    finally { clearChatCache(userId); peers.current.clear(); setKeys(null); setPending(null); setStatus(record ? "locked" : "new"); }
  }, [userId, record]);
  const getPeer = useCallback(async (uid) => {
    if (peers.current.has(uid)) return peers.current.get(uid);
    const request = (async () => {
      const { data } = await api.get(`/crypto/users/${encodeURIComponent(uid)}`);
      const peer = data.identity;
      if (!peer) return null;
      if (peer.user_id !== uid || await fingerprint(peer.public) !== peer.key_id) throw new Error("A identidade do contato não confere.");
      await pinContact(userId, peer); return peer;
    })();
    peers.current.set(uid, request);
    try { const peer = await request; if (!peer) peers.current.delete(uid); return peer; }
    catch (e) { peers.current.delete(uid); throw e; }
  }, [api, userId]);
  const encryptMessage = useCallback(async (uid, cid, clientId, kind, content, audio = null) => {
    if (!keys || status !== "ready") throw new Error("Ative ou recupere a proteção deste aparelho primeiro.");
    const peer = await getPeer(uid);
    if (!peer) throw new Error("A outra pessoa precisa abrir o chat e ativar a proteção antes de receber mensagens.");
    return sealMessage(keys, peer, cid, clientId, kind, content, audio);
  }, [keys, status, getPeer]);
  const decryptMessage = useCallback(async (message, bytes = null) => {
    if (!keys || status !== "ready") throw new Error("Recupere suas chaves neste aparelho para abrir a mensagem.");
    const participants = Object.keys(message.e2ee.header.keys);
    const peerId = participants.find((uid) => uid !== userId);
    if (!peerId || !participants.includes(userId)) throw new Error("Esta mensagem não pertence a você.");
    const peer = await getPeer(peerId);
    if (!peer) throw new Error("Chave do contato indisponível. Tente novamente.");
    return openMessage(keys, { [userId]: keys, [peerId]: peer }, message.conversation_id, message.sender_id, message.e2ee, bytes);
  }, [keys, status, userId, getPeer]);
  const codeFor = useCallback(async (uid) => {
    const peer = await getPeer(uid);
    if (!keys || !peer) throw new Error("Os dois participantes precisam ativar a proteção.");
    return securityCode(keys, peer);
  }, [keys, getPeer]);
  const showSetup = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ status, ready: status === "ready", error, keys, showSetup, load, getPeer, encryptMessage, decryptMessage, codeFor, lock }), [status, error, keys, showSetup, load, getPeer, encryptMessage, decryptMessage, codeFor, lock]);
  return <CryptoContext.Provider value={value}>{children}<CryptoSetupDialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setPending(null); }} status={status} error={error} pending={pending} onPrepare={prepare} onActivate={activate} onRecover={recover} onRetry={load} onLock={lock} /></CryptoContext.Provider>;
}
export const useCrypto = () => useContext(CryptoContext);
