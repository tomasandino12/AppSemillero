import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tablaDeCuadros, cuadroEnTiempo } from '../src/data/tablaCuadros.js';

const ascii = (texto) => new TextEncoder().encode(texto);
const unir = (...partes) => {
  const total = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { total.set(p, i); i += p.length; }
  return total;
};
const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); return b; };
const atomo = (tipo, ...contenido) => {
  const cuerpo = unir(...contenido);
  return unir(u32(8 + cuerpo.length), ascii(tipo), cuerpo);
};
const relleno = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 37) % 251);

// stts: [[cantidad, duración], ...]; ctts: [[cantidad, desfase], ...]
const stts = (entradas) => atomo('stts', u32(0), u32(entradas.length), ...entradas.flatMap(([c, d]) => [u32(c), u32(d)]));
const ctts = (entradas, version = 0) => atomo('ctts', u32(version << 24), u32(entradas.length), ...entradas.flatMap(([c, d]) => [u32(c), u32(d)]));
const hdlr = (tipo) => atomo('hdlr', u32(0), u32(0), ascii(tipo), new Uint8Array(13));
const mdhd = (escala) => atomo('mdhd', u32(0), u32(0), u32(0), u32(escala), u32(0), u32(0));
const pista = (tipo, escala, ...tablas) => atomo('trak', atomo('mdia', mdhd(escala), hdlr(tipo), atomo('minf', atomo('stbl', ...tablas))));
const moov = (...pistas) => atomo('moov', atomo('mvhd', new Uint8Array(100)), ...pistas);
const video = (tablas, escala = 90000) => pista('vide', escala, ...tablas);
const audio = () => pista('soun', 48000, stts([[100, 1024]]));

test('lee los tiempos de cada cuadro de la pista de video', () => {
  const t = tablaDeCuadros(moov(audio(), video([stts([[4, 3000]])])));
  assert.equal(t.tiempos.length, 4);
  assert.deepEqual(t.tiempos.map((x) => Math.round(x * 1000)), [0, 33, 67, 100]);
  assert.ok(Math.abs(t.intervaloS - 1 / 30) < 1e-9);
});

test('el cuadro 0 suelto de la cámara lenta del S24 FE no rompe el resto', () => {
  // Medido en el archivo real: el primer cuadro dura 1,1715 s y los demás 33,33 ms.
  const t = tablaDeCuadros(moov(video([stts([[1, 105438], [5, 3000]])])));
  assert.equal(t.tiempos.length, 6);
  assert.ok(Math.abs(t.tiempos[1] - 1.1715) < 1e-4);
  assert.ok(Math.abs(t.intervaloS - 1 / 30) < 1e-9, 'el intervalo es la mediana, no el promedio');
});

test('con cuadros B ordena por tiempo de presentación', () => {
  // Orden de decodificación con presentación en los pasos 2,4,3,5 (cada paso = 3000 ticks):
  // ordenados y corridos al cero quedan 0,1,2,3.
  const t = tablaDeCuadros(moov(video([stts([[4, 3000]]), ctts([[1, 6000], [1, 9000], [1, 3000], [1, 6000]])])));
  assert.deepEqual(t.tiempos.map((x) => Math.round(x * 30)), [0, 1, 2, 3]);
});

test('acepta desfases con signo (ctts versión 1)', () => {
  const t = tablaDeCuadros(moov(video([stts([[3, 3000]]), ctts([[3, 0xfffffc18]], 1)])));
  assert.equal(t.tiempos.length, 3);
  assert.ok(Math.abs(t.tiempos[1] - t.tiempos[0] - 1 / 30) < 1e-9);
});

test('encuentra el moov aunque haya bytes de video antes', () => {
  const bytes = unir(relleno(5000), moov(video([stts([[3, 3000]])])), relleno(100));
  assert.equal(tablaDeCuadros(bytes).tiempos.length, 3);
});

test('un "moov" suelto dentro del video no confunde', () => {
  const basura = unir(ascii('moov'), u32(0xffffffff), ascii('xxmoov'), u32(12), ascii('moovmvhd'));
  const bytes = unir(basura, relleno(300), moov(video([stts([[3, 3000]])])));
  assert.equal(tablaDeCuadros(bytes).tiempos.length, 3);
});

test('devuelve null sin moov, sin pista de video o cortado', () => {
  assert.equal(tablaDeCuadros(relleno(10000)), null);
  assert.equal(tablaDeCuadros(new Uint8Array(0)), null);
  assert.equal(tablaDeCuadros(moov(audio())), null);
  const completo = moov(video([stts([[3, 3000]])]));
  assert.equal(tablaDeCuadros(completo.subarray(0, completo.length - 20)), null);
});

test('devuelve null si la tabla no tiene cuadros o es incoherente', () => {
  assert.equal(tablaDeCuadros(moov(video([stts([])]))), null);
  assert.equal(tablaDeCuadros(moov(video([stts([[3, 3000]]), ctts([[1, 0]])]))), null);
});

test('cuadroEnTiempo devuelve el cuadro que se está mostrando en ese tiempo', () => {
  const tiempos = [0, 1.17, 1.2033, 1.2367];
  assert.equal(cuadroEnTiempo(tiempos, 0), 0);
  assert.equal(cuadroEnTiempo(tiempos, 0.5), 0, 'dentro del cuadro 0 largo');
  assert.equal(cuadroEnTiempo(tiempos, 1.17), 1);
  assert.equal(cuadroEnTiempo(tiempos, 1.22), 2);
  assert.equal(cuadroEnTiempo(tiempos, 99), 3);
  assert.equal(cuadroEnTiempo(tiempos, -1), 0);
});
