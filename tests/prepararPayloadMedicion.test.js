import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararPayloadBateria, prepararPayloadVelocidad, redondearSegundos } from '../src/data/prepararPayloadMedicion.js';

const BASE = { clubId: 'c1', plantelId: 'pl1', fecha: '2026-03-05' };

test('un jugador medido genera una fila por posición cargada', () => {
  const p = prepararPayloadBateria({ ...BASE, valores: { j1: { esq_izq: 7, frontal: 4 } } });
  assert.equal(p.tipo, 'tiro');
  assert.equal(p.mediciones.length, 2);
  assert.deepEqual(p.mediciones[0], { jugadorId: 'j1', posicion: 'esq_izq', anotados: 7, intentos: 10 });
});

test('cero es un valor cargado, no una posición vacía', () => {
  const p = prepararPayloadBateria({ ...BASE, valores: { j1: { esq_izq: 0 } } });
  assert.equal(p.mediciones.length, 1);
  assert.equal(p.mediciones[0].anotados, 0);
});

test('un jugador ausente genera las 6 posiciones en null', () => {
  const p = prepararPayloadBateria({ ...BASE, valores: { j1: { ausente: true } } });
  assert.equal(p.mediciones.length, 6);
  assert.ok(p.mediciones.every((m) => m.anotados === null));
  assert.ok(p.mediciones.every((m) => m.intentos === 10));
});

test('ausente pisa cualquier valor que hubiera quedado cargado antes', () => {
  const p = prepararPayloadBateria({ ...BASE, valores: { j1: { ausente: true, esq_izq: 7 } } });
  assert.equal(p.mediciones.length, 6);
  assert.ok(p.mediciones.every((m) => m.anotados === null));
});

test('un jugador al que la sesión nunca llegó no genera ninguna fila', () => {
  const p = prepararPayloadBateria({ ...BASE, valores: { j1: {}, j2: { esq_izq: 5 } } });
  assert.deepEqual(p.mediciones.map((m) => m.jugadorId), ['j2']);
});

test('el borrador vacío no rompe', () => {
  assert.deepEqual(prepararPayloadBateria({ ...BASE, valores: {} }).mediciones, []);
  assert.deepEqual(prepararPayloadBateria({ ...BASE, valores: undefined }).mediciones, []);
});

test('la velocidad se redondea a un decimal', () => {
  assert.equal(redondearSegundos('4.73'), 4.7);
  assert.equal(redondearSegundos('4.75'), 4.8);
  assert.equal(redondearSegundos(5), 5);
});

test('una velocidad inválida o vacía no genera fila', () => {
  assert.equal(redondearSegundos(''), null);
  assert.equal(redondearSegundos(null), null);
  assert.equal(redondearSegundos('abc'), null);
  assert.equal(redondearSegundos('-3'), null);
  assert.equal(redondearSegundos('0'), null);
  const p = prepararPayloadVelocidad({ ...BASE, valores: { j1: '', j2: '4.62' } });
  assert.deepEqual(p.mediciones, [{ jugadorId: 'j2', segundos: 4.6 }]);
  assert.equal(p.tipo, 'velocidad');
});
