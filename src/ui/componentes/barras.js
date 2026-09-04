import { escaparHtml } from '../nav.js';

/**
 * Barras horizontales del reparto: una por jugador, sobre el total del
 * equipo. No es SVG a propósito — son divs con ancho porcentual, que escalan
 * solos con el contenedor y no necesitan viewBox ni recalcularse al rotar
 * el celular.
 *
 * El ancho es relativo al mayor (la barra más larga llena la pista), y el
 * número que se muestra al costado es el valor real.
 */
export function barras(filas, { formatearValor }) {
  if (!filas.length) return '';
  const maximo = filas[0].valor;
  return `<div class="barras">${filas.map((f) => `
    <div class="barra">
      <div class="et">${escaparHtml(f.etiqueta)}</div>
      <div class="pista"><div class="relleno" style="width:${maximo === 0 ? 0 : (f.valor / maximo) * 100}%"></div></div>
      <div class="val">${escaparHtml(formatearValor(f.valor))}</div>
    </div>
  `).join('')}</div>`;
}
