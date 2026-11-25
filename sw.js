/* ETS Community Map: sw.js (the offline helper)
   Only does anything after a visitor presses Save for Offline Use. Then:
     - pages, code and data files: the newest copy from the internet when there is a connection, the saved copy when there isn't
     - photos, audio and saved map pictures: the saved copy first (they don't change)
   It never saves anything the visitor didn't ask for, and never sends anything anywhere. */
const CACHE = "ets-offline-v1:" + self.registration.scope;   // one saved copy per map, even when several maps share a website
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

const fresh = url => /\.(html|js|css|csv|json|geojson)$/i.test(url.pathname) || url.pathname.endsWith("/");
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(req, { ignoreSearch: url.origin === location.origin && fresh(url) });
    if (!saved) return fetch(req);                       // not saved: behave exactly as if this helper weren't here
    if (url.origin === location.origin && fresh(url)) {
      try { const r = await fetch(req, { cache: "no-cache" }); if (r && r.ok) cache.put(req, r.clone()); return r; }
      catch (err) { return saved; }
    }
    return saved;
  })());
});

// The page sends the list of files to save; progress goes back to the page.
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "save") e.waitUntil(save(d.urls || [], e.source));
  if (d.type === "clear") e.waitUntil(caches.delete(CACHE).then(() => e.source && e.source.postMessage({ type: "cleared" })));
});
async function save(urls, client) {
  const cache = await caches.open(CACHE);
  let done = 0, failed = 0;
  const queue = urls.slice();
  async function worker() {
    while (queue.length) {
      const u = queue.shift();
      try {
        const cross = new URL(u, location.href).origin !== location.origin;
        const r = await fetch(u, cross ? { mode: "no-cors" } : { cache: "no-cache" });
        if (r && (r.ok || r.type === "opaque")) await cache.put(u, r); else failed++;
      } catch (err) { failed++; }
      done++;
      if (client && (done % 10 === 0 || done === urls.length)) client.postMessage({ type: "progress", done, total: urls.length, failed });
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (client) client.postMessage({ type: "saved", done, total: urls.length, failed });
}
