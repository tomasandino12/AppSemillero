import {
  obtenerPlantelesDelClub, obtenerCatalogoDeCategorias, obtenerTemporadasDelClub,
  obtenerPanoramaDelClub, obtenerMiembrosDelClub, obtenerAsignacionesDelClub,
} from '../../data/repositorio.js';
import { armarPanorama } from '../../data/coordinacion.js';
import { obtenerClubActual } from '../sesion.js';
import { escaparHtml, esErrorDeRed, textoPorcentaje, formatearFechaCorta } from '../nav.js';
import { grafico } from '../componentes/graficos.js';
import { variacionHtml } from '../componentes/variacion.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('coord-panorama-contenido');

/**
 * El panorama del club para coordinación: una tarjeta por categoría, cada una
 * contra sí misma a lo largo de la temporada, con triples y libres como dos
 * series separadas (igual que HOY, que nunca las mezcla).
 *
 * Lo que esta pantalla NO hace, a propósito: ordenar por ningún valor, poner
 * una categoría contra otra, promediar el club, etiquetar con juicios ni
 * pintar una categoría distinta de otra. Comparar U13 con U17 compara edades,
 * no trabajo; y un ranking de categorías es un ranking de entrenadores. Se
 * muestran las series; la lectura la hace la persona.
 *
 * Todas las curvas usan el eje 0–100: con la escala automática una categoría
 * que se movió 3 puntos se vería igual de dramática que una que se movió 20.
 */

const SERIES = [
  { clave: 'triples', titulo: 'Triples', vacio: 'Todavía no hay baterías de triples' },
  { clave: 'libres', titulo: 'Libres', vacio: 'Todavía no hay baterías de libres' },
];

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function operativosHtml(t) {
  const medicion = t.ultimaMedicion ? `última medición ${formatearFechaCorta(t.ultimaMedicion)}` : 'sin mediciones';
  return `<div class="det">${plural(t.jugadores, 'jugador', 'jugadores')} · ${plural(t.partidos, 'partido importado', 'partidos importados')} · ${escaparHtml(medicion)}</div>`;
}

function aCargoHtml(t) {
  return t.aCargo.length
    ? `<div class="det">A cargo: ${escaparHtml(t.aCargo.join(', '))}</div>`
    : '<span class="chip sin">Sin profe asignado</span>';
}

function idSvg(t, clave) {
  return `svg-panorama-${clave}-${t.plantelId}`;
}

function serieHtml(t, { clave, titulo, vacio }) {
  const { serie, variacion } = t[clave];
  if (!serie.length) {
    return `
      <div class="k">${titulo}</div>
      <div class="det">${vacio} en ${escaparHtml(t.categoria)}.</div>
    `;
  }
  const anterior = serie.length >= 2 ? serie[serie.length - 2] : null;
  return `
    <div class="k">${titulo} · batería por batería</div>
    <div class="sub">
      ${anterior
        ? `${variacionHtml(variacion)} <span class="det">última contra la del ${escaparHtml(formatearFechaCorta(anterior.fecha))}</span>`
        : '<span class="var neutra">Una sola batería: todavía no hay con qué comparar</span>'}
    </div>
    <svg class="g" id="${idSvg(t, clave)}"></svg>
    <div class="tabla-ev">
      ${[...serie].reverse().map((p) => `
        <div class="fila-ev tres">
          <div class="f">${escaparHtml(formatearFechaCorta(p.fecha))}</div>
          <div>${textoPorcentaje(p.valor)}</div>
          <div class="f">${plural(p.jugadoresQueMidieron, 'jugador', 'jugadores')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function tarjetaHtml(t) {
  return `
    <article class="tarjeta-cat">
      <h2 class="nom">${escaparHtml(t.categoria)} <span class="det">${escaparHtml(t.nombreCategoria)}</span></h2>
      ${operativosHtml(t)}
      ${aCargoHtml(t)}
      ${SERIES.map((s) => `<div class="serie-cat">${serieHtml(t, s)}</div>`).join('')}
    </article>
  `;
}

export async function renderPanorama() {
  const club = obtenerClubActual();
  if (!club) return;
  contenedor().innerHTML = '<div class="pad"><div class="p">Cargando el panorama...</div></div>';

  let vista;
  try {
    const [planteles, catalogo, temporadas, panorama, miembros, asignaciones] = await Promise.all([
      obtenerPlantelesDelClub(club.id),
      obtenerCatalogoDeCategorias(),
      obtenerTemporadasDelClub(club.id),
      obtenerPanoramaDelClub(club.id),
      obtenerMiembrosDelClub(club.id),
      obtenerAsignacionesDelClub(club.id),
    ]);
    vista = armarPanorama({ planteles, catalogo, temporadas, panorama, miembros, asignaciones });
  } catch (e) {
    const mensaje = esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar el panorama.';
    contenedor().innerHTML = `<div class="pad"><div class="p">${mensaje}</div></div>`;
    return;
  }

  if (!vista.tarjetas.length) {
    contenedor().innerHTML = '<div class="pad"><div class="p">Todavía no hay categorías cargadas para este club.</div></div>';
    return;
  }

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Temporada ${escaparHtml(vista.temporada.nombre)}</div>
      <div class="p">Cada categoría contra sí misma a lo largo de la temporada. No se comparan entre sí: son chicos distintos en momentos distintos.</div>
      <div class="panorama">${vista.tarjetas.map(tarjetaHtml).join('')}</div>
    </div>
  `;

  for (const t of vista.tarjetas) {
    for (const { clave, titulo } of SERIES) {
      const { serie } = t[clave];
      if (!serie.length) continue;
      grafico($(idSvg(t, clave)), {
        etiquetas: serie.map((p) => formatearFechaCorta(p.fecha)),
        series: [{
          nombre: titulo,
          c: '#D9122E',
          d: serie.map((p) => p.valor.pct),
          chico: serie.map((p) => p.valor.muestraChica),
        }],
      }, { alto: 120, min: 0, max: 100 });
    }
  }
}
