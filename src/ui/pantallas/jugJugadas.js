/*
 * Jugadas asignadas al plantel del jugador (misJugadas(), 0035): agrupadas por
 * tipo, sin autor (la RPC ni siquiera lo devuelve) y con el visor a pantalla
 * completa, pensado para el celular.
 */
import { misJugadas } from '../../data/repositorio.js';
import {
  TIPOS_JUGADA, etiquetaDeTipo, estadoAlInicioDelPaso, nosotrosDefiende,
} from '../../data/jugadas.js';
import { dibujarPizarra } from '../componentes/pizarra.js';
import { montarVisor } from '../componentes/visorJugada.js';
import { html, crudo } from '../html.js';
import { avisoDeError } from '../errores.js';
import { $ } from '../dom.js';

const contenedor = () => $('jug-jugadas-contenido');

let visorActivo = null;

function cerrarVisorCompleto() {
  visorActivo?.desmontar();
  visorActivo = null;
  $('jug-visor-completo').hidden = true;
  $('jug-visor-completo-cuerpo').innerHTML = '';
}

function abrirVisorCompleto(jugada) {
  $('jug-visor-completo').hidden = false;
  visorActivo = montarVisor($('jug-visor-completo-cuerpo'), jugada.datos, nosotrosDefiende(jugada.tipo));
}

/** Se cablea una sola vez: el botón de cerrar vive siempre en el DOM (index.html), como #hoja. */
export function iniciarJugJugadas() {
  $('btn-jvc-cerrar').addEventListener('click', cerrarVisorCompleto);
}

function tarjetaJugada(j) {
  return html`
    <button type="button" class="rec-tarj jugada-tarj" data-jugada="${j.id}">
      <span class="rec-mini jugada-mini" aria-hidden="true"><svg class="pz"></svg></span>
      <span class="rec-cuerpo"><span class="t">${j.nombre}</span></span>
    </button>
  `;
}

function grupoDeJugadas(tipo, jugadas) {
  if (!jugadas.length) return html``;
  return html`
    <div class="eyebrow">${etiquetaDeTipo(tipo)}</div>
    <div class="rec-grilla">${jugadas.map(tarjetaJugada)}</div>
  `;
}

export async function renderJugJugadas() {
  contenedor().innerHTML = html`<div class="pad"><div class="p">Cargando tus jugadas...</div></div>`;

  let jugadas;
  try {
    jugadas = await misJugadas();
  } catch (e) {
    contenedor().innerHTML = html`
      <div class="pad">
        ${crudo(avisoDeError(e, 'No se pudieron cargar tus jugadas.'))}
        <button class="btn sec" id="btn-reintentar-jug-jugadas">Reintentar</button>
      </div>
    `;
    $('btn-reintentar-jug-jugadas').addEventListener('click', () => renderJugJugadas());
    return;
  }

  if (!jugadas.length) {
    contenedor().innerHTML = html`
      <div class="pad">
        <div class="estado-vacio">
          <h2>Tu profe todavía no te asignó jugadas</h2>
          <div class="p">Cuando te asigne una, va a aparecer acá agrupada por tipo.</div>
        </div>
      </div>
    `;
    return;
  }

  contenedor().innerHTML = html`
    <div class="pad">
      ${TIPOS_JUGADA.map((t) => grupoDeJugadas(t.clave, jugadas.filter((j) => j.tipo === t.clave)))}
    </div>
  `;
  contenedor().querySelectorAll('[data-jugada]').forEach((el) => {
    const jugada = jugadas.find((j) => j.id === el.dataset.jugada);
    if (!jugada) return;
    dibujarPizarra(el.querySelector('svg.pz'), jugada.datos, estadoAlInicioDelPaso(jugada.datos, 0), { nosotrosDefiende: nosotrosDefiende(jugada.tipo) });
    el.addEventListener('click', () => abrirVisorCompleto(jugada));
  });
}
