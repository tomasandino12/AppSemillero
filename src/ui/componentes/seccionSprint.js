import { html } from '../html.js';
import { formatearFechaCorta } from '../nav.js';
import {
  DISTANCIAS_SPRINT, formatearTiempoSprint, velocidadMedia, vueltaSprint, ultimaYAnterioresSprint, variacionSprint,
} from '../../data/sprint.js';

const coma = (n) => String(n).replace('.', ',');

/**
 * Sprint de un jugador, para la ficha del profe y para el progreso del propio
 * jugador. `sesiones` sale de `sesionesDeSprint` (la más reciente primero).
 *
 * Una tarjeta por distancia con el mejor intento de la última sesión: el total
 * de ida y vuelta como cifra principal y, debajo, la ida (con su velocidad
 * media) y la vuelta, que lleva el giro adentro. Las anteriores van en una
 * tabla corta. La variación es del total contra la sesión anterior de la misma
 * distancia; bajar el tiempo es mejorar (verde). Nunca se compara con otros
 * jugadores. Una sesión del CReAR (fotocélulas) lleva su etiqueta. Un intento
 * de antes de 0050 (un solo tramo) no tiene parcial: sólo muestra el tiempo.
 */
export function seccionSprint(sesiones, { sinDatos = 'Sin medir.' } = {}) {
  const bloques = [...DISTANCIAS_SPRINT].reverse().map((distanciaM) => {
    const r = ultimaYAnterioresSprint(sesiones, distanciaM);
    if (!r) return '';
    const { ultima, anteriores, variacionMs } = r;
    const mejor = ultima.mejor;
    const variacion = variacionSprint(variacionMs);
    return html`
      <div class="det">${distanciaM} + ${distanciaM} metros</div>
      <div class="tarj salto-tarj">
        <div class="det">${formatearFechaCorta(ultima.fecha)}</div>
        <div class="cifra-clave">${coma((mejor.tiempoMs / 1000).toFixed(1))}<span class="u">s</span></div>
        <span class="etq">Mejor marca · ida y vuelta</span>
        <div class="salto-datos">
          ${mejor.parcialMs != null && html`<span>Ida ${formatearTiempoSprint(mejor.parcialMs)} · ${coma(velocidadMedia(mejor.parcialMs, distanciaM))} m/s</span><span>Vuelta ${formatearTiempoSprint(vueltaSprint(mejor))}</span>`}
          ${variacion.texto && html`<span class="chip ${variacion.mejora === true ? 'sube' : variacion.mejora === false ? 'baja' : ''}">${variacion.texto} vs ${formatearFechaCorta(anteriores[0].fecha)}</span>`}
          ${ultima.origen === 'crear' && html`<span class="chip">CReAR · más exacto</span>`}
        </div>
      </div>
      ${anteriores.length ? html`<div class="tabla-ev">${anteriores.map((s) => html`
        <div class="fila-ev tres">
          <div class="f">${formatearFechaCorta(s.fecha)}</div>
          <div>${formatearTiempoSprint(s.mejor.tiempoMs)}${s.origen === 'crear' && html` <span class="chip">CReAR</span>`}</div>
          <div>${s.mejor.parcialMs != null ? html`ida ${formatearTiempoSprint(s.mejor.parcialMs)}` : ''}</div>
        </div>`)}</div>` : ''}
    `;
  });
  const hay = bloques.some((b) => b !== '');
  return html`
    <div class="eyebrow">Sprint</div>
    ${hay ? bloques : html`<div class="p">${sinDatos}</div>`}
  `;
}
