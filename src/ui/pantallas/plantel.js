import { obtenerJugadoresDelPlantel } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed } from '../nav.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('plantel-contenido');

let abrirAltaManual = () => {};
let abrirFicha = () => {};

/** Task 12 registra acá la apertura de la hoja de alta manual. */
export function setAbrirAltaManual(fn) {
  abrirAltaManual = fn;
}

/** Task 11 registra acá la apertura de la ficha de un jugador. */
export function setAbrirFicha(fn) {
  abrirFicha = fn;
}

export function iniciales(nombreLimpio) {
  const partes = nombreLimpio.split(',');
  const apellido = (partes[0] ?? '').trim();
  const nombre = (partes[1] ?? '').trim();
  return ((apellido[0] ?? '') + (nombre[0] ?? '')).toUpperCase() || '?';
}

/** NULL = "sin medir", nunca cero (Etapa 3, Decisión 8). */
export function textoMedicion(jugador) {
  const talla = jugador.tallaCm == null ? null : `${jugador.tallaCm} cm`;
  const peso = jugador.pesoKg == null ? null : `${jugador.pesoKg} kg`;
  if (talla == null && peso == null) return 'Sin medir';
  return [talla ?? 'talla sin medir', peso ?? 'peso sin medir'].join(' · ');
}

function filaJugador(j) {
  const sinMedir = j.tallaCm == null && j.pesoKg == null;
  return `
    <button class="jug" data-jugador="${j.id}">
      <div class="av">${escaparHtml(iniciales(j.nombreLimpio))}</div>
      <div>
        <div class="nom">${escaparHtml(j.nombreLimpio)}</div>
        <div class="det">${escaparHtml(textoMedicion(j))}</div>
      </div>
      <div class="der">
        ${sinMedir ? '<span class="chip sin">sin medir</span>' : ''}
        <span class="flecha">›</span>
      </div>
    </button>
  `;
}

function estadoVacioHtml(categoria) {
  return `
    <div class="estado-vacio">
      <h2>${escaparHtml(categoria)} todavía no tiene jugadores</h2>
      <div class="p">La forma más rápida de armar el plantel es cargar una planilla de la CABB: un partido suele traer entre el 70% y el 80% de los jugadores de una sola vez. Los que la CABB no trae, los agregás a mano.</div>
      <div class="acciones">
        <button class="btn" id="btn-vacio-importar">Cargar un partido de la CABB</button>
        <button class="btn sec" id="btn-vacio-manual">Agregar jugador a mano</button>
      </div>
    </div>
  `;
}

export async function renderPlantel() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p" id="plantel-estado">Cargando plantel...</div><div id="plantel-lista"></div></div>`;

  let jugadores;
  try {
    jugadores = await obtenerJugadoresDelPlantel(club.id, plantel.id);
  } catch (e) {
    $('plantel-estado').textContent = esErrorDeRed(e)
      ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
      : 'No se pudo cargar el plantel.';
    return;
  }

  if (!jugadores.length) {
    contenedor().innerHTML = `<div class="pad">${estadoVacioHtml(plantel.categoria)}</div>`;
    $('btn-vacio-importar').addEventListener('click', () => ir('p-datos'));
    $('btn-vacio-manual').addEventListener('click', () => abrirAltaManual());
    return;
  }

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">${escaparHtml(plantel.categoria)} <span class="der">${jugadores.length} jugador${jugadores.length === 1 ? '' : 'es'}</span></div>
      <div class="lista-2col" id="plantel-lista">${jugadores.map(filaJugador).join('')}</div>
    </div>
    <div class="pie-fijo"><button class="btn sec" id="btn-agregar-jugador">Agregar jugador a mano</button></div>
  `;
  $('btn-agregar-jugador').addEventListener('click', () => abrirAltaManual());
  contenedor().querySelectorAll('[data-jugador]').forEach((boton) => {
    boton.addEventListener('click', () => abrirFicha(boton.dataset.jugador));
  });
}
