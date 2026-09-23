import { abrirHoja } from './hoja.js';
import { html } from '../html.js';

/**
 * El protocolo de medición del salto (spec de la evaluación de salto). Va como
 * fragmento para poder mostrarlo también adentro del marcador de cuadros, que
 * tapa la hoja (z-index) y por eso lo muestra en un <details>.
 */
export function protocoloHtml() {
  return html`
    <ul class="protocolo-salto">
      <li><b>Cámara:</b> modo “Cámara lenta” común, nunca “instantánea” ni con IA. De costado al chico, al ras del piso (0–10 cm), a 2–3 m, en horizontal y fija. Tienen que verse los dos pies y el piso.</li>
      <li><b>Grabación:</b> mucha luz y zapatillas. Grabar, esperar 2 s y recién ahí saltar. No editar ni recortar el video.</li>
      <li><b>CMJ:</b> manos en la cadera toda la ejecución. <b>Abalakov:</b> brazos libres.</li>
      <li><b>Salto:</b> contramovimiento a la profundidad que elija el chico. Piernas extendidas en el aire y al aterrizar.</li>
      <li><b>Intentos:</b> 3 válidos, con 30–60 s de pausa. Cuenta el mejor.</li>
      <li><b>Marcado:</b> despegue = último cuadro con la punta del pie tocando el piso. Aterrizaje = primer cuadro en que vuelve a tocar.</li>
      <li><b>Después:</b> borrá el video de la galería (la app no puede hacerlo por vos).</li>
      <li><b>Medidas de pierna:</b> <b>L0</b> = del trocánter mayor a la punta del pie, con la pierna extendida y el tobillo en flexión plantar. <b>hpush</b> = del trocánter al piso, en cuclillas con la rodilla a 90°. Medí al medio centímetro.</li>
    </ul>
  `;
}

/** Botón “¿Cómo se mide?” que abre el protocolo en la hoja. */
export function botonProtocolo() {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn sec chico';
  boton.textContent = '¿Cómo se mide?';
  boton.addEventListener('click', () => {
    abrirHoja({ titulo: 'Cómo medir el salto', cuerpo: protocoloHtml().toString() });
  });
  return boton;
}
