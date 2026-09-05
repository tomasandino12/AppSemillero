import {
  obtenerJugadoresDelPlantel, obtenerPertenenciasDeJugador,
  obtenerSesionesDeMedicion, obtenerMedicionesTiroDelPlantel, obtenerMedicionesVelocidadDelPlantel,
  obtenerEstadisticasDelPlantel, obtenerPartidosDelPlantel, obtenerEnviosDeJugador,
} from '../../data/repositorio.js';
import { serieDeTiroDelJugador, ultimaBateriaDeJugador, ultimaBateriaConDatosDeJugador, historialDePartidosDelJugador } from '../../data/estadisticas.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed, textoPorcentaje, formatearFechaCorta } from '../nav.js';
import { ir } from '../main.js';
import { cancha, grafico } from '../componentes/graficos.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('ficha-contenido');

let jugadorId = null;

export function abrirFicha(id) {
  jugadorId = id;
  ir('p-ficha', { push: true });
}

function dato(k, valor, unidad) {
  const sin = valor == null;
  return `
    <div class="dato">
      <div class="k">${escaparHtml(k)}</div>
      <div class="v ${sin ? 'sin' : ''}">${sin ? 'sin medir' : escaparHtml(String(valor)) + (unidad ? `<small> ${unidad}</small>` : '')}</div>
    </div>
  `;
}

/**
 * Une las fechas de las dos series en un solo eje, y devuelve cada serie
 * alineada a ese eje con null en las fechas donde no tiene punto.
 *
 * Práctica y partido pasan en días distintos: sin esto, el punto 3 de una
 * serie caería sobre el punto 3 de la otra aunque sean de meses distintos.
 */
function ejeComun(serieA, serieB) {
  const fechas = [...new Set([...serieA.map((p) => p.fecha), ...serieB.map((p) => p.fecha)])].sort();
  const alinear = (serie) => {
    const porFecha = new Map(serie.map((p) => [p.fecha, p.valor.pct]));
    return fechas.map((f) => porFecha.get(f) ?? null);
  };
  return { fechas, a: alinear(serieA), b: alinear(serieB) };
}

/**
 * Fila fecha + porcentaje-con-denominador para un punto de la serie. Mismo
 * patrón que datos.js usa en la tabla debajo del gráfico de evolución del
 * equipo (fila-ev): el gráfico da la forma, esta tabla da el número exacto
 * de cada punto, no sólo el último. Es lo que evita que un 1/1 se vea
 * idéntico a un 25/50 por pintarse los dos como un pico al 100%.
 */
function filaDePunto(p) {
  return `
    <div class="fila-ev dos">
      <div class="f">${escaparHtml(formatearFechaCorta(p.fecha))}</div>
      <div>${textoPorcentaje(p.valor)}</div>
    </div>
  `;
}

function bloqueDeSerie(id, titulo, serie, ayuda) {
  const total = serie.practica.length + serie.partido.length;
  if (total === 0) {
    return `<div class="eyebrow">${titulo}</div><div class="p">${ayuda}</div>`;
  }
  // Más reciente primero, igual que el resto de las tablas de la ficha
  // (partidos, velocidad).
  const practicaDesc = [...serie.practica].reverse();
  const partidoDesc = [...serie.partido].reverse();
  return `
    <div class="eyebrow">${titulo}</div>
    <svg class="g" id="${id}"></svg>
    <div class="leyenda">
      <span class="linea-practica">Práctica</span>
      <span class="linea-partido">Partido</span>
    </div>
    <div class="detalle-serie">
      ${practicaDesc.length ? `
        <div class="leyenda"><span class="linea-practica">Práctica</span></div>
        <div class="tabla-ev">${practicaDesc.map(filaDePunto).join('')}</div>
      ` : ''}
      ${partidoDesc.length ? `
        <div class="leyenda"><span class="linea-partido">Partido</span></div>
        <div class="tabla-ev">${partidoDesc.map(filaDePunto).join('')}</div>
      ` : ''}
    </div>
  `;
}

function dibujarSerie(id, serie) {
  const svg = document.getElementById(id);
  if (!svg) return;
  const { fechas, a, b } = ejeComun(serie.practica, serie.partido);
  grafico(svg, {
    etiquetas: fechas.map(formatearFechaCorta),
    series: [
      { nombre: 'Práctica', c: '#131316', d: a },
      { nombre: 'Partido', c: '#D9122E', dash: true, d: b },
    ],
  });
}

