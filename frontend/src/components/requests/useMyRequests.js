import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/lib/api";

export function useMyRequests() {
  const api = useApi();
  const [items, setItems] = useState(null);
  const reload = useCallback(async () => {
    const { data } = await api.get("/requests/mine");
    setItems(data);
  }, [api]);
  useEffect(() => {
    reload().catch(() => setItems([]));
    const t = setInterval(() => reload().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [reload]);
  const update = (r) => setItems((prev) => (prev || []).map((x) => (x.id === r.id ? r : x)));
  const markReviewed = (id, field) => setItems((prev) => (prev || []).map((x) => (x.id === id ? { ...x, [field]: true } : x)));
  return { items, setItems, reload, update, markReviewed };
}
