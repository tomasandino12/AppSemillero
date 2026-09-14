import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UMBRAL_INTENTOS,
  esMuestraChica,
  porcentaje,
  margenDeDiferencia,
  compararPorcentajes,
  zonasDeSesion,
  zonasDelFoco,
  jugadoresDeZona,
  contarPorDebajo,
  totalDeZonas,
  serieDeZonas,
  serieDeZonasAgregada,
  serieDePartidosAgregada,
  ejeComun,
  repartoPorJugador,
  evolucionDeTiroDelEquipo,
  serieDeTiroDelJugador,
  ultimaBateriaDeJugador,
  ultimaBateriaConDatosDeJugador,
  historialDePartidosDelJugador,
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
});

test('ultimaBateriaConDatosDeJugador salta una ausencia completa más reciente y trae la última con datos reales', () => {
  const sesiones = [
    { id: 's1', fecha: '2026-03-05', tipo: 'tiro' },
    { id: 's2', fecha: '2026-04-05', tipo: 'tiro' },
  ];
  const mediciones = [
    // s1: el chico tiró de verdad.
    { sesionId: 's1', jugadorId: 'jX', posicion: 'esq_izq', anotados: 5, intentos: 10 },
    { sesionId: 's1', jugadorId: 'jX', posicion: 'libres', anotados: 7, intentos: 10 },
    // s2: faltó a la sesión completa (las 6 filas quedan en null).
    { sesionId: 's2', jugadorId: 'jX', posicion: 'esq_izq', anotados: null, intentos: 10 },
    { sesionId: 's2', jugadorId: 'jX', posicion: 'libres', anotados: null, intentos: 10 },
  ];
  // ultimaBateriaDeJugador no cambia de contrato: sigue trayendo la ausencia.
  const masReciente = ultimaBateriaDeJugador(sesiones, mediciones, 'jX');
  assert.equal(masReciente.fecha, '2026-04-05');
  assert.equal(masReciente.porPosicion.esq_izq, null);
  // La nueva función salta esa ausencia y trae la sesión anterior, con datos.
  const conDatos = ultimaBateriaConDatosDeJugador(sesiones, mediciones, 'jX');
  assert.equal(conDatos.fecha, '2026-03-05');
  assert.equal(conDatos.porPosicion.esq_izq.anotados, 5);
});

test('ultimaBateriaConDatosDeJugador coincide con ultimaBateriaDeJugador cuando la más reciente ya tiene datos reales', () => {
  const conDatos = ultimaBateriaConDatosDeJugador(SESIONES, MEDICIONES, 'j1');
  assert.equal(conDatos.fecha, '2026-04-05');
  assert.equal(conDatos.porPosicion.libres.anotados, 6);
});

test('ultimaBateriaConDatosDeJugador devuelve null si el jugador nunca tuvo un dato real', () => {
  // j2 sólo tiene la fila de s1, y ahí está ausente (todo en null).
  assert.equal(ultimaBateriaConDatosDeJugador(SESIONES, MEDICIONES, 'j2'), null);
  assert.equal(ultimaBateriaConDatosDeJugador([], [], 'j9'), null);
});

test('el historial de partidos va del más reciente al más viejo', () => {
  const h = historialDePartidosDelJugador(PARTIDOS, ESTADISTICAS, 'j1');
  assert.deepEqual(h.map((x) => x.fecha), ['2026-04-20', '2026-03-20']);
  assert.equal(h[0].rivalNombre, 'Rival B');
  assert.equal(h[0].pts, 5);
  assert.equal(h[0].libres.pct, 0);       // 0 de 1: dato real
  assert.equal(h[1].libres.pct, 100);
});



/* ---------- Card de HOY ---------- */

test('el margen de dos baterías grandes da los ~5 puntos esperados', () => {
  // ~700 intentos al 35% cada una: error estándar 1,8 pp cada una, compuesto
  // 2,5 pp, por 1,96 = 5 pp.
  const margen = margenDeDiferencia(porcentaje(245, 700), porcentaje(252, 700));
  assert.ok(margen > 4.5 && margen < 5.5, `margen fuera de rango: ${margen}`);
});

