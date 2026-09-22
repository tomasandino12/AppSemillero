import {
  obtenerClubActual, obtenerPlanteles, obtenerPlantelActivo, setPlantelActivoId,
  obtenerModo, obtenerRoles, obtenerCuenta,
} from './sesion.js';
import { escaparHtml } from './nav.js';
import { inicialesDeNombre } from '../data/cuenta.js';
import { $ } from './dom.js';

const ICONOS = {
  hoy: '<path d="M4 13h5v7H4zM10 8h5v12h-5zM16 4h4v16h-4z"/>',
  plantel: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 8.5a3 3 0 100-5"/><path d="M17.5 14.5c2 .7 3.5 2.6 3.5 5.5"/>',
  medir: '<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="18" cy="17" r="2.5"/>',
  // Una mancuerna: dos discos por lado y la barra.
  fisico: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  recursos: '<path d="M4 5h16v14H4z"/><path d="M10 9l5 3-5 3z"/>',
  datos: '<path d="M3 17l5-6 4 4 4-7 5 5"/><path d="M3 21h18"/>',
  persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  // Una pizarra: el tablero, una ficha y la flecha de una jugada.
  pizarra: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><circle cx="8" cy="10.5" r="1.8"/><path d="M11 13l5-5M16 8h-3v3"/><path d="M9 21h6"/>',
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
  // MEDIR y FÍSICO juntas: las dos son sobre el cuerpo del jugador, medirlo de
  // un lado y trabajarlo del otro.
  { id: 'p-fisico', texto: 'Físico', icono: ICONOS.fisico },
  { id: 'p-recursos', texto: 'Recursos', icono: ICONOS.recursos },
  { id: 'p-datos', texto: 'Datos', icono: ICONOS.datos },
];

// Coordinación: tres pestañas y ningún chip de categoría. No hay "categoría
// activa" porque el coordinador no entra a ninguna. INVENTARIO es del club
// entero, y es la única que escribe algo que no son accesos.
export const TABS_COORDINACION = [
  { id: 'p-coord-panorama', texto: 'Panorama', icono: ICONOS.datos },
  { id: 'p-coord-profes', texto: 'Profes', icono: ICONOS.plantel },
  { id: 'p-coord-inventario', texto: 'Inventario', icono: ICONOS.fisico },
];

// El jugador: tres pestañas, sólo lectura, y ningún chip de categoría ni
// cambio de modo. Su categoría es la suya y no elige (spec de la cuenta de
// jugador, sección 5). Sumar una función es una pantalla y una línea acá.
export const TABS_JUGADOR = [
  { id: 'p-jug-recursos', texto: 'Recursos', icono: ICONOS.recursos },
  { id: 'p-jug-fisico', texto: 'Físico', icono: ICONOS.fisico },
  { id: 'p-jug-progreso', texto: 'Mi progreso', icono: ICONOS.datos },
  { id: 'p-jug-jugadas', texto: 'Jugadas', icono: ICONOS.pizarra },
];

export const PANTALLA_PERFIL = 'p-mi-perfil';

/** Las pestañas del modo actual. */
export function tabsDelModo() {
  const modo = obtenerModo();
  if (modo === 'coordinar') return TABS_COORDINACION;
  if (modo === 'jugar') return TABS_JUGADOR;
  return TABS;
}

/** Entrenando arranca en PLANTEL; coordinando, en el Panorama; el jugador, en su primera pestaña. */
export function pantallaInicialDelModo() {
  const modo = obtenerModo();
  if (modo === 'coordinar') return TABS_COORDINACION[0].id;
  if (modo === 'jugar') return TABS_JUGADOR[0].id;
  return TABS[1].id;
}

/**
 * A dónde lleva el escudo: HOY. Coordinando, al Panorama: HOY es el resumen
 * de una categoría, y coordinación no entra a ninguna. El jugador no tiene HOY:
 * va a su primera pestaña.
 */
export function pantallaDeInicio() {
  const modo = obtenerModo();
  if (modo === 'coordinar') return TABS_COORDINACION[0].id;
  if (modo === 'jugar') return TABS_JUGADOR[0].id;
  return TABS[0].id;
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
  const modo = obtenerModo();
  const iniciales = inicialesDeNombre(obtenerCuenta()?.nombre ?? '');

  const atras = mostrarAtras
    ? `<button class="atras" id="btn-atras" aria-label="Volver">&lsaquo;</button>`
    : '';
  // Sólo quien tiene los dos roles cambia de modo.
  const botonModo = roles.esEntrenador && roles.esCoordinador
    ? `<button class="salir modo" id="btn-modo">${modo === 'coordinar' ? 'Entrenar' : 'Coordinar'}</button>`
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

  if (modo !== 'entrenar') {
    // Coordinando y jugando no hay categoría activa. Vacío se oculta solo
    // (.cats:empty en layout.css).
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
  const tabs = tabsDelModo();
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
