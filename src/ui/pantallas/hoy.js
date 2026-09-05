import { POSICIONES } from '../../data/posiciones.js';
import { promedioDeCanchaDelPlantel, porcentaje } from '../../data/estadisticas.js';
import { obtenerSesionesDeMedicion, obtenerMedicionesTiroDelPlantel } from '../../data/repositorio.js';
import { cancha } from '../componentes/graficos.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed, formatearFechaCorta } from '../nav.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('hoy-contenido');

/**
 * HOY se arma sola con lo que haya. Sin una sola batería de tiro cargada no
 * hay nada real que resumir, así que el estado vacío señala los tres pasos
 * que la arman (spec, Task 17) en vez de mostrar una cancha en blanco.
 */
function estadoVacioHtml(categoria) {
  return `
    <div class="estado-vacio">
      <h2>Todavía no hay nada cargado en ${escaparHtml(categoria)}</h2>
      <div class="p">El resumen del día se arma solo apenas haya datos. Así se empieza:</div>
      <div class="acciones">
        <button class="btn" id="btn-vacio-plantel">Cargar el plantel</button>
        <button class="btn sec" id="btn-vacio-partido">Cargar un partido</button>
        <button class="btn sec" id="btn-vacio-medir">Hacer la primera medición</button>
      </div>
    </div>
  `;
}

export async function renderHoy() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = `
    <div class="pad">
      <h2 class="h2">Buen día</h2>
      <div class="p" id="hoy-estado">Cargando el resumen...</div>
    </div>
  `;

  let sesiones, mediciones;
  try {
    [sesiones, mediciones] = await Promise.all([
      obtenerSesionesDeMedicion(club.id, plantel.id),
      obtenerMedicionesTiroDelPlantel(club.id, plantel.id),
    ]);
  } catch (e) {
    $('hoy-estado').textContent = esErrorDeRed(e)
      ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
      : 'No se pudo cargar el resumen.';
    return;
  }

  const bateria = promedioDeCanchaDelPlantel(sesiones, mediciones);

  if (!bateria) {
    contenedor().innerHTML = `
      <div class="pad">
        <h2 class="h2">Buen día</h2>
        ${estadoVacioHtml(plantel.categoria)}
      </div>
    `;
    $('btn-vacio-plantel').addEventListener('click', () => ir('p-plantel'));
    $('btn-vacio-partido').addEventListener('click', () => ir('p-datos'));
    $('btn-vacio-medir').addEventListener('click', () => ir('p-medir'));
    return;
  }

  // Promedio real de la categoría: se suman anotados/intentos de las
  // posiciones con datos en la última batería y se pasa por porcentaje(),
  // no un promedio de porcentajes sueltos — así el número grande sigue
  // teniendo un denominador real detrás (ningún porcentaje sin sus intentos).
  let totalAnotados = 0;
  let totalIntentos = 0;
  let medidas = 0;
  POSICIONES.forEach((p) => {
    const v = bateria.porPosicion[p.id];
    if (v) {
      totalAnotados += v.anotados;
      totalIntentos += v.intentos;
      medidas += 1;
    }
  });
  const faltan = POSICIONES.length - medidas;
  const promedio = porcentaje(totalAnotados, totalIntentos);

  contenedor().innerHTML = `
    <div class="pad">
      <h2 class="h2">Buen día</h2>
      <div class="p">Así está ${escaparHtml(plantel.categoria)} con la última batería de tiro, del ${escaparHtml(formatearFechaCorta(bateria.fecha))}.</div>

      <div class="eyebrow">Tiro de campo</div>
      <div class="tarj">
        <div class="tarj-h">
          <div class="t">Promedio de la categoría</div>
          <div class="n">${promedio.pct}<small> % · ${promedio.anotados}/${promedio.intentos}</small></div>
        </div>
        <svg class="g" id="hoy-cancha"></svg>
        <div class="leyenda"><span>Cuanto más lleno el círculo, mejor el porcentaje</span></div>
        ${faltan > 0 ? `<div class="p">Faltan medir ${faltan} posición${faltan === 1 ? '' : 'es'} en esta batería.</div>` : ''}
      </div>
      <button class="btn sec" id="btn-hoy-medir">Cargar otra medición</button>
    </div>
  `;
  cancha($('hoy-cancha'), bateria.porPosicion);
  $('btn-hoy-medir').addEventListener('click', () => ir('p-medir'));
}
