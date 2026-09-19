import { mostrarPantalla, escaparHtml } from '../nav.js';
import { retornarDeImport } from './retornoImport.js';
import { $ } from '../dom.js';

export function mostrarResultado({ resumen, advertencias }) {
  mostrarPantalla('p-resultado');
  const detalleAdvertencias = advertencias.length
    ? `
      <details style="margin-top:14px">
        <summary class="p">${advertencias.length} advertencia${advertencias.length === 1 ? '' : 's'} del archivo</summary>
        ${advertencias.map((a) => `<div class="al"><div class="tx">${escaparHtml(a.mensaje)}</div></div>`).join('')}
      </details>
    `
    : '';
  $('resultado-contenido').innerHTML = `
    <div class="al ok"><div class="tx">${escaparHtml(resumen)}</div></div>
    ${detalleAdvertencias}
    <div class="pie-fijo"><button class="btn" id="btn-volver-resultado">Cargar otro partido</button></div>
  `;
  $('btn-volver-resultado').addEventListener('click', retornarDeImport);
}