/**
 * `bateria` es siempre la sesión de tiro más reciente del jugador, tal cual
 * la devuelve ultimaBateriaDeJugador — incluso si faltó a las 6 posiciones.
 * `bateriaConDatos` es la última con al menos una medición real (puede ser
 * la misma `bateria`, una anterior, o null si nunca midió nada).
 *
 * Un jugador ausente a la más reciente no puede quedar mostrado con la
 * cancha vacía y nada más: eso lee como "nunca lo medimos". Se dicen los dos
 * hechos por separado — faltó tal día, midió tal otro — y se dibuja la
 * cancha de la batería con datos reales, no la de la ausencia.
 */
function seccionCancha(bateria, bateriaConDatos) {
  if (!bateria) {
    return `<div class="eyebrow">Tiro por posición</div>
      <div class="p">Todavía no tiene ninguna batería cargada. Se mide desde MEDIR.</div>`;
  }

  const ausenteEnLaMasReciente = bateria !== bateriaConDatos;
  if (!ausenteEnLaMasReciente) {
    return `
      <div class="eyebrow">Tiro por posición <span class="der">${escaparHtml(formatearFechaCorta(bateria.fecha))}</span></div>
      <div class="tarj">
        <svg class="g" id="ficha-cancha"></svg>
        <div class="leyenda"><span>Práctica: 10 tiros por posición. El partido no dice desde dónde se tiró, así que no se superpone acá.</span></div>
      </div>
    `;
  }

  const aviso = `<div class="p">Faltó a la batería del ${escaparHtml(formatearFechaCorta(bateria.fecha))}.</div>`;
  if (!bateriaConDatos) {
    return `<div class="eyebrow">Tiro por posición</div>
      ${aviso}
      <div class="p">Todavía no hizo ninguna batería con mediciones reales.</div>`;
  }
  return `
    <div class="eyebrow">Tiro por posición <span class="der">${escaparHtml(formatearFechaCorta(bateriaConDatos.fecha))}</span></div>
    ${aviso}
    <div class="tarj">
      <svg class="g" id="ficha-cancha"></svg>
      <div class="leyenda"><span>Práctica: 10 tiros por posición. El partido no dice desde dónde se tiró, así que no se superpone acá.</span></div>
    </div>
  `;
}

