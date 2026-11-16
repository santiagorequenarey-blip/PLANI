/* Service worker del Planificador de comidas.
   Guarda la app en el móvil para que funcione sin conexión.
   Cuando cambies index.html, sube también este archivo con el número de VERSION cambiado
   (por ejemplo "v2"), para que el móvil descargue la versión nueva. */
const VERSION = "v1";
const CACHE = "planificador-" + VERSION;

// Librerías del PDF. Se piden con esta misma dirección desde index.html.
const LIBS = [
  { url: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", local: "lib/jspdf.umd.min.js" },
  { url: "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js", local: "lib/jspdf.plugin.autotable.min.js" }
];
const CORE = [
  "./", "index.html", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png", "icons/favicon-48.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Archivos de la app: si falla alguno, la instalación se reintenta más tarde.
    await c.addAll(CORE.map((u) => new Request(u, { cache: "reload" })));
    // Librerías del PDF: primero la copia local (carpeta lib), si no existe, desde cdnjs.
    for (const l of LIBS) {
      try {
        let r = await fetch(l.local, { cache: "reload" }).catch(() => null);
        if (!r || !r.ok) r = await fetch(l.url, { cache: "reload" });
        if (r && r.ok) await c.put(l.url, r);
      } catch (_) { /* se reintentará al usar el PDF con conexión */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("planificador-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 1) Abrir la app: primero la red (para recibir versiones nuevas), y si no hay red, la copia guardada.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const r = await fetch(req, { signal: ctrl.signal });
        clearTimeout(t);
        if (r && r.ok) { c.put("index.html", r.clone()); return r; }
      } catch (_) {}
      return (await c.match("index.html", { ignoreSearch: true })) || (await c.match("./", { ignoreSearch: true })) || Response.error();
    })());
    return;
  }

  // 2) Librerías del PDF y archivos propios: primero la copia guardada.
  const esLib = LIBS.some((l) => l.url === req.url);
  if (esLib || url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r && r.ok) c.put(req, r.clone());
        return r;
      } catch (_) {
        return Response.error();
      }
    })());
  }
});
