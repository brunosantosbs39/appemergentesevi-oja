import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";

export function useUnread() {
  const api = useApi();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () => document.visibilityState === "visible" && navigator.onLine && api.get("/conversations/unread-count").then((r) => alive && setCount(r.data.count)).catch(() => {});
    tick();
    window.addEventListener("conversations-changed", tick);
    document.addEventListener("visibilitychange", tick);
    const t = setInterval(tick, 30000);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("conversations-changed", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [api]);
  return count;
}
