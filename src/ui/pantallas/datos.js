import { obtenerPartidosDelPlantel, obtenerEstadisticasDelPlantel, obtenerJugadoresDelPlantel } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed, textoPorcentaje } from '../nav.js';
import { ir } from '../main.js';
import { iniciarConfirmacion } from './confirmacionImport.js';
import { setRetornoImport } from './retornoImport.js';
import { repartoPorJugador, evolucionDeTiroDelEquipo } from '../../data/estadisticas.js';
import { barras } from '../componentes/barras.js';
import { grafico } from '../componentes/graficos.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('datos-contenido');

function formatearFecha(iso) {
  // 'YYYY-MM-DD' → 'DD/MM/YY'. Se parsea a mano para no depender de la zona
  // horaria del navegador (new Date('2026-05-01') es UTC y puede correrse un día).
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio.slice(2)}`;
}

function filaPartido(p) {
  const propios = p.puntosPropios ?? '-';
  const rival = p.puntosRival ?? '-';
  const ganado = p.puntosPropios != null && p.puntosRival != null && p.puntosPropios > p.puntosRival;
  return `
    <div class="jug-fila">
      <div style="flex:1">
        <div class="nom">${escaparHtml(p.rivalNombre ?? 'Rival sin nombre')}</div>
        <div class="det">${formatearFecha(p.fecha)} · ${p.condicionPropia === 'local' ? 'Local' : 'Visitante'}</div>
      </div>
      <div class="chip ${ganado ? 'sube' : ''}">${propios}–${rival}</div>
    </div>
  `;
}

function minutosLegibles(segundos) {
  return `${Math.round(segundos / 60)}′`;
}

async function renderSeccionesDeEquipo(club, plantel) {
  const cont = document.getElementById('datos-equipo');
  if (!cont) return;

  let estadisticas = [];
  let jugadores = [];
  let partidos = [];
  try {
    [estadisticas, jugadores, partidos] = await Promise.all([
      obtenerEstadisticasDelPlantel(club.id, plantel.id),
      obtenerJugadoresDelPlantel(club.id, plantel.id),
      obtenerPartidosDelPlantel(club.id, plantel.id),
    ]);
  } catch {
    cont.innerHTML = `<div class="p">No se pudieron cargar las estadísticas del equipo.</div>`;
    return;
  }

  if (!estadisticas.length) {
    cont.innerHTML = `
      <div class="eyebrow">Reparto del equipo</div>
      <div class="p">Cuando cargues un partido va a aparecer acá cuánto juega y cuánto anota cada uno.</div>`;
    return;
  }

  const nombre = new Map(jugadores.map((j) => [j.id, j.nombreLimpio]));
  const etiqueta = (id) => nombre.get(id) ?? 'Jugador de otra categoría';

  const minutos = repartoPorJugador(estadisticas, 'minSegundos');
  const puntos = repartoPorJugador(estadisticas, 'pts');

  const lectura = (r, que) => r.jugadoresQueConcentranLaMitad === 0
    ? ''
    : `<div class="p">Los primeros ${r.jugadoresQueConcentranLaMitad} jugadores concentran más de la mitad de ${que}.</div>`;

  cont.innerHTML = `
    <div class="eyebrow">Reparto de minutos</div>
    ${lectura(minutos, 'los minutos')}
    ${barras(minutos.filas.map((f) => ({ etiqueta: etiqueta(f.jugadorId), valor: f.valor })), { formatearValor: minutosLegibles })}

    <div class="eyebrow">Reparto de puntos</div>
    ${lectura(puntos, 'los puntos')}
    ${barras(puntos.filas.map((f) => ({ etiqueta: etiqueta(f.jugadorId), valor: f.valor })), { formatearValor: (v) => String(v) })}

    <div class="eyebrow">Tiro del equipo, partido a partido</div>
    <div id="datos-evolucion"></div>
  `;

  const evolucion = evolucionDeTiroDelEquipo(partidos, estadisticas);
  document.getElementById('datos-evolucion').innerHTML = `
    <svg class="g" id="svg-evolucion"></svg>
    <div class="leyenda"><span class="s2">2P</span><span class="s3">3P</span><span class="sl">TL</span></div>
    <div class="tabla-ev">
      ${evolucion.map((e) => `
        <div class="fila-ev">
          <div class="f">${escaparHtml(formatearFecha(e.fecha))}</div>
          <div>2P ${textoPorcentaje(e.dos)}</div>
          <div>3P ${textoPorcentaje(e.tres)}</div>
          <div>TL ${textoPorcentaje(e.libres)}</div>
        </div>
      `).join('')}
    </div>
  `;

  // Con un solo partido no se dibuja línea: grafico() devuelve true igual y
  // pinta el punto. Con cero, devuelve false y el svg queda en alto 0.
  grafico(document.getElementById('svg-evolucion'), {
    etiquetas: evolucion.map((e) => formatearFecha(e.fecha)),
    series: [
      { nombre: '2P', c: '#D9122E', d: evolucion.map((e) => e.dos?.pct ?? null) },
      { nombre: '3P', c: '#131316', d: evolucion.map((e) => e.tres?.pct ?? null) },
      { nombre: 'TL', c: '#726E65', dash: true, d: evolucion.map((e) => e.libres?.pct ?? null) },
    ],
  });
}

export async function renderDatos() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Partidos de ${escaparHtml(plantel.categoria)}</div>
      <div class="p" id="datos-estado">Cargando partidos...</div>
      <div id="datos-lista"></div>
      <div id="datos-equipo"></div>
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-cargar-partido">Cargar partido</button></div>
  `;
  $('btn-cargar-partido').addEventListener('click', () => $('input-archivo').click());

  let partidos;
  try {
    partidos = await obtenerPartidosDelPlantel(club.id, plantel.id);
  } catch (e) {
    $('datos-estado').textContent = esErrorDeRed(e)
      ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
      : 'No se pudieron cargar los partidos.';
    return;
  }

  if (!partidos.length) {
    $('datos-estado').outerHTML = `
      <div class="estado-vacio">
        <h2>Todavía no cargaste partidos</h2>
        <div class="p">Cargá la planilla <b>.xlsx</b> que exporta la app de la CABB y los datos del partido quedan guardados, con las estadísticas de cada jugador.</div>
      </div>
    `;
    return;
  }

  $('datos-estado').remove();
  $('datos-lista').innerHTML = `<div class="lista-2col">${partidos.map(filaPartido).join('')}</div>`;
  await renderSeccionesDeEquipo(club, plantel);
}

export function iniciarDatos() {
  // El input de archivo vive en index.html, fuera de las pantallas, para que
  // el listener se registre una sola vez en toda la vida de la página.
  $('input-archivo').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    await ir('p-confirmacion', { push: true });
    await iniciarConfirmacion(archivo);
  });

  // Punto único de retorno del import: vuelve a DATOS y releé la lista, así
  // el partido recién importado aparece sin recargar la página.
  setRetornoImport(() => { ir('p-datos'); });
}
