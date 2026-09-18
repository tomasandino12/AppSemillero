import { escaparHtml } from '../nav.js';
import { abrirHoja, cerrarHoja } from './hoja.js';

/**
 * El historial completo detrás de "Ver detalles". Recibe las tablas ya armadas
 * por la pantalla: el componente no sabe de tiro, de partidos ni de jugadores,
 * sólo las guarda y las muestra.
 *
 * Abre la hoja (bottom sheet en celular, diálogo en escritorio) en vez de
 * desplegar en el lugar. Antes era un <details>: con 20 filas andaba, pero
 * cada batería y cada partido suman una fila, y a la larga "Ver detalles"
 * estiraba la pantalla con filas y filas. La hoja tiene su propio scroll y
 * la pantalla de atrás no cambia de largo.
 *
 * Las tablas viajan en un <template>: están en el HTML pero no se renderizan
 * ni ocupan lugar hasta que la hoja las copia. Así el componente sigue
 * devolviendo un string y ninguna pantalla registra listeners propios: los
 * atiende uno solo, delegado, en iniciarVerDetalles().
 *
 * El texto del botón no es configurable a propósito: es la misma acción en
 * todas las pantallas, y dos textos distintos para lo mismo se notan sin que
 * se sepa por qué.
 *
 * titulo: el de la hoja. tablas: [{ nombre, html }]. Una tabla sin html no
 * entra, y sin ninguna no se dibuja el botón: no hay nada que mostrar.
 */
export function verDetallesHtml(titulo, tablas) {
  const conContenido = (tablas ?? []).filter((t) => t && t.html);
  if (!conContenido.length) return '';
  return `
    <button type="button" class="ver-detalles" data-ver-detalles data-titulo="${escaparHtml(titulo)}">
      <span>Ver detalles</span><span class="flecha" aria-hidden="true">›</span>
    </button>
    <template>
      ${conContenido.map((t) => `
        <div class="tabla-nombrada">
          <div class="sub-fuente">${escaparHtml(t.nombre)}</div>
          ${t.html}
        </div>
      `).join('')}
    </template>
  `;
}

/** Una sola vez en la vida de la página (registro.js). */
export function iniciarVerDetalles() {
  document.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-ver-detalles]');
    if (!boton) return;
    const plantilla = boton.nextElementSibling;
    if (!(plantilla instanceof HTMLTemplateElement)) return;
    // Cerrar abajo, a mano: con una tabla larga, lo que queda de velo arriba
    // de la hoja es una franja que no se encuentra.
    abrirHoja({
      titulo: boton.dataset.titulo,
      cuerpo: `${plantilla.innerHTML}
        <button type="button" class="btn sec cerrar-detalles" id="btn-cerrar-detalles">Cerrar</button>`,
      // El foco vuelve al botón que la abrió, no al principio de la página.
      alCerrar: () => boton.focus(),
    });
    document.getElementById('btn-cerrar-detalles').addEventListener('click', cerrarHoja);
  });
}
