import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";

export function useUnread() {
  const api = useApi();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () => api.get("/conversations/unread-count").then((r) => alive && setCount(r.data.count)).catch(() => {});
    tick();
    const t = setInterval(tick, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [api]);
  return count;
}
