import { obtenerMiProgreso, obtenerMiPlan } from '../../data/repositorio.js';
import {
  serieDeTiroDelJugador, ultimaBateriaConDatosDeJugador, historialDePartidosDelJugador,
  ejeComun, compararPorcentajes,
} from '../../data/estadisticas.js';
import {
  insumosDeEstadisticas, acumuladosDePartidos, progresionDePesos, pesosPorBloque, bloquePorClaveDePlanes,
} from '../../data/progresoDelJugador.js';
import { sesionesDeSalto, TESTS_SALTO } from '../../data/salto.js';
import { obtenerFichaJugador } from '../sesion.js';
import { cancha, grafico } from '../componentes/graficos.js';
import { variacionHtml } from '../componentes/variacion.js';
import { tarjetasDePesosHtml, dibujarCurvasDePesos } from '../componentes/tarjetasDePesos.js';
import { html, crudo } from '../html.js';
import { formatearFechaCorta, textoPorcentaje } from '../nav.js';
import { avisoDeError } from '../errores.js';
import { $ } from '../dom.js';

const contenedor = () => $('jug-progreso-contenido');

/**
 * Mi progreso: el jugador contra sí mismo. Sin ranking, sin promedio del
 * plantel y sin nadie más en pantalla — mi_progreso() sólo le entrega lo suyo.
 * Todo porcentaje sale por textoPorcentaje: nunca sin sus intentos, y con el
 * aviso de "pocos datos" cuando la muestra es chica.
 */

/** El último punto de una fuente y la variación contra el anterior de la MISMA fuente. */
function resumenDeFuente(nombre, clase, serie) {
  if (!serie.length) return '';
  const ultimo = serie[serie.length - 1];
  const anterior = serie.length >= 2 ? serie[serie.length - 2] : null;
  return html`
    <div class="resumen-fuente">
      <span class="k ${clase}">${nombre} · ${formatearFechaCorta(ultimo.fecha)}</span>
      <span>${crudo(textoPorcentaje(ultimo.valor))}</span>
      ${anterior
        ? html`${crudo(variacionHtml(compararPorcentajes(ultimo.valor, anterior.valor)))} <span class="det">vs ${formatearFechaCorta(anterior.fecha)}</span>`
        : html`<span class="var neutra">Una sola medición: todavía no hay con qué comparar</span>`}
    </div>
  `;
}

