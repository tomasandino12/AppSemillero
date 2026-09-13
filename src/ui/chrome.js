import {
  obtenerClubActual, obtenerPlanteles, obtenerPlantelActivo, setPlantelActivoId,
  obtenerModo, obtenerRoles, obtenerCuenta,
} from './sesion.js';
import { escaparHtml } from './nav.js';
import { inicialesDeNombre } from '../data/cuenta.js';

const $ = (id) => document.getElementById(id);

const ICONOS = {
  hoy: '<path d="M4 13h5v7H4zM10 8h5v12h-5zM16 4h4v16h-4z"/>',
  plantel: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 8.5a3 3 0 100-5"/><path d="M17.5 14.5c2 .7 3.5 2.6 3.5 5.5"/>',
  medir: '<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="18" cy="17" r="2.5"/>',
  recursos: '<path d="M4 5h16v14H4z"/><path d="M10 9l5 3-5 3z"/>',
  datos: '<path d="M3 17l5-6 4 4 4-7 5 5"/><path d="M3 21h18"/>',
  persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
};

// El escudo real del club. Hasta acá era un pentágono rojo dibujado con
// clip-path y las letras NOB encima: una marca genérica, no el escudo de
// Newell's. El archivo es el mismo que usa el favicon. Va dentro de un botón
// que lleva al inicio, así que el nombre lo dice el botón y no la imagen.
const ESCUDO = `<img class="escudo" src="/public/escudo.png" alt="">`;

// Orden de la navegación. PLANTEL primero después de HOY, igual que el
// prototipo; el landing por defecto es PLANTEL (ver main.js).
export const TABS = [
  { id: 'p-hoy', texto: 'Hoy', icono: ICONOS.hoy },
  { id: 'p-plantel', texto: 'Plantel', icono: ICONOS.plantel },
  { id: 'p-medir', texto: 'Medir', icono: ICONOS.medir },
  { id: 'p-recursos', texto: 'Recursos', icono: ICONOS.recursos },
  { id: 'p-datos', texto: 'Datos', icono: ICONOS.datos },
];

// Coordinación: dos pestañas y ningún chip de categoría. No hay "categoría
// activa" porque el coordinador no entra a ninguna.
export const TABS_COORDINACION = [
  { id: 'p-coord-panorama', texto: 'Panorama', icono: ICONOS.datos },
  { id: 'p-coord-profes', texto: 'Profes', icono: ICONOS.plantel },
];

export const PANTALLA_PERFIL = 'p-mi-perfil';

/** Entrenando arranca en PLANTEL; coordinando, en el Panorama. */
export function pantallaInicialDelModo() {
  return obtenerModo() === 'coordinar' ? TABS_COORDINACION[0].id : TABS[1].id;
}

/**
 * A dónde lleva el escudo: HOY. Coordinando, al Panorama: HOY es el resumen
 * de una categoría, y coordinación no entra a ninguna.
 */
export function pantallaDeInicio() {
  return obtenerModo() === 'coordinar' ? TABS_COORDINACION[0].id : TABS[0].id;
}

let alTocarTab = () => {};
let alElegirPlantel = () => {};
let alVolver = () => {};
let alIrAlInicio = () => {};
let alAbrirPerfil = () => {};
let alCambiarModo = () => {};

export function iniciarChrome({ onTab, onPlantel, onVolver, onInicio, onPerfil, onModo }) {
  alTocarTab = onTab;
  alElegirPlantel = onPlantel;
  alVolver = onVolver;
  alIrAlInicio = onInicio ?? (() => {});
  alAbrirPerfil = onPerfil ?? (() => {});
  alCambiarModo = onModo ?? (() => {});
}

/**
 * Dibuja cabecera, selector de categoría y navegación.
 *
 * El botón de volver vive SOLO acá, en el chrome — el router nunca inyecta
 * botones de volver dentro del contenido de una pantalla (invariante de
 * navegación del spec, Decisión 8). Lo mismo el escudo (al inicio), el cambio
 * de modo y Mi perfil: se llega desde cualquier pantalla y ninguna los repite.
 * Cerrar sesión vive en Mi perfil: con el escudo, volver, modo y perfil, un
 * quinto botón no entra en la cabecera a 375px.
 */
