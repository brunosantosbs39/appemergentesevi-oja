import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_POS } from "@/lib/constants";
export function useGeo(initial) {
  const [pos, setPos] = useState(initial || DEFAULT_POS);
  const [status, setStatus] = useState("idle");
  const [accuracy, setAccuracy] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const watch = useRef(null), timer = useRef(null), generation = useRef(0);
  const stop = useCallback(() => {
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    clearTimeout(timer.current); watch.current = null;
  }, []);
  useEffect(() => () => { generation.current++; stop(); }, [stop]);
  const locate = useCallback(() => {
    stop(); const run = ++generation.current;
    if (!navigator.geolocation) { setStatus("unsupported"); return; }
    setStatus("locating"); setAccuracy(null);
    let best = Infinity;
    watch.current = navigator.geolocation.watchPosition(p => {
      if (run !== generation.current || p.coords.accuracy >= best) return;
      best = p.coords.accuracy;
      setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      setAccuracy(best); setUpdatedAt(p.timestamp); setStatus("ok");
      if (best <= 30) stop();
    }, e => {
      if (run !== generation.current) return;
      if (!Number.isFinite(best)) setStatus(e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable");
      stop();
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    timer.current = setTimeout(() => { stop(); if (!Number.isFinite(best)) setStatus("timeout"); }, 22000);
  }, [stop]);
  return { pos, setPos, status, locate, accuracy, updatedAt };
}
