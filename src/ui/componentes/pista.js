import { html } from '../html.js';
import { $ } from '../dom.js';
import { PISTAS } from '../../data/guias.js';
import { claveGuia, yaVista, marcarVista } from '../guiaVista.js';

/**
 * Pista de una vez: un aviso arriba de una pantalla que no se entiende sola,
 * con "Entendido". No bloquea nada: si alguien la ignora y sigue, la pantalla
 * funciona igual, y la pista vuelve la próxima vez hasta que la cierre.
 *
 * Comparte el registro con la guía (guiaVista.js) con un prefijo propio, para
 * que el id de una pista nunca choque con el de un modo.
 */

const VERSION = 1;
const clave = (pistaId, usuarioId) => claveGuia(usuarioId, `pista.${pistaId}`);
const idAviso = (pistaId) => `pista-${pistaId}`;

/** El HTML de la pista, o vacío si ya se vio o no existe. */
export function pistaUnaVez(pistaId, usuarioId) {
  const texto = PISTAS[pistaId];
  if (!texto || yaVista(clave(pistaId, usuarioId), VERSION)) return html``;
  return html`
    <div class="al pista" id="${idAviso(pistaId)}" role="note">
      <div class="ico" aria-hidden="true">?</div>
      <div class="tx">${texto}</div>
      <button type="button" class="btn sec chico" data-pista-ok>Entendido</button>
    </div>
  `;
}

/** Cablea "Entendido": marca la pista y saca el aviso sin re-renderizar la pantalla. */
export function conectarPista(pistaId, usuarioId) {
  const aviso = $(idAviso(pistaId));
  aviso?.querySelector('[data-pista-ok]').addEventListener('click', () => {
    marcarVista(clave(pistaId, usuarioId), VERSION);
    aviso.remove();
  });
}
