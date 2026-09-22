/*
 * Íconos de acciones secundarias (lápiz, tacho, deshacer...) compartidos
 * entre la ficha de una jugada y su editor. No se unifica con `ICONOS` de
 * chrome.js (navegación): son familias de íconos distintas, unificarlas
 * sería un refactor que no hace falta todavía.
 */
import { html, crudo } from '../html.js';

const ATR = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

export const ICONO = {
  lapiz: `<svg ${ATR}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  tacho: `<svg ${ATR}><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
  deshacer: `<svg ${ATR}><path d="M3 10h10a5 5 0 0 1 0 10H9"/><path d="M3 10l5-5"/><path d="M3 10l5 5"/></svg>`,
  rehacer: `<svg ${ATR}><path d="M21 10H11a5 5 0 0 0 0 10h4"/><path d="M21 10l-5-5"/><path d="M21 10l-5 5"/></svg>`,
  duplicar: `<svg ${ATR}><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  descargar: `<svg ${ATR}><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/></svg>`,
  imprimir: `<svg ${ATR}><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1"/><path d="M6 17v4h12v-4"/></svg>`,
  mas: `<svg ${ATR}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
  reproducir: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" focusable="false"><path d="M7 4l13 8-13 8V4z"/></svg>',
};

/** Botón cuadrado con un solo ícono: `aria-label` y `title` cubren lo que en un botón de texto da la etiqueta. */
export function botonIcono({
  id, icono, etiqueta, extraClase = '',
}) {
  return html`<button type="button" class="btn-icono${extraClase ? ` ${extraClase}` : ''}"${id ? html` id="${id}"` : ''} aria-label="${etiqueta}" title="${etiqueta}">${crudo(icono)}</button>`;
}
