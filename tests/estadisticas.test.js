import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UMBRAL_INTENTOS, esMuestraChica, porcentaje } from '../src/data/estadisticas.js';
import { POSICIONES, POSICIONES_BATERIA, INTENTOS_POR_POSICION } from '../src/data/posiciones.js';

test('la batería tiene 5 posiciones de arco más libres', () => {
  assert.equal(POSICIONES.length, 5);
  assert.equal(POSICIONES_BATERIA.length, 6);
  assert.equal(POSICIONES_BATERIA[5].id, 'libres');
  assert.equal(INTENTOS_POR_POSICION, 10);
});

test('el umbral de muestra chica es 10 intentos', () => {
  assert.equal(UMBRAL_INTENTOS, 10);
  assert.equal(esMuestraChica(9), true);
  assert.equal(esMuestraChica(10), false);
  assert.equal(esMuestraChica(35), false);
  assert.equal(esMuestraChica(null), true);
});

test('porcentaje devuelve el denominador junto al porcentaje, nunca un número pelado', () => {
  assert.deepEqual(porcentaje(7, 10), { pct: 70, anotados: 7, intentos: 10, muestraChica: false });
  assert.deepEqual(porcentaje(11, 35), { pct: 31, anotados: 11, intentos: 35, muestraChica: false });
});

test('una muestra por debajo del umbral queda marcada', () => {
  assert.equal(porcentaje(1, 2).muestraChica, true);
  assert.equal(porcentaje(9, 9).muestraChica, true);
});

test('cero anotados es un dato real, no ausencia de dato', () => {
  assert.deepEqual(porcentaje(0, 10), { pct: 0, anotados: 0, intentos: 10, muestraChica: false });
});

test('sin medir devuelve null, y nunca se confunde con cero', () => {
  assert.equal(porcentaje(null, 10), null);
  assert.equal(porcentaje(undefined, 10), null);
  assert.equal(porcentaje(5, null), null);
  assert.equal(porcentaje(5, 0), null);
  // La diferencia que importa: 0/10 SÍ es un dato, null/10 NO lo es.
  assert.notEqual(porcentaje(0, 10), null);
});
