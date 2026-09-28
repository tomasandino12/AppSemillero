import { $ } from './dom.js';
import { valorContado } from '../data/animacion.js';
import { JUGADA_DEMO_LANDING as JUGADA } from '../data/jugadaDemoLanding.js';
import { estadoEn, DURACION_PASO_MS } from '../data/animacionJugada.js';
import { dibujarPizarra } from './componentes/pizarra.js';

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
  if (!cifra || sinMovimiento()) return;
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

const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let cuadroPizarra = null;

/** Un cuadro de la jugada: `paso` (0-based) y avance `t` (0–1) dentro de él. */
function dibujarJugada(svg, paso, t) {
  dibujarPizarra(svg, JUGADA, estadoEn(JUGADA, paso, t), { paso, nosotrosDefiende: false });
}

/**
 * La pizarra de la tarjeta de jugadas, con el mismo motor que el visor de la
 * app. Reposa en el primer paso (con su trazo a la vista, para que no sea una
 * cancha vacía) y, al soltarse la demo, recorre los pasos una vez con
 * requestAnimationFrame. Con movimiento reducido queda en ese primer paso.
 */
function correrJugada(tarjeta) {
  const svg = tarjeta.querySelector('svg.pz');
  if (!svg) return;
  if (cuadroPizarra != null) cancelAnimationFrame(cuadroPizarra);
  cuadroPizarra = null;
  dibujarJugada(svg, 0, 0);
  if (sinMovimiento()) return;
  const total = JUGADA.pasos.length;
  const inicio = performance.now();
  const cuadro = (ahora) => {
    const avance = (ahora - inicio) / DURACION_PASO_MS;
    if (avance >= total) {
      dibujarJugada(svg, total - 1, 1);
      cuadroPizarra = null;
      return;
    }
    dibujarJugada(svg, Math.floor(avance), avance % 1);
    cuadroPizarra = requestAnimationFrame(cuadro);
  };
  cuadroPizarra = requestAnimationFrame(cuadro);
}

/**
 * Vuelve a correr la demo de una tarjeta desde el primer cuadro. Se reemplaza
 * el bloque .demo por un clon: es la forma de reiniciar también las animaciones
 * de los pseudo-elementos y las ya terminadas, que getAnimations() no devuelve.
 * La entrada de la tarjeta misma no se repite.
 */
function reproducir(tarjeta) {
  const demo = tarjeta.querySelector('.demo');
  if (!demo) return;
  demo.replaceWith(demo.cloneNode(true));
  if (tarjeta.querySelector('#cifra-salto')) contarSalto();
  if (tarjeta.dataset.demo === 'jugadas') correrJugada(tarjeta);
}

/**
 * Cada demo queda pausada en su primer cuadro hasta que su tarjeta entra en
 * pantalla: ahí se le pone .en-vista (con una pausa corta, para que no corra
 * mientras todavía se está mirando el hero) y se deja de observar. Después se
 * repite al pasar el mouse o tocar la tarjeta, no sola: no hay animación
 * continua salvo el anillo. Sin IntersectionObserver se arrancan enseguida.
 */
function arrancarDemosAlEntrarEnPantalla() {
  const tarjetas = document.querySelectorAll('.ben[data-demo]');
  // El primer cuadro se dibuja ya: antes de que la tarjeta entre en pantalla
  // no puede haber una cancha vacía.
  const jugadas = document.querySelector('.ben[data-demo="jugadas"] svg.pz');
  if (jugadas) dibujarJugada(jugadas, 0, 0);
  const soltar = (t) => {
    t.classList.add('en-vista');
    reproducir(t);
    // Un rato en el que no se acepta otra repetición: si no, pasar el mouse
    // por encima reinicia la demo a la mitad y parpadea.
    t.dataset.corre = '1';
    setTimeout(() => delete t.dataset.corre, 2600);
  };
  for (const t of tarjetas) {
    const repetir = () => { if (t.classList.contains('en-vista') && !t.dataset.corre) soltar(t); };
    t.addEventListener('pointerenter', repetir);
    t.addEventListener('click', repetir);
  }
  if (typeof IntersectionObserver === 'undefined') {
    tarjetas.forEach((t) => t.classList.add('en-vista'));
    return;
  }
  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      observador.unobserve(e.target);
      setTimeout(() => soltar(e.target), 500);
    }
  }, { threshold: 0.3 });
  tarjetas.forEach((t) => observador.observe(t));
}

export function iniciarLandingAnimada() {
  pausarAnilloFueraDePantalla();
  arrancarDemosAlEntrarEnPantalla();
}
