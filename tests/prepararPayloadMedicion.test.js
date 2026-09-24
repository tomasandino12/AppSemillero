import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararPayloadBateria, prepararPayloadSalto, prepararPayloadSprint, prepararPayloadYoyo } from '../src/data/prepararPayloadMedicion.js';

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

test('el sesionId del borrador pasa al payload de la batería', () => {
  const bateria = prepararPayloadBateria({ ...BASE, valores: { j1: { esq_izq: 7 } }, sesionId: 'sesion-1' });
  assert.equal(bateria.sesionId, 'sesion-1');
});

const SALTO = { ...BASE, sesionId: 's1', testSalto: 'cmj' };

test('payload de salto con 3 intentos', () => {
  const intentos = [
    { tiempoVueloMs: 480.5, fpsCaptura: 240 },
    { tiempoVueloMs: 500, fpsCaptura: 240 },
    { tiempoVueloMs: 495.83, fpsCaptura: 240 },
  ];
  const p = prepararPayloadSalto({ ...SALTO, valores: { j1: { intentos } } });
  assert.equal(p.tipo, 'salto');
  assert.equal(p.testSalto, 'cmj');
  assert.equal(p.sesionId, 's1');
  assert.deepEqual(p.mediciones.map((m) => m.intento), [1, 2, 3]);
  assert.deepEqual(p.mediciones[2], { jugadorId: 'j1', intento: 3, tiempoVueloMs: 495.83, fpsCaptura: 240 });
});

test('ausente va sin intentos', () => {
  const p = prepararPayloadSalto({ ...SALTO, valores: { j1: { ausente: true } } });
  assert.deepEqual(p.mediciones, [{ jugadorId: 'j1', intento: 1 }]);
});

test('intento sin tiempo no viaja, y un chico sin nada no genera filas', () => {
  const p = prepararPayloadSalto({
    ...SALTO,
    valores: {
      j1: { intentos: [{ tiempoVueloMs: null, fpsCaptura: null }, { tiempoVueloMs: 450, fpsCaptura: 240 }] },
      j2: { intentos: [] },
      j3: {},
    },
  });
  assert.deepEqual(p.mediciones, [{ jugadorId: 'j1', intento: 1, tiempoVueloMs: 450, fpsCaptura: 240 }]);
});

const SPRINT = { ...BASE, sesionId: 's1', distanciaSprintM: 30 };

test('payload de sprint: ausente en una fila', () => {
  const p = prepararPayloadSprint({ ...SPRINT, valores: { j1: { ausente: true, intentos: [{ parcialMs: 4500, tiempoMs: 10000 }] } } });
  assert.equal(p.tipo, 'sprint');
  assert.equal(p.distanciaSprintM, 30);
  assert.equal(p.sesionId, 's1');
  assert.deepEqual(p.mediciones, [{ jugadorId: 'j1', intento: 1, tiempoMs: null, parcialMs: null }]);
});

test('payload de sprint: no manda intentos vacíos y numera sin huecos', () => {
  const p = prepararPayloadSprint({
    ...SPRINT,
    valores: {
      j1: { intentos: [null, { parcialMs: 4600, tiempoMs: 10200 }] },
      j2: { intentos: [{ parcialMs: 4500, tiempoMs: 10000 }, { parcialMs: 4400, tiempoMs: 9900 }] },
      j3: { intentos: [] },
      j4: {},
    },
  });
  assert.deepEqual(p.mediciones, [
    { jugadorId: 'j1', intento: 1, tiempoMs: 10200, parcialMs: 4600 },
    { jugadorId: 'j2', intento: 1, tiempoMs: 10000, parcialMs: 4500 },
    { jugadorId: 'j2', intento: 2, tiempoMs: 9900, parcialMs: 4400 },
  ]);
});

test('payload de sprint: exige distancia 20 o 30', () => {
  for (const mala of [undefined, null, 25, '30']) {
    assert.throws(() => prepararPayloadSprint({ ...SPRINT, distanciaSprintM: mala, valores: {} }), /Distancia/);
  }
  assert.equal(prepararPayloadSprint({ ...SPRINT, distanciaSprintM: 20, valores: {} }).distanciaSprintM, 20);
});

const YOYO = { ...BASE, sesionId: 's1' };

test('payload de yoyo: una fila por jugador', () => {
  const p = prepararPayloadYoyo({ ...YOYO, valores: { j1: { idas: 40 }, j2: { idas: 0 } } });
  assert.equal(p.tipo, 'yoyo');
  assert.equal(p.sesionId, 's1');
  assert.deepEqual(p.mediciones, [{ jugadorId: 'j1', idas: 40 }, { jugadorId: 'j2', idas: 0 }]);
  assert.equal('distanciaSprintM' in p, false);
  assert.equal('testSalto' in p, false);
});

test('payload de yoyo: ausente con idas null', () => {
  const p = prepararPayloadYoyo({ ...YOYO, valores: { j1: { ausente: true, idas: 30 } } });
  assert.deepEqual(p.mediciones, [{ jugadorId: 'j1', idas: null }]);
});

test('payload de yoyo: no manda jugadores sin tocar', () => {
  const p = prepararPayloadYoyo({ ...YOYO, valores: { j1: {}, j2: { idas: null }, j3: { idas: 12 } } });
  assert.deepEqual(p.mediciones, [{ jugadorId: 'j3', idas: 12 }]);
});
