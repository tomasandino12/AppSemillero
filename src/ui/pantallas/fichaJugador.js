import {
  obtenerJugadoresDelPlantel, obtenerPertenenciasDeJugador,
  obtenerSesionesDeMedicion, obtenerMedicionesTiroDelPlantel,
  obtenerMedicionesSaltoDelPlantel, obtenerMedicionesSprintDelPlantel,
  obtenerEstadisticasDelPlantel, obtenerPartidosDelPlantel, obtenerEnviosDeJugador,
  obtenerMedicionesCorporalesDeJugador, crearMedicionCorporal, borrarMedicionCorporal,
  actualizarFechaNacimiento, obtenerCargasDelPlantel, sacarDelPlantel,
} from '../../data/repositorio.js';
import {
  serieDeTiroDelJugador, ultimaBateriaDeJugador, ultimaBateriaConDatosDeJugador, historialDePartidosDelJugador,
  ejeComun, compararPorcentajes,
} from '../../data/estadisticas.js';
import {
  sesionesDeSalto, ultimaYAnteriores, potenciaPrincipal, TESTS_SALTO,
} from '../../data/salto.js';
import { sesionesDeSprint } from '../../data/sprint.js';
import { progresionDePesos, pesosPorBloque, pesosDeMovimientos } from '../../data/progresoDelJugador.js';
import {
  edadEnAnios, hoyLocal, ordenarMediciones, vigentePorCampo, validarMedicion, validarFechaNacimiento,
} from '../../data/antropometria.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed, textoPorcentaje, formatearFechaCorta, toast } from '../nav.js';
import { ir, volver } from '../main.js';
import { cancha, grafico } from '../componentes/graficos.js';
import { variacionHtml } from '../componentes/variacion.js';
import { verDetallesHtml } from '../componentes/verDetalles.js';
import { tarjetasDePesosHtml, dibujarCurvasDePesos } from '../componentes/tarjetasDePesos.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { botonIcono, ICONO } from '../componentes/iconos.js';
import { abrirGuiaSalto } from '../componentes/guiaSalto.js';
import { seccionSprint } from '../componentes/seccionSprint.js';
import { abrirProtocoloCorporal } from '../componentes/protocoloCorporal.js';
import { html, crudo } from '../html.js';
import { $ } from '../dom.js';
import { avisoDeError, textoDeError, mensajeAlGuardar } from '../errores.js';
import { renderAccesoDeJugador } from './aprobarJugador.js';

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

/**
 * El último punto de una fuente, siempre visible: fecha, porcentaje con su
 * fracción, y la variación contra el punto anterior de la MISMA fuente.
 *
 * La variación va aunque casi siempre diga "sin diferencia clara": una batería
 * individual son ~50 tiros de arco y ~10 libres, así que el margen es ancho. El
 * número se muestra igual; la afirmación no se hace. Es la misma regla que el
 * Panorama, y el día que un jugador acumule una diferencia real, se ve.
 */
function resumenDeFuente(nombre, clase, serie) {
  if (!serie.length) return '';
  const ultimo = serie[serie.length - 1];
  const anterior = serie.length >= 2 ? serie[serie.length - 2] : null;
  return `
    <div class="resumen-fuente">
      <span class="k ${clase}">${nombre} · ${escaparHtml(formatearFechaCorta(ultimo.fecha))}</span>
      <span>${textoPorcentaje(ultimo.valor)}</span>
      ${anterior
        ? `${variacionHtml(compararPorcentajes(ultimo.valor, anterior.valor))} <span class="det">vs ${escaparHtml(formatearFechaCorta(anterior.fecha))}</span>`
        : '<span class="var neutra">Una sola medición: todavía no hay con qué comparar</span>'}
    </div>
  `;
}

/**
 * Gráfico y último dato a la vista; el historial fecha por fecha, detrás de
 * "Ver detalles" (el mismo componente que usa el Panorama). Antes las dos
 * tablas estaban siempre desplegadas, y el encabezado "Práctica" de la primera
 * caía justo debajo de la leyenda del gráfico: se leía repetido.
 */
