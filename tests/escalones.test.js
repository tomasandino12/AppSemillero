import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fechaLocal, diaDeLaSemana, formatearKg,
  parsearPeso, nuevoPeso,
  claveDeEjercicio, pasoDeLinea,
  estadoDePlan, elegirPlanVisible, bloquesDeLineas, agruparPorBloque, detalleDeLinea,
} from '../src/data/escalones.js';

/* ---------- fechas y formato ---------- */

test('fechaLocal usa la fecha del dispositivo, no la de UTC', () => {
  // 23:30 del 5 de marzo en hora local sigue siendo el 5, aunque en UTC ya sea el 6.
  assert.equal(fechaLocal(new Date(2026, 2, 5, 23, 30)), '2026-03-05');
});

test('diaDeLaSemana se deriva de la fecha sin correrse por el huso horario', () => {
  assert.equal(diaDeLaSemana('2026-04-06'), 'lunes');
  assert.equal(diaDeLaSemana('2026-04-05'), 'domingo');
});

test('formatearKg usa coma decimal y no agrega ceros', () => {
  assert.equal(formatearKg(22.5), '22,5');
  assert.equal(formatearKg(20), '20');
});

/* ---------- pesos ---------- */

test('parsearPeso: un número solo, con coma decimal', () => {
  assert.deepEqual(parsearPeso('12'), { error: null, kg: 12 });
  assert.deepEqual(parsearPeso('12,5'), { error: null, kg: 12.5 });
  assert.deepEqual(parsearPeso('  2 '), { error: null, kg: 2 });
});

test('parsearPeso rechaza vacío, texto, cero, negativos y más de un número', () => {
  for (const texto of ['', '   ', 'diez', '0', '-5', '8 10', '8 kg', '8;10']) {
    const r = parsearPeso(texto);
    assert.ok(r.error, `"${texto}" tendría que dar error`);
    assert.equal(r.kg, null);
  }
});

/* ---------- escalones ---------- */

test('nuevoPeso suma y resta el escalón del ejercicio', () => {
  assert.equal(nuevoPeso(10, 2, 'subir'), 12);
  assert.equal(nuevoPeso(10, 2, 'bajar'), 8);
  assert.equal(nuevoPeso(12.5, 2.5, 'subir'), 15);
});

test('nuevoPeso no tiene techo: sube indefinidamente', () => {
  assert.equal(nuevoPeso(200, 5, 'subir'), 205);
});

test('nuevoPeso no baja a cero ni a negativo, y no inventa un piso', () => {
  assert.equal(nuevoPeso(2, 2, 'bajar'), null);
  assert.equal(nuevoPeso(1, 2, 'bajar'), null);
  assert.equal(nuevoPeso(2.5, 2, 'bajar'), 0.5);
});

test('nuevoPeso sin peso o sin escalón devuelve null: primero hay que ubicar y definir', () => {
  assert.equal(nuevoPeso(null, 2, 'subir'), null);
  assert.equal(nuevoPeso(10, null, 'subir'), null);
  assert.equal(nuevoPeso(null, null, 'bajar'), null);
});

test('nuevoPeso redondea las colas del punto flotante', () => {
  assert.equal(nuevoPeso(12.3, 2.1, 'bajar'), 10.2);
  assert.equal(nuevoPeso(0.1, 0.2, 'subir'), 0.3);
});

/* ---------- línea ↔ escalón ---------- */

test('pasoDeLinea busca por nombre normalizado exacto, sin parecidos', () => {
  const pasos = [
    { id: 'e1', clave: claveDeEjercicio('Press Plano') },
    { id: 'e2', clave: claveDeEjercicio('Press Plano (Manc)') },
  ];
  assert.equal(pasoDeLinea('press  PLANO', pasos).id, 'e1');
  assert.equal(pasoDeLinea('Press Plano (Manc)', pasos).id, 'e2');
  assert.equal(pasoDeLinea('Press Plano Alternado', pasos), null);
});

/* ---------- plan visible ---------- */

const plan = (id, fechas, creadoEn = '2026-01-01T00:00:00+00:00') => ({ id, nombreArchivo: `${id}.xlsx`, creadoEn, fechas });

