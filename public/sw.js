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
 * 3. Code (JS and CSS) is network-first, like HTML. There is no build step and
 *    so no content hashing in filenames, which means a stale module would run
 *    against a newer API for a whole load after every deploy. The files are
 *    small and revalidate as a 304, so the round trip is cheap and the cache is
 *    still there the moment the network is not.
 * 4. Everything else — fonts, icons, the syllabus JSON — is
 *    stale-while-revalidate: instant, and refreshed behind you for next time.
 * 5. The cache name carries a version. On activate every other cache is
 *    deleted, so an installed copy cannot serve an old shell forever.
 *
 * Bump CACHE_VERSION whenever the shell or the data files change shape.
 */
const CACHE_VERSION = "econib-v2";

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

  // 3. Code: network first. A stale script against a fresh API is the exact
  // failure this whole file exists to avoid, and without content-hashed
  // filenames the cache cannot tell old code from new.
  if (/\.(?:js|mjs|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 4. Everything else: serve from cache immediately, refresh behind it.
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