export function renderChrome({ pantallaId, titulo, mostrarAtras }) {
  const cabecera = $('cabecera');
  const cats = $('cats');
  const nav = $('nav');

  const club = obtenerClubActual();
  const roles = obtenerRoles();
  const coordinando = obtenerModo() === 'coordinar';
  const iniciales = inicialesDeNombre(obtenerCuenta()?.nombre ?? '');

  const atras = mostrarAtras
    ? `<button class="atras" id="btn-atras" aria-label="Volver">&lsaquo;</button>`
    : '';
  // Sólo quien tiene los dos roles cambia de modo.
  const botonModo = roles.esEntrenador && roles.esCoordinador
    ? `<button class="salir modo" id="btn-modo">${coordinando ? 'Entrenar' : 'Coordinar'}</button>`
    : '';
  // Sin nombre cargado (cuentas anteriores a 0019) va el ícono de persona.
  const contenidoPerfil = iniciales
    ? escaparHtml(iniciales)
    : `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONOS.persona}</svg>`;

  // El escudo es marca, no un control compuesto: siempre el mismo elemento en
  // el mismo lugar, y nunca con la flecha de volver al lado. Volver vive en
  // el bloque de la pantalla actual, en un lugar reservado aunque no haya
  // flecha: así el título arranca siempre en la misma posición.
  // En escritorio este escudo se oculta y aparece arriba de la navegación
  // lateral (ver más abajo y layout.css).
  cabecera.innerHTML = `
    <button class="inicio" id="btn-inicio" aria-label="Ir al inicio">${ESCUDO}</button>
    <div class="pantalla-actual">
      <span class="lugar-volver">${atras}</span>
      <div class="titulo">
        <h1>${escaparHtml(titulo ?? '')}</h1>
        <div class="sub">${escaparHtml(club?.nombre ?? '')}</div>
      </div>
    </div>
    ${botonModo}
    <button class="perfil ${pantallaId === PANTALLA_PERFIL ? 'on' : ''}" id="btn-perfil" aria-label="Mi perfil">${contenidoPerfil}</button>
  `;
  $('btn-inicio').addEventListener('click', () => alIrAlInicio());
  $('btn-atras')?.addEventListener('click', () => alVolver());
  $('btn-modo')?.addEventListener('click', () => alCambiarModo());
  $('btn-perfil').addEventListener('click', () => alAbrirPerfil());

  if (coordinando) {
    // Vacío se oculta solo (.cats:empty en layout.css).
    cats.innerHTML = '';
  } else {
    const activo = obtenerPlantelActivo();
    cats.innerHTML = obtenerPlanteles().map((p) => `
      <button class="cat ${p.id === activo?.id ? 'on' : ''}" data-plantel="${p.id}">
        <div><div class="sig">${escaparHtml(p.categoria)}</div></div>
      </button>
    `).join('');
    cats.querySelectorAll('.cat').forEach((boton) => {
      boton.addEventListener('click', () => {
        setPlantelActivoId(boton.dataset.plantel);
        alElegirPlantel();
      });
    });
  }

  // La marca encabeza la navegación lateral en escritorio: escudo y club fijos
  // arriba de los ítems, en todas las pantallas. En celular la barra de abajo
  // no la muestra (layout.css): ahí el escudo está en la cabecera.
  const tabs = coordinando ? TABS_COORDINACION : TABS;
  nav.innerHTML = `
    <button class="marca-nav" id="btn-inicio-nav" aria-label="Ir al inicio">
      ${ESCUDO}
      <span class="club">${escaparHtml(club?.nombre ?? '')}</span>
    </button>
    ${tabs.map((t) => `
      <button class="${pantallaId === t.id ? 'on' : ''}" data-ir="${t.id}">
        <svg viewBox="0 0 24 24">${t.icono}</svg><span>${t.texto}</span>
      </button>
    `).join('')}
  `;
  $('btn-inicio-nav').addEventListener('click', () => alIrAlInicio());
  nav.querySelectorAll('[data-ir]').forEach((boton) => {
    boton.addEventListener('click', () => alTocarTab(boton.dataset.ir));
  });
}