test('una diferencia dentro del ruido no es concluyente', () => {
  const c = compararPorcentajes(porcentaje(252, 700), porcentaje(245, 700));
  assert.equal(c.pp, 1);
  assert.equal(c.concluyente, false);
});

test('una diferencia que supera el margen sí es concluyente', () => {
  const c = compararPorcentajes(porcentaje(301, 700), porcentaje(245, 700));
  assert.equal(c.pp, 8);
  assert.equal(c.concluyente, true);
});

test('el signo de la variación dice para qué lado se movió', () => {
  assert.ok(compararPorcentajes(porcentaje(200, 700), porcentaje(245, 700)).pp < 0);
});

test('sin batería anterior no hay variación: null, nunca un cero con flecha', () => {
  assert.equal(compararPorcentajes(porcentaje(245, 700), null), null);
  assert.equal(compararPorcentajes(null, porcentaje(245, 700)), null);
  assert.equal(margenDeDiferencia(porcentaje(1, 10), null), null);
});

test('un 10 de 10 no vuelve concluyente a cualquier diferencia', () => {
  // Sin el ajuste de Agresti-Caffo el error estándar de 10/10 sería cero y el
  // margen daría cero, declarando concluyente hasta una diferencia mínima.
  const margen = margenDeDiferencia(porcentaje(10, 10), porcentaje(9, 10));
  assert.ok(margen > 15, `el margen tendría que ser grande con n=10, dio ${margen}`);
  assert.equal(compararPorcentajes(porcentaje(10, 10), porcentaje(9, 10)).concluyente, false);
});

test('las zonas de una sesión suman sobre las filas reales, no sobre lo asumido', () => {
  // 3 jugadores citados, uno ausente: el denominador es 20, no 30.
  const mediciones = [
    { sesionId: 's1', jugadorId: 'a', posicion: 'frontal', anotados: 4, intentos: 10 },
    { sesionId: 's1', jugadorId: 'b', posicion: 'frontal', anotados: 6, intentos: 10 },
    { sesionId: 's1', jugadorId: 'c', posicion: 'frontal', anotados: null, intentos: 10 },
    { sesionId: 's2', jugadorId: 'a', posicion: 'frontal', anotados: 9, intentos: 10 },
  ];
  const r = zonasDeSesion(mediciones, 's1');
  assert.equal(r.porZona.frontal.intentos, 20);
  assert.equal(r.porZona.frontal.anotados, 10);
  assert.equal(r.jugadoresQueMidieron, 2);
});

test('una sesión sin nadie medido no rompe ni inventa zonas', () => {
  const r = zonasDeSesion([{ sesionId: 's1', jugadorId: 'a', posicion: 'frontal', anotados: null, intentos: 10 }], 's1');
  assert.deepEqual(r.porZona, {});
  assert.equal(r.jugadoresQueMidieron, 0);
});

test('el foco es una sola zona cuando se separa del resto', () => {
  const zonas = [
    { id: 'esq_izq', valor: porcentaje(140, 700) },   // 20%
    { id: 'frontal', valor: porcentaje(280, 700) },   // 40%
    { id: 'esq_der', valor: porcentaje(315, 700) },   // 45%
  ];
  const foco = zonasDelFoco(zonas);
  assert.deepEqual(foco.zonas, ['esq_izq']);
  assert.equal(foco.concluyente, true);
});

test('con empate técnico se dicen todas las zonas, sin elegir una', () => {
  const zonas = [
    { id: 'esq_izq', valor: porcentaje(210, 700) },   // 30%
    { id: 'c45_izq', valor: porcentaje(217, 700) },   // 31%
    { id: 'frontal', valor: porcentaje(350, 700) },   // 50%
  ];
  const foco = zonasDelFoco(zonas);
  assert.deepEqual(foco.zonas, ['esq_izq', 'c45_izq']);
  assert.equal(foco.concluyente, false);
});

test('las zonas de muestra chica quedan fuera del foco', () => {
  const zonas = [
    { id: 'esq_izq', valor: porcentaje(1, 5) },       // 20% con 5 intentos
    { id: 'frontal', valor: porcentaje(280, 700) },
  ];
  assert.deepEqual(zonasDelFoco(zonas).zonas, ['frontal']);
});

