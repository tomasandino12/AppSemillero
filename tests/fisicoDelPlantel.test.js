import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serieSprintDelPlantel, serieSaltoDelPlantel, serieYoyoDelPlantel } from '../src/data/fisicoDelPlantel.js';
import { alturaDeSalto } from '../src/data/salto.js';

const sprint = (sesionId, fecha, jugadorId, tiempoMs, distanciaM = 30) => ({
  sesionId, fecha, jugadorId, tiempoMs, distanciaM, intento: 1,
});

test('sprint: promedia lo mejor de cada chico y cuenta cuántos entraron', () => {
  const intentos = [
    sprint('s1', '2026-05-01', 'a', 9000), sprint('s1', '2026-05-01', 'a', 8000),
    sprint('s1', '2026-05-01', 'b', 10000),
  ];
  assert.deepEqual(serieSprintDelPlantel(intentos, 30), [
    { sesionId: 's1', fecha: '2026-05-01', valor: 9000, chicos: 2 },
  ]);
});

test('sprint: una serie por distancia y de la fecha más vieja a la más nueva', () => {
  const intentos = [
    sprint('s2', '2026-06-01', 'a', 8500), sprint('s1', '2026-05-01', 'a', 9000),
    sprint('s3', '2026-05-15', 'a', 6000, 20),
  ];
  assert.deepEqual(serieSprintDelPlantel(intentos, 30).map((p) => p.fecha), ['2026-05-01', '2026-06-01']);
  assert.deepEqual(serieSprintDelPlantel(intentos, 20).map((p) => p.valor), [6000]);
});

test('un ausente (null) no cuenta como cero ni entra al promedio', () => {
  const intentos = [sprint('s1', '2026-05-01', 'a', 9000), sprint('s1', '2026-05-01', 'b', null)];
  const [punto] = serieSprintDelPlantel(intentos, 30);
  assert.equal(punto.valor, 9000);
  assert.equal(punto.chicos, 1);
});

test('una sesión donde nadie tiene dato no aparece', () => {
  assert.deepEqual(serieSprintDelPlantel([sprint('s1', '2026-05-01', 'a', null)], 30), []);
  assert.deepEqual(serieSprintDelPlantel(undefined, 30), []);
});

test('salto: altura del mejor intento de cada chico, separada por test', () => {
  const salto = (sesionId, jugadorId, tiempoVueloMs, testSalto = 'cmj') => ({
    sesionId, fecha: '2026-05-01', jugadorId, tiempoVueloMs, testSalto, intento: 0,
  });
  const intentos = [
    salto('s1', 'a', 400), salto('s1', 'a', 500), salto('s1', 'b', 450), salto('s1', 'b', null),
    salto('s2', 'a', 600, 'abalakov'),
  ];
  const [punto] = serieSaltoDelPlantel(intentos, 'cmj');
  const esperado = (alturaDeSalto(0.5) + alturaDeSalto(0.45)) / 2;
  assert.ok(Math.abs(punto.valor - esperado) < 1e-9);
  assert.equal(punto.chicos, 2);
  assert.equal(serieSaltoDelPlantel(intentos, 'abalakov').length, 1);
});

test('yoyo: promedio de metros (20 m por ida) y ausentes afuera', () => {
  const r = (jugadorId, idas) => ({ sesionId: 's1', fecha: '2026-05-01', jugadorId, idas });
  const [punto] = serieYoyoDelPlantel([r('a', 50), r('b', 30), r('c', null)]);
  assert.equal(punto.valor, 800);
  assert.equal(punto.chicos, 2);
});
