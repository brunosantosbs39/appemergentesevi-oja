/* Notifications only: never cache authenticated API responses. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch {}
  const destination = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/feed";
  event.waitUntil(self.registration.showNotification(data.title || "ServiçoJá", {
    body: data.body || "Você tem uma nova atualização.", icon: "/icon-192.png", badge: "/icon-192.png",
    tag: data.id || "servicoja-update", data: { url: destination },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/feed", self.location.origin);
  if (destination.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const window of windows) {
      if (new URL(window.url).origin === self.location.origin && "focus" in window) {
        await window.navigate(destination.href); return window.focus();
      }
    }
    return self.clients.openWindow(destination.href);
  })());
});
