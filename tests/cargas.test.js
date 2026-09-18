import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargasPorBloque } from '../src/data/cargas.js';

// Ejercicios: pasoId → nombre y bloque. `orden` es el orden de llegada de la
// base (movimiento_escalon.orden): define cuál es el último movimiento.
const SENT = { pasoId: 'sent', nombre: 'Sentadilla', bloque: 'FUERZA' };
const PRESS = { pasoId: 'press', nombre: 'Press banca', bloque: 'FUERZA' };
const SALTO = { pasoId: 'salto', nombre: 'Salto con carga', bloque: 'POTENCIA' };
const SUELTO = { pasoId: 'suelto', nombre: 'Remo', bloque: null };
const EJ = [SENT, PRESS, SALTO, SUELTO];

let orden = 0;
const mov = (jugadorId, pasoId, kg, fecha) => ({ jugadorId, pasoId, kg, fecha, orden: ++orden });

test('sin movimientos no hay bloques', () => {
  assert.deepEqual(cargasPorBloque([], EJ), []);
  assert.deepEqual(cargasPorBloque(null, EJ), []);
});

test('el % se mide contra el arranque propio de cada chico', () => {
  // A arranca en 20 y sube a 24 (+20%); B arranca en 60 y sube a 66 (+10%).
  const [fuerza] = cargasPorBloque([
    mov('a', 'press', 20, '2026-09-01'),
    mov('b', 'sent', 60, '2026-09-01'),
    mov('a', 'press', 24, '2026-09-08'),
    mov('b', 'sent', 66, '2026-09-08'),
  ], EJ);
  assert.equal(fuerza.bloque, 'FUERZA');
  assert.deepEqual(fuerza.serie.map((p) => [p.fecha, p.pct]), [['2026-09-01', 0], ['2026-09-08', 15]]);
  assert.equal(fuerza.pct, 15);
  assert.equal(fuerza.chicos, 2);
});

test('entre movimientos cada chico conserva su último peso', () => {
  // El 15 sólo se mueve A; B sigue en su +10% del 8.
  const [fuerza] = cargasPorBloque([
    mov('a', 'sent', 50, '2026-09-01'),
    mov('b', 'sent', 50, '2026-09-01'),
    mov('b', 'sent', 55, '2026-09-08'),
    mov('a', 'sent', 60, '2026-09-15'),
  ], EJ);
  assert.deepEqual(fuerza.serie.map((p) => p.pct), [0, 5, 15]);
});

test('dos movimientos el mismo día: vale el último por orden', () => {
  const [fuerza] = cargasPorBloque([
    mov('a', 'sent', 50, '2026-09-01'),
    mov('a', 'sent', 60, '2026-09-08'),
    mov('a', 'sent', 55, '2026-09-08'),
  ], EJ);
  assert.deepEqual(fuerza.serie.map((p) => p.pct), [0, 10]);
});

test('un ejercicio nuevo entra en 0% y no desploma el bloque', () => {
  // Press arranca el 8 con 20 kg: en kg bajaría el promedio; en % entra en 0.
  const [fuerza] = cargasPorBloque([
    mov('a', 'sent', 50, '2026-09-01'),
    mov('a', 'sent', 60, '2026-09-08'),
    mov('a', 'press', 20, '2026-09-08'),
  ], EJ);
  assert.deepEqual(fuerza.serie.map((p) => p.pct), [0, 10]);
  assert.deepEqual(fuerza.serie.map((p) => p.ejercicios), [1, 2]);
});

test('agrupa por bloque, en el orden en que aparecen, y "Sin bloque" al final', () => {
  const bloques = cargasPorBloque([
    mov('a', 'suelto', 30, '2026-09-01'),
    mov('a', 'salto', 10, '2026-09-01'),
    mov('a', 'sent', 50, '2026-09-01'),
  ], EJ);
  assert.deepEqual(bloques.map((b) => b.bloque), ['POTENCIA', 'FUERZA', 'Sin bloque']);
});

test('el detalle es por ejercicio, en kg promedio', () => {
  const [fuerza] = cargasPorBloque([
    mov('a', 'sent', 50, '2026-09-01'),
    mov('b', 'sent', 60, '2026-09-01'),
    mov('a', 'sent', 55, '2026-09-08'),
    mov('a', 'press', 20, '2026-09-08'),
  ], EJ);
  assert.deepEqual(fuerza.ejercicios, [
    { nombre: 'Press banca', chicos: 1, arranqueKg: 20, actualKg: 20 },
    { nombre: 'Sentadilla', chicos: 2, arranqueKg: 55, actualKg: 57.5 },
  ]);
});

test('un movimiento de un ejercicio desconocido va a "Sin bloque" con su id', () => {
  const [b] = cargasPorBloque([mov('a', 'x', 10, '2026-09-01')], EJ);
  assert.equal(b.bloque, 'Sin bloque');
});
