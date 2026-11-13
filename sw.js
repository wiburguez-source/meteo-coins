// Garde l'appli en mémoire sur le téléphone pour qu'elle s'ouvre même sans réseau.
// La météo, le relief, les forêts et les chemins viennent toujours d'Internet.
const CACHE = "meteo-coins-v25";
const MAPS = "meteo-coins-fonds";      // fonds de carte déjà regardés
const MAPS_MAX = 2500;                 // environ 60 Mo au pire ; au-delà, on jette les plus anciens
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
// La carte vient d'un CDN : si elle manque à l'installation, l'appli s'installe quand même.
const EXTRA = ["https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL).then(() => Promise.all(EXTRA.map(u => c.add(u).catch(() => {})))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== MAPS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Page de l'appli : d'abord Internet (pour recevoir les mises à jour), sinon la copie gardée
  if (req.mode === "navigate" || (url.origin === location.origin)) {
    // Réseau d'abord, mais pas plus de 2,5 s : en lisière de forêt, un réseau à moitié mort
    // faisait attendre trente secondes devant un écran blanc au lieu de servir la copie gardée.
    const fromNet = fetch(req).then(res => {
      if (res && res.ok && res.status === 200 && res.type === "basic") {   // ne jamais garder une erreur ni une page tronquée
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    });
    const fallback = () => caches.match(req).then(r => r || caches.match("./index.html"));
    e.respondWith(Promise.race([
      fromNet.catch(() => fallback()),
      new Promise(r => setTimeout(() => r(fallback().then(c => c || fromNet)), 2500))
    ]).then(r => r || fromNet));
    return;
  }
  // Bibliothèque de carte et polices : la copie gardée suffit
  if (url.hostname === "cdnjs.cloudflare.com" || url.hostname.endsWith("gstatic.com") || url.hostname === "fonts.googleapis.com") {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
  }
  // Fonds de carte : on garde ceux qu'il a déjà regardés, pour qu'ils soient là sans réseau.
  // Une tuile de carte ne change jamais : la copie gardée passe donc avant le réseau.
  if (url.hostname === "data.geopf.fr" && url.searchParams.get("REQUEST") === "GetTile"
      || url.hostname.endsWith("tile.opentopomap.org")) {
    e.respondWith(caches.open(MAPS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      // Une tuile demandée par <img> revient « opaque » : on ne peut pas lire son code HTTP,
      // mais on peut la garder. Le bouton des Réglages permet de tout vider si une tuile est abîmée.
      if (res && (res.ok || res.type === "opaque")) { c.put(req, res.clone()).then(() => trimMaps(c)); }
      return res;
    }))));
    return;
  }
  // Tout le reste (météo, relief, forêts, chemins) passe directement par Internet
});

/* Plafond du cache des fonds de carte : on ne vérifie qu'une fois sur cinquante, et on jette
   les plus anciennes entrées. Sans ça, une longue session de carte remplirait le téléphone. */
let putCount = 0;
function trimMaps(c) {
  if (++putCount % 50) return Promise.resolve();
  return c.keys().then(keys => {
    if (keys.length <= MAPS_MAX) return;
    return Promise.all(keys.slice(0, keys.length - MAPS_MAX + 200).map(k => c.delete(k)));
  }).catch(() => {});
}
