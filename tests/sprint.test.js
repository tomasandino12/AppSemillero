import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTANCIAS_SPRINT, INTENTOS_SPRINT, TIEMPO_SPRINT_MIN_MS, TIEMPO_SPRINT_MAX_MS,
  validarTiempoSprint, formatearTiempoSprint, velocidadMedia, mejorIntentoSprint,
  sesionesDeSprint, ultimaYAnterioresSprint, variacionSprint,
} from '../src/data/sprint.js';

const intento = (sesionId, fecha, n, tiempoMs, extra = {}) => ({
  sesionId, fecha, distanciaM: 30, intento: n, tiempoMs, origen: 'propio', ...extra,
});

test('constantes del protocolo', () => {
  assert.deepEqual(DISTANCIAS_SPRINT, [20, 30]);
  assert.equal(INTENTOS_SPRINT, 2);
  assert.equal(TIEMPO_SPRINT_MIN_MS, 2500);
  assert.equal(TIEMPO_SPRINT_MAX_MS, 12000);
});

test('acepta coma y punto y devuelve ms', () => {
  assert.deepEqual(validarTiempoSprint('4,5'), { ok: true, ms: 4500, error: null });
  assert.equal(validarTiempoSprint('4.53').ms, 4530);
  assert.equal(validarTiempoSprint(' 5 ').ms, 5000);
});

test('rechaza vacío, texto y fuera de rango', () => {
  for (const malo of ['', '  ', 'abc', '4e0', '1,2', '2,4', '12,1', '99']) {
    const r = validarTiempoSprint(malo);
    assert.equal(r.ok, false, malo);
    assert.equal(r.ms, null);
    assert.ok(r.error);
  }
  assert.equal(validarTiempoSprint('2,5').ok, true);
  assert.equal(validarTiempoSprint('12').ok, true);
});

test('formatea en décimas con coma', () => {
  assert.equal(formatearTiempoSprint(4530), '4,5 s');
  assert.equal(formatearTiempoSprint(5000), '5,0 s');
  assert.equal(formatearTiempoSprint(null), null);
});

test('velocidad media con un decimal y null si falta el tiempo', () => {
  assert.equal(velocidadMedia(4500, 30), 6.7);
  assert.equal(velocidadMedia(null, 30), null);
  assert.equal(velocidadMedia(4500, null), null);
  assert.equal(velocidadMedia(0, 30), null);
});

test('el mejor intento es el más rápido e ignora los ausentes', () => {
  const r = mejorIntentoSprint([intento('s', '2026-09-01', 1, 4800), intento('s', '2026-09-01', 2, 4600)]);
  assert.equal(r.tiempoMs, 4600);
  assert.equal(mejorIntentoSprint([intento('s', '2026-09-01', 1, null)]), null);
  assert.equal(mejorIntentoSprint([]), null);
});

test('agrupa por sesión, la más reciente primero', () => {
  const r = sesionesDeSprint([
    intento('a', '2026-08-01', 1, 5000),
    intento('b', '2026-09-01', 2, 4700),
    intento('b', '2026-09-01', 1, 4800),
  ]);
  assert.deepEqual(r.map((s) => s.sesionId), ['b', 'a']);
  assert.equal(r[0].mejor.tiempoMs, 4700);
  assert.deepEqual(r[0].intentos.map((i) => i.intento), [1, 2]);
});

test('marca la sesión como crear si un intento es del CReAR', () => {
  const [s] = sesionesDeSprint([
    intento('a', '2026-08-01', 1, 5000),
    intento('a', '2026-08-01', 2, 4900, { origen: 'crear' }),
  ]);
  assert.equal(s.origen, 'crear');
  assert.equal(sesionesDeSprint([intento('a', '2026-08-01', 1, 5000)])[0].origen, 'propio');
});

test('no compara sesiones de 20 m con las de 30 m', () => {
  const sesiones = sesionesDeSprint([
    intento('a', '2026-08-01', 1, 5000),
    intento('b', '2026-09-01', 1, 3300, { distanciaM: 20 }),
    intento('c', '2026-09-10', 1, 4800),
  ]);
  const r30 = ultimaYAnterioresSprint(sesiones, 30);
  assert.equal(r30.ultima.sesionId, 'c');
  assert.equal(r30.anteriores.length, 1);
  assert.equal(r30.variacionMs, -200);
  const r20 = ultimaYAnterioresSprint(sesiones, 20);
  assert.equal(r20.ultima.sesionId, 'b');
  assert.equal(ultimaYAnterioresSprint(sesiones, 25), null);
});

test('con una sola sesión no hay variación', () => {
  const r = ultimaYAnterioresSprint(sesionesDeSprint([intento('a', '2026-08-01', 1, 5000)]), 30);
  assert.equal(r.variacionMs, null);
  assert.deepEqual(r.anteriores, []);
});

test('bajar el tiempo es mejorar, y menos de una décima es igual', () => {
  assert.deepEqual(variacionSprint(-200), { texto: '−0,2 s', mejora: true });
  assert.deepEqual(variacionSprint(340), { texto: '+0,3 s', mejora: false });
  assert.deepEqual(variacionSprint(40), { texto: 'igual', mejora: null });
  assert.deepEqual(variacionSprint(null), { texto: null, mejora: null });
});
