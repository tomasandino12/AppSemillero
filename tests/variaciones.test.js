import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EJES, NIVEL, nombreDeEje, nivelSugerido, ordenarVariaciones, validarVariacion,
} from '../src/data/variaciones.js';

const v = (nivel, creadoEn, id = `${nivel}-${creadoEn}`) => ({ id, nivel, creadoEn });

test('sugiere el siguiente nivel sin pasar de 5', () => {
  assert.equal(nivelSugerido([]), NIVEL.min);
  assert.equal(nivelSugerido([v(1, 'a'), v(3, 'b')]), 4);
  assert.equal(nivelSugerido([v(5, 'a')]), NIVEL.max);
});

test('ordena por nivel y a igual nivel por fecha', () => {
  const lista = [
    v(2, '2026-09-20T10:00:00Z', 'b'),
    v(1, '2026-09-25T10:00:00Z', 'a'),
    v(2, '2026-09-18T10:00:00Z', 'c'),
  ];
  assert.deepEqual(ordenarVariaciones(lista).map((x) => x.id), ['a', 'c', 'b']);
  // No toca el arreglo original.
  assert.equal(lista[0].id, 'b');
});

test('rechaza título vacío o nivel fuera de rango', () => {
  assert.equal(validarVariacion({ titulo: 'Con defensor', nivel: 2 }).ok, true);
  assert.equal(validarVariacion({ titulo: '   ', nivel: 2 }).ok, false);
  assert.equal(validarVariacion({ titulo: 'x', nivel: 0 }).ok, false);
  assert.equal(validarVariacion({ titulo: 'x', nivel: 6 }).ok, false);
  assert.equal(validarVariacion({ titulo: 'x', nivel: 2.5 }).ok, false);
});

test('rechaza un eje que no está en la lista', () => {
  assert.equal(validarVariacion({ titulo: 'x', nivel: 1, eje: 'oposicion' }).ok, true);
  assert.equal(validarVariacion({ titulo: 'x', nivel: 1, eje: null }).ok, true);
  assert.equal(validarVariacion({ titulo: 'x', nivel: 1, eje: 'inventado' }).ok, false);
});

test('rechaza textos más largos que el límite', () => {
  assert.equal(validarVariacion({ titulo: 'x'.repeat(151), nivel: 1 }).ok, false);
  assert.equal(validarVariacion({ titulo: 'x', nivel: 1, descripcion: 'x'.repeat(2001) }).ok, false);
});

test('un eje desconocido se muestra crudo', () => {
  assert.equal(nombreDeEje('oposicion'), 'Oposición');
  assert.equal(nombreDeEje('transicion'), 'transicion');
  assert.equal(nombreDeEje(null), '');
});

test('los ejes cubren básquet y físico', () => {
  assert.deepEqual(EJES.map((e) => e.id), ['oposicion', 'espacio', 'tiempo', 'numero', 'regla', 'carga']);
});
