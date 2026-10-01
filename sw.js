// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Service worker for the web (GitHub Pages) version. Network-first so updates land right away,
// cache fallback so the app opens with no signal. The Android app does not use this.

const CACHE = "chipload-v1";
// The shell, plus what a page loads late and so can't report: the number font (first used on a
// calculator), the tab icon, and the license text.
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./src/styles/app.css", "./src/app/main.js",
  "./assets/icons/app-192.png", "./assets/fonts/ibm-plex-sans-latin.woff2", "./assets/fonts/ibm-plex-mono-latin-400.woff2",
  "./assets/fonts/ibm-plex-mono-latin-600.woff2", "./assets/fonts/LICENSE-IBM-Plex-Mono.txt",
];
const sameOrigin = (url) => new URL(url, location.href).origin === location.origin;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("chipload-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// The page lists what it loaded before this worker existed; fetch a copy of anything not cached yet.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "precache" || !Array.isArray(event.data.urls)) return;
  const urls = [...new Set(event.data.urls.filter((u) => typeof u === "string" && sameOrigin(u)))];
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(urls.map(async (url) => {
    if (await cache.match(url)) return true;
    try { const res = await fetch(url, { cache: "no-cache" }); if (res.ok) { await cache.put(url, res); return true; } } catch { /* offline right now: next visit */ }
    return false;
  }))).then((kept) => event.source?.postMessage({ type: "precached", complete: kept.every(Boolean) })));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !sameOrigin(req.url)) return;
  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok) {
        // Copy the response now, before the page starts reading it — a body can only be read once.
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: req.mode === "navigate" }).then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
