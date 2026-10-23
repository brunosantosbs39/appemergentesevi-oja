import { useCallback, useEffect, useRef, useState } from "react";
import { pageCursor, mergeItems } from "@/lib/pagination";
import { useApi } from "@/lib/api";

export function useMyRequests() {
  const api = useApi();
  const [items, setItems] = useState(null);
  const cursor = useRef(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMore = async () => {
    if (loadingMore || !cursor.current) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get("/requests/mine", { params: { before: cursor.current } });
      setItems((previous) => mergeItems(previous, data));
      setHasMore(data.length === 100);
      if (data.length) cursor.current = pageCursor(data[data.length - 1]);
    } finally { setLoadingMore(false); }
  };
  const reload = useCallback(async () => {
    const { data } = await api.get("/requests/mine");
    setItems((previous) => mergeItems(previous, data));
    if (!cursor.current) { setHasMore(data.length === 100); cursor.current = pageCursor(data[data.length - 1]); }
  }, [api]);
  useEffect(() => {
    reload().catch(() => setItems([]));
    const t = setInterval(() => document.visibilityState === "visible" && reload().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [reload]);
  const update = (r) => setItems((prev) => (prev || []).map((x) => (x.id === r.id ? r : x)));
  const markReviewed = (id, field) => setItems((prev) => (prev || []).map((x) => (x.id === id ? { ...x, [field]: true } : x)));
  return { items, setItems, reload, update, markReviewed, hasMore, loadMore, loadingMore };
}