test('sin ninguna zona con dato no hay foco', () => {
  assert.equal(zonasDelFoco([]), null);
  assert.equal(zonasDelFoco([{ id: 'x', valor: null }]), null);
});

test('los jugadores de una zona salen del más flojo al mejor', () => {
  const mediciones = [
    { sesionId: 's1', jugadorId: 'a', posicion: 'frontal', anotados: 7, intentos: 10 },
    { sesionId: 's1', jugadorId: 'b', posicion: 'frontal', anotados: 2, intentos: 10 },
    { sesionId: 's1', jugadorId: 'c', posicion: 'frontal', anotados: null, intentos: 10 },
    { sesionId: 's1', jugadorId: 'd', posicion: 'esq_izq', anotados: 5, intentos: 10 },
  ];
  const j = jugadoresDeZona(mediciones, 's1', 'frontal');
  assert.deepEqual(j.map((x) => x.jugadorId), ['b', 'a']);
  assert.equal(j.length, 2, 'el ausente no entra en la lista');
});

test('sin objetivo del club no se cuenta a nadie por debajo', () => {
  const jugadores = [{ jugadorId: 'a', valor: porcentaje(2, 10) }];
  assert.equal(contarPorDebajo(jugadores, null), null);
  assert.equal(contarPorDebajo(jugadores, undefined), null);
});

test('con objetivo del club se cuentan los que están por debajo', () => {
  const jugadores = [
    { jugadorId: 'a', valor: porcentaje(2, 10) },   // 20%
    { jugadorId: 'b', valor: porcentaje(4, 10) },   // 40%
    { jugadorId: 'c', valor: porcentaje(5, 10) },   // 50%
  ];
  assert.equal(contarPorDebajo(jugadores, 40), 1);
  assert.equal(contarPorDebajo(jugadores, 0), 0);
});

test('el total del arco suma las zonas pedidas y deja libres afuera', () => {
  const porZona = {
    esq_izq: porcentaje(28, 140),
    frontal: porcentaje(56, 140),
    libres: porcentaje(98, 140),
  };
  const total = totalDeZonas(porZona, ['esq_izq', 'frontal']);
  assert.equal(total.anotados, 84);
  assert.equal(total.intentos, 280);
  assert.equal(total.pct, 30);
});

test('el total ignora las zonas sin medir en vez de contarlas como cero', () => {
  const total = totalDeZonas({ esq_izq: porcentaje(28, 140) }, ['esq_izq', 'frontal']);
  assert.equal(total.intentos, 140);
});

test('sin ninguna zona con dato el total es null, no cero', () => {
  assert.equal(totalDeZonas({}, ['esq_izq']), null);
  assert.equal(totalDeZonas(null, null), null);
});

test('la comparación del total sí puede ser concluyente con ~700 intentos', () => {
  // Es la diferencia con la comparación por zona: con 140 intentos el margen
  // ronda los 11 pp y casi nada se puede afirmar; con 700 baja a ~5 pp.
  const actual = totalDeZonas({ a: porcentaje(266, 700) }, ['a']);     // 38%
  const anterior = totalDeZonas({ a: porcentaje(210, 700) }, ['a']);   // 30%
  assert.equal(compararPorcentajes(actual, anterior).concluyente, true);
});

test('la serie ordena de la batería más vieja a la más nueva', () => {
  const ses = [
    { id: 's3', fecha: '2026-07-01', tipo: 'tiro' },
    { id: 's1', fecha: '2026-03-01', tipo: 'tiro' },
    { id: 's2', fecha: '2026-05-01', tipo: 'tiro' },
  ];
  const med = [
    { sesionId: 's1', jugadorId: 'a', posicion: 'frontal', anotados: 2, intentos: 10 },
    { sesionId: 's2', jugadorId: 'a', posicion: 'frontal', anotados: 3, intentos: 10 },
    { sesionId: 's3', jugadorId: 'a', posicion: 'frontal', anotados: 4, intentos: 10 },
  ];
  const s = serieDeZonas(ses, med, ['frontal']);
  assert.deepEqual(s.map((p) => p.fecha), ['2026-03-01', '2026-05-01', '2026-07-01']);
  assert.deepEqual(s.map((p) => p.valor.pct), [20, 30, 40]);
});

