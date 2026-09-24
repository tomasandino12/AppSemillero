import { abrirHoja } from './hoja.js';
import { html, crudo } from '../html.js';
import { ICONO } from './iconos.js';
import { etiquetaMetodologia } from '../../data/metodologia.js';
import { obtenerClubActual } from '../sesion.js';
import { PARCIAL_SPRINT_MIN_MS, PARCIAL_SPRINT_MAX_MS, TIEMPO_SPRINT_MAX_MS } from '../../data/sprint.js';

const segundos = (ms) => String(ms / 1000).replace('.', ',');

const PASOS = [
  ['Pista', crudo('Marcá la línea de salida y, a <b>30 m</b>, un cono para el giro (o a <b>20 m</b> si no hay 30 despejados). El chico corre hasta el cono, frena, gira y vuelve a la línea: <b>30 + 30</b>. Los de 20 y los de 30 no se comparan entre sí. Mismo piso y mismo calzado en todas las mediciones.')],
  ['Entrada en calor', crudo('Trote, movilidad y dos o tres arranques progresivos antes del primer intento. Practicá el giro una vez sin cronómetro.')],
  ['Dónde te parás', crudo('En la línea de salida, siempre el mismo profe: ahí controlás que arranque bien y ves la llegada. El giro lo ves de frente, a 30 m.')],
  ['Salida', crudo('De pie, con un pie adelante y detrás de la línea. La app dice “En sus marcas… listos…” y suena un pitido: el reloj arranca con el pitido, no cuando el chico se mueve.')],
  ['Giró y Llegó', crudo('Tocá <b>¡Giró!</b> en el momento en que el chico frena para dar la vuelta, y <b>¡Llegó!</b> cuando cruza otra vez la línea de salida. Siempre el mismo criterio para el giro (por ejemplo, cuando planta el pie junto al cono).')],
  ['Qué mira la app', crudo('El dato principal es el <b>total</b> (ida y vuelta), porque un toque de más o de menos pesa menos sobre unos 10 segundos. La <b>ida</b> sirve para comparar con el sprint simple, y la <b>vuelta</b> (total menos ida) incluye el giro: mostrala como aproximada.')],
  ['Intentos', crudo('2 intentos con 3 minutos de pausa. Cuenta el mejor total.')],
  ['Qué esperar', crudo(`Un tiempo fuera de rango se rechaza (la ida entre ${segundos(PARCIAL_SPRINT_MIN_MS)} y ${segundos(PARCIAL_SPRINT_MAX_MS)} s, el total hasta ${segundos(TIEMPO_SPRINT_MAX_MS)} s): casi seguro fue un toque de más. El cronómetro a mano sirve para ver la evolución del chico con el mismo profe, no para compararlo con tablas. Si el CReAR mide con fotocélulas, ese dato queda marcado como más exacto.`)],
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