test('elegirPlanVisible: el que contiene hoy', () => {
  const r = elegirPlanVisible([plan('marzo', ['2026-03-02', '2026-04-27']), plan('mayo', ['2026-05-04', '2026-06-29'])], '2026-04-06');
  assert.equal(r.visible.id, 'marzo');
  assert.equal(r.estado, 'en_curso');
  assert.deepEqual(r.otros.map((p) => p.id), ['mayo']);
});

test('elegirPlanVisible: si ninguno contiene hoy, el próximo', () => {
  const r = elegirPlanVisible([plan('marzo', ['2026-03-02', '2026-04-27']), plan('mayo', ['2026-05-04', '2026-06-29'])], '2026-05-01');
  assert.equal(r.visible.id, 'mayo');
  assert.equal(r.estado, 'proximo');
});

test('elegirPlanVisible: si tampoco hay próximo, el último', () => {
  const r = elegirPlanVisible([plan('marzo', ['2026-03-02', '2026-04-27']), plan('mayo', ['2026-05-04', '2026-06-29'])], '2026-08-01');
  assert.equal(r.visible.id, 'mayo');
  assert.equal(r.estado, 'terminado');
});

test('elegirPlanVisible: con un empate gana el importado más recientemente', () => {
  const r = elegirPlanVisible([
    plan('viejo', ['2026-03-02', '2026-04-27'], '2026-03-01T10:00:00+00:00'),
    plan('nuevo', ['2026-03-02', '2026-04-27'], '2026-03-01T12:00:00+00:00'),
  ], '2026-04-06');
  assert.equal(r.visible.id, 'nuevo');
});

test('elegirPlanVisible: el rango sale de la primera y la última fecha, en cualquier orden', () => {
  const r = elegirPlanVisible([plan('marzo', ['2026-04-27', '2026-03-02', '2026-03-05'])], '2026-03-03');
  assert.equal(r.visible.desde, '2026-03-02');
  assert.equal(r.visible.hasta, '2026-04-27');
});

test('elegirPlanVisible sin planes, o sin fechas, no elige nada', () => {
  assert.deepEqual(elegirPlanVisible([], '2026-04-06'), { visible: null, estado: null, otros: [] });
  assert.deepEqual(elegirPlanVisible([plan('vacio', [])], '2026-04-06'), { visible: null, estado: null, otros: [] });
});

test('estadoDePlan', () => {
  const p = { desde: '2026-03-02', hasta: '2026-04-27' };
  assert.equal(estadoDePlan(p, '2026-03-02'), 'en_curso');
  assert.equal(estadoDePlan(p, '2026-03-01'), 'proximo');
  assert.equal(estadoDePlan(p, '2026-04-28'), 'terminado');
});

/* ---------- bloques ---------- */

const lineas = [{ bloque: 'POTENCIA' }, { bloque: 'POTENCIA' }, { bloque: 'FUERZA' }, { bloque: null }, { bloque: 'FUERZA' }];

test('bloquesDeLineas: sin repetidos y en orden de aparición, sin los vacíos', () => {
  assert.deepEqual(bloquesDeLineas(lineas), ['POTENCIA', 'FUERZA']);
});

test('agruparPorBloque: grupos consecutivos, respetando el orden del archivo', () => {
  assert.deepEqual(agruparPorBloque(lineas).map((g) => [g.bloque, g.lineas.length]), [
    ['POTENCIA', 2], ['FUERZA', 1], [null, 1], ['FUERZA', 1],
  ]);
});

test('detalleDeLinea: series, reps, carga y pausa tal cual, sin lo que falta', () => {
  assert.equal(detalleDeLinea({ series: 4, reps: '5xL', cargaSugerida: 'PC', pausa: "90''" }), "4 series · 5xL · PC · pausa 90''");
  assert.equal(detalleDeLinea({ series: 1, reps: null, cargaSugerida: null, pausa: null }), '1 serie');
  assert.equal(detalleDeLinea({ series: null, reps: null, cargaSugerida: null, pausa: null }), '');
});
