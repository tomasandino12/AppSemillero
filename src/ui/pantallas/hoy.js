import { POSICIONES, LIBRES } from '../../data/posiciones.js';
import {
  zonasDeSesion, zonasDelFoco, compararPorcentajes, jugadoresDeZona, contarPorDebajo,
  totalDeZonas, serieDeZonas,
} from '../../data/estadisticas.js';
import { metaDeZona, alcanzaMeta, resumenDeMetas } from '../../data/objetivosClub.js';
import { ultimaMedicion, ultimaMedicionPorJugador } from '../../data/antropometria.js';
import {
  obtenerSesionesDeMedicion, obtenerMedicionesTiroDelPlantel,
  obtenerJugadoresDelPlantel, obtenerMedicionesCorporalesDelClub, obtenerMetasDelPlantel,
} from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed, formatearFechaCorta, textoPorcentaje } from '../nav.js';
import { abrirHoja } from '../componentes/hoja.js';
import { grafico } from '../componentes/graficos.js';
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
  const llego = alcanzaMeta(zona.valor, zona.meta);
  return `
    <div class="zona">
      <div class="zona-cab">
        <span class="nom">${escaparHtml(zona.nombre)}</span>
        <span class="frac">${zona.valor ? `${zona.valor.anotados}/${zona.valor.intentos}` : '<span class="sin">sin medir</span>'}</span>
      </div>
      <div class="zona-barra">
        <div class="pista">
          ${pct == null ? '' : `<div class="relleno ${llego === true ? 'llego' : ''}" style="width:${pct}%"></div>`}
          ${zona.meta == null ? '' : `<div class="meta" style="left:${zona.meta}%" title="Meta del cuerpo técnico: ${zona.meta}%"></div>`}
        </div>
        <span class="pct">${pct == null ? '—' : `${pct}%`}</span>
      </div>
      <div class="zona-pie">
        <button class="btn-zona-recurso" data-recurso-zona="${zona.id}">Mandar un recurso</button>
        ${zona.meta == null ? '' : `<span class="marca-meta ${llego === true ? 'si' : 'no'}">${llego === true ? '✓ llegó a la meta' : `meta ${zona.meta}%`}</span>`}
        ${zona.valor?.muestraChica ? '<span class="poco-tag">pocos datos</span>' : ''}
        ${variacionHtml(zona.variacion)}
      </div>
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
    return `<div class="foco-linea">Todavía no hay suficientes zonas medidas como para señalar una más floja.</div>`;
  }
  const nombres = foco.zonas.map((id) => porId.get(id)?.nombre ?? id);
  if (foco.concluyente) {
    const zona = porId.get(foco.zonas[0]);
    return `<div class="foco-linea">Zona más floja: <b>${escaparHtml(zona.nombre)}</b>, ${textoPorcentaje(zona.valor)}.</div>`;
  }
  return `<div class="foco-linea">Zonas más flojas: <b>${escaparHtml(nombres.join(' · '))}</b> — empatadas dentro del margen de error, el dato no alcanza para elegir una.</div>`;
}

/** Lista de jugadores por debajo del objetivo del club, en una hoja. */
function abrirListaDeZona(zona, jugadores, nombres) {
  abrirHoja({
    titulo: zona.nombre,
    cuerpo: `
      <div class="p">Meta del cuerpo técnico para esta zona: ${zona.meta}%. Cada uno con sus intentos: la diferencia entre 2 de 10 y 4 de 10 no significa nada.</div>
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

  let sesiones, mediciones, jugadores, corporales, metas;
  try {
    // Las dos últimas son para el pie de la card y degradan solas: si fallan,
    // la card se dibuja igual sin el pie. Lo que no puede faltar es la
    // batería, que es de lo que trata la pantalla.
    [sesiones, mediciones, jugadores, corporales, metas] = await Promise.all([
      obtenerSesionesDeMedicion(club.id, plantel.id),
      obtenerMedicionesTiroDelPlantel(club.id, plantel.id),
      obtenerJugadoresDelPlantel(club.id, plantel.id).catch(() => null),
      obtenerMedicionesCorporalesDelClub(club.id).catch(() => null),
      // Sin metas la card funciona igual, así que degradan solas a "ninguna".
      obtenerMetasDelPlantel(club.id, plantel.id).catch(() => ({})),
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
    meta: metaDeZona(def.id, metas),
    // Sin batería anterior no hay variación: null, no un cero con flecha.
    variacion: compararPorcentajes(porZona[def.id] ?? null, zonasAnterior[def.id] ?? null),
  });

  // De peor a mejor porcentaje, no por posición en cancha.
  //
  // OJO con la premisa: esto NO es una recomendación de qué entrenar. En
  // estas categorías no se entrena tiro por posición — el tiro se trabaja en
  // un ejercicio al inicio y la práctica va a situaciones de partido. El
  // ranking sirve para elegir un recurso y para darle algo de foco a ese
  // ejercicio inicial, nada más. Cualquier texto que suene a "entrená esta
  // zona" está reintroduciendo una premisa que el cuerpo técnico ya
  // descartó. Las zonas sin medir van al final.
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
  const metasArco = resumenDeMetas(zonasArco);
  // Una batería anterior sólo da una comparación; seis dan una serie. El
  // margen invalida el salto entre dos puntos, no mirar todos los puntos.
  const serieArco = serieDeZonas(sesiones, mediciones, idsArco);

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
  const porDebajo = zonaDelFoco ? contarPorDebajo(jugadoresDelFoco, zonaDelFoco.meta) : null;

  // El .sep separa el arco de los tiros libres en todos los anchos: el
  // proyecto los trata como series aparte y nunca los mezcla.
  contenedor().innerHTML = `
    <div class="pad">
      <div class="contexto">${escaparHtml(plantel.categoria)} · batería del ${escaparHtml(formatearFechaCorta(actual.fecha))} · ${jugadoresQueMidieron} jugador${jugadoresQueMidieron === 1 ? '' : 'es'} midió${jugadoresQueMidieron === 1 ? '' : 'eron'}</div>

      ${totalActual ? `
        <div class="cabecera-tiro">
          <div class="k">Tiro de campo · todo el arco</div>
          <div class="n">${totalActual.pct}<span class="u">%</span></div>
          <div class="frac">${totalActual.anotados}/${totalActual.intentos} tiros</div>
          <div class="sub">
            ${variacionHtml(totalVariacion) || '<span class="var neutra">Primera batería: todavía no hay con qué comparar</span>'}
            ${metasArco ? `<span class="metas-resumen">${metasArco.alcanzadas} de ${metasArco.conMeta} zona${metasArco.conMeta === 1 ? '' : 's'} llegó a su meta</span>` : ''}
          </div>
          ${curvaHtml(serieArco)}
        </div>
      ` : ''}

      <div class="eyebrow">Por zona ${anterior ? `<span class="der">vs ${escaparHtml(formatearFechaCorta(anterior.fecha))}</span>` : ''}</div>
      <div class="zonas">${zonasArco.map(zonaHtml).join('')}</div>
      ${focoHtml(foco, porId)}

      ${porDebajo == null ? '' : `
        <div class="foco-linea">${porDebajo} de ${jugadoresDelFoco.length} está${porDebajo === 1 ? '' : 'n'} por debajo de la meta del cuerpo técnico.
          <button class="btn sec chico" id="btn-ver-quienes">Ver quiénes</button>
        </div>
      `}

      <div class="sep"></div>
      <div class="eyebrow">Tiros libres</div>
      <div class="zonas">${zonaHtml(zonaLibres)}</div>

      ${pieHtml(corporal)}
      <div class="acciones-hoy">
        <button class="btn sec" id="btn-hoy-medir">Cargar otra medición</button>
        <button class="btn sec" id="btn-hoy-metas">${metasArco ? 'Editar las metas' : 'Fijar las metas'}</button>
      </div>
    </div>
  `;

  $('btn-hoy-medir').addEventListener('click', () => ir('p-medir'));
  $('btn-hoy-plantel')?.addEventListener('click', () => ir('p-plantel'));
  $('btn-hoy-metas').addEventListener('click', () => ir('p-metas', { push: true }));
  dibujarCurva(serieArco);
  $('btn-curva-arco')?.addEventListener('click', () => ir('p-datos'));
  // Atajo de navegación, no automatización: lleva a RECURSOS con el plantel
  // cargado y ahí el entrenador elige QUÉ mandar. La app no sugiere un
  // recurso por zona ni filtra una biblioteca por debilidad — eso sería
  // decidir qué necesita un chico, que no le corresponde.
  contenedor().querySelectorAll('[data-recurso-zona]').forEach((b) => {
    b.addEventListener('click', () => ir('p-recursos'));
  });
  $('btn-ver-quienes')?.addEventListener('click', () => abrirListaDeZona(zonaDelFoco, jugadoresDelFoco, nombres));
}

