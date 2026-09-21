import { obtenerMisRecursos, registrarAperturaDeRecurso } from '../../data/repositorio.js';
import { esEnlaceWeb } from '../../data/enlaces.js';
import { abrirVideo, esVideoEmbebible } from '../componentes/video.js';
import { miniaturaDeRecurso, quitarImagenesRotas } from '../componentes/miniaturaRecurso.js';
import { html } from '../html.js';
import { formatearFechaCorta } from '../nav.js';
import { avisoDeError } from '../errores.js';
import { $ } from '../dom.js';

const contenedor = () => $('jug-recursos-contenido');

/**
 * Lo que le mandó el profe, sin nada más: ni cuántos otros lo recibieron ni si
 * lo miró. El jugador ve la lista, no un tablero de seguimiento. Abrir un
 * recurso se anota, y el profe ve sólo cuántos abrieron, nunca quién (0034):
 * por eso el aviso de arriba de la lista. Se ve igual que la del profe
 * (miniatura, eyebrow, botones) para que sea la misma pantalla de los dos lados.
 */
const tarjeta = (r) => html`
  <article class="rec-tarj">
    ${miniaturaDeRecurso(r)}
    <div class="rec-cuerpo">
      <div class="rec-eyebrow">Enviado el ${formatearFechaCorta(r.fecha)}</div>
      <div class="t">${r.titulo}</div>
      <div class="d">${r.descripcion}</div>
      <div class="rec-acciones">${esVideoEmbebible(r.enlace) && html`<button class="btn chico" type="button" data-ver-video="${r.id}">Ver video</button>`}${!esVideoEmbebible(r.enlace) && esEnlaceWeb(r.enlace) && html`<a class="btn chico" data-abrir-material="${r.id}" href="${r.enlace}" target="_blank" rel="noopener noreferrer">Abrir el material</a>`}</div>
    </div>
  </article>
`;

const introduccion = html`
  <section class="rec-filosofia">
    <div class="rec-filo-ico" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>
    </div>
    <div class="rec-filo-cuerpo">
      <h2 class="rec-filo-t">Lo que te mandó tu profe</h2>
      <p class="rec-filo-tx">Mirá lo que quieras, cuando quieras. <strong>No es obligación.</strong></p>
      <p class="rec-filo-nota">Tu profe ve cuántos abrieron cada recurso, no quién.</p>
    </div>
  </section>`;

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
      ${introduccion}
      <div class="rec-grilla">${recursos.map(tarjeta)}</div>
    </div>
  `;
  quitarImagenesRotas(contenedor());
  contenedor().querySelectorAll('[data-ver-video]').forEach((b) => {
    b.addEventListener('click', () => {
      const recurso = recursos.find((r) => r.id === b.dataset.verVideo);
      if (!recurso) return;
      registrarAperturaDeRecurso(recurso.id);
      abrirVideo(recurso.enlace, recurso.titulo);
    });
  });
  // El link sigue su camino (se abre en otra pestaña); sólo se anota.
  contenedor().querySelectorAll('[data-abrir-material]').forEach((a) => {
    a.addEventListener('click', () => registrarAperturaDeRecurso(a.dataset.abrirMaterial));
  });
}
