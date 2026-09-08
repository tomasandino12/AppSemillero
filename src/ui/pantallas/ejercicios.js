import { obtenerEjercicios } from '../../data/repositorio.js';
import { TEMAS, nombreDeTema } from '../../data/temas.js';
import { obtenerClubActual } from '../sesion.js';
import { escaparHtml, esErrorDeRed } from '../nav.js';
import { cargarPerfiles, nombreDe } from '../perfil.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('recursos-ejercicios');

let temaFiltro = null;              // null = todos
let abrirEjercicio = () => {};

/**
 * La Task 8 registra acá la apertura del detalle. Es inyección y no import
 * para no armar un ciclo: `ejercicio.js` sí importa de este archivo.
 */
export function setAbrirEjercicio(fn) { abrirEjercicio = fn; }

function estadoVacioHtml() {
  return `
    <div class="estado-vacio">
      <h2>La biblioteca está vacía</h2>
      <div class="p">Acá van los ejercicios del club, con lo que cada profe aprendió al usarlos. Lo que hoy se pierde no es el ejercicio —eso está en internet— sino qué pasó cuando lo probaste con estos chicos.</div>
      <div class="p">Cargar uno son dos campos: título y tema.</div>
      <div class="acciones"><button class="btn" id="btn-primer-ejercicio">Cargar el primero</button></div>
    </div>
  `;
}

function tarjetaEjercicio(e) {
  return `
    <button class="ejercicio" data-ejercicio="${e.id}">
      <div class="cab">
        <span class="tema">${escaparHtml(nombreDeTema(e.tema))}</span>
        ${e.tieneNotas ? '<span class="probado" title="Tiene notas de uso">✓ probado</span>' : ''}
      </div>
      <div class="tit">${escaparHtml(e.titulo)}</div>
      <div class="autor">${escaparHtml(nombreDe(e.creadoPor))}</div>
    </button>
  `;
}

/** Sólo los temas que efectivamente tienen ejercicios: nunca se muestra un chip vacío. */
function temasConEjercicios(ejercicios) {
  const presentes = new Set(ejercicios.map((e) => e.tema));
  return TEMAS.filter((t) => presentes.has(t.id));
}

function pintarListaEjercicios(ejercicios) {
  const temas = temasConEjercicios(ejercicios);
  const filtrados = temaFiltro == null ? ejercicios : ejercicios.filter((e) => e.tema === temaFiltro);

  contenedor().innerHTML = `
    <div class="pad">
      <div class="chips-tema">
        <button type="button" class="chip-tema ${temaFiltro === null ? 'on' : ''}" data-tema-filtro="">Todos</button>
        ${temas.map((t) => `<button type="button" class="chip-tema ${temaFiltro === t.id ? 'on' : ''}" data-tema-filtro="${t.id}">${escaparHtml(t.nombre)}</button>`).join('')}
      </div>
      <div id="ejercicios-lista">${filtrados.map(tarjetaEjercicio).join('')}</div>
    </div>
    <div class="pie-fijo"><button class="btn sec" id="btn-agregar-ejercicio">Cargar un ejercicio</button></div>
  `;

  contenedor().querySelectorAll('[data-tema-filtro]').forEach((chip) => {
    chip.addEventListener('click', () => {
      temaFiltro = chip.dataset.temaFiltro || null;
      pintarListaEjercicios(ejercicios);
    });
  });
  $('btn-agregar-ejercicio').addEventListener('click', () => abrirAltaEjercicio(null));
  contenedor().querySelectorAll('[data-ejercicio]').forEach((boton) => {
    boton.addEventListener('click', () => abrirEjercicio(boton.dataset.ejercicio));
  });
}

export async function renderSeccionEjercicios() {
  const club = obtenerClubActual();
  if (!club) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay un club seleccionado.</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p" id="ejercicios-estado">Cargando ejercicios...</div></div>`;

  let ejercicios;
  try {
    // cargarPerfiles junto con la lectura: sin nombres, el autor de cada
    // ejercicio sería un UUID. Mismo patrón que la pestaña Jugadores.
    [, ejercicios] = await Promise.all([
      cargarPerfiles(club.id),
      obtenerEjercicios(club.id),
    ]);
  } catch (e) {
    // Que falle la lectura no puede dejar la pantalla sin su acción principal:
    // mismo criterio que ya sigue la pestaña Jugadores (recursos.js).
    $('ejercicios-estado').outerHTML = `
      <div class="al"><div class="tx">${
        esErrorDeRed(e)
          ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
          : 'No se pudieron cargar los ejercicios.'
      }</div></div>
      <button class="btn sec" id="btn-reintentar-ejercicios">Reintentar</button>
    `;
    $('btn-reintentar-ejercicios').addEventListener('click', () => renderSeccionEjercicios());
    return;
  }

  if (!ejercicios.length) {
    contenedor().innerHTML = `<div class="pad">${estadoVacioHtml()}</div>`;
    $('btn-primer-ejercicio').addEventListener('click', () => abrirAltaEjercicio(null));
    return;
  }

  temaFiltro = null;
  pintarListaEjercicios(ejercicios);
}
