import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TABLA_YYET1, IDA_M, IDAS_MAX, duracionIdaS, cronograma, posicionEn, segundosAlPitido, sesionesDeYoyo, ultimaYAnterioresYoyo, metrosDe, nivelYIda, validarIdas,
} from '../src/data/yoyo.js';

const cerca = (real, esperado, tolerancia = 0.01) => assert.ok(
  Math.abs(real - esperado) < tolerancia,
  `${real} no está cerca de ${esperado}`,
);

test('la tabla suma 223 idas y 4460 m', () => {
  assert.equal(TABLA_YYET1.length, 20);
  assert.equal(IDAS_MAX, 223);
  assert.equal(metrosDe(IDAS_MAX), 4460);
  assert.equal(IDA_M, 20);
  assert.deepEqual(TABLA_YYET1[0], { nivel: 1, kmh: 8, idas: 7 });
  assert.deepEqual(TABLA_YYET1[19], { nivel: 20, kmh: 17.5, idas: 15 });
});

test('el nivel 1 dura unos 63 s', () => {
  cerca(duracionIdaS(8), 9, 0.001);
  const nivel1 = cronograma().filter((p) => p.nivel === 1);
  assert.equal(nivel1.length, 7);
  cerca(nivel1.at(-1).t, 63, 0.001);
});

test('el cronograma termina en la ida 223 y marca cada cambio de nivel', () => {
  const c = cronograma();
  assert.equal(c.length, 223);
  assert.deepEqual([c.at(-1).nivel, c.at(-1).ida], [20, 15]);
  const cambios = c.filter((p) => p.cambioDeNivel);
  assert.equal(cambios.length, 19);
  assert.deepEqual(cambios.map((p) => p.nivel), Array.from({ length: 19 }, (_, i) => i + 1));
  assert.ok(c.every((p, i) => i === 0 || p.t > c[i - 1].t), 'los pitidos van en orden');
});

test('posicionEn en t=0 y justo antes y después de un cambio de nivel', () => {
  assert.deepEqual(posicionEn(0), { nivel: 1, ida: 1, idasCompletas: 0 });
  assert.deepEqual(posicionEn(-5), { nivel: 1, ida: 1, idasCompletas: 0 });
  assert.deepEqual(posicionEn(62.9), { nivel: 1, ida: 7, idasCompletas: 6 });
  // En el pitido exacto del fin del nivel 1 esa ida ya está completa.
  assert.deepEqual(posicionEn(63), { nivel: 2, ida: 1, idasCompletas: 7 });
  assert.deepEqual(posicionEn(63.1), { nivel: 2, ida: 1, idasCompletas: 7 });
  assert.deepEqual(posicionEn(99999), { nivel: 20, ida: 15, idasCompletas: 223 });
});

test('nivelYIda de 0, de 7 (fin del nivel 1) y de 8', () => {
  assert.equal(nivelYIda(0), '0');
  assert.equal(nivelYIda(7), '1.7');
  assert.equal(nivelYIda(8), '2.1');
  assert.equal(nivelYIda(223), '20.15');
  assert.equal(nivelYIda(null), '0');
});

test('validarIdas rechaza decimales, negativos y más de 223', () => {
  assert.deepEqual(validarIdas('40'), { ok: true, idas: 40, error: null });
  assert.equal(validarIdas('0').ok, true);
  assert.equal(validarIdas('223').ok, true);
  for (const malo of ['', ' ', 'abc', '4,5', '-1', '224', '1e2']) {
    const r = validarIdas(malo);
    assert.equal(r.ok, false, malo);
    assert.equal(r.idas, null);
    assert.ok(r.error);
  }
});

test('segundos al próximo pitido', () => {
  cerca(segundosAlPitido(0), 9, 0.001);
  cerca(segundosAlPitido(6.5), 2.5, 0.001);
  cerca(segundosAlPitido(63), 8.4706, 0.001);
  assert.equal(segundosAlPitido(99999), null);
});

const res = (sesionId, fecha, idas, origen) => ({ sesionId, fecha, idas, origen });

test('ordena las sesiones con la más reciente primero', () => {
  const s = sesionesDeYoyo([res('a', '2026-03-01', 30), res('b', '2026-09-01', 44, 'crear'), res('c', '2026-06-01', null)]);
  assert.deepEqual(s.map((x) => x.sesionId), ['b', 'c', 'a']);
  assert.equal(s[0].origen, 'crear');
  assert.equal(s[1].idas, null);
  assert.equal(sesionesDeYoyo(undefined).length, 0);
});

test('la variación es en metros contra la sesión anterior con dato, y salta las ausencias', () => {
  const s = sesionesDeYoyo([res('a', '2026-03-01', 30), res('b', '2026-09-01', 44), res('c', '2026-06-01', null)]);
  const r = ultimaYAnterioresYoyo(s);
  assert.equal(r.ultima.sesionId, 'b');
  assert.deepEqual(r.anteriores.map((x) => x.sesionId), ['a']);
  assert.equal(r.variacionM, 280);
});

test('con una sola sesión con dato no hay variación, y sin datos es null', () => {
  const uno = ultimaYAnterioresYoyo(sesionesDeYoyo([res('a', '2026-03-01', 0), res('b', '2026-09-01', null)]));
  assert.equal(uno.ultima.idas, 0);
  assert.equal(uno.variacionM, null);
  assert.equal(ultimaYAnterioresYoyo(sesionesDeYoyo([res('b', '2026-09-01', null)])), null);
  assert.equal(ultimaYAnterioresYoyo([]), null);
});