function seccionPartidos(historial) {
  if (!historial.length) {
    return `<div class="eyebrow">Partido a partido</div>
      <div class="p">Todavía no jugó ningún partido cargado.</div>`;
  }
  return `
    <div class="eyebrow">Partido a partido</div>
    <div class="tabla-part">
      ${historial.map((h) => `
        <div class="fila-part">
          <div class="cab">
            <div class="riv">${escaparHtml(h.rivalNombre ?? 'Rival sin nombre')}</div>
            <div class="f">${escaparHtml(formatearFechaCorta(h.fecha))}</div>
          </div>
          <div class="nums">
            <span>${h.minSegundos == null ? '<span class="sin">sin dato</span>' : `${Math.round(h.minSegundos / 60)}′`}</span>
            <span>${h.pts == null ? '<span class="sin">sin dato</span>' : `${h.pts} pts`}</span>
          </div>
          <div class="tiros">
            <div>2P ${textoPorcentaje(h.dos)}</div>
            <div>3P ${textoPorcentaje(h.tres)}</div>
            <div>TL ${textoPorcentaje(h.libres)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Velocidad: se listan los valores con su fecha y NO se grafica tendencia.
 * Con un intento por sesión y ~0.2s de error humano de cronómetro, una línea
 * de tendencia mentiría (spec, Decisión 6).
 */
function seccionVelocidad(velocidades) {
  if (!velocidades.length) {
    return `<div class="eyebrow">Velocidad</div><div class="p">Sin medir.</div>`;
  }
  return `
    <div class="eyebrow">Velocidad</div>
    <div class="tabla-ev">
      ${velocidades.map((v) => `
        <div class="fila-ev dos">
          <div class="f">${escaparHtml(formatearFechaCorta(v.fecha))}</div>
          <div>${v.segundos.toFixed(1)} s</div>
        </div>
      `).join('')}
    </div>
  `;
}

function seccionRecursos(envios) {
  if (!envios.length) {
    return `<div class="eyebrow">Recursos enviados</div>
      <div class="p">Todavía no se le mandó ningún material.</div>`;
  }
  return `
    <div class="eyebrow">Recursos enviados</div>
    ${envios.map((e) => `
      <div class="rec">
        <div class="t">${escaparHtml(e.titulo ?? 'Recurso borrado')}</div>
        <div class="m"><span class="tag">${escaparHtml(formatearFechaCorta(e.fecha))}</span></div>
      </div>
    `).join('')}
  `;
}

export async function renderFicha() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel || !jugadorId) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay un jugador seleccionado.</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando jugador...</div></div>`;

  let jugador;
  let pertenencias = [];
  try {
    const jugadores = await obtenerJugadoresDelPlantel(club.id, plantel.id);
    jugador = jugadores.find((j) => j.id === jugadorId) ?? null;
    if (jugador) pertenencias = await obtenerPertenenciasDeJugador(club.id, jugadorId);
  } catch (e) {
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar el jugador.'
    }</div></div></div>`;
    return;
  }

  if (!jugador) {
    contenedor().innerHTML = `<div class="pad"><div class="p">Este jugador ya no está en ${escaparHtml(plantel.categoria)}.</div></div>`;
    return;
  }

  const categorias = pertenencias.map((p) => p.categoria).filter(Boolean);
  contenedor().innerHTML = `
    <div class="ficha-top">
      <div class="nom">${escaparHtml(jugador.nombreLimpio)}</div>
      <div class="sub">${categorias.length ? escaparHtml(categorias.join(' · ')) : 'Sin categoría vigente'}</div>
      <div class="datos-ficha">
        ${dato('Talla', jugador.tallaCm, 'cm')}
        ${dato('Peso', jugador.pesoKg, 'kg')}
      </div>
    </div>
    <div class="pad">
      <div class="eyebrow">Mediciones</div>
      <div class="p">${
        jugador.fechaMedicion
          ? `Última medición: ${escaparHtml(jugador.fechaMedicion)}.`
          : 'Todavía no tiene mediciones cargadas. Talla y peso salen de los estudios médicos de principio de año y se cargan aparte.'
      }</div>
    </div>
    <div class="pad" id="ficha-historia"><div class="p">Cargando historia del jugador...</div></div>
  `;

  // Todo lo de acá abajo va en su propio try/catch: los datos básicos ya
  // están pintados arriba, así que un error de red trayendo la historia no
  // puede dejar la ficha entera en blanco.
  try {
    const [sesiones, medicionesTiro, velocidades, partidos, estadisticas, envios] = await Promise.all([
      obtenerSesionesDeMedicion(club.id, plantel.id),
      obtenerMedicionesTiroDelPlantel(club.id, plantel.id),
      obtenerMedicionesVelocidadDelPlantel(club.id, plantel.id),
      obtenerPartidosDelPlantel(club.id, plantel.id),
      obtenerEstadisticasDelPlantel(club.id, plantel.id),
      obtenerEnviosDeJugador(club.id, jugadorId),
    ]);

    const bateria = ultimaBateriaDeJugador(sesiones, medicionesTiro, jugadorId);
    // Si la más reciente es una ausencia completa (todas las posiciones en
    // null), se busca la última vez que sí midió algo real. Si no, es la
    // misma batería: no hace falta ir a buscar otra.
    const bateriaEsAusenciaCompleta = !!bateria && !Object.values(bateria.porPosicion).some((v) => v != null);
    const bateriaConDatos = bateriaEsAusenciaCompleta
      ? ultimaBateriaConDatosDeJugador(sesiones, medicionesTiro, jugadorId)
      : bateria;
    const series = serieDeTiroDelJugador({ sesiones, medicionesTiro, partidos, estadisticas, jugadorId });
    const historial = historialDePartidosDelJugador(partidos, estadisticas, jugadorId);
    const velocidadesDelJugador = velocidades
      .filter((v) => v.jugadorId === jugadorId && v.segundos != null)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    $('ficha-historia').innerHTML = `
      ${seccionCancha(bateria, bateriaConDatos)}
      ${bloqueDeSerie('ficha-triples', 'Tiro de tres', series.triples, 'Todavía no hay datos de triples, ni de práctica ni de partido.')}
      ${bloqueDeSerie('ficha-libres', 'Tiro libre', series.libres, 'Todavía no hay datos de libres, ni de práctica ni de partido.')}
      ${seccionPartidos(historial)}
      ${seccionVelocidad(velocidadesDelJugador)}
      ${seccionRecursos(envios)}
    `;

    // Los SVG se dibujan después de meter el HTML en el DOM: recién ahí
    // existen los elementos. cancha() sólo se llama si seccionCancha() dibujó
    // el <svg> (bateriaConDatos no nula); dibujarSerie ya se cuida sola de eso.
    if (bateriaConDatos) cancha($('ficha-cancha'), bateriaConDatos.porPosicion);
    dibujarSerie('ficha-triples', series.triples);
    dibujarSerie('ficha-libres', series.libres);
  } catch (e) {
    $('ficha-historia').innerHTML = `<div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar la historia del jugador.'
    }</div></div>`;
  }
}
