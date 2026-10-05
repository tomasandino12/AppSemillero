import { html } from '../html.js';
import { $ } from '../dom.js';
import { abrirHoja, cerrarHoja } from './hoja.js';

/**
 * Hoja de confirmación para lo que no se puede deshacer o cuesta rehacer.
 * El botón de confirmar lleva el verbo ("Terminar", "Descartar"), no "Sí" ni
 * "Aceptar": quien mira la hoja con una mano ocupada tiene que saber qué va
 * a pasar sin releer el texto. Cancelar siempre está, y primero en el DOM.
 *
 * `alConfirmar` puede ser async. La hoja queda abierta hasta que termina y el
 * botón se deshabilita mientras tanto, así un doble toque no lo corre dos
 * veces. Si falla, se rehabilita: quien llama es el que le cuenta el error a
 * la persona (toast o aviso), acá sólo se vuelve a poder intentar.
 */
export function confirmarEnHoja({ titulo, texto, verbo, alConfirmar }) {
  abrirHoja({
    titulo,
    cuerpo: html`
      <div class="p">${texto}</div>
      <div class="acciones-hoja">
        <button type="button" class="btn sec" id="confirmar-cancelar">Cancelar</button>
        <button type="button" class="btn" id="confirmar-ok">${verbo}</button>
      </div>
    `.toString(),
  });
  $('confirmar-cancelar').addEventListener('click', cerrarHoja);
  $('confirmar-ok').addEventListener('click', async () => {
    const boton = $('confirmar-ok');
    if (boton.disabled) return;
    boton.disabled = true;
    try {
      await alConfirmar();
      cerrarHoja();
    } catch (e) {
      console.error('La acción confirmada falló:', e);
      boton.disabled = false;
    }
  });
}
