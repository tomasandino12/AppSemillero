import {
  obtenerPlantelesDelClub, obtenerCatalogoDeCategorias, obtenerTemporadasDelClub,
  obtenerPanoramaDelClub, obtenerMiembrosDelClub, obtenerAsignacionesDelClub,
} from '../../data/repositorio.js';
import { armarPanorama, textoSinDatos, hayAlgoParaMostrar } from '../../data/coordinacion.js';
import { ejeComun } from '../../data/estadisticas.js';
import { obtenerClubActual } from '../sesion.js';
import { escaparHtml, esErrorDeRed, textoPorcentaje, formatearFechaCorta } from '../nav.js';
import { grafico } from '../componentes/graficos.js';
import { variacionHtml } from '../componentes/variacion.js';
import { verDetallesHtml } from '../componentes/verDetalles.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('coord-panorama-contenido');

/**
 * El panorama del club para coordinación: una tarjeta por categoría, cada una
 * contra sí misma a lo largo de la temporada. Por tipo de tiro (triples y
 * libres) dos fuentes lado a lado, batería y partidos, nunca mezcladas ni
 * restadas.
 *
 * Lo que esta pantalla NO hace, a propósito: ordenar por ningún valor, poner
 * una categoría contra otra, promediar el club, etiquetar con juicios ni
 * pintar una categoría distinta de otra. Comparar U13 con U17 compara edades,
 * no trabajo; y un ranking de categorías es un ranking de entrenadores. Se
 * muestran las series; la lectura la hace la persona.
 *
 * Siempre visible: número, fracción, variación y el gráfico de evolución de
 * cada tipo. Detrás de "Ver detalles" van sólo las tablas fecha por fecha.
 * Todas las curvas usan el eje 0–100: con la escala automática una categoría
 * que se movió 3 puntos se vería igual de dramática que una que se movió 20.
 */

const TIPOS = [
  { clave: 'triples', titulo: 'Triples' },
  { clave: 'libres', titulo: 'Libres' },
];

