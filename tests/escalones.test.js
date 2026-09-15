import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fechaLocal, diaDeLaSemana, formatearKg, textoDeEscalera,
  parsearPesos, estadoDelEscalon, pasoDeEscalon, quedanFuera,
  claveDeEjercicio, escaleraDeLinea,
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

test('textoDeEscalera dice el menor y el mayor, o el único', () => {
  assert.equal(textoDeEscalera([20, 25, 30, 35, 40]), '20–40 kg');
  assert.equal(textoDeEscalera([8]), '8 kg');
});

/* ---------- pesos ---------- */

test('parsearPesos: separan espacio, punto y coma o coma seguida de espacio', () => {
  assert.deepEqual(parsearPesos('8 10 12'), { error: null, pesos: [8, 10, 12] });
  assert.deepEqual(parsearPesos('8, 10, 12'), { error: null, pesos: [8, 10, 12] });
  assert.deepEqual(parsearPesos('8;10; 12'), { error: null, pesos: [8, 10, 12] });
});

test('parsearPesos: una coma entre dígitos es decimal', () => {
  assert.deepEqual(parsearPesos('20 22,5 25'), { error: null, pesos: [20, 22.5, 25] });
  // "8,10" se lee 8,1: por eso la hoja muestra "Queda:" antes de guardar.
  assert.deepEqual(parsearPesos('8,10'), { error: null, pesos: [8.1] });
});

test('parsearPesos ordena y saca repetidos de lo que escribió el profe', () => {
  assert.deepEqual(parsearPesos('12 8 10 8'), { error: null, pesos: [8, 10, 12] });
});

test('parsearPesos rechaza vacío, texto, cero, negativos y listas sin espacio', () => {
  for (const texto of ['', '   ', 'diez', '0', '-5', '8,10,12', '8 kg']) {
    const r = parsearPesos(texto);
    assert.ok(r.error, `"${texto}" tendría que dar error`);
    assert.equal(r.pesos, null);
  }
});

/* ---------- escalones ---------- */

const PESOS = [20, 25, 30, 35, 40];

test('estadoDelEscalon: sin escalón, en la escalera o en un peso que ya no está', () => {
  assert.equal(estadoDelEscalon(PESOS, null), 'sin');
  assert.equal(estadoDelEscalon(PESOS, 25), 'en');
  assert.equal(estadoDelEscalon(PESOS, 22.5), 'fuera');
});

test('pasoDeEscalon sube y baja al valor contiguo', () => {
  assert.equal(pasoDeEscalon(PESOS, 25, 'subir'), 30);
  assert.equal(pasoDeEscalon(PESOS, 25, 'bajar'), 20);
});

test('pasoDeEscalon en los extremos devuelve null', () => {
  assert.equal(pasoDeEscalon(PESOS, 40, 'subir'), null);
  assert.equal(pasoDeEscalon(PESOS, 20, 'bajar'), null);
});

test('pasoDeEscalon desde un peso que ya no está en la escalera va al más cercano de cada lado', () => {
  assert.equal(pasoDeEscalon(PESOS, 22.5, 'subir'), 25);
  assert.equal(pasoDeEscalon(PESOS, 22.5, 'bajar'), 20);
  assert.equal(pasoDeEscalon(PESOS, 50, 'subir'), null);
  assert.equal(pasoDeEscalon(PESOS, 50, 'bajar'), 40);
});

test('pasoDeEscalon sin escalón devuelve null: no hay subir ni bajar sin ubicar antes', () => {
  assert.equal(pasoDeEscalon(PESOS, null, 'subir'), null);
  assert.equal(pasoDeEscalon(PESOS, null, 'bajar'), null);
});

test('quedanFuera: los chicos cuyo peso no está en la escalera nueva', () => {
  const escalones = [{ jugadorId: 'a', kg: 22.5 }, { jugadorId: 'b', kg: 25 }, { jugadorId: 'c', kg: null }];
  assert.deepEqual(quedanFuera(PESOS, escalones), [{ jugadorId: 'a', kg: 22.5 }]);
});

/* ---------- línea ↔ escalera ---------- */

test('escaleraDeLinea busca por nombre normalizado exacto, sin parecidos', () => {
  const escaleras = [
    { id: 'e1', clave: claveDeEjercicio('Press Plano') },
    { id: 'e2', clave: claveDeEjercicio('Press Plano (Manc)') },
  ];
  assert.equal(escaleraDeLinea('press  PLANO', escaleras).id, 'e1');
  assert.equal(escaleraDeLinea('Press Plano (Manc)', escaleras).id, 'e2');
  assert.equal(escaleraDeLinea('Press Plano Alternado', escaleras), null);
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
