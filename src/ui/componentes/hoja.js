import { escaparHtml } from '../nav.js';
import { $ } from '../dom.js';

// Callback de cierre de la hoja actualmente abierta, si quien la abrió pasó
// uno. Vive acá (no observado desde afuera) porque el mecanismo de
// mostrar/ocultar la hoja es un detalle privado de este módulo: quien
// necesita saber cuándo se cierra pide que se lo avisen, en vez de espiar la
// clase CSS de #hoja.
let alCerrarActual = null;

// Quien necesita saber que la hoja se abrió o cerró (el historial del botón
// Atrás, en main.js) se registra acá; hoja.js no importa de main.js.
let alCambiar = null;
let abierta = false;

export function hojaAbierta() {
  return abierta;
}

export function alCambiarHoja(fn) {
  alCambiar = fn;
}

/** Bottom sheet en celular; diálogo centrado a partir de 1024px (layout.css). */
export function abrirHoja({ titulo, cuerpo, alCerrar }) {
  const hoja = $('hoja');
  hoja.innerHTML = `
    <div class="asa"></div>
    <h2 id="hoja-titulo">${escaparHtml(titulo)}</h2>
    <div class="pad">${cuerpo}</div>
  `;
  // La hoja es una sola y se reusa: sin esto, abre donde quedó el scroll
  // de la anterior.
  hoja.scrollTop = 0;
  $('velo').classList.add('on');
  hoja.classList.add('on');
  alCerrarActual = alCerrar ?? null;
  abierta = true;
  alCambiar?.();
}

export function cerrarHoja() {
  $('velo').classList.remove('on');
  const hoja = $('hoja');
  hoja.classList.remove('on');
  // La hoja sólo se oculta, no se vacía: un video abierto seguiría sonando
  // desde adentro. Sacar los iframes lo corta.
  hoja.querySelectorAll('iframe').forEach((f) => f.remove());
  abierta = false;
  alCambiar?.();
  // Se limpia ANTES de invocar, no después: si alCerrar() abriera otra hoja
  // (que fijaría su propio alCerrarActual), limpiar después la pisaría a
  // ciegas. Así, además, un cierre por Escape mientras el velo ya disparó no
  // puede invocar el mismo callback dos veces.
  const fn = alCerrarActual;
  alCerrarActual = null;
  if (fn) fn();
}

export function iniciarHoja() {
  $('velo').addEventListener('click', cerrarHoja);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarHoja();
  });
}