test('cada punto de la serie lleva su fracción real', () => {
  const ses = [{ id: 's1', fecha: '2026-03-01', tipo: 'tiro' }];
  const med = ['esq_izq', 'frontal'].map((posicion) => (
    { sesionId: 's1', jugadorId: 'a', posicion, anotados: 3, intentos: 10 }
  ));
  const [p] = serieDeZonas(ses, med, ['esq_izq', 'frontal']);
  assert.equal(p.valor.anotados, 6);
  assert.equal(p.valor.intentos, 20);
});

test('las sesiones de velocidad no generan puntos en la serie de tiro', () => {
  const ses = [
    { id: 's1', fecha: '2026-03-01', tipo: 'tiro' },
    { id: 'sv', fecha: '2026-04-01', tipo: 'velocidad' },
  ];
  const med = [{ sesionId: 's1', jugadorId: 'a', posicion: 'frontal', anotados: 3, intentos: 10 }];
  assert.equal(serieDeZonas(ses, med, ['frontal']).length, 1);
});

test('una batería sin mediciones reales no deja un punto en cero', () => {
  const ses = [
    { id: 's1', fecha: '2026-03-01', tipo: 'tiro' },
    { id: 's2', fecha: '2026-04-01', tipo: 'tiro' },
  ];
  const med = [
    { sesionId: 's1', jugadorId: 'a', posicion: 'frontal', anotados: 3, intentos: 10 },
    { sesionId: 's2', jugadorId: 'a', posicion: 'frontal', anotados: null, intentos: 10 },
  ];
  const s = serieDeZonas(ses, med, ['frontal']);
  assert.equal(s.length, 1, 'la sesión de todos ausentes no aporta punto');
  assert.equal(s[0].fecha, '2026-03-01');
});

test('sin ninguna batería la serie es vacía, no null', () => {
  assert.deepEqual(serieDeZonas([], [], ['frontal']), []);
});

test('la serie agregada da lo mismo que serieDeZonas con filas por jugador', () => {
  const ses = [
    { id: 's1', fecha: '2026-03-01', tipo: 'tiro' },
    { id: 's2', fecha: '2026-04-01', tipo: 'tiro' },
  ];
  const med = [
    { sesionId: 's1', jugadorId: 'a', posicion: 'frontal', anotados: 3, intentos: 10 },
    { sesionId: 's1', jugadorId: 'b', posicion: 'frontal', anotados: 5, intentos: 10 },
    { sesionId: 's1', jugadorId: 'a', posicion: 'esq_izq', anotados: 2, intentos: 10 },
    { sesionId: 's1', jugadorId: 'a', posicion: 'libres', anotados: 9, intentos: 10 },
    { sesionId: 's2', jugadorId: 'a', posicion: 'frontal', anotados: 6, intentos: 10 },
  ];
  // Lo mismo, como lo devuelve panorama_del_club: sumado por sesión y posición.
  const agregadas = [
    { sesionId: 's1', fecha: '2026-03-01', posicion: 'frontal', anotados: 8, intentos: 20, jugadoresQueMidieron: 2 },
    { sesionId: 's1', fecha: '2026-03-01', posicion: 'esq_izq', anotados: 2, intentos: 10, jugadoresQueMidieron: 2 },
    { sesionId: 's1', fecha: '2026-03-01', posicion: 'libres', anotados: 9, intentos: 10, jugadoresQueMidieron: 2 },
    { sesionId: 's2', fecha: '2026-04-01', posicion: 'frontal', anotados: 6, intentos: 10, jugadoresQueMidieron: 1 },
  ];
  const triples = POSICIONES.map((z) => z.id);
  const individual = serieDeZonas(ses, med, triples);
  const agregada = serieDeZonasAgregada(agregadas, triples);
  assert.deepEqual(agregada.map((p) => p.valor), individual.map((p) => p.valor));
  assert.deepEqual(agregada.map((p) => p.fecha), ['2026-03-01', '2026-04-01']);
  assert.deepEqual(agregada.map((p) => p.jugadoresQueMidieron), [2, 1]);

  // Y libres por su lado, sin mezclarse con triples.
  assert.deepEqual(
    serieDeZonasAgregada(agregadas, ['libres']).map((p) => p.valor),
    serieDeZonas(ses, med, ['libres']).map((p) => p.valor),
  );
});

