// Service worker di Radice: rende l'app installabile e apribile anche senza rete.
// Strategia "prima la rete": gli aggiornamenti arrivano subito, la copia salvata serve solo offline.
// Le chiamate a Supabase e ad altri siti non passano di qui.
const CACHE = 'greenrabbit-v1';
const FILE = [
  './', './index.html', './vivaio.html', './app.js', './vivaio.js', './db.js', './config.js',
  './costanti.js', './luna.js', './ui.js', './immagine.js', './styles.css',
  './libreria-supabase.js', './libreria-qrcode.js', './favicon.svg', './logo.svg', './icona-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => n !== CACHE).map((n) => caches.delete(n)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
