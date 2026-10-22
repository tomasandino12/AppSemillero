// Sólo un video propio de public/portal/: la CSP (media-src 'self') no deja
// cargar medios de otro sitio, y enlazar al de afuera le pasaría la IP de cada
// familia a otro servidor.
const RUTA_VIDEO = /^\/public\/portal\/[\w-]+\.(?:mp4|webm)$/;
const RUTA_POSTER = /^\/public\/portal\/[\w-]+\.(?:webp|jpe?g|png)$/;

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

/** El video del hero si es un archivo propio, con su poster y un texto que cuente qué se ve. */
export function heroVideoValido(video) {
  const alt = texto(video?.alt);
  if (!RUTA_VIDEO.test(video?.src ?? '') || !RUTA_POSTER.test(video?.poster ?? '') || !alt) return null;
  return { src: video.src, poster: video.poster, alt };
}

const CONEXIONES_LENTAS = new Set(['slow-2g', '2g']);

/**
 * ¿Se baja el video? No con movimiento reducido (es movimiento continuo), ni
 * con ahorro de datos, ni con conexión lenta: en esos casos queda el poster.
 * `conexion` es navigator.connection.effectiveType, que muchos navegadores no
 * tienen: sin dato, se asume que alcanza.
 */
export function debeCargarVideo({ movimientoReducido = false, ahorroDeDatos = false, conexion = null } = {}) {
  return !movimientoReducido && !ahorroDeDatos && !CONEXIONES_LENTAS.has(conexion);
}
