import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errMsg, useApi } from "@/lib/api";
import { Button } from "@/components/ui/button";

export const AudioRecorder = ({ conversationId, onSent, compact = false, hideTrigger = false, onStateChange }) => {
  const api = useApi();
  const recorder = useRef(null);
  const stream = useRef(null);
  const timer = useRef(null);
  const mounted = useRef(true);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState(null);
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const release = () => { clearInterval(timer.current); stream.current?.getTracks().forEach((t) => t.stop()); };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (recorder.current?.state === "recording") recorder.current.stop(); release(); };
  }, []);
  useEffect(() => {
    if (!clip) { setUrl(null); return; }
    const preview = URL.createObjectURL(clip);
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [clip]);
  useEffect(() => { onStateChange?.(recording || !!clip || starting || busy); }, [recording, clip, starting, busy, onStateChange]);
  const start = async () => {
    if (starting || recording || busy) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast.error("Seu navegador não permite gravar áudio. Use um navegador atualizado.");
    setStarting(true);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { mic.getTracks().forEach((t) => t.stop()); return; }
      stream.current = mic;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((v) => MediaRecorder.isTypeSupported(v));
      const rec = new MediaRecorder(mic, mime ? { mimeType: mime } : undefined);
      recorder.current = rec;
      const chunks = [];
      let bytes = 0;
      rec.ondataavailable = ({ data }) => { if (data.size) { chunks.push(data); bytes += data.size; if (bytes > 4 * 1024 * 1024 && rec.state === "recording") rec.stop(); } };
      rec.onstop = () => {
        release();
        if (!mounted.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType });
        if (!blob.size || blob.size > 4 * 1024 * 1024) return toast.error("O áudio deve ter até 4 MB. Grave uma mensagem mais curta.");
        setClip(blob);
      };
      rec.onerror = () => { release(); if (mounted.current) { setRecording(false); toast.error("Não foi possível gravar o áudio."); } };
      setSeconds(0);
      setRecording(true);
      rec.start(500);
      let elapsed = 0;
      timer.current = setInterval(() => { elapsed += 1; setSeconds(elapsed); if (elapsed >= 120 && rec.state === "recording") rec.stop(); }, 1000);
    } catch (err) {
      release();
      toast.error(err.name === "NotAllowedError" ? "Permita o acesso ao microfone para gravar áudio." : "Não foi possível acessar o microfone.");
    } finally { if (mounted.current) setStarting(false); }
  };
  const send = async () => {
    if (!clip || busy) return;
    setBusy(true);
    try {
      const form = new FormData();
      const extension = clip.type.includes("mp4") ? "m4a" : clip.type.includes("ogg") ? "ogg" : "webm";
      form.append("file", clip, `audio.${extension}`);
      const { data } = await api.post(`/conversations/${conversationId}/audio`, form);
      onSent(data);
      setClip(null);
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return <div className={compact ? "sj-audio-controls" : "flex flex-wrap items-center gap-2"}>
    {!recording && !clip && !hideTrigger && <Button type="button" variant="outline" className={compact ? "sj-mic" : undefined} onClick={start} disabled={starting} aria-label="Gravar áudio">{starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}{!compact && " Áudio"}</Button>}
    {recording && <><span role="status" className="text-sm text-red-500">Gravando {seconds}s / 120s</span><Button type="button" variant="outline" onClick={() => recorder.current?.stop()} aria-label="Parar gravação"><Square className="h-4 w-4" /> Parar</Button></>}
    {clip && <><audio controls src={url || undefined} className="h-9 max-w-full" aria-label="Ouvir antes de enviar" /><Button type="button" variant="outline" disabled={busy} onClick={() => setClip(null)} aria-label="Descartar áudio"><Trash2 className="h-4 w-4" /></Button><Button type="button" disabled={busy} onClick={send}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar áudio</Button></>}
  </div>;
};
