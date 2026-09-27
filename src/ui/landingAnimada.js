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

/**
 * Cada demo queda pausada en su primer cuadro hasta que su tarjeta entra en
 * pantalla: ahí se le pone .en-vista, corre una vez y se deja de observar,
 * así no se repite al volver a scrollear. Sin IntersectionObserver se
 * arrancan enseguida.
 */
function arrancarDemosAlEntrarEnPantalla() {
  const tarjetas = document.querySelectorAll('.ben[data-demo]');
  if (typeof IntersectionObserver === 'undefined') {
    tarjetas.forEach((t) => t.classList.add('en-vista'));
    return;
  }
  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('en-vista');
      observador.unobserve(e.target);
    }
  }, { threshold: 0.4 });
  tarjetas.forEach((t) => observador.observe(t));
}

export function iniciarLandingAnimada() {
  pausarAnilloFueraDePantalla();
  arrancarDemosAlEntrarEnPantalla();
}
