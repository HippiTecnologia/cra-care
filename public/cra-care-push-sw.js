self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(payload.title || "CRA Care", {
    body: payload.body || "Você tem uma nova notificação.",
    icon: "/logo-cra.png",
    badge: "/logo-cra.png",
    data: { url: payload.url || "/paciente" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/paciente"));
});
