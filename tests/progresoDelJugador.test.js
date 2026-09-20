import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insumosDeEstadisticas, acumuladosDePartidos, progresionDePesos } from '../src/data/progresoDelJugador.js';
import { serieDeTiroDelJugador, ultimaBateriaConDatosDeJugador, historialDePartidosDelJugador, UMBRAL_INTENTOS } from '../src/data/estadisticas.js';

const progreso = {
  partidos: [
    { partidoId: 'p2', fecha: '2026-04-20', rivalNombre: 'B', minSegundos: 600, pts: 8, dosAnotados: 2, dosIntentados: 4, tresAnotados: 1, tresIntentados: 3, libresAnotados: 2, libresIntentados: 2 },
    { partidoId: 'p1', fecha: '2026-04-10', rivalNombre: 'A', minSegundos: 1200, pts: 14, dosAnotados: 3, dosIntentados: 5, tresAnotados: 2, tresIntentados: 5, libresAnotados: null, libresIntentados: null },
  ],
  tiro: [
    { sesionId: 's1', fecha: '2026-04-05', posicion: 'frontal', anotados: 6, intentos: 10 },
    { sesionId: 's1', fecha: '2026-04-05', posicion: 'libres', anotados: 7, intentos: 10 },
    { sesionId: 's2', fecha: '2026-04-15', posicion: 'frontal', anotados: null, intentos: 10 },
  ],
};

test('insumosDeEstadisticas arma lo que esperan las funciones de estadisticas.js', () => {
  const i = insumosDeEstadisticas(progreso, 'yo');
  assert.deepEqual(i.sesiones.map((s) => s.id).sort(), ['s1', 's2']);
  assert.ok(i.sesiones.every((s) => s.tipo === 'tiro'));
  assert.ok(i.medicionesTiro.every((m) => m.jugadorId === 'yo'));
  assert.deepEqual(i.partidos.map((p) => p.id).sort(), ['p1', 'p2']);

  const historial = historialDePartidosDelJugador(i.partidos, i.estadisticas, 'yo');
  assert.deepEqual(historial.map((h) => h.partidoId), ['p2', 'p1']);   // más reciente primero
  assert.equal(historial[0].pts, 8);

  const series = serieDeTiroDelJugador(i);
  assert.equal(series.libres.practica.length, 1);
  assert.equal(series.libres.practica[0].valor.pct, 70);
  assert.equal(series.triples.partido.length, 2);
});

test('la última batería con datos salta la sesión donde faltó', () => {
  const i = insumosDeEstadisticas(progreso, 'yo');
  const b = ultimaBateriaConDatosDeJugador(i.sesiones, i.medicionesTiro, 'yo');
  assert.equal(b.sesionId, 's1');
});

test('un progreso vacío no rompe nada', () => {
  const i = insumosDeEstadisticas({}, 'yo');
  assert.deepEqual([i.sesiones, i.medicionesTiro, i.partidos, i.estadisticas], [[], [], [], []]);
  assert.equal(acumuladosDePartidos(undefined).partidos, 0);
  assert.deepEqual(progresionDePesos(undefined), []);
});

test('acumuladosDePartidos suma lo leído y cuenta aparte lo que no', () => {
  const a = acumuladosDePartidos(progreso.partidos);
  assert.equal(a.partidos, 2);
  assert.deepEqual(a.puntos, { total: 22, partidos: 2 });
  assert.deepEqual(a.minutos, { total: 30, partidos: 2 });
  assert.equal(a.dos.anotados, 5);
  assert.equal(a.dos.intentos, 9);
  assert.equal(a.dos.pct, 56);
  // Los libres del partido 1 no se leyeron: no suman ni cuentan como 0 de 0.
  assert.equal(a.libres.anotados, 2);
  assert.equal(a.libres.intentos, 2);
});

test('acumuladosDePartidos: pocos intentos se marcan muestra chica, no se maquillan', () => {
  const a = acumuladosDePartidos([{ tresAnotados: 1, tresIntentados: 2, pts: 3, minSegundos: 300 }]);
  assert.ok(a.tres.intentos < UMBRAL_INTENTOS);
  assert.equal(a.tres.muestraChica, true);
});

test('acumuladosDePartidos: un null es "no se sabe", nunca cero', () => {
  const a = acumuladosDePartidos([
    { pts: null, minSegundos: null, dosAnotados: null, dosIntentados: null },
    { pts: 6, minSegundos: 600, dosAnotados: 3, dosIntentados: 6 },
  ]);
  assert.deepEqual(a.puntos, { total: 6, partidos: 1 });
  assert.deepEqual(a.sinDato, { puntos: 1, minutos: 1 });
  assert.equal(a.dos.intentos, 6);
  // Sin ningún par leído no hay porcentaje que mostrar.
  assert.equal(acumuladosDePartidos([{ tresAnotados: null, tresIntentados: null }]).tres, null);
});

test('progresionDePesos agrupa por ejercicio, en orden de llegada', () => {
  const p = progresionDePesos([
    { clave: 'SENTADILLA', nombre: 'Sentadilla', kg: '40', creadoEn: '2026-04-01T15:00:00Z' },
    { clave: 'PRESS', nombre: 'Press', kg: 20, creadoEn: '2026-04-02T15:00:00Z' },
    { clave: 'SENTADILLA', nombre: 'Sentadilla', kg: '42.5', creadoEn: '2026-04-15T15:00:00Z' },
  ]);
  assert.deepEqual(p.map((x) => x.nombre), ['Press', 'Sentadilla']);
  const sentadilla = p[1];
  assert.equal(sentadilla.inicialKg, 40);
  assert.equal(sentadilla.actualKg, 42.5);
  assert.equal(sentadilla.variacionKg, 2.5);
  assert.deepEqual(sentadilla.movimientos.map((m) => m.kg), [40, 42.5]);
});

test('progresionDePesos: con un solo movimiento no hay variación que inventar', () => {
  const [press] = progresionDePesos([{ clave: 'PRESS', nombre: 'Press', kg: 20, creadoEn: '2026-04-02T15:00:00Z' }]);
  assert.equal(press.variacionKg, null);
  assert.equal(press.actualKg, 20);
});

test('progresionDePesos: una baja es una variación negativa, sin suavizar', () => {
  const [x] = progresionDePesos([
    { clave: 'A', nombre: 'A', kg: 50, creadoEn: '2026-04-01T15:00:00Z' },
    { clave: 'A', nombre: 'A', kg: 47.5, creadoEn: '2026-04-08T15:00:00Z' },
  ]);
  assert.equal(x.variacionKg, -2.5);
});
