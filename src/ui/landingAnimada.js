import { $ } from './dom.js';

/**
 * Animaciones de la landing. Todo es decoración: si algo falla o el navegador
 * no tiene IntersectionObserver, la landing se lee igual.
 */

/**
 * El anillo del escudo es la única animación continua del proyecto, así que
 * se pausa cuando no se ve (fuera de pantalla o con otra vista pública
 * abierta, que deja la landing en display:none): no gasta batería girando
 * para nadie.
 */
function pausarAnilloFueraDePantalla() {
  const anillo = $('anillo-escudo');
  if (!anillo || typeof IntersectionObserver === 'undefined') return;
  new IntersectionObserver(([entrada]) => {
    anillo.classList.toggle('quieto', !entrada.isIntersecting);
  }).observe(anillo);
}

export function iniciarLandingAnimada() {
  pausarAnilloFueraDePantalla();
}
