import { escaparHtml } from '../nav.js';

/**
 * El historial completo detrás de "Ver detalles". Recibe las tablas ya armadas
 * por la pantalla: el componente no sabe de tiro, de partidos ni de jugadores,
 * sólo muestra y oculta.
 *
 * <details> nativo: se abre con el dedo, con teclado y con lector de pantalla
 * —que lo anuncia como botón expandible con su estado— sin una línea de JS y
 * sin estado que sincronizar. Sin `open`: siempre arranca cerrado.
 *
 * El gráfico queda AFUERA, siempre visible: lo colapsado es el detalle fecha
 * por fecha, no la forma de la serie.
 *
 * El texto del botón no es configurable a propósito: es la misma acción en
 * todas las pantallas, y dos textos distintos para lo mismo se notan sin que
 * se sepa por qué.
 *
 * tablas: [{ nombre, html }]. Una tabla sin html no entra, y sin ninguna no se
 * dibuja el botón: no hay nada que desplegar.
 */
export function detalleColapsableHtml(tablas) {
  const conContenido = (tablas ?? []).filter((t) => t && t.html);
  if (!conContenido.length) return '';
  return `
    <details class="detalle-colapsable">
      <summary>
        <span class="ver">Ver detalles</span><span class="ocultar">Ocultar detalles</span>
        <span class="flecha" aria-hidden="true">▾</span>
      </summary>
      ${conContenido.map((t) => `
        <div class="tabla-nombrada">
          <div class="sub-fuente">${escaparHtml(t.nombre)}</div>
          ${t.html}
        </div>
      `).join('')}
    </details>
  `;
}
