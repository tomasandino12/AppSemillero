import { POSICIONES, LIBRES } from '../../data/posiciones.js';
import {
  zonasDeSesion, zonasDelFoco, compararPorcentajes, jugadoresDeZona, contarPorDebajo,
  totalDeZonas,
} from '../../data/estadisticas.js';
import { objetivoDeZona } from '../../data/objetivosClub.js';
import { ultimaMedicion, ultimaMedicionPorJugador } from '../../data/antropometria.js';
import {
  obtenerSesionesDeMedicion, obtenerMedicionesTiroDelPlantel,
  obtenerJugadoresDelPlantel, obtenerMedicionesCorporalesDelClub,
} from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed, formatearFechaCorta, textoPorcentaje } from '../nav.js';
import { abrirHoja } from '../componentes/hoja.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('hoy-contenido');

/**
 * HOY se arma sola con lo que haya. El piloto arranca sin una sola medición,
 * así que este no es un caso de borde: es el primer estado real de la app.
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

/**
 * La variación contra la batería anterior.
 *
 * Sólo lleva flecha y color cuando supera el margen de error de la
 * comparación. Dos baterías de ~700 intentos tienen ±2 pp cada una: una
 * diferencia de 2 pp entre sesiones está dentro del ruido, y pintarla verde
 * con una flecha para arriba le diría al entrenador que el equipo mejoró
 * cuando el dato no alcanza para afirmarlo.
 *
 * La flecha es la señal, no el color: quien no distinga los tonos igual ve
 * para qué lado se movió.
 */
function variacionHtml(variacion) {
  if (variacion == null) return '';
  const signo = variacion.pp > 0 ? '+' : '';
  const texto = `${signo}${variacion.pp}`;
  if (!variacion.concluyente) {
    return `<span class="var neutra" title="La diferencia no supera el margen de error">${texto} pp · sin diferencia clara</span>`;
  }
  const flecha = variacion.pp > 0 ? '▲' : '▼';
  return `<span class="var ${variacion.pp > 0 ? 'sube' : 'baja'}">${flecha} ${texto} pp</span>`;
}

/**
 * Una zona. La barra va siempre en escala 0-100 fija: una barra cuya escala
 * cambia entre filas es la forma clásica de hacer que dos números distintos
 * se vean iguales.
 */
function zonaHtml(zona) {
  const pct = zona.valor?.pct ?? null;
  return `
    <div class="zona">
      <div class="zona-cab">
        <span class="nom">${escaparHtml(zona.nombre)}</span>
        <span class="frac">${zona.valor ? `${zona.valor.anotados}/${zona.valor.intentos}` : '<span class="sin">sin medir</span>'}</span>
      </div>
      <div class="zona-barra">
        <div class="pista">
          ${pct == null ? '' : `<div class="relleno" style="width:${pct}%"></div>`}
          ${zona.objetivo == null ? '' : `<div class="obj" style="left:${zona.objetivo}%" title="Objetivo del club: ${zona.objetivo}%"></div>`}
        </div>
        <span class="pct">${pct == null ? '—' : `${pct}%`}</span>
      </div>
      ${zona.valor?.muestraChica ? '<div class="poco-tag">pocos datos</div>' : ''}
      ${variacionHtml(zona.variacion)}
    </div>
  `;
}

/**
 * El foco. Se dice cuál es la zona más floja, pero sólo se presenta como una
 * sola cuando se separa del resto más que el margen de error: con las
 * muestras reales varias zonas suelen ser indistinguibles entre sí, y
 * señalar a la última del ranking como "el problema" estando empatada con
 * otras tres es inventar una conclusión.
 */
function focoHtml(foco, porId) {
  if (!foco) {
    return `<div class="p">Todavía no hay suficientes zonas medidas como para señalar una más floja.</div>`;
  }
  const nombres = foco.zonas.map((id) => porId.get(id)?.nombre ?? id);
  if (foco.concluyente) {
    const zona = porId.get(foco.zonas[0]);
    return `
      <div class="foco">
        <div class="k">La zona más floja de la última batería</div>
        <div class="v">${escaparHtml(zona.nombre)}</div>
        <div class="d">${textoPorcentaje(zona.valor)}</div>
      </div>
    `;
  }
  return `
    <div class="foco">
      <div class="k">Las zonas más flojas de la última batería</div>
      <div class="v">${escaparHtml(nombres.join(' · '))}</div>
      <div class="d">Están empatadas dentro del margen de error: el dato no alcanza para elegir una.</div>
    </div>
  `;
}

