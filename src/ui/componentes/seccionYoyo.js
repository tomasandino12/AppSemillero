import { html } from '../html.js';
import { formatearFechaCorta } from '../nav.js';
import { metrosDe, nivelYIda, ultimaYAnterioresYoyo } from '../../data/yoyo.js';

const miles = new Intl.NumberFormat('es-AR');

/**
 * Resistencia (Yo-Yo) de un jugador, para la ficha del profe y para el
 * progreso del propio jugador. `sesiones` sale de `sesionesDeYoyo` (la más
 * reciente primero).
 *
 * Una tarjeta con el nivel.ida y los metros de la última sesión, la variación
 * en metros contra la anterior (más metros es mejorar, verde) y las anteriores
 * en una tabla corta. Nunca se compara con otros jugadores. Un dato del CReAR
 * lleva su etiqueta.
 */
export function seccionYoyo(sesiones, { sinDatos = 'Sin medir.' } = {}) {
  const r = ultimaYAnterioresYoyo(sesiones);
  if (!r) {
    return html`<div class="eyebrow">Resistencia (Yo-Yo)</div><div class="p">${sinDatos}</div>`;
  }
  const { ultima, anteriores, variacionM } = r;
  const signo = variacionM > 0 ? '+' : variacionM < 0 ? '−' : '';
  return html`
    <div class="eyebrow">Resistencia (Yo-Yo)</div>
    <div class="tarj salto-tarj">
      <div class="det">${formatearFechaCorta(ultima.fecha)}</div>
      <div class="cifra-clave">${nivelYIda(ultima.idas)}</div>
      <span class="etq">Nivel · ida</span>
      <div class="salto-datos">
        <span>${miles.format(metrosDe(ultima.idas))} m en total</span>
        ${variacionM != null && html`<span class="chip ${variacionM > 0 ? 'sube' : variacionM < 0 ? 'baja' : ''}">${variacionM === 0 ? 'igual' : `${signo}${miles.format(Math.abs(variacionM))} m`} vs ${formatearFechaCorta(anteriores[0].fecha)}</span>`}
        ${ultima.origen === 'crear' && html`<span class="chip">CReAR · más exacto</span>`}
      </div>
    </div>
    ${anteriores.length ? html`<div class="tabla-ev">${anteriores.map((s) => html`
      <div class="fila-ev tres">
        <div class="f">${formatearFechaCorta(s.fecha)}</div>
        <div>${nivelYIda(s.idas)}${s.origen === 'crear' && html` <span class="chip">CReAR</span>`}</div>
        <div>${miles.format(metrosDe(s.idas))} m</div>
      </div>`)}</div>` : ''}
  `;
}
