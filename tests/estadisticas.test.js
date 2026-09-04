import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UMBRAL_INTENTOS,
  esMuestraChica,
  porcentaje,
  repartoPorJugador,
  evolucionDeTiroDelEquipo,
} from '../src/data/estadisticas.js';
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

test('el reparto ordena de mayor a menor y calcula el porcentaje del total', () => {
  const estadisticas = [
    { jugadorId: 'a', partidoId: 'p1', pts: 10 },
    { jugadorId: 'b', partidoId: 'p1', pts: 5 },
    { jugadorId: 'a', partidoId: 'p2', pts: 5 },
  ];
  const r = repartoPorJugador(estadisticas, 'pts');
  assert.equal(r.total, 20);
  assert.deepEqual(r.filas.map((f) => f.jugadorId), ['a', 'b']);
  assert.equal(r.filas[0].valor, 15);
  assert.equal(r.filas[0].porcentajeDelTotal, 75);
});

test('los NULL no suman al reparto y se cuentan aparte', () => {
  const estadisticas = [
    { jugadorId: 'a', partidoId: 'p1', minSegundos: 600 },
    { jugadorId: 'b', partidoId: 'p1', minSegundos: null },
  ];
  const r = repartoPorJugador(estadisticas, 'minSegundos');
  assert.equal(r.total, 600);
  assert.equal(r.filasSinDato, 1);
  assert.equal(r.filas.length, 1);
});

test('cuántos jugadores concentran más de la mitad', () => {
  // 10+5+3+2 = 20. El primero tiene exactamente la mitad, que NO es "más de
  // la mitad": hacen falta dos.
  const estadisticas = [
    { jugadorId: 'a', partidoId: 'p1', pts: 10 },
    { jugadorId: 'b', partidoId: 'p1', pts: 5 },
    { jugadorId: 'c', partidoId: 'p1', pts: 3 },
    { jugadorId: 'd', partidoId: 'p1', pts: 2 },
  ];
  assert.equal(repartoPorJugador(estadisticas, 'pts').jugadoresQueConcentranLaMitad, 2);
});

test('el reparto vacío no rompe', () => {
  const r = repartoPorJugador([], 'pts');
  assert.equal(r.total, 0);
  assert.deepEqual(r.filas, []);
  assert.equal(r.jugadoresQueConcentranLaMitad, 0);
});

test('la evolución del equipo suma las filas de cada partido y ordena por fecha', () => {
  const partidos = [
    { id: 'p2', fecha: '2026-05-10' },
    { id: 'p1', fecha: '2026-05-01' },
  ];
  const estadisticas = [
    { jugadorId: 'a', partidoId: 'p1', tresAnotados: 2, tresIntentados: 6, dosAnotados: 3, dosIntentados: 5, libresAnotados: 1, libresIntentados: 2 },
    { jugadorId: 'b', partidoId: 'p1', tresAnotados: 1, tresIntentados: 4, dosAnotados: 2, dosIntentados: 5, libresAnotados: 0, libresIntentados: 0 },
    { jugadorId: 'a', partidoId: 'p2', tresAnotados: 4, tresIntentados: 10, dosAnotados: 1, dosIntentados: 2, libresAnotados: 3, libresIntentados: 4 },
  ];
  const ev = evolucionDeTiroDelEquipo(partidos, estadisticas);
  assert.deepEqual(ev.map((e) => e.fecha), ['2026-05-01', '2026-05-10']);
  // p1: 3 de 10 triples entre los dos jugadores.
  assert.equal(ev[0].tres.anotados, 3);
  assert.equal(ev[0].tres.intentos, 10);
  assert.equal(ev[0].tres.pct, 30);
  assert.equal(ev[0].tres.muestraChica, false);
  // p2: 4 de 10, y los libres del partido son 3 de 4 → muestra chica.
  assert.equal(ev[1].libres.muestraChica, true);
});

test('un partido sin estadísticas cargadas no rompe la evolución', () => {
  const ev = evolucionDeTiroDelEquipo([{ id: 'p1', fecha: '2026-05-01' }], []);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].tres, null);
});
