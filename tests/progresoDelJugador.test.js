import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insumosDeEstadisticas, acumuladosDePartidos, progresionDePesos, pesosPorBloque, bloquePorClaveDePlanes, pesosDeMovimientos } from '../src/data/progresoDelJugador.js';
import { serieDeTiroDelJugador, ultimaBateriaConDatosDeJugador, historialDePartidosDelJugador, UMBRAL_INTENTOS } from '../src/data/estadisticas.js';
import { claveDeEjercicio } from '../src/data/escalones.js';

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

const mov = (clave, kg, dia) => ({ clave, nombre: clave, kg, creadoEn: `2026-04-${dia}T15:00:00Z` });

test('progresionDePesos: cada ejercicio lleva su bloque, y sin dato queda en null', () => {
  const bloques = new Map([['PRESS', 'FUERZA']]);
  const p = progresionDePesos([mov('PRESS', 20, '01'), mov('PLANCHA', 0.5, '02')], bloques);
  assert.equal(p.find((x) => x.clave === 'PRESS').bloque, 'FUERZA');
  assert.equal(p.find((x) => x.clave === 'PLANCHA').bloque, null);
});

test('pesosPorBloque agrupa por bloque en el orden del plan y deja "Sin bloque" al final', () => {
  const bloques = new Map([['SENTADILLA', 'FUERZA'], ['PLANCHA', 'CORE'], ['PRESS', 'FUERZA']]);
  const ejercicios = progresionDePesos([
    mov('PRESS', 20, '01'), mov('PRESS', 25, '08'),
    mov('SUELTO', 5, '02'),
    mov('PLANCHA', 1, '03'),
    mov('SENTADILLA', 40, '04'),
  ], bloques);
  const grupos = pesosPorBloque(ejercicios, bloques);
  assert.deepEqual(grupos.map((g) => g.bloque), ['FUERZA', 'CORE', 'Sin bloque']);
  assert.deepEqual(grupos[0].ejercicios.map((e) => e.clave), ['PRESS', 'SENTADILLA']);
});

test('pesosPorBloque cuenta cuántos subieron: una baja o un solo movimiento no cuentan', () => {
  const bloques = new Map([['A', 'FUERZA'], ['B', 'FUERZA'], ['C', 'FUERZA'], ['D', 'FUERZA']]);
  const ejercicios = progresionDePesos([
    mov('A', 10, '01'), mov('A', 12, '08'),
    mov('B', 10, '01'), mov('B', 8, '08'),
    mov('C', 10, '01'), mov('C', 10, '08'),
    mov('D', 10, '01'),
  ], bloques);
  const [fuerza] = pesosPorBloque(ejercicios, bloques);
  assert.equal(fuerza.subieron, 1);
  assert.equal(fuerza.ejercicios.length, 4);
});

test('pesosPorBloque sin ejercicios devuelve una lista vacía', () => {
  assert.deepEqual(pesosPorBloque([], new Map()), []);
  assert.deepEqual(pesosPorBloque(undefined, undefined), []);
});

const linea = (orden, bloque, nombreOriginal) => ({ id: `l${orden}`, orden, bloque, nombreOriginal });

test('bloquePorClaveDePlanes une cada línea del plan con su clave y respeta el orden del plan', () => {
  const planes = [{
    planId: 'p', plantelId: 'x', categoria: 'U15', nombreArchivo: 'a.xlsx',
    sesiones: [
      { id: 's2', fecha: '2026-04-08', lineas: [linea(1, 'CORE', 'Plancha')] },
      { id: 's1', fecha: '2026-04-01', lineas: [linea(2, 'FUERZA', 'Press plano'), linea(1, 'POTENCIA', 'Salto')] },
    ],
  }];
  const mapa = bloquePorClaveDePlanes(planes);
  assert.equal(mapa.get(claveDeEjercicio('Press plano')), 'FUERZA');
  assert.equal(mapa.get(claveDeEjercicio('Plancha')), 'CORE');
  // Sesión más vieja primero y, dentro de ella, por `orden`: POTENCIA, FUERZA, CORE.
  assert.deepEqual([...new Set(mapa.values())], ['POTENCIA', 'FUERZA', 'CORE']);
});

test('bloquePorClaveDePlanes: sin planes o líneas sin bloque no inventa nada', () => {
  assert.equal(bloquePorClaveDePlanes(undefined).size, 0);
  const planes = [{ sesiones: [{ fecha: '2026-04-01', lineas: [linea(1, null, 'Suelto')] }] }];
  assert.equal(bloquePorClaveDePlanes(planes).size, 0);
});

test('progresionDePesos: una fecha ya local no se corre de día al leerla', () => {
  const [x] = progresionDePesos([{ clave: 'A', nombre: 'A', kg: 10, fecha: '2026-04-01' }]);
  assert.equal(x.movimientos[0].fecha, '2026-04-01');
});

test('pesosDeMovimientos adapta lo que lee el profe: orden por fecha, bloque por ejercicio', () => {
  const ejercicios = [
    { pasoId: 'p1', nombre: 'Plancha', bloque: 'CORE' },
    { pasoId: 'p2', nombre: 'Sentadilla', bloque: 'FUERZA' },
    { pasoId: 'p3', nombre: 'Suelto', bloque: null },
  ];
  const movimientos = [
    { jugadorId: 'j', pasoId: 'p2', kg: 42.5, fecha: '2026-04-15', orden: 3 },
    { jugadorId: 'j', pasoId: 'p1', kg: 1, fecha: '2026-04-05', orden: 2 },
    { jugadorId: 'j', pasoId: 'p2', kg: 40, fecha: '2026-04-01', orden: 1 },
    { jugadorId: 'j', pasoId: 'p3', kg: 5, fecha: '2026-04-20', orden: 4 },
  ];
  const { escalones, bloquePorClave } = pesosDeMovimientos(movimientos, ejercicios);
  assert.deepEqual(escalones.map((e) => e.kg), [40, 1, 42.5, 5]);
  // Los bloques en el orden en que aparecen sus movimientos, como en DATOS.
  assert.deepEqual([...new Set(bloquePorClave.values())], ['FUERZA', 'CORE']);

  const grupos = pesosPorBloque(progresionDePesos(escalones, bloquePorClave), bloquePorClave);
  assert.deepEqual(grupos.map((g) => g.bloque), ['FUERZA', 'CORE', 'Sin bloque']);
  assert.equal(grupos[0].ejercicios[0].variacionKg, 2.5);
});

test('pesosDeMovimientos: sin movimientos no hay nada, y un ejercicio desconocido no rompe', () => {
  assert.deepEqual(pesosDeMovimientos(undefined, undefined).escalones, []);
  const { escalones } = pesosDeMovimientos([{ pasoId: 'x', kg: 3, fecha: '2026-04-01', orden: 1 }], []);
  assert.equal(escalones.length, 1);
  assert.equal(progresionDePesos(escalones)[0].nombre, 'x');
});
