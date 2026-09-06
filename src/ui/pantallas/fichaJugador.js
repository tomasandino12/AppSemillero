import {
  obtenerJugadoresDelPlantel, obtenerPertenenciasDeJugador,
  obtenerSesionesDeMedicion, obtenerMedicionesTiroDelPlantel, obtenerMedicionesVelocidadDelPlantel,
  obtenerEstadisticasDelPlantel, obtenerPartidosDelPlantel, obtenerEnviosDeJugador,
  obtenerMedicionesCorporalesDeJugador, crearMedicionCorporal, borrarMedicionCorporal,
  actualizarFechaNacimiento,
} from '../../data/repositorio.js';
import { serieDeTiroDelJugador, ultimaBateriaDeJugador, ultimaBateriaConDatosDeJugador, historialDePartidosDelJugador } from '../../data/estadisticas.js';
import {
  edadEnAnios, hoyLocal, ordenarMediciones, validarMedicion, validarFechaNacimiento,
  ALTURA_MIN_CM, ALTURA_MAX_CM, PESO_MIN_KG, PESO_MAX_KG,
} from '../../data/antropometria.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed, textoPorcentaje, formatearFechaCorta, toast } from '../nav.js';
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
      <div class="datos-ficha" id="ficha-cabecera-datos">
        ${dato('Edad', edadEnAnios(jugador.fechaNacimiento), 'años')}
      </div>
    </div>
    <div class="pad" id="ficha-personales"></div>
    <div class="pad" id="ficha-corporal"><div class="p">Cargando mediciones...</div></div>
    <div class="pad" id="ficha-historia"><div class="p">Cargando historia del jugador...</div></div>
  `;

  renderPersonales(jugador);
  cargarCorporal(club.id, jugador.id);

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

/* ---------- Datos personales: fecha de nacimiento ---------- */

/**
 * La fecha de nacimiento se edita acá y no en el alta: los jugadores entran
 * casi siempre por una planilla de la CABB, que no la trae. Vacía es un
 * estado válido y significa "no se sabe" — nunca se infiere.
 *
 * Sin ella no se puede separar "mejoró" de "creció" al comparar dos
 * generaciones, que es exactamente para lo que existe el dato.
 */
function renderPersonales(jugador) {
  const cont = $('ficha-personales');
  if (!cont) return;
  cont.innerHTML = `
    <div class="eyebrow">Datos personales</div>
    <div class="campo">
      <label for="in-nacimiento">Fecha de nacimiento</label>
      <input id="in-nacimiento" type="date" max="${hoyLocal()}" value="${escaparHtml(jugador.fechaNacimiento ?? '')}">
      <div class="ayuda">Las planillas de la CABB no la traen, así que se carga a mano. Sin ella no se puede saber si una mejora es progreso o es crecimiento.</div>
    </div>
    <div id="nacimiento-aviso"></div>
    <button class="btn sec" id="btn-guardar-nacimiento">Guardar fecha de nacimiento</button>
  `;

  $('btn-guardar-nacimiento').addEventListener('click', async () => {
    const boton = $('btn-guardar-nacimiento');
    if (boton.disabled) return;
    const aviso = $('nacimiento-aviso');
    const { ok, errores, valor } = validarFechaNacimiento($('in-nacimiento').value);
    if (!ok) {
      aviso.innerHTML = `<div class="al"><div class="tx">${escaparHtml(errores.join(' '))}</div></div>`;
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Guardando...';
    aviso.innerHTML = '';
    try {
      await actualizarFechaNacimiento(obtenerClubActual().id, jugador.id, valor);
    } catch (e) {
      aviso.innerHTML = `<div class="al"><div class="tx">${
        esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo guardar la fecha.'
      }</div></div>`;
      boton.disabled = false;
      boton.textContent = 'Guardar fecha de nacimiento';
      return;
    }

    jugador.fechaNacimiento = valor;
    const cabecera = $('ficha-cabecera-datos');
    if (cabecera) cabecera.innerHTML = dato('Edad', edadEnAnios(valor), 'años');
    boton.disabled = false;
    boton.textContent = 'Guardar fecha de nacimiento';
    toast(valor ? 'Fecha de nacimiento guardada' : 'Fecha de nacimiento borrada');
  });
}

/* ---------- Mediciones corporales: histórico y alta ---------- */

async function cargarCorporal(clubId, idJugador) {
  const cont = $('ficha-corporal');
  if (!cont) return;
  let mediciones;
  try {
    mediciones = await obtenerMedicionesCorporalesDeJugador(clubId, idJugador);
  } catch (e) {
    cont.innerHTML = `
      <div class="eyebrow">Mediciones</div>
      <div class="al"><div class="tx">${
        esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudieron cargar las mediciones.'
      }</div></div>
      <button class="btn sec" id="btn-reintentar-corporal">Reintentar</button>
    `;
    $('btn-reintentar-corporal').addEventListener('click', () => cargarCorporal(clubId, idJugador));
    return;
  }
  renderCorporal(clubId, idJugador, mediciones);
}

/** NULL es "no se midió" y se muestra como tal; nunca como un cero. */
function celdaMedida(valor, unidad) {
  return valor == null ? '<span class="sin">sin medir</span>' : `${valor} ${unidad}`;
}

function renderCorporal(clubId, idJugador, mediciones) {
  const cont = $('ficha-corporal');
  if (!cont) return;
  const ordenadas = ordenarMediciones(mediciones);

  cont.innerHTML = `
    <div class="eyebrow">Mediciones <span class="der">${ordenadas.length}</span></div>
    ${ordenadas.length ? `
      <div class="tabla-corporal">
        <div class="fila-corporal cab"><div>Fecha</div><div>Altura</div><div>Peso</div><div></div></div>
        ${ordenadas.map((m) => `
          <div class="fila-corporal">
            <div class="f">${escaparHtml(formatearFechaCorta(m.fechaMedicion))}</div>
            <div>${celdaMedida(m.alturaCm, 'cm')}</div>
            <div>${celdaMedida(m.pesoKg, 'kg')}</div>
            <div><button class="borrar" data-borrar="${m.id}" aria-label="Borrar la medición del ${escaparHtml(m.fechaMedicion)}">&#10005;</button></div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="p">Todavía no tiene ninguna medición. Cargá la primera y a partir de la segunda vas a poder ver cuánto creció.</div>
    `}

    <div class="eyebrow">Agregar una medición</div>
    <div class="campo">
      <label for="in-fecha-medicion">Fecha</label>
      <input id="in-fecha-medicion" type="date" max="${hoyLocal()}" value="${hoyLocal()}">
    </div>
    <div class="campos-par">
      <div class="campo">
        <label for="in-altura">Altura (cm)</label>
        <input id="in-altura" type="text" inputmode="numeric" autocomplete="off" placeholder="—">
      </div>
      <div class="campo">
        <label for="in-peso">Peso (kg)</label>
        <input id="in-peso" type="text" inputmode="decimal" autocomplete="off" placeholder="—">
      </div>
    </div>
    <div class="ayuda">Se puede cargar sólo una de las dos. Altura entre ${ALTURA_MIN_CM} y ${ALTURA_MAX_CM} cm, peso entre ${PESO_MIN_KG} y ${PESO_MAX_KG} kg.</div>
    <div id="corporal-aviso"></div>
    <button class="btn" id="btn-agregar-medicion">Agregar medición</button>
  `;

  cont.querySelectorAll('[data-borrar]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (b.disabled) return;
      b.disabled = true;
      try {
        await borrarMedicionCorporal(clubId, b.dataset.borrar);
      } catch (e) {
        $('corporal-aviso').innerHTML = `<div class="al"><div class="tx">${
          esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos.' : 'No se pudo borrar la medición.'
        }</div></div>`;
        b.disabled = false;
        return;
      }
      await cargarCorporal(clubId, idJugador);
    });
  });

  $('btn-agregar-medicion').addEventListener('click', async () => {
    const boton = $('btn-agregar-medicion');
    if (boton.disabled) return;
    const aviso = $('corporal-aviso');

    const { ok, errores, valores } = validarMedicion({
      fechaMedicion: $('in-fecha-medicion').value,
      altura: $('in-altura').value,
      peso: $('in-peso').value,
    });
    if (!ok) {
      aviso.innerHTML = `<div class="al"><div class="tx">${escaparHtml(errores.join(' '))}</div></div>`;
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Agregando...';
    aviso.innerHTML = '';
    try {
      await crearMedicionCorporal({
        clubId,
        jugadorId: idJugador,
        fechaMedicion: valores.fechaMedicion,
        alturaCm: valores.alturaCm,
        pesoKg: valores.pesoKg,
      });
    } catch (e) {
      aviso.innerHTML = `<div class="al"><div class="tx">${
        e?.message === 'MEDICION_DUPLICADA'
          ? 'Ya hay una medición de este jugador en esa fecha. Borrá la que está o poné otra fecha.'
          : (esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo agregar la medición.')
      }</div></div>`;
      boton.disabled = false;
      boton.textContent = 'Agregar medición';
      return;
    }

    toast('Medición agregada');
    await cargarCorporal(clubId, idJugador);
  });
}
