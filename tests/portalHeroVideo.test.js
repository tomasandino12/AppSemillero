import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlFondoHero, iniciarVideoHero } from '../src/ui/portalHeroVideo.js';

const VIDEO = { src: '/public/portal/hero.mp4', poster: '/public/portal/hero.jpg', alt: 'Vista del estadio' };

/** Un <video> y su contenedor de mentira: lo justo para ver qué hace iniciarVideoHero. */
function falso({ falla = false } = {}) {
  const eventos = {};
  const video = {
    dataset: { src: VIDEO.src }, src: '', quitado: false, jugadas: 0, pausas: 0,
    addEventListener: (nombre, fn) => { eventos[nombre] = fn; },
    play() { this.jugadas += 1; return falla ? Promise.reject(new Error('bloqueado')) : Promise.resolve(); },
    pause() { this.pausas += 1; },
    remove() { this.quitado = true; },
  };
  const clases = new Set();
  const contenedor = { querySelector: () => (video.quitado ? null : video), classList: { add: (c) => clases.add(c) } };
  return { video, contenedor, eventos, clases };
}

test('htmlFondoHero sin video devuelve vacío', () => {
  assert.equal(htmlFondoHero(null).toString(), '');
});

test('htmlFondoHero pone el poster y el src en data-src, nunca en src', () => {
  const out = htmlFondoHero(VIDEO).toString();
  assert.match(out, /<img class="portal-heroe-poster" src="\/public\/portal\/hero\.jpg"/);
  assert.match(out, /<video [^>]*data-src="\/public\/portal\/hero\.mp4"/);
  assert.doesNotMatch(out, /<video [^>]*\ssrc=/, 'el video no pide el archivo hasta que se decide');
  assert.match(out, /<video [^>]*\bmuted\b[^>]*\bplaysinline\b/);
  assert.match(out, /preload="none"/);
});

test('htmlFondoHero escapa el texto alternativo', () => {
  const out = htmlFondoHero({ ...VIDEO, alt: '"><script>x</script>' }).toString();
  assert.doesNotMatch(out, /<script>/);
});

test('iniciarVideoHero no asigna src con movimiento reducido', () => {
  const { video, contenedor } = falso();
  assert.equal(iniciarVideoHero(contenedor, { movimientoReducido: true }), false);
  assert.equal(video.src, '');
  assert.equal(video.jugadas, 0);
});

test('iniciarVideoHero asigna el src, reproduce y marca el contenedor al empezar', () => {
  const { video, contenedor, eventos, clases } = falso();
  assert.equal(iniciarVideoHero(contenedor, {}), true);
  assert.equal(video.src, VIDEO.src);
  assert.equal(video.jugadas, 1);
  eventos.playing();
  assert.ok(clases.has('reproduciendo'));
});

test('iniciarVideoHero quita el video si falla, y el poster queda', () => {
  const { video, contenedor, eventos } = falso();
  iniciarVideoHero(contenedor, {});
  eventos.error();
  assert.equal(video.quitado, true);
});

test('iniciarVideoHero no se rompe si el navegador bloquea el autoplay', async () => {
  const { contenedor } = falso({ falla: true });
  assert.equal(iniciarVideoHero(contenedor, {}), true);
  await new Promise((r) => setImmediate(r));
});

test('iniciarVideoHero no revienta sin IntersectionObserver', () => {
  const { contenedor } = falso();
  assert.doesNotThrow(() => iniciarVideoHero(contenedor, { IntersectionObserver: undefined }));
});

test('iniciarVideoHero pausa el video cuando el hero sale de pantalla y lo retoma al volver', () => {
  const { video, contenedor } = falso();
  let aviso;
  class Observador { constructor(fn) { aviso = fn; } observe() {} }
  iniciarVideoHero(contenedor, { IntersectionObserver: Observador });
  aviso([{ isIntersecting: false }]);
  assert.equal(video.pausas, 1);
  aviso([{ isIntersecting: true }]);
  assert.equal(video.jugadas, 2);
});

test('iniciarVideoHero sin <video> en el contenedor no hace nada', () => {
  assert.equal(iniciarVideoHero({ querySelector: () => null, classList: { add() {} } }, {}), false);
  assert.equal(iniciarVideoHero(null, {}), false);
});
