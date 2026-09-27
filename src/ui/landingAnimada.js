import { $ } from './dom.js';
import { valorContado } from '../data/animacion.js';

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
 * La cifra del salto está escrita en su valor final (42) en el HTML: sin JS o
 * con movimiento reducido se queda así. Si hay animación, arranca en 38 y
 * cuenta hasta 42 en lo que dura una demo, leyendo el token de CSS para no
 * tener la duración escrita en dos lugares.
 */
function contarSalto() {
  const cifra = $('cifra-salto');
  if (!cifra || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const hasta = Number(cifra.textContent);
  const duracion = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-demo'));
  if (!Number.isFinite(hasta) || !(duracion > 0)) return;
  const desde = hasta - 4;
  const inicio = performance.now();
  cifra.textContent = String(desde);
  const cuadro = (ahora) => {
    const t = (ahora - inicio) / duracion;
    cifra.textContent = String(valorContado(desde, hasta, t));
    if (t < 1) requestAnimationFrame(cuadro);
  };
  requestAnimationFrame(cuadro);
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
      if (e.target.dataset.demo === 'salto') contarSalto();
      observador.unobserve(e.target);
    }
  }, { threshold: 0.4 });
  tarjetas.forEach((t) => observador.observe(t));
}

export function iniciarLandingAnimada() {
  pausarAnilloFueraDePantalla();
  arrancarDemosAlEntrarEnPantalla();
}
