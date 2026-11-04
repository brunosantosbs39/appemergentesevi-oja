// One request at a time, pause hidden/offline, back off on errors.
export function startPolling(task, { interval = 30000, onError = () => {}, doc = document, win = window } = {}) {
  let stopped = false, busy = false, timer, failures = 0;
  const delay = () => Math.max(typeof interval === "function" ? interval() : interval, 1000) * Math.min(4, 2 ** failures);
  const tick = async () => {
    if (stopped || busy) return;
    clearTimeout(timer);
    if (doc.visibilityState !== "visible" || win.navigator.onLine === false) return;
    busy = true;
    try { await task(); failures = 0; }
    catch (error) { failures++; if (!stopped) onError(error); }
    finally {
      busy = false;
      if (!stopped) timer = setTimeout(tick, delay());
    }
  };
  const wake = () => { if (!busy) { clearTimeout(timer); tick(); } };
  doc.addEventListener("visibilitychange", wake);
  win.addEventListener("online", wake);
  tick();
  return () => {
    stopped = true; clearTimeout(timer);
    doc.removeEventListener("visibilitychange", wake);
    win.removeEventListener("online", wake);
  };
}
