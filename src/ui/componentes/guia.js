import { html, crudo } from '../html.js';
import { $ } from '../dom.js';
import { abrirHoja, cerrarHoja, hojaAbierta } from './hoja.js';
import { TABS, TABS_COORDINACION, TABS_JUGADOR } from '../chrome.js';
import { GUIAS, pasosDeGuia, estadoDePaso } from '../../data/guias.js';
import { claveGuia, marcarVista } from '../guiaVista.js';

/**
 * Intro de primer uso de un modo, en la hoja. Ver
 * docs/superpowers/specs/2026-10-10-guia-primer-uso-design.md.
 *
 * Al cambiar de paso se reescribe el cuerpo y no se vuelve a abrir la hoja:
 * reabrirla dispararía alCambiar y el historial de Atrás sumaría una entrada
 * por paso. Se marca como vista en alCerrar, así cuenta cualquier forma de
 * cerrarla (Saltar, Empezar, el velo, Escape, Atrás): si alguien la cerró,
 * no se la volvemos a mostrar.
 */

const PESTANAS = [...TABS, ...TABS_COORDINACION, ...TABS_JUGADOR];

const iconoDe = (pestana) => PESTANAS.find((t) => t.id === pestana)?.icono ?? '';

function cuerpoDePaso(paso, estado) {
  return html`
    <div class="intro" id="guia-intro">
      <div class="intro-cab">
        <span class="intro-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${crudo(iconoDe(paso.pestana))}</svg></span>
        <span class="intro-contador" aria-live="polite">${estado.contador}</span>
        <button type="button" class="btn sec chico" id="guia-saltar">Saltar</button>
      </div>
      <p class="intro-texto">${paso.texto}</p>
      <div class="acciones-hoja">
        ${estado.hayAnterior && html`<button type="button" class="btn sec" id="guia-anterior">Anterior</button>`}
        <button type="button" class="btn" id="guia-siguiente">${estado.textoSiguiente}</button>
      </div>
    </div>
  `.toString();
}

export function abrirGuia({ guiaId, roles, usuarioId }) {
  const pasos = pasosDeGuia(guiaId, roles);
  if (!pasos.length) return;
  let indice = 0;

  function mostrar() {
    const paso = pasos[indice];
    const estado = estadoDePaso(indice, pasos.length);
    const titulo = $('hoja-titulo');
    titulo.textContent = paso.titulo;
    $('hoja').querySelector('.pad').innerHTML = cuerpoDePaso(paso, estado);
    $('guia-saltar').addEventListener('click', cerrarHoja);
    $('guia-anterior')?.addEventListener('click', () => irA(indice - 1));
    $('guia-siguiente').addEventListener('click', () => {
      if (indice >= pasos.length - 1) cerrarHoja();
      else irA(indice + 1);
    });
    // El contador se anuncia solo; el foco en el título hace que un lector
    // de pantalla lea el paso nuevo y no se quede en un botón que ya no está.
    titulo.setAttribute('tabindex', '-1');
    titulo.focus({ preventScroll: true });
  }

  function irA(i) {
    if (i < 0 || i >= pasos.length) return;
    indice = i;
    mostrar();
  }

  function alTeclado(e) {
    // Otra hoja pudo abrirse encima sin pasar por alCerrar (abrirHoja pisa el
    // callback): entonces la guía ya no está y el listener sobra.
    if (!hojaAbierta() || !$('guia-intro')) {
      document.removeEventListener('keydown', alTeclado);
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') irA(indice - 1);
    else if (e.key === 'ArrowRight') irA(indice + 1);
  }

  abrirHoja({
    titulo: pasos[0].titulo,
    cuerpo: '',
    alCerrar: () => {
      document.removeEventListener('keydown', alTeclado);
      marcarVista(claveGuia(usuarioId, guiaId), GUIAS[guiaId].version);
    },
  });
  document.addEventListener('keydown', alTeclado);
  mostrar();
}
