/**
 * Offline support for EconIB.
 *
 * Rules, in order of importance:
 *
 * 1. NEVER cache /api/. Those responses contain a student's coursework and
 *    marks. Caching them would leave personal work in the browser cache after
 *    sign-out, on a shared school computer.
 * 2. HTML is network-first. A cached shell running against a newer API is the
 *    failure this exists to avoid, so the network always wins when it can.
 * 3. Static assets are stale-while-revalidate: instant offline, and refreshed
 *    in the background for next time.
 * 4. The cache name carries a version. On activate every other cache is
 *    deleted, so an installed copy cannot serve an old shell forever.
 *
 * Bump CACHE_VERSION whenever the shell or the data files change shape.
 */
const CACHE_VERSION = "econib-v1";

const PRECACHE = [
  "/app",
  "/login",
  "/assets/css/tokens.css",
  "/assets/css/base.css",
  "/assets/css/app.css",
  "/assets/favicon.svg",
  "/assets/data/syllabus.json",
  "/assets/data/rubrics.json",
  "/assets/data/command-terms.json",
  "/assets/data/key-concepts.json",
  "/assets/data/assessment.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // Precaching must not fail the whole install if one file is missing.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 1. Personal data never touches the cache.
  if (url.pathname.startsWith("/api/")) return;

  // 2. Pages: network first, cache as the fallback.
  const wantsHtml = request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");
  if (wantsHtml) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/app")))
    );
    return;
  }

  // 3. Everything else: serve from cache immediately, refresh behind it.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
