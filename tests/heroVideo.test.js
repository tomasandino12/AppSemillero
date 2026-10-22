import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroVideoValido, debeCargarVideo } from '../src/data/heroVideo.js';

/**
 * El video del hero es un <video src> de la página pública: sólo uno propio
 * (la CSP no deja cargar medios de otro sitio) y sólo si la persona no pidió
 * menos movimiento ni ahorra datos.
 */

const BUENO = { src: '/public/portal/hero.mp4', poster: '/public/portal/hero.webp', alt: 'Vista aérea del estadio' };

test('heroVideoValido acepta uno propio', () => {
  assert.deepEqual(heroVideoValido(BUENO), BUENO);
  assert.equal(heroVideoValido({ ...BUENO, src: '/public/portal/hero-2.webm' })?.src, '/public/portal/hero-2.webm');
});

test('heroVideoValido rechaza rutas de otro sitio, formatos raros y sin alt', () => {
  assert.equal(heroVideoValido({ ...BUENO, src: 'https://www.newellsoldboys.com.ar/videos/hero-drone.mp4' }), null);
  assert.equal(heroVideoValido({ ...BUENO, src: '/public/otra/hero.mp4' }), null);
  assert.equal(heroVideoValido({ ...BUENO, src: '/public/portal/../x.mp4' }), null);
  assert.equal(heroVideoValido({ ...BUENO, src: '/public/portal/hero.mov' }), null);
  assert.equal(heroVideoValido({ ...BUENO, poster: '/public/portal/hero.mp4' }), null);
  assert.equal(heroVideoValido({ ...BUENO, alt: '  ' }), null);
});

test('heroVideoValido devuelve null con null o sin nada', () => {
  assert.equal(heroVideoValido(null), null);
  assert.equal(heroVideoValido(undefined), null);
  assert.equal(heroVideoValido({}), null);
});

test('debeCargarVideo es false con movimiento reducido', () => {
  assert.equal(debeCargarVideo({ movimientoReducido: true }), false);
});

test('debeCargarVideo es false con ahorro de datos', () => {
  assert.equal(debeCargarVideo({ ahorroDeDatos: true }), false);
});

test('debeCargarVideo es false con conexión lenta (slow-2g o 2g)', () => {
  assert.equal(debeCargarVideo({ conexion: 'slow-2g' }), false);
  assert.equal(debeCargarVideo({ conexion: '2g' }), false);
});

test('debeCargarVideo es true sin restricciones, aunque el navegador no diga la conexión', () => {
  assert.equal(debeCargarVideo({ movimientoReducido: false, ahorroDeDatos: false, conexion: '4g' }), true);
  assert.equal(debeCargarVideo({}), true);
});

test('los archivos de PORTAL.heroVideo existen, son válidos y pesan lo permitido', async () => {
  const { existsSync, statSync } = await import('node:fs');
  const { PORTAL } = await import('../src/data/portal.js');
  const v = heroVideoValido(PORTAL.heroVideo);
  assert.ok(v, 'PORTAL.heroVideo no pasa heroVideoValido');
  const disco = (ruta) => new URL(`..${ruta}`, import.meta.url);
  assert.ok(existsSync(disco(v.src)), `falta ${v.src}`);
  assert.ok(existsSync(disco(v.poster)), `falta ${v.poster}`);
  assert.ok(statSync(disco(v.src)).size <= 4 * 1024 * 1024, 'el video pesa más de 4 MB');
  assert.ok(statSync(disco(v.poster)).size <= 150 * 1024, 'el poster pesa más de 150 KB');
});