function bloqueDeSerie(id, titulo, serie, ayuda) {
  const total = serie.practica.length + serie.partido.length;
  if (total === 0) {
    return `<div class="eyebrow">${titulo}</div><div class="p">${ayuda}</div>`;
  }
  // Más reciente primero, igual que el resto de las tablas de la ficha
  // (partidos, salto).
  const tabla = (s) => (s.length ? `<div class="tabla-ev">${[...s].reverse().map(filaDePunto).join('')}</div>` : '');
  return `
    <div class="eyebrow">${titulo}</div>
    <svg class="g" id="${id}"></svg>
    <!-- Sin leyenda aparte: cada línea del resumen lleva la marca de su curva
         (raya llena para práctica, punteada roja para partido) y dice el
         nombre una sola vez. Con leyenda arriba, "Práctica" aparecía dos
         veces seguidas debajo del gráfico. -->
    <div class="resumen-serie">
      ${resumenDeFuente('Práctica', 'linea-practica', serie.practica)}
      ${resumenDeFuente('Partido', 'linea-partido', serie.partido)}
    </div>
    ${verDetallesHtml(titulo, [
      { nombre: 'Práctica', html: tabla(serie.practica) },
      { nombre: 'Partido', html: tabla(serie.partido) },
    ])}
  `;
}

