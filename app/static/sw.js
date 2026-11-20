const CACHE_PREFIX = "plants-static-";
const CACHE = CACHE_PREFIX + "v13";
const ASSETS = [
  "/static/app.js?v=care-ui-8",
  "/static/style.css?v=care-ui-8",
  "/static/icon.svg?v=2",
  "/static/manifest.json?v=2",
  "/static/apple-touch-icon.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(["/", ...ASSETS]))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Cache only public app assets. Care data and quick links go directly to the server.
  if (ASSETS.includes(url.pathname + url.search)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(request)) || fetch(request)));
  } else if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match("/")) || Response.error();
    }));
  }
});

// ---------------------------------------------------------------- push notifications

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Plants";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Some plants need checking.",
      icon: "/static/icon.svg?v=2",
      badge: "/static/icon.svg?v=2",
      tag: data.tag || "plants",
      renotify: Boolean(data.tag),
      data: { url: data.url || "/#/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only ever open pages of this app, whatever the payload says.
  const target = new URL(event.notification.data?.url || "/#/", self.location.origin);
  const url = target.origin === self.location.origin ? target.href : new URL("/#/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        return open.focus().then((w) => (w && "navigate" in w ? w.navigate(url) : w));
      }
      return self.clients.openWindow(url);
    }),
  );
});

// The browser rotated or dropped the subscription: re-register it so reminders keep arriving.
self.addEventListener("pushsubscriptionchange", (event) => {
  const post = (path, body) =>
    fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      let sub = event.newSubscription;
      if (!sub && old && old.options && old.options.applicationServerKey) {
        sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: old.options.applicationServerKey,
        });
      }
      if (sub) {
        const json = sub.toJSON();
        await post("/api/push/subscribe", { endpoint: json.endpoint, keys: json.keys });
      }
      if (old && (!sub || old.endpoint !== sub.endpoint)) {
        await post("/api/push/unsubscribe", { endpoint: old.endpoint });
      }
    })().catch(() => {}),
  );
});
