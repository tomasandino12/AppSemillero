import { abrirHoja } from './hoja.js';
import { html, crudo } from '../html.js';
import { ICONO } from './iconos.js';
import { etiquetaMetodologia } from '../../data/metodologia.js';
import { obtenerClubActual } from '../sesion.js';
import { IDA_M, IDAS_MAX, metrosDe } from '../../data/yoyo.js';

const PASOS = [
  ['Pista', crudo(`Dos líneas a <b>${IDA_M} m</b> una de otra, marcadas con conos. Los chicos corren de una línea a la otra, sin pausa: una ida por pitido.`)],
  ['Celular', crudo('Con el parlante fuerte (o un parlante bluetooth) y el volumen al máximo: tienen que oír los pitidos desde toda la pista. No bloquees el celular ni cambies de aplicación durante la prueba; si pasa, la app avisa y hay que rehacerla.')],
  ['Entrada en calor', crudo('Trote, movilidad y unos arranques progresivos antes de empezar.')],
  ['Salida y ritmo', crudo('La app cuenta 5 segundos y suena un pitido largo: ahí arrancan. Cada pitido corto marca el fin de una ida y un pitido doble, el paso a un nivel más rápido. Hay que pisar la línea con el pitido.')],
  ['Avisos y eliminación', crudo('Al <b>primer</b> pitido que un chico no llega a la línea a tiempo, tocalo: queda con un aviso. Si llega bien en el siguiente, tocá <b>Llegó</b> para limpiarlo. Si falla dos veces seguidas, tocalo de nuevo: queda afuera y la app anota sus idas.')],
  ['Cuántos por tanda', crudo('No más de 8 a 10 jugadores a la vez, para poder mirarlos a todos. Las tandas se cargan como sesiones separadas.')],
  ['Cuánto dura y cuánto se repite', crudo(`Hasta unos 15 minutos, y agota: no lo repitas más de 2 o 3 veces por año. El máximo son ${IDAS_MAX} idas (${metrosDe(IDAS_MAX)} m). Sirve para comparar al chico contra sí mismo; si el CReAR lo mide, ese dato queda marcado como más exacto.`)],
];

/**
 * El protocolo del Yo-Yo, en tarjetas numeradas como el del salto y el sprint.
 * Los pasos son texto propio (por eso `crudo`).
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
        <span class="tit">Protocolo del Yo-Yo</span>
        <span class="tag-metodo">${etiquetaMetodologia(obtenerClubActual())}</span>
        <p class="sub">Cómo medir la resistencia con pitidos.</p>
      </div>
      ${protocoloHtml()}
    `;
    abrirHoja({ titulo: 'Cómo medir el Yo-Yo', cuerpo: cuerpo.toString() });
  });
  return boton;
}