function dibujarSerie(id, serie) {
  const svg = document.getElementById(id);
  if (!svg) return;
  // ejeComun vive en estadisticas.js y devuelve el objeto valor completo; la
  // ficha dibuja sólo el porcentaje, igual que antes de moverla.
  const { fechas, a, b } = ejeComun(serie.practica, serie.partido);
  grafico(svg, {
    etiquetas: fechas.map(formatearFechaCorta),
    series: [
      { nombre: 'Práctica', c: '#131316', d: a.map((v) => v?.pct ?? null) },
      { nombre: 'Partido', c: '#D9122E', dash: true, d: b.map((v) => v?.pct ?? null) },
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

const NOMBRE_TEST_SALTO = { cmj: 'CMJ', abalakov: 'Abalakov' };

const decimalEs = (n, dec = 1) => n.toFixed(dec).replace('.', ',');

/**
 * Salto: la última sesión de cada test en una tarjeta (CMJ y Abalakov no se
 * comparan entre sí) y las anteriores en una lista corta, sin barras ni
 * flechas: el error de un cuadro son ±2 cm y una diferencia de ese tamaño no
 * es una mejora. La potencia sólo sale si hay peso y largos de pierna
 * vigentes a esa fecha; si no, la cifra héroe es la altura y se dice qué falta.
 */
function tarjetaSalto(s, chica) {
  const m = s.mejor;
  const principal = potenciaPrincipal(m);
  const etiqueta = { pico: 'Potencia pico', media: 'Potencia media' };
  // Con el pico como cifra, la media sale aparte (si hay piernas); y viceversa no hace falta.
  const mediaAparte = principal?.tipo === 'pico' && m.potenciaWKg != null;
  const faltaMedia = principal?.tipo === 'pico' && m.potenciaWKg == null;
  return html`
    <div class="tarj salto-tarj${chica ? ' chica' : ''}">
      <div class="det">${formatearFechaCorta(s.fecha)}</div>
      <div class="cifra-clave">${principal ? decimalEs(principal.wKg) : decimalEs(m.alturaCm)}<span class="u">${principal ? 'W/kg' : 'cm'}</span></div>
      <span class="etq">${principal ? etiqueta[principal.tipo] : 'Altura'}</span>
      <div class="salto-datos">
        ${principal ? html`<span>${decimalEs(m.alturaCm)} cm</span>` : ''}
        <span>${decimalEs(m.tiempoVueloMs / 1000, 2)} s en el aire</span>
        ${principal ? html`<span>${Math.round(principal.w)} W</span>` : ''}
        ${mediaAparte ? html`<span>media ${decimalEs(m.potenciaWKg)} W/kg</span>` : ''}
      </div>
      ${principal && !faltaMedia ? '' : html`<div class="det sin">${faltaMedia ? 'Sin potencia media: faltan las medidas de pierna.' : 'Sin potencia: falta el peso o las medidas de pierna.'} <button type="button" class="btn chico sec" data-como-medir>¿Cómo medirlas?</button></div>`}
      ${s.intentos.length > 1 && s.rangoCm != null
        ? html`<div class="det">${s.intentos.length} intentos · ${decimalEs(s.rangoCm)} cm entre el mejor y el peor</div>`
        : ''}
    </div>
  `;
}

function filaSaltoAnterior(s) {
  if (!s.mejor) {
    return html`<div class="fila-ev tres"><div class="f">${formatearFechaCorta(s.fecha)}</div><div class="sin">Ausente</div><div></div></div>`;
  }
  return html`
    <div class="fila-ev tres">
      <div class="f">${formatearFechaCorta(s.fecha)}</div>
      <div>${decimalEs(s.mejor.alturaCm)} cm</div>
      <div>${potenciaPrincipal(s.mejor) == null
    ? crudo('<span class="sin">sin potencia</span>')
    : `${decimalEs(potenciaPrincipal(s.mejor).wKg)} W/kg`}</div>
    </div>
  `;
}

function seccionSalto(sesiones) {
  if (!sesiones.length) {
    return html`<div class="eyebrow">Salto</div><div class="p">Sin medir.</div>`;
  }
  const bloques = TESTS_SALTO.map((test) => {
    const r = ultimaYAnteriores(sesiones, test);
    if (!r) return '';
    return html`
      <div class="det">${NOMBRE_TEST_SALTO[test]}</div>
      ${tarjetaSalto(r.ultima, test !== 'cmj')}
      ${r.anteriores.length ? html`<div class="tabla-ev">${r.anteriores.map(filaSaltoAnterior)}</div>` : ''}
    `;
  });
  return html`
    <div class="eyebrow">Salto <button type="button" class="btn chico sec" id="btn-guia-salto">¿Cómo interpretarlo?</button></div>
    ${bloques}
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
    contenedor().innerHTML = avisoDeError(e, 'No se pudo cargar el jugador.');
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
      <div class="ficha-top-cab">
        <div class="datos-ficha" id="ficha-cabecera-datos">
          ${dato('Edad', edadEnAnios(jugador.fechaNacimiento), 'años')}
        </div>
        ${botonIcono({ id: 'btn-ficha-nacimiento', icono: ICONO.lapiz, etiqueta: 'Editar fecha de nacimiento' })}
      </div>
      <button class="btn sec chico" id="btn-ficha-sacar">Sacar del plantel</button>
    </div>
    <div class="pad" id="ficha-acceso"></div>
    <div class="pad" id="ficha-corporal"><div class="p">Cargando mediciones...</div></div>
    <div class="pad" id="ficha-historia"><div class="p">Cargando historia del jugador...</div></div>
    <div class="pad" id="ficha-cargas"></div>
  `;

  $('btn-ficha-nacimiento').addEventListener('click', () => abrirEditarNacimiento(jugador));
  $('btn-ficha-sacar').addEventListener('click', () => abrirSacarDelPlantel(club, plantel, jugador));
  renderAccesoDeJugador(jugador);
  cargarCorporal(club.id, jugador.id);
  cargarCargas(club.id, plantel.id, jugador.id);

  // Todo lo de acá abajo va en su propio try/catch: los datos básicos ya
  // están pintados arriba, así que un error de red trayendo la historia no
  // puede dejar la ficha entera en blanco.
  try {
    const [sesiones, medicionesTiro, saltos, sprints, corporales, partidos, estadisticas, envios] = await Promise.all([
      obtenerSesionesDeMedicion(club.id, plantel.id),
      obtenerMedicionesTiroDelPlantel(club.id, plantel.id),
      obtenerMedicionesSaltoDelPlantel(club.id, plantel.id),
      obtenerMedicionesSprintDelPlantel(club.id, plantel.id),
      obtenerMedicionesCorporalesDeJugador(club.id, jugadorId),
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
    const sesionesDeSaltoDelJugador = sesionesDeSalto(saltos.filter((x) => x.jugadorId === jugadorId), corporales);

    $('ficha-historia').innerHTML = `
      ${seccionCancha(bateria, bateriaConDatos)}
      ${bloqueDeSerie('ficha-triples', 'Tiro de tres', series.triples, 'Todavía no hay datos de triples, ni de práctica ni de partido.')}
      ${bloqueDeSerie('ficha-libres', 'Tiro libre', series.libres, 'Todavía no hay datos de libres, ni de práctica ni de partido.')}
      ${seccionPartidos(historial)}
      ${seccionSalto(sesionesDeSaltoDelJugador)}
      ${seccionSprint(sesionesDeSprint(sprints.filter((x) => x.jugadorId === jugadorId)))}
      ${seccionRecursos(envios)}
    `;

    // Los SVG se dibujan después de meter el HTML en el DOM: recién ahí
    // existen los elementos. cancha() sólo se llama si seccionCancha() dibujó
    // el <svg> (bateriaConDatos no nula); dibujarSerie ya se cuida sola de eso.
    if (bateriaConDatos) cancha($('ficha-cancha'), bateriaConDatos.porPosicion);
    dibujarSerie('ficha-triples', series.triples);
    dibujarSerie('ficha-libres', series.libres);
    $('btn-guia-salto')?.addEventListener('click', () => abrirGuiaSalto(club));
    $('ficha-historia').querySelectorAll('[data-como-medir]').forEach((b) => b.addEventListener('click', () => abrirProtocoloCorporal(club)));
  } catch (e) {
    $('ficha-historia').innerHTML = `<div class="al"><div class="tx">${
      textoDeError(e, 'No se pudo cargar la historia del jugador.')
    }</div></div>`;
  }
}

/* ---------- Datos personales: fecha de nacimiento ---------- */

/**
 * Se pide al chico cuando pide acceso a la app (0041) y el profe la revisa al
 * aprobarlo; esto es sólo para corregirla después (typeo, o un jugador que
 * entró por planilla CABB y nunca pasó por esa pantalla). Un campo de fecha
 * siempre abierto ocupaba lugar para algo que se carga una vez en la vida y
 * no cambia nunca — un lápiz al lado de la edad, como en Renombrar jugada,
 * alcanza.
 */
function abrirEditarNacimiento(jugador) {
  abrirHoja({
    titulo: 'Fecha de nacimiento',
    cuerpo: `
      <div class="campo">
        <label for="in-nacimiento">Fecha de nacimiento</label>
        <input id="in-nacimiento" type="date" max="${hoyLocal()}" value="${escaparHtml(jugador.fechaNacimiento ?? '')}">
        <div class="ayuda">Vacía significa "no se sabe". Sin ella no se puede saber si una mejora es progreso o es crecimiento.</div>
      </div>
      <div id="nacimiento-aviso"></div>
      <button class="btn" id="btn-guardar-nacimiento">Guardar</button>
    `,
  });
  $('in-nacimiento').focus();

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
        textoDeError(e, 'No se pudo guardar la fecha.')
      }</div></div>`;
      boton.disabled = false;
      boton.textContent = 'Guardar';
      return;
    }

    jugador.fechaNacimiento = valor;
    const cabecera = $('ficha-cabecera-datos');
    if (cabecera) cabecera.innerHTML = dato('Edad', edadEnAnios(valor), 'años');
    cerrarHoja();
    toast(valor ? 'Fecha de nacimiento guardada' : 'Fecha de nacimiento borrada');
  });
}

/* ---------- Sacar del plantel ---------- */

/**
 * Cierra la pertenencia vigente (0040): el jugador deja de aparecer en este
 * plantel, pero ni la ficha ni su historia se borran. Confirmación por lo
 * mismo que Dar de baja a un profe: es lo que más duele si fue un dedazo.
 */
function abrirSacarDelPlantel(club, plantel, jugador) {
  abrirHoja({
    titulo: `Sacar a ${jugador.nombreLimpio} de ${plantel.categoria}`,
    cuerpo: `
      <div class="p">${escaparHtml(jugador.nombreLimpio)} deja de aparecer en ${escaparHtml(plantel.categoria)} desde ahora. Su ficha y su historia no se borran: si vuelve, se lo suma de nuevo desde "Agregar jugador a mano".</div>
      <div id="sacar-aviso"></div>
      <div class="acciones">
        <button class="btn" id="btn-confirmar-sacar">Sacar del plantel</button>
        <button class="btn sec" id="btn-cancelar-sacar">Cancelar</button>
      </div>
    `,
  });
  $('btn-cancelar-sacar').addEventListener('click', () => cerrarHoja());
  $('btn-confirmar-sacar').addEventListener('click', async () => {
    const boton = $('btn-confirmar-sacar');
    if (boton.disabled) return;
    boton.disabled = true;
    try {
      await sacarDelPlantel(club.id, jugador.id, plantel.id);
    } catch (e) {
      $('sacar-aviso').innerHTML = `<div class="al"><div class="tx">${
        mensajeAlGuardar(e, { generico: 'No se pudo sacar al jugador.' })
      }</div></div>`;
      boton.disabled = false;
      return;
    }
    cerrarHoja();
    toast(`${jugador.nombreLimpio} ya no está en ${plantel.categoria}`);
    await volver();
  });
}

/* ---------- Cargas: cómo se movió su peso en cada ejercicio ---------- */

/**
 * Los pesos de este chico, un desplegable por bloque del plan. Va aparte de la
 * historia: si falla, el resto de la ficha sigue. Sin pesos anotados no se
 * dibuja nada (ni siquiera el título): el profe que no usa FÍSICO no ve ruido.
 */
async function cargarCargas(clubId, plantelId, idJugador) {
  const cont = $('ficha-cargas');
  if (!cont) return;
  let grupos;
  let bloques;
  try {
    const { movimientos, ejercicios } = await obtenerCargasDelPlantel(clubId, plantelId, [idJugador]);
    const pesos = pesosDeMovimientos(movimientos, ejercicios);
    bloques = pesos.bloquePorClave;
    grupos = pesosPorBloque(progresionDePesos(pesos.escalones, bloques), bloques);
  } catch (e) {
    console.error('No se pudieron cargar los pesos del jugador:', e);
    cont.innerHTML = html`<div class="eyebrow">Cargas</div><div class="p">No se pudieron cargar los pesos.</div>`;
    return;
  }
  // La ficha pudo cambiar de jugador mientras esto cargaba.
  if (idJugador !== jugadorId || !$('ficha-cargas')) return;
  if (!grupos.length) return;
  cont.innerHTML = html`<div class="eyebrow">Cargas</div>${tarjetasDePesosHtml(grupos, 'ficha-pesos')}`;
  dibujarCurvasDePesos(grupos, 'ficha-pesos');
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
        textoDeError(e, 'No se pudieron cargar las mediciones.')
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
  return valor == null
    ? '<span class="sin" title="sin medir" aria-label="sin medir">—</span>'
    : `${valor}<span class="u"> ${unidad}</span>`;
}

const MEDIDAS_VIGENTES = [
  ['alturaCm', 'Altura', 'cm'], ['pesoKg', 'Peso', 'kg'],
  ['piernaCm', 'Pierna ext.', 'cm'], ['piernaFlexionadaCm', 'Pierna flex.', 'cm'],
];

/**
 * Lo último que se cargó de cada medida. Si no es de la medición más reciente
 * se le pone su fecha: el peso no se toma en cada visita y no tiene que
 * desaparecer por eso.
 */
function vigentesHtml(ordenadas) {
  if (!ordenadas.length) return '';
  const vigente = vigentePorCampo(ordenadas);
  const ultimaFecha = ordenadas[0].fechaMedicion;
  return html`
    <div class="eyebrow">Último dato de cada medida</div>
    <div class="vigentes">
      ${MEDIDAS_VIGENTES.map(([campo, nombre, unidad]) => {
        const v = vigente[campo];
        return html`<div class="vigente"><div class="k">${nombre}</div>
          <div class="v">${v ? crudo(celdaMedida(v.valor, unidad)) : crudo(celdaMedida(null, unidad))}</div>
          ${v && v.fechaMedicion !== ultimaFecha ? html`<div class="d">${formatearFechaCorta(v.fechaMedicion)}</div>` : ''}</div>`;
      })}
    </div>`;
}

function renderCorporal(clubId, idJugador, mediciones) {
  const cont = $('ficha-corporal');
  if (!cont) return;
  const ordenadas = ordenarMediciones(mediciones);

  cont.innerHTML = `
    ${vigentesHtml(ordenadas)}
    <div class="eyebrow">Mediciones <span class="der">${ordenadas.length}</span></div>
    ${ordenadas.length ? `
      <div class="tabla-corporal">
        <div class="fila-corporal cab"><div>Fecha</div><div>Altura</div><div>Peso</div><div>Pierna ext.</div><div>Pierna flex.</div><div></div></div>
        ${ordenadas.map((m) => `
          <div class="fila-corporal">
            <div class="f">${escaparHtml(formatearFechaCorta(m.fechaMedicion))}</div>
            <div>${celdaMedida(m.alturaCm, 'cm')}</div>
            <div>${celdaMedida(m.pesoKg, 'kg')}</div>
            <div>${celdaMedida(m.piernaCm, 'cm')}</div>
            <div>${celdaMedida(m.piernaFlexionadaCm, 'cm')}</div>
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
    <div class="campos-par">
      <div class="campo">
        <label for="in-pierna">Pierna extendida (cm)</label>
        <input id="in-pierna" type="text" inputmode="decimal" autocomplete="off" placeholder="—">
      </div>
      <div class="campo">
        <label for="in-pierna-flexionada">Pierna flexionada (cm)</label>
        <input id="in-pierna-flexionada" type="text" inputmode="decimal" autocomplete="off" placeholder="—">
      </div>
    </div>
    <div class="aviso-corporal">
      <span>No hace falta cargar todas las medidas en cada medición.</span>
      <button type="button" class="btn chico sec" id="btn-como-medir">¿Cómo medir?</button>
    </div>
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

  $('btn-como-medir').addEventListener('click', () => abrirProtocoloCorporal(obtenerClubActual()));

  $('btn-agregar-medicion').addEventListener('click', async () => {
    const boton = $('btn-agregar-medicion');
    if (boton.disabled) return;
    const aviso = $('corporal-aviso');

    const { ok, errores, valores } = validarMedicion({
      fechaMedicion: $('in-fecha-medicion').value,
      altura: $('in-altura').value,
      peso: $('in-peso').value,
      pierna: $('in-pierna').value,
      piernaFlexionada: $('in-pierna-flexionada').value,
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
        piernaCm: valores.piernaCm,
        piernaFlexionadaCm: valores.piernaFlexionadaCm,
      });
    } catch (e) {
      aviso.innerHTML = `<div class="al"><div class="tx">${
        e?.message === 'MEDICION_DUPLICADA'
          ? 'Ya hay una medición de este jugador en esa fecha. Borrá la que está o poné otra fecha.'
          : (textoDeError(e, 'No se pudo agregar la medición.'))
      }</div></div>`;
      boton.disabled = false;
      boton.textContent = 'Agregar medición';
      return;
    }

    toast('Medición agregada');
    await cargarCorporal(clubId, idJugador);
  });
}
