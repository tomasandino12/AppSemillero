import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargasPorBloque, bloquesPorClave } from '../src/data/cargas.js';

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

test('el arranque es el primero por fecha, aunque se haya cargado después', () => {
  // Un movimiento con fecha anterior que llegó a la base más tarde (orden
  // mayor) sigue siendo el arranque: la curva va por fecha.
  const [fuerza] = cargasPorBloque([
    { jugadorId: 'a', pasoId: 'sent', kg: 60, fecha: '2026-09-08', orden: 1 },
    { jugadorId: 'a', pasoId: 'sent', kg: 50, fecha: '2026-09-01', orden: 2 },
  ], EJ);
  assert.deepEqual(fuerza.serie.map((p) => [p.fecha, p.pct]), [['2026-09-01', 0], ['2026-09-08', 20]]);
});

/* ---------- el bloque de cada ejercicio: la aparición más reciente ---------- */

const linea = (clave, bloque, fecha, orden = 1) => ({ clave, bloque, fecha, orden });

test('vale el bloque de la aparición más reciente por fecha de sesión', () => {
  // PRESS ARNOLD en el archivo real: AUX/CORE en marzo, AUXILIAR, y FUERZA el 24/04.
  const b = bloquesPorClave([
    linea('PRESS ARNOLD', 'FUERZA', '2026-04-24'),
    linea('PRESS ARNOLD', 'AUX/CORE', '2026-03-09'),
    linea('PRESS ARNOLD', 'AUXILIAR', '2026-04-03'),
  ]);
  assert.equal(b.get('PRESS ARNOLD'), 'FUERZA');
});

test('AUX/CORE se guarda tal cual: es un bloque más', () => {
  const b = bloquesPorClave([linea('REMO', 'AUX/CORE', '2026-03-23')]);
  assert.equal(b.get('REMO'), 'AUX/CORE');
});

test('el mismo día con dos bloques: gana la línea que va más abajo en la sesión', () => {
  const b = bloquesPorClave([
    linea('X', 'CORE', '2026-04-10', 7),
    linea('X', 'AUXILIAR', '2026-04-10', 3),
  ]);
  assert.equal(b.get('X'), 'CORE');
});

test('una aparición sin bloque no pisa el bloque de las anteriores', () => {
  const b = bloquesPorClave([
    linea('X', 'FUERZA', '2026-04-01'),
    linea('X', null, '2026-04-20'),
  ]);
  assert.equal(b.get('X'), 'FUERZA');
});

test('sin bloque en ninguna aparición no entra al mapa (queda "Sin bloque")', () => {
  const b = bloquesPorClave([linea('X', null, '2026-04-01'), linea('X', '  ', '2026-04-02')]);
  assert.equal(b.has('X'), false);
});

test('con los bloques de las sesiones, un ejercicio que no está en la hoja Ejercicios igual tiene bloque', () => {
  // El bug: PRESS PLANO no está en la hoja "Ejercicios" y caía en "Sin bloque".
  const bloques = bloquesPorClave([linea('PRESS PLANO', 'FUERZA', '2026-04-27')]);
  const [b] = cargasPorBloque(
    [mov('a', 'pp', 20, '2026-09-01')],
    [{ pasoId: 'pp', nombre: 'PRESS PLANO', bloque: bloques.get('PRESS PLANO') ?? null }],
  );
  assert.equal(b.bloque, 'FUERZA');
});
