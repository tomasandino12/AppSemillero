import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fpsDeCaptura } from '../src/data/metadatosVideo.js';

// Los átomos `keys` e `ilst` tal cual los escribió la cámara lenta del S24 FE
// (2026-09-23): versión de Android, capture.fps = 240 (float32) y el huso horario.
const KEYS_REAL = '000000706b65797300000000000000030000001b6d647461636f6d2e616e64726f69642e76657273696f6e'
  + '0000001f6d647461636f6d2e616e64726f69642e636170747572652e667073000000266d647461636f6d2e73616d73756e67'
  + '2e616e64726f69642e7574635f6f6666736574';
const ILST_REAL = '0000005b696c73740000001a000000010000001264617461000000010000000031360000001c00000002000000146461'
  + '74610000001700000000437000000000001d00000003000000156461746100000001000000002d30333030';

const deHex = (hex) => Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
const ascii = (texto) => new TextEncoder().encode(texto);
const unir = (...partes) => {
  const total = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { total.set(p, i); i += p.length; }
  return total;
};
const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const atomo = (tipo, ...contenido) => {
  const cuerpo = unir(...contenido);
  return unir(u32(8 + cuerpo.length), ascii(tipo), cuerpo);
};
const keys = (...nombres) => atomo('keys', u32(0), u32(nombres.length), ...nombres.map((n) => atomo('mdta', ascii(n))));
const dato = (tipoDato, valor) => atomo('data', u32(tipoDato), u32(0), valor);
const item = (indice, dataAtomo) => unir(u32(8 + dataAtomo.length), u32(indice), dataAtomo);
const ilst = (...items) => atomo('ilst', ...items);
const float32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, n); return b; };
const float64 = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, n); return b; };
const relleno = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 37) % 251);

const CLAVE = 'com.android.capture.fps';

test('lee 240 de los átomos reales del S24 FE', () => {
  assert.equal(fpsDeCaptura(unir(relleno(5000), deHex(KEYS_REAL), deHex(ILST_REAL), relleno(3000))), 240);
});

test('encuentra 240 en un buffer sintético', () => {
  const bytes = unir(relleno(100), keys('otra', CLAVE), ilst(item(1, dato(1, ascii('x'))), item(2, dato(23, float32(240)))));
  assert.equal(fpsDeCaptura(bytes), 240);
  assert.equal(fpsDeCaptura(unir(keys(CLAVE), ilst(item(1, dato(24, float64(120)))))), 120);
  assert.equal(fpsDeCaptura(unir(keys(CLAVE), ilst(item(1, dato(21, u32(480)))))), 480);
});

test('acepta el valor como texto', () => {
  assert.equal(fpsDeCaptura(unir(keys(CLAVE), ilst(item(1, dato(1, ascii('240.000000')))))), 240);
});

test('devuelve null sin la clave', () => {
  assert.equal(fpsDeCaptura(unir(keys('com.android.version'), ilst(item(1, dato(1, ascii('16')))))), null);
  assert.equal(fpsDeCaptura(relleno(10000)), null);
  assert.equal(fpsDeCaptura(new Uint8Array(0)), null);
});

test('ignora valores no numéricos', () => {
  for (const valor of [dato(1, ascii('abc')), dato(1, ascii('')), dato(23, float32(Number.NaN)), dato(23, float32(0)), dato(23, float32(-240))]) {
    assert.equal(fpsDeCaptura(unir(keys(CLAVE), ilst(item(1, valor)))), null);
  }
});

test('acepta la clave cerca del final', () => {
  assert.equal(fpsDeCaptura(unir(relleno(4 * 1024 * 1024 - 300), deHex(KEYS_REAL), deHex(ILST_REAL))), 240);
});

test('un "keys" suelto en los datos del video no confunde', () => {
  const basura = unir(ascii('xxkeysxxilst'), u32(0xffffffff), ascii('keys'), u32(3));
  assert.equal(fpsDeCaptura(unir(basura, deHex(KEYS_REAL), deHex(ILST_REAL))), 240);
});

test('un ilst cortado por el borde del pedazo leído da null sin romperse', () => {
  const completo = unir(deHex(KEYS_REAL), deHex(ILST_REAL));
  assert.equal(fpsDeCaptura(completo.subarray(0, completo.length - 60)), null);
});
