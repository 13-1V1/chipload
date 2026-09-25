const APP_VERSION = "3.2.0";
const CACHE_PREFIX = "marcos-calc-v";
const CACHE = `${CACHE_PREFIX}${APP_VERSION}`;
const PRECACHE = ["./index.html", "./app.css?v=3.2.0", "./app.js?v=3.2.0", "./calc-core.js?v=3.2.0", "./ui-state.js?v=3.2.0", "./units.js?v=3.2.0", "./persistence.js?v=3.2.0", "./mobile-ui.js?v=3.2.0", "./pwa.js?v=3.2.0", "./favicon.png", "./manifest.json", "./tests.html", "./assets/fonts/ibm-plex-sans-latin.woff2", "./assets/fonts/roboto-slab-700-latin.woff2", "./assets/icons/brand-96.png", "./assets/icons/brand-192.png", "./assets/icons/apple-touch-180.png", "./assets/icons/app-192.png", "./assets/icons/app-512.png", "./assets/icons/maskable-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
  // Wait for explicit acceptance before replacing an installed version.
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "GET_VERSION" && event.source) event.source.postMessage({type:"APP_VERSION",version:APP_VERSION});
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === "navigate") {
      try {
        const response = await fetch(event.request);
        if (response.ok && (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html"))) {
          await cache.put("./index.html", response.clone());
        }
        return response;
      } catch {
        return await cache.match(event.request) || await cache.match("./index.html") || Response.error();
      }
    }
    // Versioned modules keep an existing page on one consistent release.
    const cached = await cache.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch { return Response.error(); }
  })());
});
