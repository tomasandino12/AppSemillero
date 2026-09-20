import { ir } from '../main.js';
import { agruparPorBloque, diaDeLaSemana, formatearKg, detalleDeLinea } from '../../data/escalones.js';
import { pesoDeLinea } from '../../data/planDelJugador.js';
import { esEnlaceWeb } from '../../data/enlaces.js';
import { abrirVideo, esVideoEmbebible } from '../componentes/video.js';
import { html } from '../html.js';
import { formatearFechaCorta } from '../nav.js';
import { $ } from '../dom.js';

const contenedor = () => $('jug-sesion-contenido');

// Lo que se abrió desde FÍSICO: { sesion, pesos }.
let actual = null;

export function abrirSesionJugador(datos) {
  actual = datos;
  ir('p-jug-sesion', { push: true });
}

/**
 * Una sesión: los ejercicios por bloque, en el orden del archivo, con series,
 * reps, pausa y notas, el peso actual del propio jugador donde lo hay y el
 * video si lo tiene. Ni escalones ni botones de + y −: eso lo maneja el profe.
 */
const tarjetaDeLinea = (l, pesos) => {
  const detalle = detalleDeLinea(l);
  const kg = pesoDeLinea(l, pesos);
  return html`
    <div class="tarj linea-fisico" style="cursor:default">
      <div class="nom">${l.orden != null ? `${l.orden} · ` : ''}${l.nombreOriginal}</div>
      ${detalle && html`<div class="det">${detalle}</div>`}
      ${l.notas && html`<div class="det">${l.notas}</div>`}
      <div class="pie-linea">
        ${esVideoEmbebible(l.video?.link) && html`<button class="btn sec chico" data-ver-video="${l.id}">Ver video</button>`}
        ${l.video && esEnlaceWeb(l.video.link) && !esVideoEmbebible(l.video.link)
          && html`<a class="btn sec chico" href="${l.video.link}" target="_blank" rel="noopener noreferrer">Ver video</a>`}
        ${kg != null && html`<span class="escalon">Tu peso: ${formatearKg(kg)} kg</span>`}
      </div>
    </div>
  `;
};

export function renderJugSesion() {
  if (!actual) {
    ir('p-jug-fisico');
    return;
  }
  const { sesion, pesos } = actual;
  const dia = diaDeLaSemana(sesion.fecha);
  const titulo = `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${formatearFechaCorta(sesion.fecha)}`;

  contenedor().innerHTML = html`
    <div class="pad">
      <div class="p"><b>${titulo}</b>${sesion.categoria && ` · ${sesion.categoria}`}</div>
      ${agruparPorBloque(sesion.lineas).map((grupo) => html`
        ${grupo.bloque && html`<div class="eyebrow">${grupo.bloque}</div>`}
        ${grupo.lineas.map((l) => tarjetaDeLinea(l, pesos))}
      `)}
    </div>
  `;

  contenedor().querySelectorAll('[data-ver-video]').forEach((b) => {
    b.addEventListener('click', () => {
      const linea = sesion.lineas.find((l) => l.id === b.dataset.verVideo);
      if (linea) abrirVideo(linea.video.link, linea.nombreOriginal);
    });
  });
}
