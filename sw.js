// Garde l'appli en mémoire sur le téléphone pour qu'elle s'ouvre même sans réseau.
// La météo, le relief, les forêts et les chemins viennent toujours d'Internet.
const CACHE = "meteo-coins-v6";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Page de l'appli : d'abord Internet (pour recevoir les mises à jour), sinon la copie gardée
  if (req.mode === "navigate" || (url.origin === location.origin)) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("./index.html"))));
    return;
  }
  // Bibliothèque de carte et polices : la copie gardée suffit
  if (url.hostname === "cdnjs.cloudflare.com" || url.hostname.endsWith("gstatic.com") || url.hostname === "fonts.googleapis.com") {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
  }
  // Tout le reste (météo, relief, forêts, chemins, fonds de carte) passe directement par Internet
});
