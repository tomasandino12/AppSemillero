import { abrirHoja } from './hoja.js';
import { html, crudo } from '../html.js';
import { ICONO } from './iconos.js';
import { etiquetaMetodologia } from '../../data/metodologia.js';
import { obtenerClubActual } from '../sesion.js';

const PASOS = [
  ['Cámara', crudo('Modo “Cámara lenta” común, nunca “instantánea” ni con IA. De costado al chico, al ras del piso (0–10 cm), a 2–3 m, en horizontal y fija. Tienen que verse los dos pies y el piso.')],
  ['Grabación', crudo('Mucha luz y zapatillas. Grabar, esperar 2 s y recién ahí saltar. No editar ni recortar el video.')],
  ['Test', crudo('<b>CMJ:</b> manos en la cadera toda la ejecución. <b>Abalakov:</b> brazos libres.')],
  ['Salto', crudo('Contramovimiento a la profundidad que elija el chico. Piernas extendidas en el aire y al aterrizar.')],
  ['Intentos', crudo('3 válidos, con 30–60 s de pausa. Cuenta el mejor.')],
  ['Marcado', crudo('Despegue = último cuadro con la punta del pie tocando el piso. Aterrizaje = primer cuadro en que vuelve a tocar.')],
  ['Después', crudo('Borrá el video de la galería (la app no puede hacerlo por vos).')],
  ['Medidas de pierna', crudo('<b>L0</b> = del trocánter mayor a la punta del pie, con la pierna extendida y el tobillo en flexión plantar. <b>hpush</b> = del trocánter al piso, en cuclillas con la rodilla a 90°. Medí al medio centímetro.')],
];

/**
 * El protocolo de medición del salto (spec de la evaluación de salto), en
 * tarjetas numeradas. Va como fragmento para poder mostrarlo también adentro
 * del marcador de cuadros, que tapa la hoja (z-index) y por eso lo muestra
 * en un <details>. El texto de los pasos es propio (por eso `crudo`).
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

/** Botón “¿Cómo se mide?” que abre el protocolo en la hoja, con la cabecera y la etiqueta. */
export function botonProtocolo() {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn sec chico';
  boton.textContent = '¿Cómo se mide?';
  boton.addEventListener('click', () => {
    const cuerpo = html`
      <div class="guia-cab">
        <span class="ico">${crudo(ICONO.info)}</span>
        <span class="tit">Protocolo del salto</span>
        <span class="tag-metodo">${etiquetaMetodologia(obtenerClubActual())}</span>
        <p class="sub">Cómo filmar y marcar para que el número sea confiable.</p>
      </div>
      ${protocoloHtml()}
    `;
    abrirHoja({ titulo: 'Cómo medir el salto', cuerpo: cuerpo.toString() });
  });
  return boton;
}