// Siempre en este orden, en el resumen, la leyenda y las tablas: el ojo
// aprende dónde está cada cosa.
const FUENTES = [
  { clave: 'bateria', etiqueta: 'Batería', unPunto: 'Una sola batería: todavía no hay con qué comparar' },
  { clave: 'partido', etiqueta: 'Partidos', unPunto: 'Un solo partido: todavía no hay con qué comparar' },
];

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function fecha(iso) {
  return escaparHtml(formatearFechaCorta(iso));
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

/**
 * El resumen de una fuente: último valor grande, su fracción al lado, y la
 * variación contra el punto anterior de la MISMA fuente y categoría.
 *
 * El número va en --rojo SIEMPRE, con cualquier valor: es jerarquía, no una
 * señal. La única señal de mejora sigue siendo variacionHtml, con su flecha.
 * Un estado vacío nunca usa el estilo del número.
 */
function resumenFuenteHtml(t, tipo, fuente) {
  const { serie, variacion } = t[tipo.clave][fuente.clave];
  if (!serie.length) {
    const texto = textoSinDatos({ fuente: fuente.clave, tipo: tipo.clave, partidosImportados: t.partidos });
    return `
      <div class="fuente">
        <div class="k">${fuente.etiqueta}</div>
        <div class="vacio">${escaparHtml(texto)}</div>
      </div>`;
  }
  const ultimo = serie[serie.length - 1];
  const anterior = serie.length >= 2 ? serie[serie.length - 2] : null;
  return `
    <div class="fuente">
      <div class="k">${fuente.etiqueta} · ${fecha(ultimo.fecha)}</div>
      <div class="numero">
        <span class="n">${ultimo.valor.pct}<span class="u">%</span></span>
        <span class="frac">${ultimo.valor.anotados}/${ultimo.valor.intentos}</span>
      </div>
      ${ultimo.valor.muestraChica ? '<span class="poco-tag">pocos datos</span>' : ''}
      <div>${anterior
        ? `${variacionHtml(variacion)} <span class="det">vs ${fecha(anterior.fecha)}</span>`
        : `<span class="var neutra">${fuente.unPunto}</span>`}</div>
    </div>`;
}

function idSvg(t, tipo) {
  return `svg-panorama-${tipo.clave}-${t.plantelId}`;
}

/**
 * El gráfico de evolución va siempre visible, debajo de los dos números: a
 * 375px no entra al costado. Una sola curva por fuente, en el mismo eje de
 * fechas. Sin ningún punto en el tipo, no hay gráfico.
 */
function graficoTipoHtml(t, tipo) {
  const bateria = t[tipo.clave].bateria.serie;
  const partido = t[tipo.clave].partido.serie;
  if (!bateria.length && !partido.length) return '';
  return `
    <svg class="g" id="${idSvg(t, tipo)}"></svg>
    <div class="leyenda">
      ${bateria.length ? '<span class="linea-practica">Batería</span>' : ''}
      ${partido.length ? '<span class="linea-partido">Partidos</span>' : ''}
    </div>`;
}

function resumenTipoHtml(t, tipo) {
  return `
    <div class="serie-cat">
      <div class="k">${tipo.titulo}</div>
      <div class="fuentes">${FUENTES.map((f) => resumenFuenteHtml(t, tipo, f)).join('')}</div>
      ${graficoTipoHtml(t, tipo)}
    </div>`;
}

function tablaBateriaHtml(serie) {
  return [...serie].reverse().map((p) => `
    <div class="fila-ev tres">
      <div class="f">${fecha(p.fecha)}</div>
      <div>${textoPorcentaje(p.valor)}</div>
      <div class="f">${plural(p.jugadoresQueMidieron, 'jugador', 'jugadores')}</div>
    </div>`).join('');
}

function tablaPartidosHtml(serie) {
  return [...serie].reverse().map((p) => `
    <div class="fila-ev partido">
      <div class="f">${fecha(p.fecha)}</div>
      <div>${textoPorcentaje(p.valor)}</div>
      <div class="rival">${p.rival ? `vs ${escaparHtml(p.rival)}` : ''}</div>
    </div>`).join('');
}

/**
 * Las cuatro tablas de la tarjeta, cada una con su nombre completo: el detalle
 * ya no agrupa por tipo con un subtítulo, lo dice el nombre de cada tabla.
 * El gráfico queda afuera, siempre visible.
 */
function tablasDeTarjeta(t) {
  const tablas = [];
  for (const tipo of TIPOS) {
    const bateria = t[tipo.clave].bateria.serie;
    const partido = t[tipo.clave].partido.serie;
    if (bateria.length) {
      tablas.push({ nombre: `${tipo.titulo} · Batería`, html: `<div class="tabla-ev">${tablaBateriaHtml(bateria)}</div>` });
    }
    if (partido.length) {
      tablas.push({ nombre: `${tipo.titulo} · Partidos`, html: `<div class="tabla-ev">${tablaPartidosHtml(partido)}</div>` });
    }
  }
  return tablas;
}

function tarjetaHtml(t) {
  const cuerpo = hayAlgoParaMostrar(t)
    ? `${TIPOS.map((tipo) => resumenTipoHtml(t, tipo)).join('')}${verDetallesHtml(`Historial de ${t.categoria}`, tablasDeTarjeta(t))}`
    : `<div class="det sin-tiros">Todavía no hay baterías ni partidos con tiros en ${escaparHtml(t.categoria)}.</div>`;
  return `
    <article class="tarjeta-cat">
      <h2 class="nom">${escaparHtml(t.categoria)} <span class="det">${escaparHtml(t.nombreCategoria)}</span></h2>
      ${operativosHtml(t)}
      ${aCargoHtml(t)}
      ${cuerpo}
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
    for (const tipo of TIPOS) {
      const svg = $(idSvg(t, tipo));
      if (!svg) continue;
      // Mismo lenguaje que la ficha del jugador: batería sólida, partidos
      // punteada y roja. Eje fijo 0–100 en todas las tarjetas.
      const { fechas, a, b } = ejeComun(t[tipo.clave].bateria.serie, t[tipo.clave].partido.serie);
      grafico(svg, {
        etiquetas: fechas.map(formatearFechaCorta),
        series: [
          { nombre: 'Batería', c: '#131316', d: a.map((v) => v?.pct ?? null), chico: a.map((v) => v?.muestraChica === true) },
          { nombre: 'Partidos', c: '#D9122E', dash: true, d: b.map((v) => v?.pct ?? null), chico: b.map((v) => v?.muestraChica === true) },
        ],
      }, { alto: 140, min: 0, max: 100 });
    }
  }
}
