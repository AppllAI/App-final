// Service worker : le site s'ouvre instantanément (même hors ligne pour l'interface).
// Les appels à l'API ne sont JAMAIS mis en cache (données personnelles).
const VERSION = "applai-v5";
const FICHIERS = ["./", "index.html", "app.html", "styles.css", "accueil.css", "config.js", "accueil.js", "demo.js", "admin.js", "app.js",
  "confidentialite.html", "manifest.webmanifest", "icones/logo.svg", "icones/icone-192.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;     // API et autres sites : réseau direct
  // réseau d'abord, en revalidant toujours (sinon le navigateur ressert jusqu'à 10 min une ancienne version)
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => {
    const copie = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copie)); return r;
  }).catch(() => caches.match(e.request)));
});
