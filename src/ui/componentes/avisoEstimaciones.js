import { html } from '../html.js';

/**
 * Va al pie de las mediciones físicas (salto, sprint, resistencia), donde hay
 * números que un profe o una familia pueden leer como un diagnóstico. Es el
 * mismo texto que los Términos (§5) y la Política de privacidad (§3): si
 * cambia acá, cambia allá.
 */
export function avisoEstimaciones() {
  return html`<p class="aviso-estimacion">Valores estimados para orientar el entrenamiento; no reemplazan una evaluación médica.</p>`;
}