/** Lista de jugadores por debajo del objetivo del club, en una hoja. */
function abrirListaDeZona(zona, jugadores, nombres) {
  abrirHoja({
    titulo: zona.nombre,
    cuerpo: `
      <div class="p">Objetivo del club para esta zona: ${zona.objetivo}%. Cada uno con sus intentos: la diferencia entre 2 de 10 y 4 de 10 no significa nada.</div>
      <div class="lista-chk">
        ${jugadores.map((j) => `
          <div class="chk-fila">
            <span>${escaparHtml(nombres.get(j.jugadorId) ?? 'Jugador')}</span>
            <span class="der">${textoPorcentaje(j.valor)}</span>
          </div>
        `).join('')}
      </div>
    `,
  });
}

function pieHtml(corporal) {
  if (!corporal) return '';
  const { ultimaFecha, sinMedir, total } = corporal;
  return `
    <div class="pie-hoy">
      <div class="k">Altura y peso</div>
      <div class="d">${
        ultimaFecha
          ? `Última medición del plantel: ${escaparHtml(formatearFechaCorta(ultimaFecha))}.`
          : 'Todavía no hay ninguna medición cargada.'
      }${
        sinMedir > 0
          ? ` ${sinMedir} de ${total} jugador${total === 1 ? '' : 'es'} no tiene${sinMedir === 1 ? '' : 'n'} ninguna.`
          : ''
      }</div>
      <button class="btn sec chico" id="btn-hoy-plantel">Ver el plantel</button>
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

  let sesiones, mediciones, jugadores, corporales;
  try {
    // Las dos últimas son para el pie de la card y degradan solas: si fallan,
    // la card se dibuja igual sin el pie. Lo que no puede faltar es la
    // batería, que es de lo que trata la pantalla.
    [sesiones, mediciones, jugadores, corporales] = await Promise.all([
      obtenerSesionesDeMedicion(club.id, plantel.id),
      obtenerMedicionesTiroDelPlantel(club.id, plantel.id),
      obtenerJugadoresDelPlantel(club.id, plantel.id).catch(() => null),
      obtenerMedicionesCorporalesDelClub(club.id).catch(() => null),
    ]);
  } catch (e) {
    $('hoy-estado').textContent = esErrorDeRed(e)
      ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
      : 'No se pudo cargar el resumen.';
    return;
  }

  const sesionesTiro = sesiones
    .filter((s) => s.tipo === 'tiro')
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (!sesionesTiro.length) {
    contenedor().innerHTML = `<div class="pad"><h2 class="h2">Buen día</h2>${estadoVacioHtml(plantel.categoria)}</div>`;
    $('btn-vacio-plantel').addEventListener('click', () => ir('p-plantel'));
    $('btn-vacio-partido').addEventListener('click', () => ir('p-datos'));
    $('btn-vacio-medir').addEventListener('click', () => ir('p-medir'));
    return;
  }

  const actual = sesionesTiro[0];
  const anterior = sesionesTiro[1] ?? null;
  const { porZona, jugadoresQueMidieron } = zonasDeSesion(mediciones, actual.id);
  const zonasAnterior = anterior ? zonasDeSesion(mediciones, anterior.id).porZona : {};

  const armarZona = (def) => ({
    id: def.id,
    nombre: def.nombre,
    valor: porZona[def.id] ?? null,
    objetivo: objetivoDeZona(def.id),
    // Sin batería anterior no hay variación: null, no un cero con flecha.
    variacion: compararPorcentajes(porZona[def.id] ?? null, zonasAnterior[def.id] ?? null),
  });

  // De peor a mejor porcentaje, no por posición en cancha: el orden es la
  // primera pista de qué entrenar. Las zonas sin medir van al final.
  const zonasArco = POSICIONES.map(armarZona).sort((a, b) => {
    if (!a.valor) return 1;
    if (!b.valor) return -1;
    return a.valor.pct - b.valor.pct;
  });
  const zonaLibres = armarZona(LIBRES);
  const porId = new Map(zonasArco.map((z) => [z.id, z]));
  const foco = zonasDelFoco(zonasArco);

  // Total del arco: las 5 zonas sumadas rondan los 700 intentos, y es la
  // única comparación entre baterías con resolución para encender una señal
  // mes a mes. Por zona son 140 y el margen ronda los 11 pp.
  const idsArco = POSICIONES.map((z) => z.id);
  const totalActual = totalDeZonas(porZona, idsArco);
  const totalVariacion = compararPorcentajes(totalActual, totalDeZonas(zonasAnterior, idsArco));

  if (!zonasArco.some((z) => z.valor) && !zonaLibres.valor) {
    contenedor().innerHTML = `
      <div class="pad">
        <h2 class="h2">Buen día</h2>
        <div class="p">Hubo una batería el ${escaparHtml(formatearFechaCorta(actual.fecha))} en ${escaparHtml(plantel.categoria)}, pero quedó sin ninguna medición: todos los jugadores figuran como ausentes.</div>
        <button class="btn" id="btn-hoy-medir">Hacer una medición</button>
      </div>
    `;
    $('btn-hoy-medir').addEventListener('click', () => ir('p-medir'));
    return;
  }

  const nombres = new Map((jugadores ?? []).map((j) => [j.id, j.nombreLimpio]));
  const corporal = (jugadores && corporales)
    ? (() => {
        const porJugador = ultimaMedicionPorJugador(corporales);
        const delPlantel = jugadores.map((j) => porJugador.get(j.id)).filter(Boolean);
        return {
          ultimaFecha: ultimaMedicion(delPlantel)?.fechaMedicion ?? null,
          sinMedir: jugadores.filter((j) => !porJugador.has(j.id)).length,
          total: jugadores.length,
        };
      })()
    : null;

  // El conteo por debajo del objetivo es sólo una puerta a la lista, nunca
  // una métrica en sí misma: con 10 intentos por jugador, la diferencia entre
  // 2/10 y 4/10 no significa nada.
  const zonaDelFoco = foco?.concluyente ? porId.get(foco.zonas[0]) : null;
  const jugadoresDelFoco = zonaDelFoco ? jugadoresDeZona(mediciones, actual.id, zonaDelFoco.id) : [];
  const porDebajo = zonaDelFoco ? contarPorDebajo(jugadoresDelFoco, zonaDelFoco.objetivo) : null;

  contenedor().innerHTML = `
    <div class="pad">
      <h2 class="h2">Buen día</h2>
      <div class="p">${escaparHtml(plantel.categoria)} · batería del ${escaparHtml(formatearFechaCorta(actual.fecha))} · ${jugadoresQueMidieron} jugador${jugadoresQueMidieron === 1 ? '' : 'es'} midió${jugadoresQueMidieron === 1 ? '' : 'eron'}</div>

      ${totalActual ? `
        <div class="total-arco">
          <span class="k">Tiro de campo, todo el arco</span>
          <span class="v">${textoPorcentaje(totalActual)}</span>
          ${variacionHtml(totalVariacion)}
        </div>
      ` : ''}

      ${focoHtml(foco, porId)}
      ${porDebajo == null ? '' : `
        <div class="p">${porDebajo} de ${jugadoresDelFoco.length} está${porDebajo === 1 ? '' : 'n'} por debajo del objetivo del club.
          <button class="btn sec chico" id="btn-ver-quienes">Ver quiénes</button>
        </div>
      `}

      <div class="eyebrow">Por zona ${anterior ? `<span class="der">vs ${escaparHtml(formatearFechaCorta(anterior.fecha))}</span>` : ''}</div>
      <div class="zonas">${zonasArco.map(zonaHtml).join('')}</div>

      <div class="sep"></div>
      <div class="eyebrow">Tiros libres</div>
      <div class="zonas">${zonaHtml(zonaLibres)}</div>

      ${pieHtml(corporal)}
      <button class="btn sec" id="btn-hoy-medir">Cargar otra medición</button>
    </div>
  `;

  $('btn-hoy-medir').addEventListener('click', () => ir('p-medir'));
  $('btn-hoy-plantel')?.addEventListener('click', () => ir('p-plantel'));
  $('btn-ver-quienes')?.addEventListener('click', () => abrirListaDeZona(zonaDelFoco, jugadoresDelFoco, nombres));
}
