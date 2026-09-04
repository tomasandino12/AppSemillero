import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UMBRAL_INTENTOS,
  esMuestraChica,
  porcentaje,
  repartoPorJugador,
  evolucionDeTiroDelEquipo,
  serieDeTiroDelJugador,
  ultimaBateriaDeJugador,
  historialDePartidosDelJugador,
  promedioDeCanchaDelPlantel,
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

const SESIONES = [
  { id: 's1', fecha: '2026-03-05', tipo: 'tiro' },
  { id: 's2', fecha: '2026-04-05', tipo: 'tiro' },
  { id: 's3', fecha: '2026-04-05', tipo: 'velocidad' },
];

// s1: 5 posiciones de arco a 4/10 cada una = 20/50, y libres 8/10.
// s2: sólo libres, 6/10 (el chico faltó a lo demás no: simplemente no se midió).
const MEDICIONES = [
  ...['esq_izq', 'c45_izq', 'frontal', 'c45_der', 'esq_der'].map((posicion) => (
    { sesionId: 's1', jugadorId: 'j1', posicion, anotados: 4, intentos: 10 }
  )),
  { sesionId: 's1', jugadorId: 'j1', posicion: 'libres', anotados: 8, intentos: 10 },
  { sesionId: 's2', jugadorId: 'j1', posicion: 'libres', anotados: 6, intentos: 10 },
  // Otro jugador, ausente en s1: filas en NULL.
  ...['esq_izq', 'libres'].map((posicion) => (
    { sesionId: 's1', jugadorId: 'j2', posicion, anotados: null, intentos: 10 }
  )),
];

const PARTIDOS = [
  { id: 'p1', fecha: '2026-03-20', rivalNombre: 'Rival A' },
  { id: 'p2', fecha: '2026-04-20', rivalNombre: 'Rival B' },
];

const ESTADISTICAS = [
  { jugadorId: 'j1', partidoId: 'p1', minSegundos: 1200, pts: 9, dosAnotados: 2, dosIntentados: 4, tresAnotados: 1, tresIntentados: 5, libresAnotados: 2, libresIntentados: 2 },
  { jugadorId: 'j1', partidoId: 'p2', minSegundos: 900, pts: 5, dosAnotados: 1, dosIntentados: 3, tresAnotados: 1, tresIntentados: 2, libresAnotados: 0, libresIntentados: 1 },
];

test('la serie de triples suma las 5 posiciones del arco de cada sesión', () => {
  const s = serieDeTiroDelJugador({ sesiones: SESIONES, medicionesTiro: MEDICIONES, partidos: PARTIDOS, estadisticas: ESTADISTICAS, jugadorId: 'j1' });
  assert.equal(s.triples.practica.length, 1);
  assert.equal(s.triples.practica[0].fecha, '2026-03-05');
  assert.equal(s.triples.practica[0].valor.anotados, 20);
  assert.equal(s.triples.practica[0].valor.intentos, 50);
  assert.equal(s.triples.practica[0].valor.pct, 40);
});

test('libres es su propia serie y no entra en triples', () => {
  const s = serieDeTiroDelJugador({ sesiones: SESIONES, medicionesTiro: MEDICIONES, partidos: PARTIDOS, estadisticas: ESTADISTICAS, jugadorId: 'j1' });
  assert.deepEqual(s.libres.practica.map((p) => p.valor.anotados), [8, 6]);
  assert.deepEqual(s.libres.practica.map((p) => p.fecha), ['2026-03-05', '2026-04-05']);
});

test('la serie de partido sale de las estadísticas importadas, ordenada por fecha', () => {
  const s = serieDeTiroDelJugador({ sesiones: SESIONES, medicionesTiro: MEDICIONES, partidos: PARTIDOS, estadisticas: ESTADISTICAS, jugadorId: 'j1' });
  assert.deepEqual(s.triples.partido.map((p) => p.fecha), ['2026-03-20', '2026-04-20']);
  assert.equal(s.triples.partido[0].valor.intentos, 5);
  assert.equal(s.triples.partido[0].valor.muestraChica, true);
});

test('un jugador ausente no aporta puntos a la serie', () => {
  const s = serieDeTiroDelJugador({ sesiones: SESIONES, medicionesTiro: MEDICIONES, partidos: PARTIDOS, estadisticas: ESTADISTICAS, jugadorId: 'j2' });
  assert.deepEqual(s.triples.practica, []);
  assert.deepEqual(s.libres.practica, []);
});

test('un jugador sin nada devuelve series vacías, no rompe', () => {
  const s = serieDeTiroDelJugador({ sesiones: [], medicionesTiro: [], partidos: [], estadisticas: [], jugadorId: 'j9' });
  assert.deepEqual(s.triples.practica, []);
  assert.deepEqual(s.libres.partido, []);
});

test('la última batería es la sesión de tiro más reciente donde el jugador midió', () => {
  const b = ultimaBateriaDeJugador(SESIONES, MEDICIONES, 'j1');
  assert.equal(b.fecha, '2026-04-05');
  assert.equal(b.porPosicion.libres.anotados, 6);
});

test('un jugador ausente tiene batería con la posición en null, no en cero', () => {
  const b = ultimaBateriaDeJugador(SESIONES, MEDICIONES, 'j2');
  assert.equal(b.fecha, '2026-03-05');
  assert.equal(b.porPosicion.esq_izq, null);
});

test('sin ninguna batería devuelve null', () => {
  assert.equal(ultimaBateriaDeJugador([], [], 'j1'), null);
  assert.equal(promedioDeCanchaDelPlantel([], []), null);
});

test('el historial de partidos va del más reciente al más viejo', () => {
  const h = historialDePartidosDelJugador(PARTIDOS, ESTADISTICAS, 'j1');
  assert.deepEqual(h.map((x) => x.fecha), ['2026-04-20', '2026-03-20']);
  assert.equal(h[0].rivalNombre, 'Rival B');
  assert.equal(h[0].pts, 5);
  assert.equal(h[0].libres.pct, 0);       // 0 de 1: dato real
  assert.equal(h[1].libres.pct, 100);
});

test('el promedio del plantel usa la última sesión de tiro y saltea los ausentes', () => {
  const p = promedioDeCanchaDelPlantel(SESIONES, MEDICIONES);
  assert.equal(p.fecha, '2026-04-05');
  assert.equal(p.porPosicion.libres.anotados, 6);
  assert.equal(p.porPosicion.esq_izq, undefined);
});
