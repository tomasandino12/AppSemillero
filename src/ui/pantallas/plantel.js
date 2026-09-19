import { obtenerJugadoresDelPlantel, obtenerMedicionesCorporalesDelClub } from '../../data/repositorio.js';
import { ultimaMedicionPorJugador } from '../../data/antropometria.js';
import { obtenerClubActual, obtenerPlantelActivo, obtenerPlanteles } from '../sesion.js';
import { escaparHtml } from '../nav.js';
import { ir } from '../main.js';
import { $ } from '../dom.js';
import { textoDeError } from '../errores.js';

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
export function textoMedicion(medicion) {
  if (medicion == null) return 'Sin medir';
  const altura = medicion.alturaCm == null ? null : `${medicion.alturaCm} cm`;
  const peso = medicion.pesoKg == null ? null : `${medicion.pesoKg} kg`;
  if (altura == null && peso == null) return 'Sin medir';
  return [altura ?? 'altura sin medir', peso ?? 'peso sin medir'].join(' · ');
}

function filaJugador(j, medicion) {
  const sinMedir = medicion == null || (medicion.alturaCm == null && medicion.pesoKg == null);
  return `
    <button class="jug" data-jugador="${j.id}">
      <div class="av">${escaparHtml(iniciales(j.nombreLimpio))}</div>
      <div>
        <div class="nom">${escaparHtml(j.nombreLimpio)}</div>
        <div class="det">${escaparHtml(textoMedicion(medicion))}</div>
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
    // Sin ninguna categoría no es "no elegiste": es que todavía no le
    // asignaron. Decírselo evita que piense que la app está rota.
    const mensaje = obtenerPlanteles().length === 0
      ? 'Todavía no tenés categorías asignadas. Pedíselas al coordinador del club.'
      : 'No hay una categoría seleccionada.';
    contenedor().innerHTML = `<div class="pad"><div class="p">${mensaje}</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p" id="plantel-estado">Cargando plantel...</div><div id="plantel-lista"></div></div>`;

  let jugadores;
  let mediciones = [];
  try {
    // Las mediciones van juntas con el plantel para poder marcar quién está
    // sin medir. Si sólo fallara esta consulta la lista igual se dibuja: es
    // preferible un plantel sin el detalle de altura que ningún plantel.
    [jugadores, mediciones] = await Promise.all([
      obtenerJugadoresDelPlantel(club.id, plantel.id),
      obtenerMedicionesCorporalesDelClub(club.id).catch(() => []),
    ]);
  } catch (e) {
    $('plantel-estado').textContent = textoDeError(e, 'No se pudo cargar el plantel.');
    return;
  }

  if (!jugadores.length) {
    contenedor().innerHTML = `<div class="pad">${estadoVacioHtml(plantel.categoria)}</div>`;
    $('btn-vacio-importar').addEventListener('click', () => ir('p-datos'));
    $('btn-vacio-manual').addEventListener('click', () => abrirAltaManual());
    return;
  }

  const porJugador = ultimaMedicionPorJugador(mediciones);
  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">${escaparHtml(plantel.categoria)} <span class="der">${jugadores.length} jugador${jugadores.length === 1 ? '' : 'es'}</span></div>
      <div class="lista-2col" id="plantel-lista">${jugadores.map((j) => filaJugador(j, porJugador.get(j.id) ?? null)).join('')}</div>
    </div>
    <div class="pie-fijo"><button class="btn sec" id="btn-agregar-jugador">Agregar jugador a mano</button></div>
  `;
  $('btn-agregar-jugador').addEventListener('click', () => abrirAltaManual());
  contenedor().querySelectorAll('[data-jugador]').forEach((boton) => {
    boton.addEventListener('click', () => abrirFicha(boton.dataset.jugador));
  });
}
