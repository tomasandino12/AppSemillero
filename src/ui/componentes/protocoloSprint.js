import { abrirHoja } from './hoja.js';
import { html, crudo } from '../html.js';
import { ICONO } from './iconos.js';
import { etiquetaMetodologia } from '../../data/metodologia.js';
import { obtenerClubActual } from '../sesion.js';
import { TIEMPO_SPRINT_MIN_MS, TIEMPO_SPRINT_MAX_MS } from '../../data/sprint.js';

const segundos = (ms) => String(ms / 1000).replace('.', ',');

const PASOS = [
  ['Pista', crudo('Marcá la salida y la llegada con cinta o conos: <b>30 m</b>, o <b>20 m</b> si no hay 30 despejados. Los 20 y los 30 no se comparan entre sí. Mismo piso y mismo calzado en todas las mediciones.')],
  ['Entrada en calor', crudo('Trote, movilidad y dos o tres arranques progresivos antes del primer intento.')],
  ['Salida', crudo('De pie, con un pie adelante y detrás de la línea. La app dice “En sus marcas… listos…” y suena un pitido: el reloj arranca con el pitido, no cuando el chico se mueve.')],
  ['Llegada', crudo('Siempre el mismo profe toca <b>¡Llegó!</b>, parado en la línea de meta, cuando el pecho del chico la cruza. El chico sigue corriendo un poco más allá para no frenar antes.')],
  ['Intentos', crudo('2 intentos con 3 minutos de pausa. Cuenta el mejor.')],
  ['Qué esperar', crudo(`Un tiempo fuera de ${segundos(TIEMPO_SPRINT_MIN_MS)}–${segundos(TIEMPO_SPRINT_MAX_MS)} s se rechaza: casi seguro fue un toque de más. El cronómetro a mano tiene un error de reacción de unas décimas: sirve para ver la evolución del chico con el mismo profe, no para compararlo con tablas. Si el CReAR mide con fotocélulas, ese dato queda marcado como más exacto.`)],
];

/**
 * El protocolo del sprint, en tarjetas numeradas como el del salto. Los pasos
 * son texto propio (por eso `crudo`).
 */
export function protocoloHtml() {
  return html`
    <div class="protocolo-salto">
      ${PASOS.map(([titulo, texto], i) => html`
        <div class="guia-paso">
          <span class="num">${i + 1}</span><span class="tit">${titulo}</span>
          <div class="cuerpo">${texto}</div>
        </div>
      `)}
    </div>
  `;
}

/** Botón “¿Cómo medir?” que abre el protocolo en la hoja, con la cabecera y la etiqueta. */
export function botonProtocolo() {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn sec chico';
  boton.textContent = '¿Cómo medir?';
  boton.addEventListener('click', () => {
    const cuerpo = html`
      <div class="guia-cab">
        <span class="ico">${crudo(ICONO.info)}</span>
        <span class="tit">Protocolo del sprint</span>
        <span class="tag-metodo">${etiquetaMetodologia(obtenerClubActual())}</span>
        <p class="sub">Cómo medir para que el tiempo sea confiable.</p>
      </div>
      ${protocoloHtml()}
    `;
    abrirHoja({ titulo: 'Cómo medir el sprint', cuerpo: cuerpo.toString() });
  });
  return boton;
}
