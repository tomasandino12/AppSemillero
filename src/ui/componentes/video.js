import { escaparHtml } from '../nav.js';
import { urlDeReproductor } from '../../data/youtube.js';

/**
 * Reproductor de YouTube embebido. Devuelve '' si el enlace no es un video de
 * YouTube: quien lo llama sigue mostrando el link común, el iframe es un
 * agregado y no lo reemplaza. La CSP (frame-src) sólo deja cargar
 * youtube-nocookie.
 */
export function reproductorHtml(enlace, titulo) {
  const src = urlDeReproductor(enlace);
  if (!src) return '';
  return `
    <div class="video-embed">
      <iframe src="${escaparHtml(src)}" title="Video: ${escaparHtml(titulo)}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </div>
  `;
}
