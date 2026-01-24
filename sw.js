const CACHE_NAME = "vocab-garden-cache-v0.3.51";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=059",
  "./app.js?v=059",
  "./config.json",
  "./manifest.webmanifest",
  "./Vocabulary/vocab-manifest.json",
  "./Audio/audio-manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const CORE_PATHS = new Set(
  CORE_ASSETS.map((asset) => new URL(asset, self.registration.scope).pathname),
);

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

  const isCoreAsset = CORE_PATHS.has(url.pathname);

  // Keep core assets fresh while preserving offline fallback.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const shouldBypassCache = isCoreAsset
        || req.mode === "navigate"
        || url.pathname.includes("/Vocabulary/")
        || url.pathname.includes("/Audio/")
        || url.pathname.includes("/UserAudio/");
      const fetchReq = shouldBypassCache
        ? new Request(req.url, { cache: "no-store" })
        : req;
      const res = await fetch(fetchReq);
      if (res && res.ok) {
        if (isCoreAsset) {
          cache.put(req, res.clone());
        }
        // Cache vocab JSON and audio as they are requested
        const p = url.pathname;
        if (p.includes("/Vocabulary/") || p.includes("/Audio/") || p.includes("/UserAudio/")) {
          cache.put(req, res.clone());
        }
      }
      return res;
    } catch (e) {
      const cached = await cache.match(req);
      if (cached) return cached;
      // Offline fallback: try cache for navigation
      if (req.mode === "navigate") {
        const cachedIndex = await cache.match("./index.html");
        if (cachedIndex) return cachedIndex;
      }
      throw e;
    }
  })());
});
