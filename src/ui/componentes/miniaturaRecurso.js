import { html } from '../html.js';
import { claseDeEnlace } from '../../data/recursos.js';
import { urlDeMiniatura } from '../../data/youtube.js';
import { esVideoEmbebible } from './video.js';

const ETIQUETA_SIN_MINIATURA = { drive: 'Drive', pdf: 'PDF', otro: 'Link', youtube: 'Video' };

/**
 * La imagen de arriba de la tarjeta de un recurso: la miniatura de YouTube con
 * su play (un botón que abre el video) o, si no hay, un cuadro con el tipo de
 * link. La usan la pantalla del profe y la del jugador, para que se vean igual.
 */
export function miniaturaDeRecurso(r) {
  const src = urlDeMiniatura(r.enlace);
  if (esVideoEmbebible(r.enlace) && src) {
    return html`
      <button class="rec-mini" type="button" data-ver-video="${r.id}" aria-label="Ver video: ${r.titulo}">
        <img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <span class="rec-play" aria-hidden="true"></span>
      </button>`;
  }
  const clase = claseDeEnlace(r.enlace);
  return html`
    <div class="rec-mini sin-img" aria-hidden="true">
      <span class="rec-mini-et">${clase ? ETIQUETA_SIN_MINIATURA[clase] : 'Instrucciones'}</span>
    </div>`;
}

/**
 * Un link de video que ya no existe (o sin conexión a YouTube) deja la imagen
 * rota; se la saca y queda el fondo con el play, que sigue abriendo el video.
 * El CSP no permite un onerror en el HTML, por eso se engancha acá.
 */
export function quitarImagenesRotas(raiz) {
  raiz.querySelectorAll('.rec-mini img').forEach((img) => {
    img.addEventListener('error', () => img.remove(), { once: true });
  });
}