test('la serie agregada no mezcla libres con triples y no inventa puntos', () => {
  const filas = [
    { sesionId: 's1', fecha: '2026-03-01', posicion: 'libres', anotados: 9, intentos: 10, jugadoresQueMidieron: 1 },
  ];
  assert.deepEqual(serieDeZonasAgregada(filas, POSICIONES.map((z) => z.id)), []);
  assert.deepEqual(serieDeZonasAgregada([], ['frontal']), []);
  assert.deepEqual(serieDeZonasAgregada(null, ['frontal']), []);
});

test('la serie agregada marca la muestra chica con el umbral único', () => {
  const filas = [
    { sesionId: 's1', fecha: '2026-03-01', posicion: 'frontal', anotados: 1, intentos: UMBRAL_INTENTOS - 1, jugadoresQueMidieron: 1 },
  ];
  const [p] = serieDeZonasAgregada(filas, ['frontal']);
  assert.equal(p.valor.muestraChica, true);
});

test('la serie de partidos sale de las sumas de cada partido, ordenada por fecha', () => {
  const filas = [
    { partidoId: 'p2', fecha: '2026-05-10', rival: 'B', tresAnotados: 8, tresIntentados: 30, libresAnotados: 10, libresIntentados: 14 },
    { partidoId: 'p1', fecha: '2026-05-03', rival: 'A', tresAnotados: 6, tresIntentados: 25, libresAnotados: 7, libresIntentados: 12 },
  ];
  const tres = serieDePartidosAgregada(filas, 'tres');
  assert.deepEqual(tres.map((p) => p.partidoId), ['p1', 'p2']);
  assert.deepEqual(tres.map((p) => [p.valor.anotados, p.valor.intentos]), [[6, 25], [8, 30]]);
  assert.equal(tres[0].rival, 'A');
  const libres = serieDePartidosAgregada(filas, 'libres');
  assert.deepEqual(libres.map((p) => [p.valor.anotados, p.valor.intentos]), [[7, 12], [10, 14]]);
});

test('un partido sin intentos o sin estadísticas no genera punto: un hueco no es un cero', () => {
  const filas = [
    { partidoId: 'p1', fecha: '2026-05-03', rival: 'A', tresAnotados: 0, tresIntentados: 0, libresAnotados: 4, libresIntentados: 6 },
    { partidoId: 'p2', fecha: '2026-05-10', rival: 'B', tresAnotados: null, tresIntentados: null, libresAnotados: null, libresIntentados: null },
  ];
  assert.deepEqual(serieDePartidosAgregada(filas, 'tres'), []);
  assert.deepEqual(serieDePartidosAgregada(filas, 'libres').map((p) => p.partidoId), ['p1']);
  assert.deepEqual(serieDePartidosAgregada(null, 'tres'), []);
  assert.deepEqual(serieDePartidosAgregada(filas, 'dos'), []);
});

test('un partido con pocos intentos queda marcado con el umbral único', () => {
  const [p] = serieDePartidosAgregada(
    [{ partidoId: 'p1', fecha: '2026-05-03', tresAnotados: 2, tresIntentados: UMBRAL_INTENTOS - 1 }], 'tres');
  assert.equal(p.valor.muestraChica, true);
});

test('ejeComun une las fechas y alinea cada serie con huecos', () => {
  const a = [{ fecha: '2026-05-01', valor: porcentaje(3, 10) }, { fecha: '2026-05-20', valor: porcentaje(5, 10) }];
  const b = [{ fecha: '2026-05-10', valor: porcentaje(2, 8) }];
  const eje = ejeComun(a, b);
  assert.deepEqual(eje.fechas, ['2026-05-01', '2026-05-10', '2026-05-20']);
  assert.deepEqual(eje.a.map((v) => v?.pct ?? null), [30, null, 50]);
  assert.deepEqual(eje.b.map((v) => v?.pct ?? null), [null, 25, null]);
  assert.equal(eje.b[1].anotados, 2);
});
