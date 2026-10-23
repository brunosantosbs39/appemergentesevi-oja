import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import { useCrypto } from "@/context/CryptoContext";

export const AudioMessage = ({ message }) => {
  const api = useApi();
  const protection = useCrypto();
  const { ready, decryptMessage } = protection;
  const [url, setUrl] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true, objectUrl;
    setUrl(null); setError("");
    if (!attempt || message.e2ee && !ready) return;
    (async () => {
      try {
        const { data } = await api.get(`/conversations/${message.conversation_id}/messages/${message.id}/audio`, { responseType: "blob" });
        const blob = message.e2ee ? (await decryptMessage(message, await data.arrayBuffer())).audio : data;
        if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
      } catch (e) { if (active) setError(e.response ? "Não foi possível carregar o áudio." : e.message); }
    })();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, message, attempt, ready, decryptMessage]);
  if (message.e2ee && !ready) return <button type="button" onClick={protection.showSetup}>Recuperar chaves para ouvir</button>;
  return url ? <audio controls preload="metadata" src={url} className="max-w-full" aria-label="Mensagem de áudio" /> : <button type="button" onClick={() => setAttempt((n) => n + 1)}>{error || (attempt ? "Carregando… toque para tentar novamente" : "Carregar áudio")}</button>;
};
