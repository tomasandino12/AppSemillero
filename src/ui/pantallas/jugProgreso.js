import { obtenerMiProgreso } from '../../data/repositorio.js';
import {
  serieDeTiroDelJugador, ultimaBateriaConDatosDeJugador, historialDePartidosDelJugador,
  ejeComun, compararPorcentajes,
} from '../../data/estadisticas.js';
import { insumosDeEstadisticas, acumuladosDePartidos, progresionDePesos } from '../../data/progresoDelJugador.js';
import { formatearKg } from '../../data/escalones.js';
import { obtenerFichaJugador } from '../sesion.js';
import { cancha, grafico } from '../componentes/graficos.js';
import { variacionHtml } from '../componentes/variacion.js';
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

/** Sin gráfico de tendencia: con un intento por sesión y ~0,2 s de error de cronómetro, una línea mentiría. */
function seccionVelocidad(velocidad) {
  const medidas = velocidad.filter((v) => v.segundos != null).sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!medidas.length) {
    return html`<div class="eyebrow">Velocidad</div><div class="p">Todavía no te midieron la velocidad.</div>`;
  }
  return html`
    <div class="eyebrow">Velocidad</div>
    <div class="tabla-ev">
      ${medidas.map((v) => html`
        <div class="fila-ev dos">
          <div class="f">${formatearFechaCorta(v.fecha)}</div>
          <div>${v.segundos.toFixed(1)} s</div>
        </div>
      `)}
    </div>
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

function seccionPesos(ejercicios) {
  if (!ejercicios.length) {
    return html`<div class="eyebrow">Tus pesos</div><div class="p">Todavía no tenés pesos anotados.</div>`;
  }
  const cambio = (v) => (v == null ? '' : v === 0 ? 'sin cambio' : `${v > 0 ? '+' : '−'}${formatearKg(Math.abs(v))} kg`);
  return html`
    <div class="eyebrow">Tus pesos</div>
    ${ejercicios.map((e) => html`
      <div class="tarj">
        <div class="nom">${e.nombre}</div>
        <div class="det">${e.movimientos.slice(-6).map((m) => formatearKg(m.kg)).join(' → ')} kg</div>
        <div class="det">Ahora: ${formatearKg(e.actualKg)} kg${e.variacionKg == null ? '' : ` · ${cambio(e.variacionKg)} desde el primero`}</div>
      </div>
    `)}
  `;
}

export async function renderJugProgreso() {
  const ficha = obtenerFichaJugador();
  if (!ficha) return;
  contenedor().innerHTML = '<div class="pad"><div class="p">Cargando tu progreso…</div></div>';

  let progreso;
  try {
    progreso = await obtenerMiProgreso();
  } catch (e) {
    contenedor().innerHTML = `${avisoDeError(e, 'No se pudo cargar tu progreso.')}
      <div class="pad"><button class="btn sec" id="btn-reintentar-jug-progreso">Reintentar</button></div>`;
    $('btn-reintentar-jug-progreso').addEventListener('click', () => renderJugProgreso());
    return;
  }

  const vacio = !progreso.partidos.length && !progreso.tiro.length && !progreso.velocidad.length && !progreso.escalones.length;
  if (vacio) {
    contenedor().innerHTML = html`
      <div class="pad">
        <div class="estado-vacio">
          <h2>Todavía no hay nada para mostrar</h2>
          <div class="p">Cuando haya partidos, baterías de tiro, velocidad o pesos tuyos cargados, tu progreso aparece acá.</div>
        </div>
      </div>
    `;
    return;
  }

  const insumos = insumosDeEstadisticas(progreso, ficha.jugadorId);
  const bateria = ultimaBateriaConDatosDeJugador(insumos.sesiones, insumos.medicionesTiro, ficha.jugadorId);
  const series = serieDeTiroDelJugador(insumos);
  const historial = historialDePartidosDelJugador(insumos.partidos, insumos.estadisticas, ficha.jugadorId);

  contenedor().innerHTML = html`
    <div class="pad">
      ${seccionCancha(bateria)}
      ${seccionSerie('jug-triples', 'Tiro de tres', series.triples, 'Todavía no hay datos de triples, ni de práctica ni de partido.')}
      ${seccionSerie('jug-libres', 'Tiro libre', series.libres, 'Todavía no hay datos de libres, ni de práctica ni de partido.')}
      ${seccionPartidos(historial, acumuladosDePartidos(progreso.partidos))}
      ${seccionVelocidad(progreso.velocidad)}
      ${seccionPesos(progresionDePesos(progreso.escalones))}
    </div>
  `;

  // Los SVG se dibujan después de meter el HTML: recién ahí existen.
  if (bateria) cancha($('jug-cancha'), bateria.porPosicion);
  dibujarSerie('jug-triples', series.triples);
  dibujarSerie('jug-libres', series.libres);
}
