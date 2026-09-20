import { html } from '../html.js';
import { formatearKg } from '../../data/escalones.js';
import { formatearFechaCorta } from '../nav.js';
import { grafico } from './graficos.js';

/**
 * La progresión de pesos de un chico: un desplegable por bloque del plan
 * (FUERZA, CORE…) con una tarjeta por ejercicio, cada una con su curva en kg.
 * Lo usan "Mi progreso" del jugador y la ficha que ve el profe: por eso recibe
 * los grupos ya armados (pesosPorBloque) y no sabe de dónde salieron.
 *
 * Los bloques arrancan cerrados: la pantalla se acorta y el que quiere ver
 * CORE lo abre. Es un <details>, así que teclado y lectores de pantalla andan
 * sin JS. Cada curva tiene su propia escala en kg: son ejercicios distintos y
 * no se comparan entre tarjetas.
 *
 * Es de un solo chico, así que no promedia nada: cada punto es un peso
 * anotado. Una baja se dibuja como baja, sin color de "malo".
 */

const MAX_PUNTOS = 12;

const cambio = (v) => (v === 0 ? 'sin cambio' : `${v > 0 ? '+' : '−'}${formatearKg(Math.abs(v))} kg`);
const idDeCurva = (prefijo, i, j) => `${prefijo}-${i}-${j}`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function tarjeta(e, id) {
  const ultimos = e.movimientos.slice(-MAX_PUNTOS);
  return html`
    <div class="tarj pesos-tarj">
      <div class="pesos-nom">${e.nombre}</div>
      <div class="pesos-actual">
        <span class="kg">${formatearKg(e.actualKg)} kg</span>
        ${e.variacionKg == null
          ? html`<span class="pesos-det">Una sola marca: todavía no hay con qué comparar</span>`
          : html`<span class="pesos-det">${cambio(e.variacionKg)} desde el primero (${formatearKg(e.inicialKg)} kg)</span>`}
      </div>
      <svg class="g" id="${id}" role="img"
        aria-label="${e.nombre}: ${ultimos.map((m) => `${formatearKg(m.kg)} kg`).join(', ')}"></svg>
    </div>
  `;
}

/** El HTML de los desplegables. `prefijo` evita ids repetidos si se usa dos veces en una pantalla. */
export function tarjetasDePesosHtml(grupos, prefijo) {
  return html`${grupos.map((g, i) => html`
    <details class="pesos-bloque">
      <summary>
        <span class="t">${g.bloque}</span>
        <span class="n">${plural(g.ejercicios.length, 'ejercicio', 'ejercicios')}${g.subieron ? ` · ${g.subieron} ${g.subieron === 1 ? 'subió' : 'subieron'}` : ''}</span>
      </summary>
      ${g.ejercicios.map((e, j) => tarjeta(e, idDeCurva(prefijo, i, j)))}
    </details>
  `)}`;
}

/** Dibuja las curvas: hay que llamarla después de meter el HTML, recién ahí existen los SVG. */
export function dibujarCurvasDePesos(grupos, prefijo) {
  grupos.forEach((g, i) => g.ejercicios.forEach((e, j) => {
    const svg = document.getElementById(idDeCurva(prefijo, i, j));
    if (!svg) return;
    const ultimos = e.movimientos.slice(-MAX_PUNTOS);
    grafico(svg, {
      etiquetas: ultimos.map((m) => formatearFechaCorta(m.fecha)),
      series: [{ nombre: e.nombre, c: '#D9122E', d: ultimos.map((m) => m.kg) }],
    // Sin unidad en el eje: con decimales ("26.3") la etiqueta se pisa con el
    // primer número, y los kg ya están escritos en la tarjeta.
    }, { u: '', dec: 1, alto: 130 });
  }));
}
