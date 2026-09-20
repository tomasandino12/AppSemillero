import { escaparHtml } from '../nav.js';
import { idDeYoutube, urlDeReproductor } from '../../data/youtube.js';
import { abrirHoja } from './hoja.js';

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

/** Si el enlace se puede ver embebido: decide si una lista muestra "Ver video" o el link común. */
export function esVideoEmbebible(enlace) {
  return idDeYoutube(enlace) !== null;
}

/**
 * Abre el video en la hoja. Las listas (recursos, sesión del plan) no llevan un
 * iframe por tarjeta: cada uno es una página entera de YouTube, y veinte juntos
 * traban un celular. El link de abajo es por si el dueño del video no deja
 * embeberlo; se arma con el ID ya validado, nunca con el texto guardado.
 */
export function abrirVideo(enlace, titulo) {
  const id = idDeYoutube(enlace);
  if (!id) return;
  abrirHoja({
    titulo,
    cuerpo: `
      ${reproductorHtml(enlace, titulo)}
      <a class="enlace-rec" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener noreferrer">Abrir en YouTube</a>
    `,
  });
}
