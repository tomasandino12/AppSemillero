import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valorContado } from '../src/data/animacion.js';

test('valorContado empieza en desde y termina en hasta', () => {
  assert.equal(valorContado(38, 42, 0), 38);
  assert.equal(valorContado(38, 42, 1), 42);
});

test('valorContado devuelve enteros', () => {
  for (let t = 0; t <= 1; t += 0.037) assert.ok(Number.isInteger(valorContado(38, 42, t)), `t=${t}`);
});

test('valorContado con t fuera de [0,1] se queda en los extremos', () => {
  assert.equal(valorContado(38, 42, -3), 38);
  assert.equal(valorContado(38, 42, 7), 42);
  assert.equal(valorContado(38, 42, NaN), 38);
});

test('valorContado sube parejo hacia hasta y frena al llegar', () => {
  const pasos = [0, 0.25, 0.5, 0.75, 1].map((t) => valorContado(0, 100, t));
  assert.deepEqual([...pasos].sort((a, b) => a - b), pasos);
  assert.ok(pasos[1] > 25, 'con easing de salida arranca rápido');
});
