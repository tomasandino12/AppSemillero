/**
 * De un link de YouTube saca el ID del video, para mostrarlo con el reproductor
 * embebido en vez de mandar al profe a otra app. El video lo aloja y lo sirve
 * YouTube: la app sólo guarda el link (costo cero).
 *
 * Es estricto a propósito: el ID termina dentro de un <iframe src>, así que
 * sólo pasa un host de YouTube exacto (no "youtube.com.evil.com") y 11
 * caracteres [A-Za-z0-9_-]. Cualquier otra cosa da null y la pantalla cae al
 * link común de siempre.
 */

const HOSTS_WATCH = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const ID_VALIDO = /^[A-Za-z0-9_-]{11}$/;
const RUTAS_CON_ID = /^\/(?:shorts|embed|live)\/([^/]+)\/?$/;

export function idDeYoutube(url) {
  if (typeof url !== 'string') return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

  let candidato = null;
  if (u.hostname === 'youtu.be') {
    candidato = u.pathname.slice(1).replace(/\/$/, '');
  } else if (HOSTS_WATCH.has(u.hostname)) {
    candidato = u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.match(RUTAS_CON_ID)?.[1];
  }
  return candidato && ID_VALIDO.test(candidato) ? candidato : null;
}

/**
 * URL del reproductor: youtube-nocookie no deja cookies de seguimiento hasta
 * que se da play, y rel=0 limita las sugerencias al mismo canal. null si el
 * link no es un video de YouTube.
 */
export function urlDeReproductor(url) {
  const id = idDeYoutube(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}
