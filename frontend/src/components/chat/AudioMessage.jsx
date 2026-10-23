import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";

export const AudioMessage = ({ message }) => {
  const api = useApi();
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl;
    setError(false);
    api.get(`/conversations/${message.conversation_id}/messages/${message.id}/audio`, { responseType: "blob" })
      .then(({ data }) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(data);
        setUrl(objectUrl);
      }).catch(() => active && setError(true));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [api, message.id, message.conversation_id, attempt]);
  if (error) return <button type="button" onClick={() => setAttempt((n) => n + 1)}>Tentar carregar áudio novamente</button>;
  return url ? <audio controls preload="metadata" src={url} className="max-w-full" aria-label="Mensagem de áudio" /> : <p>Carregando áudio...</p>;
};
