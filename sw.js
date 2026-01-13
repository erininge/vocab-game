const CACHE_NAME = "vocab-garden-cache-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.json",
  "./manifest.webmanifest",
  "./Vocabulary/vocab-manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Cache-first for core and vocab/audio files
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      if (res && res.ok) {
        // Cache vocab JSON and audio as they are requested
        const p = url.pathname;
        if (p.includes("/Vocabulary/") || p.includes("/Audio/") || p.includes("/UserAudio/")) {
          cache.put(req, res.clone());
        }
      }
      return res;
    } catch (e) {
      // Offline fallback: try cache for navigation
      if (req.mode === "navigate") {
        const cachedIndex = await cache.match("./index.html");
        if (cachedIndex) return cachedIndex;
      }
      throw e;
    }
  })());
});
