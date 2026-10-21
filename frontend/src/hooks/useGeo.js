import { useCallback, useState } from "react";
import { DEFAULT_POS } from "@/lib/constants";

export function useGeo(initial) {
  const [pos, setPos] = useState(initial || DEFAULT_POS);
  const [status, setStatus] = useState("idle");
  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("denied");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setStatus("ok");
      },
      () => setStatus("denied"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }, []);
  return { pos, setPos, status, locate };
}