function seccionSerie(id, titulo, serie, vacio) {
  if (!serie.practica.length && !serie.partido.length) {
    return html`<div class="eyebrow">${titulo}</div><div class="p">${vacio}</div>`;
  }
  return html`
    <div class="eyebrow">${titulo}</div>
    <svg class="g" id="${id}"></svg>
    <div class="resumen-serie">
      ${resumenDeFuente('Práctica', 'linea-practica', serie.practica)}
      ${resumenDeFuente('Partido', 'linea-partido', serie.partido)}
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
      { nombre: 'Práctica', c: '#131316', d: a.map((v) => v?.pct ?? null) },
      { nombre: 'Partido', c: '#D9122E', dash: true, d: b.map((v) => v?.pct ?? null) },
    ],
  });
}

function seccionCancha(bateria) {
  if (!bateria) {
    return html`<div class="eyebrow">Tiro por posición</div>
      <div class="p">Todavía no hiciste ninguna batería de tiro.</div>`;
  }
  return html`
    <div class="eyebrow">Tiro por posición <span class="der">${formatearFechaCorta(bateria.fecha)}</span></div>
    <div class="tarj">
      <svg class="g" id="jug-cancha"></svg>
      <div class="leyenda"><span>Práctica: 10 tiros por posición. El partido no dice desde dónde se tiró, así que no se superpone acá.</span></div>
    </div>
  `;
}

const NOMBRE_TEST_SALTO = { cmj: 'CMJ', abalakov: 'Abalakov' };

/**
 * Salto: altura del mejor intento de cada sesión, por test. Sin potencia (es
 * un número para el cuerpo técnico) y sin gráfico: ±2 cm de error por cuadro.
 */
function seccionSalto(saltos) {
  // mi_progreso trae los intentos ya agrupados; se aplanan para reusar la serie.
  const intentos = saltos.flatMap((s) => s.intentos.map((i) => ({
    sesionId: s.sesionId, fecha: s.fecha, testSalto: s.test, intento: i.intento, tiempoVueloMs: i.tiempoVueloMs,
  })));
  const sesiones = sesionesDeSalto(intentos, null).filter((s) => s.mejor);
  if (!sesiones.length) {
    return html`<div class="eyebrow">Salto</div><div class="p">Todavía no te midieron el salto.</div>`;
  }
  return html`
    <div class="eyebrow">Salto</div>
    ${TESTS_SALTO.map((test) => {
      const delTest = sesiones.filter((s) => s.testSalto === test);
      if (!delTest.length) return '';
      return html`
        <div class="det">${NOMBRE_TEST_SALTO[test]}</div>
        <div class="tabla-ev">
          ${delTest.map((s) => html`
            <div class="fila-ev dos">
              <div class="f">${formatearFechaCorta(s.fecha)}</div>
              <div>${s.mejor.alturaCm.toFixed(1).replace('.', ',')} cm</div>
            </div>
          `)}
        </div>
      `;
    })}
  `;
}

function seccionPartidos(historial, acumulados) {
  if (!historial.length) {
    return html`<div class="eyebrow">Partido a partido</div>
      <div class="p">Todavía no tenés ningún partido cargado.</div>`;
  }
  const a = acumulados;
  const puntos = a.sinDato.puntos ? `${a.puntos.total} pts (${a.sinDato.puntos} sin dato)` : `${a.puntos.total} pts`;
  return html`
    <div class="eyebrow">Partido a partido</div>
    <div class="tarj">
      <div class="nom">Lo que llevás en la temporada</div>
      <div class="det">${a.partidos} ${a.partidos === 1 ? 'partido' : 'partidos'} · ${puntos} · ${a.minutos.total}′</div>
      <div class="det">2P ${crudo(textoPorcentaje(a.dos))}</div>
      <div class="det">3P ${crudo(textoPorcentaje(a.tres))}</div>
      <div class="det">TL ${crudo(textoPorcentaje(a.libres))}</div>
    </div>
    <div class="tabla-part">
      ${historial.map((h) => html`
        <div class="fila-part">
          <div class="cab">
            <div class="riv">${h.rivalNombre ?? 'Rival sin nombre'}</div>
            <div class="f">${formatearFechaCorta(h.fecha)}</div>
          </div>
          <div class="nums">
            <span>${h.minSegundos == null ? crudo('<span class="sin">sin dato</span>') : `${Math.round(h.minSegundos / 60)}′`}</span>
            <span>${h.pts == null ? crudo('<span class="sin">sin dato</span>') : `${h.pts} pts`}</span>
          </div>
          <div class="tiros">
            <div>2P ${crudo(textoPorcentaje(h.dos))}</div>
            <div>3P ${crudo(textoPorcentaje(h.tres))}</div>
            <div>TL ${crudo(textoPorcentaje(h.libres))}</div>
          </div>
        </div>
      `)}
    </div>
  `;
}

function seccionPesos(grupos) {
  if (!grupos.length) {
    return html`<div class="eyebrow">Tus pesos</div><div class="p">Todavía no tenés pesos anotados.</div>`;
  }
  return html`
    <div class="eyebrow">Tus pesos</div>
    ${tarjetasDePesosHtml(grupos, 'jug-pesos')}
  `;
}

export async function renderJugProgreso() {
  const ficha = obtenerFichaJugador();
  if (!ficha) return;
  contenedor().innerHTML = '<div class="pad"><div class="p">Cargando tu progreso…</div></div>';

  let progreso;
  let plan = null;
  try {
    // El plan sólo aporta el bloque de cada ejercicio: si falla, los pesos se
    // muestran igual, todos en "Sin bloque", en vez de tirar abajo la pantalla.
    [progreso, plan] = await Promise.all([
      obtenerMiProgreso(),
      obtenerMiPlan().catch((e) => { console.error('No se pudo leer el plan para agrupar los pesos:', e); return null; }),
    ]);
  } catch (e) {
    contenedor().innerHTML = `${avisoDeError(e, 'No se pudo cargar tu progreso.')}
      <div class="pad"><button class="btn sec" id="btn-reintentar-jug-progreso">Reintentar</button></div>`;
    $('btn-reintentar-jug-progreso').addEventListener('click', () => renderJugProgreso());
    return;
  }

  const vacio = !progreso.partidos.length && !progreso.tiro.length && !progreso.saltos.length && !progreso.escalones.length;
  if (vacio) {
    contenedor().innerHTML = html`
      <div class="pad">
        <div class="estado-vacio">
          <h2>Todavía no hay nada para mostrar</h2>
          <div class="p">Cuando haya partidos, baterías de tiro, saltos o pesos tuyos cargados, tu progreso aparece acá.</div>
        </div>
      </div>
    `;
    return;
  }

  const insumos = insumosDeEstadisticas(progreso, ficha.jugadorId);
  const bateria = ultimaBateriaConDatosDeJugador(insumos.sesiones, insumos.medicionesTiro, ficha.jugadorId);
  const series = serieDeTiroDelJugador(insumos);
  const historial = historialDePartidosDelJugador(insumos.partidos, insumos.estadisticas, ficha.jugadorId);

  const bloques = bloquePorClaveDePlanes(plan?.planes);
  const pesos = pesosPorBloque(progresionDePesos(progreso.escalones, bloques), bloques);

  contenedor().innerHTML = html`
    <div class="pad">
      ${seccionCancha(bateria)}
      ${seccionSerie('jug-triples', 'Tiro de tres', series.triples, 'Todavía no hay datos de triples, ni de práctica ni de partido.')}
      ${seccionSerie('jug-libres', 'Tiro libre', series.libres, 'Todavía no hay datos de libres, ni de práctica ni de partido.')}
      ${seccionPartidos(historial, acumuladosDePartidos(progreso.partidos))}
      ${seccionSalto(progreso.saltos)}
      ${seccionPesos(pesos)}
    </div>
  `;

  // Los SVG se dibujan después de meter el HTML: recién ahí existen.
  if (bateria) cancha($('jug-cancha'), bateria.porPosicion);
  dibujarSerie('jug-triples', series.triples);
  dibujarSerie('jug-libres', series.libres);
  dibujarCurvasDePesos(pesos, 'jug-pesos');
}
