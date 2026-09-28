import {
  obtenerMedicionesSprintDelPlantel, obtenerMedicionesYoyoDelPlantel, obtenerMedicionesSaltoDelPlantel,
} from '../../data/repositorio.js';
import { serieSprintDelPlantel, serieSaltoDelPlantel, serieYoyoDelPlantel } from '../../data/fisicoDelPlantel.js';
import { DISTANCIAS_SPRINT } from '../../data/sprint.js';
import { TESTS_SALTO } from '../../data/salto.js';
import { grafico } from '../componentes/graficos.js';
import { verDetallesHtml } from '../componentes/verDetalles.js';
import { formatearFechaCorta } from '../nav.js';
import { html, crudo } from '../html.js';
import { $ } from '../dom.js';

const NOMBRE_TEST_SALTO = { cmj: 'CMJ (manos en la cadera)', abalakov: 'Abalakov (brazos libres)' };

const coma = (n, decimales) => n.toFixed(decimales).replace('.', ',');
const miles = new Intl.NumberFormat('es-AR');
const chicos = (n) => `${n} ${n === 1 ? 'chico' : 'chicos'}`;

/**
 * Cada prueba es un bloque: título, cómo se escribe un valor y su serie. La
 * escala del gráfico (`escala`, `u`, `dec`) va aparte del texto porque el
 * sprint se dibuja en segundos pero llega en milisegundos.
 */
function bloques(sprint, yoyo, salto) {
  return [
    ...[...DISTANCIAS_SPRINT].reverse().map((d) => ({
      id: `sprint-${d}`,
      titulo: `Velocidad · ${d} + ${d} metros`,
      nota: 'Tiempo de ida y vuelta: baja cuando mejoran.',
      serie: serieSprintDelPlantel(sprint, d),
      escala: 1000, u: 's', dec: 1,
      texto: (v) => `${coma(v / 1000, 1)} s`,
    })),
    {
      id: 'yoyo',
      titulo: 'Resistencia · Yo-Yo',
      nota: 'Metros recorridos hasta el final del test.',
      serie: serieYoyoDelPlantel(yoyo),
      escala: 1, u: 'm', dec: 0,
      texto: (v) => `${miles.format(Math.round(v))} m`,
    },
    ...TESTS_SALTO.map((t) => ({
      id: `salto-${t}`,
      titulo: `Salto · ${NOMBRE_TEST_SALTO[t] ?? t}`,
      nota: 'Altura del mejor salto de cada chico.',
      serie: serieSaltoDelPlantel(salto, t),
      escala: 1, u: 'cm', dec: 0,
      texto: (v) => `${coma(v, 1)} cm`,
    })),
  ].filter((b) => b.serie.length);
}

function tablaDeBloque(b) {
  const filas = [...b.serie].reverse().map((p) => html`
    <div class="fila-ev tres">
      <div class="f">${formatearFechaCorta(p.fecha)}</div>
      <div>${b.texto(p.valor)}</div>
      <div>${chicos(p.chicos)}</div>
    </div>`);
  return html`<div class="tabla-ev">${filas}</div>`.toString();
}

/**
 * Velocidad, resistencia y salto del plantel: una curva por prueba con el
 * promedio de los chicos que midieron cada día. Sólo aparecen las pruebas que
 * el club ya cargó: si no usa una, no ocupa lugar. Como toda curva del
 * proyecto, une los puntos observados y nada más (sin tendencia ni "mejora").
 */
export async function renderPruebasDelPlantel(club, plantel) {
  const cont = $('datos-pruebas');
  if (!cont) return;
  const titulo = html`<div class="eyebrow">Velocidad, resistencia y salto</div>`;

  let lista;
  try {
    const [sprint, yoyo, salto] = await Promise.all([
      obtenerMedicionesSprintDelPlantel(club.id, plantel.id),
      obtenerMedicionesYoyoDelPlantel(club.id, plantel.id),
      obtenerMedicionesSaltoDelPlantel(club.id, plantel.id),
    ]);
    lista = bloques(sprint, yoyo, salto);
  } catch (e) {
    console.error('No se pudieron cargar las pruebas físicas:', e);
    cont.innerHTML = html`${titulo}<div class="p">No se pudieron cargar las mediciones de velocidad, resistencia y salto.</div>`;
    return;
  }

  if (!lista.length) {
    cont.innerHTML = html`${titulo}<div class="p">Todavía no hay nada medido. Las pruebas se cargan desde MEDIR y acá aparece cómo viene el grupo.</div>`;
    return;
  }

  cont.innerHTML = html`${titulo}
    <div class="p">Promedio de los chicos que midieron cada día. Cada punto dice cuántos fueron, porque no siempre son los mismos.</div>
    ${lista.map((b) => {
    const ultimo = b.serie.at(-1);
    return html`
      <div class="curva-zona">
        <div class="zona-cab">
          <span class="nom">${b.titulo}</span>
          <span class="frac">${b.texto(ultimo.valor)} · ${chicos(ultimo.chicos)}</span>
        </div>
        <div class="p">${b.nota}</div>
        <svg class="g" id="svg-fis-${b.id}"></svg>
        ${crudo(verDetallesHtml(b.titulo, [{ nombre: 'Por medición', html: tablaDeBloque(b) }]))}
      </div>`;
  })}`.toString();

  for (const b of lista) {
    grafico($(`svg-fis-${b.id}`), {
      etiquetas: b.serie.map((p) => formatearFechaCorta(p.fecha)),
      series: [{ nombre: b.titulo, c: '#D9122E', d: b.serie.map((p) => p.valor / b.escala) }],
    }, { alto: 140, u: b.u, dec: b.dec });
  }
}
