import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proximaSesion, sesionesOrdenadas, sesionesDeLosPlanes, pesoDeLinea } from '../src/data/planDelJugador.js';

const s = (id, fecha, extra = {}) => ({ id, fecha, lineas: [], ...extra });

test('proximaSesion: si hay sesión hoy, es esa', () => {
  const sesiones = [s('a', '2026-04-01'), s('b', '2026-04-07'), s('c', '2026-04-09')];
  assert.equal(proximaSesion(sesiones, '2026-04-07').id, 'b');
});

test('proximaSesion: un martes sin entrenamiento muestra la del miércoles', () => {
  // 2026-04-07 es martes.
  const sesiones = [s('lunes', '2026-04-06'), s('miercoles', '2026-04-08'), s('viernes', '2026-04-10')];
  assert.equal(proximaSesion(sesiones, '2026-04-07').id, 'miercoles');
});

test('proximaSesion: no depende del orden en que vengan', () => {
  const sesiones = [s('viernes', '2026-04-10'), s('miercoles', '2026-04-08'), s('lunes', '2026-04-06')];
  assert.equal(proximaSesion(sesiones, '2026-04-07').id, 'miercoles');
});

test('proximaSesion: si ya pasaron todas, null (plan vencido)', () => {
  assert.equal(proximaSesion([s('a', '2026-03-01'), s('b', '2026-03-05')], '2026-04-07'), null);
});

test('proximaSesion: lista vacía o sin lista, null', () => {
  assert.equal(proximaSesion([], '2026-04-07'), null);
  assert.equal(proximaSesion(undefined, '2026-04-07'), null);
});

test('proximaSesion: dos planteles mezclados, la más cercana gana y conserva su categoría', () => {
  const planes = [
    { plantelId: 'p17', categoria: 'Sub-17 Masculino', sesiones: [s('x', '2026-04-09'), s('y', '2026-04-14')] },
    { plantelId: 'p21', categoria: 'Sub-21 Masculino', sesiones: [s('z', '2026-04-08')] },
  ];
  const proxima = proximaSesion(sesionesDeLosPlanes(planes), '2026-04-07');
  assert.equal(proxima.id, 'z');
  assert.equal(proxima.categoria, 'Sub-21 Masculino');
  assert.equal(proxima.plantelId, 'p21');
});

test('proximaSesion: hoy en los dos planteles devuelve una de hoy, no una futura', () => {
  const planes = [
    { plantelId: 'p17', categoria: 'U17', sesiones: [s('x', '2026-04-07'), s('x2', '2026-04-09')] },
    { plantelId: 'p21', categoria: 'U21', sesiones: [s('z', '2026-04-07')] },
  ];
  assert.equal(proximaSesion(sesionesDeLosPlanes(planes), '2026-04-07').fecha, '2026-04-07');
});

test('sesionesOrdenadas ordena por fecha sin tocar la lista original', () => {
  const original = [s('b', '2026-04-10'), s('a', '2026-04-01')];
  assert.deepEqual(sesionesOrdenadas(original).map((x) => x.id), ['a', 'b']);
  assert.deepEqual(original.map((x) => x.id), ['b', 'a']);
});

test('sesionesDeLosPlanes junta las sesiones de todos los planes, por fecha', () => {
  const planes = [
    { plantelId: 'p17', categoria: 'U17', sesiones: [s('a', '2026-04-10')] },
    { plantelId: 'p21', categoria: 'U21', sesiones: [s('b', '2026-04-03')] },
  ];
  assert.deepEqual(sesionesDeLosPlanes(planes).map((x) => x.id), ['b', 'a']);
  assert.deepEqual(sesionesDeLosPlanes(undefined), []);
});

test('pesoDeLinea une línea y peso por el nombre normalizado', () => {
  const pesos = [{ clave: 'SENTADILLA TRASERA', nombre: 'Sentadilla trasera', kg: 62.5 }];
  assert.equal(pesoDeLinea({ nombreOriginal: 'Sentadilla  trasera' }, pesos), 62.5);
  assert.equal(pesoDeLinea({ nombreOriginal: 'sentadilla trásera' }, pesos), 62.5);
});

test('pesoDeLinea: sin peso cargado para ese ejercicio es null, no cero', () => {
  const pesos = [{ clave: 'SENTADILLA TRASERA', nombre: 'x', kg: 62.5 }];
  assert.equal(pesoDeLinea({ nombreOriginal: 'Plancha' }, pesos), null);
  assert.equal(pesoDeLinea({ nombreOriginal: 'Plancha' }, []), null);
  assert.equal(pesoDeLinea({ nombreOriginal: 'Plancha' }, undefined), null);
});
