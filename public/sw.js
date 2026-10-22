/*
 * Service worker de Semillero (/app). Existe para que la app se pueda instalar
 * en el celular, no para que ande sin conexión (fuera de alcance). El portal
 * del básquet (/) no lo registra y no queda bajo su alcance.
 * Reglas y porqués en docs/superpowers/specs/2026-10-18-portal-v2-design.md;
 * las ata tests/serviceWorker.test.js.
 *
 * - Otro origen (Supabase, Google) NO se intercepta: nunca entra a la caché.
 *   Guardar respuestas de Supabase dejaría datos de menores en el celular.
 * - /src y el CSS NO se interceptan: no llevan hash en el nombre, y servirlos
 *   de la caché dejaría HTML nuevo con JS viejo después de un deploy. Siguen
 *   con el no-cache de vercel.json, como antes de que existiera este archivo.
 * - El HTML de la app va red-primero; la copia de /app sólo se usa sin conexión.
 * - Lo que no cambia entre deploys (vendor, fuentes, íconos, escudo) va
 *   caché-primero, en un caché con la versión en el nombre.
 *
 * VERSION es el hash de esos archivos fijos: si cambia uno (npm run vendor),
 * el test falla y dice el valor nuevo. Plan de escape si esto rompe algo: ver
 * docs/SEGURIDAD-LANZAMIENTO.md.
 *
 * Script clásico y no módulo: Safari tardó en aceptar service workers módulo.
 */
const VERSION = 'ff0f6bb22216';
const PREFIJO = 'inferiores-';
const CACHE = PREFIJO + VERSION;
const FIJOS = /^\/public\/(?:vendor|fonts|icons)\/|^\/public\/escudo\.png$/;

const APP = '/app';

function estrategia(url, metodo, modo, origen) {
  if (metodo !== 'GET' || url.origin !== origen) return null;
  // Sólo la app: el portal, las páginas legales y cualquier otra navegación
  // siguen como si este archivo no existiera.
  if (modo === 'navigate') return url.pathname === APP ? 'red-primero' : null;
  if (FIJOS.test(url.pathname)) return 'cache-primero';
  return null;
}

async function redPrimero(pedido, url) {
  try {
    const respuesta = await fetch(pedido);
    // Sólo /app limpia: nunca la vuelta del login (?code=, #access_token).
    if (respuesta.ok && !url.search) {
      const cache = await caches.open(CACHE);
      await cache.put(APP, respuesta.clone());
    }
    return respuesta;
  } catch (error) {
    const copia = await (await caches.open(CACHE)).match(APP);
    if (copia) return copia;
    throw error;
  }
}

async function cachePrimero(pedido) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(pedido);
  if (guardada) return guardada;
  const respuesta = await fetch(pedido);
  if (respuesta.ok) await cache.put(pedido, respuesta.clone());
  return respuesta;
}

self.addEventListener('install', () => {
  // Sin esperar a que se cierren las pestañas: el deploy entra al recargar.
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n.startsWith(PREFIJO) && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  const cual = estrategia(url, pedido.method, pedido.mode, self.location.origin);
  if (cual === 'red-primero') evento.respondWith(redPrimero(pedido, url));
  else if (cual === 'cache-primero') evento.respondWith(cachePrimero(pedido));
});
