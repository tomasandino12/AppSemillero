import { html } from '../html.js';
import { formatearFechaCorta } from '../nav.js';
import {
  DISTANCIAS_SPRINT, formatearTiempoSprint, velocidadMedia, ultimaYAnterioresSprint, variacionSprint,
} from '../../data/sprint.js';

const coma = (n) => String(n).replace('.', ',');

/**
 * Sprint de un jugador, para la ficha del profe y para el progreso del propio
 * jugador. `sesiones` sale de `sesionesDeSprint` (la más reciente primero).
 *
 * Una tarjeta por distancia con el mejor tiempo de la última sesión, y las
 * anteriores en una tabla corta. La variación es contra la sesión anterior
 * de la misma distancia; bajar el tiempo es mejorar (verde). Nunca se compara
 * con otros jugadores. Una sesión del CReAR (fotocélulas) lleva su etiqueta.
 */
export function seccionSprint(sesiones, { sinDatos = 'Sin medir.' } = {}) {
  const bloques = [...DISTANCIAS_SPRINT].reverse().map((distanciaM) => {
    const r = ultimaYAnterioresSprint(sesiones, distanciaM);
    if (!r) return '';
    const { ultima, anteriores, variacionMs } = r;
    const mejor = ultima.mejor;
    const variacion = variacionSprint(variacionMs);
    return html`
      <div class="det">${distanciaM} metros</div>
      <div class="tarj salto-tarj">
        <div class="det">${formatearFechaCorta(ultima.fecha)}</div>
        <div class="cifra-clave">${coma((mejor.tiempoMs / 1000).toFixed(1))}<span class="u">s</span></div>
        <span class="etq">Mejor marca</span>
        <div class="salto-datos">
          <span>${coma(velocidadMedia(mejor.tiempoMs, distanciaM))} m/s de media</span>
          ${variacion.texto && html`<span class="chip ${variacion.mejora === true ? 'sube' : variacion.mejora === false ? 'baja' : ''}">${variacion.texto} vs ${formatearFechaCorta(anteriores[0].fecha)}</span>`}
          ${ultima.origen === 'crear' && html`<span class="chip">CReAR · más exacto</span>`}
        </div>
      </div>
      ${anteriores.length ? html`<div class="tabla-ev">${anteriores.map((s) => html`
        <div class="fila-ev tres">
          <div class="f">${formatearFechaCorta(s.fecha)}</div>
          <div>${formatearTiempoSprint(s.mejor.tiempoMs)}${s.origen === 'crear' && html` <span class="chip">CReAR</span>`}</div>
          <div>${coma(velocidadMedia(s.mejor.tiempoMs, distanciaM))} m/s</div>
        </div>`)}</div>` : ''}
    `;
  });
  const hay = bloques.some((b) => b !== '');
  return html`
    <div class="eyebrow">Sprint</div>
    ${hay ? bloques : html`<div class="p">${sinDatos}</div>`}
  `;
}