/**
 * Curva del arco completo, un punto por batería.
 *
 * Une los puntos observados y nada más: no hay línea de tendencia, ni
 * proyección, ni ninguna afirmación sobre si el equipo mejora. Ajustar una
 * recta sobre cuatro mediciones y extenderla sería inventar. La lectura la
 * hace el entrenador mirando los puntos.
 *
 * Con una sola batería se dibuja el punto y ninguna línea: una tendencia de
 * un punto no existe.
 *
 * Las fracciones del primero y el último van como texto —la regla es que
 * ningún punto se muestre sin su denominador— y las de todos los puntos
 * están en DATOS, adonde lleva el toque.
 */
function curvaHtml(serie) {
  if (!serie.length) return '';
  const primero = serie[0];
  const ultimo = serie[serie.length - 1];
  return `
    <button class="curva" id="btn-curva-arco" aria-label="Ver la evolución completa en DATOS">
      <svg class="chispa" id="svg-curva-arco"></svg>
      <div class="curva-pie">
        ${serie.length === 1
          ? `<span>Una sola batería: ${escaparHtml(formatearFechaCorta(primero.fecha))} · ${primero.valor.anotados}/${primero.valor.intentos}</span>`
          : `<span>${serie.length} baterías · primera ${primero.valor.pct}% (${primero.valor.anotados}/${primero.valor.intentos}) · última ${ultimo.valor.pct}% (${ultimo.valor.anotados}/${ultimo.valor.intentos})</span>`}
        <span class="ver">Ver todo ›</span>
      </div>
    </button>
  `;
}

/** Dibuja la curva. Se llama después de meter el HTML: el svg tiene que existir. */
function dibujarCurva(serie) {
  const svg = document.getElementById('svg-curva-arco');
  if (!svg || !serie.length) return;
  grafico(svg, {
    etiquetas: serie.map((p) => formatearFechaCorta(p.fecha)),
    series: [{
      nombre: 'Arco',
      c: '#D9122E',
      d: serie.map((p) => p.valor.pct),
      chico: serie.map((p) => p.valor.muestraChica),
    }],
  }, { alto: 96 });
}
