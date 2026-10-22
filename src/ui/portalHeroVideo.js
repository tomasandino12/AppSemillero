import { html } from './html.js';
import { debeCargarVideo } from '../data/heroVideo.js';

/*
 * El video de fondo del hero del inicio (spec 2026-10-21-portal-home-inmersiva).
 * Es movimiento continuo, así que es una excepción acotada de DESIGN.md: el
 * poster se pinta primero y el video recién se pide si la persona no pidió
 * menos movimiento ni ahorra datos; se pausa cuando el hero sale de pantalla,
 * y si falla, el poster se queda. El texto y los botones del hero nunca
 * esperan al video.
 */

/** El poster, el <video> (sin src: va en data-src hasta decidir) y el velo que garantiza el contraste. */
export function htmlFondoHero(video) {
  if (!video) return html``;
  return html`<img class="portal-heroe-poster" src="${video.poster}" alt="${video.alt}" fetchpriority="high" decoding="async">
    <video class="portal-heroe-video" data-src="${video.src}" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"></video>
    <div class="portal-heroe-velo"></div>`;
}

function entornoDelNavegador() {
  return {
    movimientoReducido: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    ahorroDeDatos: navigator.connection?.saveData ?? false,
    conexion: navigator.connection?.effectiveType ?? null,
    IntersectionObserver: window.IntersectionObserver,
  };
}

/** Un play() rechazado (autoplay bloqueado) no es un error: el poster alcanza. */
const reproducir = (video) => { video.play()?.catch?.(() => {}); };

/** Devuelve true si el video quedó andando, false si se quedó el poster. */
export function iniciarVideoHero(contenedor, entorno = entornoDelNavegador()) {
  const video = contenedor?.querySelector('video');
  if (!video || !debeCargarVideo(entorno)) return false;
  video.addEventListener('error', () => video.remove(), { once: true });
  video.addEventListener('playing', () => contenedor.classList.add('reproduciendo'), { once: true });
  video.src = video.dataset.src;
  reproducir(video);
  if (typeof entorno.IntersectionObserver === 'function') {
    new entorno.IntersectionObserver(([e]) => (e.isIntersecting ? reproducir(video) : video.pause())).observe(contenedor);
  }
  return true;
}
