import { obtenerMisRecursos } from '../../data/repositorio.js';
import { esEnlaceWeb } from '../../data/enlaces.js';
import { abrirVideo, esVideoEmbebible } from '../componentes/video.js';
import { html } from '../html.js';
import { formatearFechaCorta } from '../nav.js';
import { avisoDeError } from '../errores.js';
import { $ } from '../dom.js';

const contenedor = () => $('jug-recursos-contenido');

/**
 * Lo que le mandó el profe, sin nada más: ni cuántos otros lo recibieron ni si
 * lo miró. El jugador ve la lista, no un tablero de seguimiento.
 */
const tarjeta = (r) => html`
  <div class="rec">
    <div class="t">${r.titulo}</div>
    <div class="d">${r.descripcion}</div>
    ${esVideoEmbebible(r.enlace) && html`<button class="btn sec chico" data-ver-video="${r.id}">Ver video</button>`}
    ${!esVideoEmbebible(r.enlace) && esEnlaceWeb(r.enlace)
      && html`<a class="enlace-rec" href="${r.enlace}" target="_blank" rel="noopener noreferrer">Abrir el material</a>`}
    <div class="m"><span class="tag">${formatearFechaCorta(r.fecha)}</span></div>
  </div>
`;

export async function renderJugRecursos() {
  contenedor().innerHTML = '<div class="pad"><div class="p">Cargando tus recursos...</div></div>';

  let recursos;
  try {
    recursos = await obtenerMisRecursos();
  } catch (e) {
    contenedor().innerHTML = `${avisoDeError(e, 'No se pudieron cargar tus recursos.')}
      <div class="pad"><button class="btn sec" id="btn-reintentar-jug-recursos">Reintentar</button></div>`;
    $('btn-reintentar-jug-recursos').addEventListener('click', () => renderJugRecursos());
    return;
  }

  if (!recursos.length) {
    contenedor().innerHTML = html`
      <div class="pad">
        <div class="estado-vacio">
          <h2>Todavía no te mandaron ningún recurso</h2>
          <div class="p">Cuando tu profe te mande algo para mirar (un video, una rutina, un consejo), va a aparecer acá.</div>
        </div>
      </div>
    `;
    return;
  }

  contenedor().innerHTML = html`
    <div class="pad">
      <div class="eyebrow">Lo que te mandó tu profe</div>
      ${recursos.map(tarjeta)}
    </div>
  `;
  contenedor().querySelectorAll('[data-ver-video]').forEach((b) => {
    b.addEventListener('click', () => {
      const recurso = recursos.find((r) => r.id === b.dataset.verVideo);
      if (recurso) abrirVideo(recurso.enlace, recurso.titulo);
    });
  });
}
