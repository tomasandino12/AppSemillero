import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaDeZona, hayMetas, alcanzaMeta, resumenDeMetas, validarMeta, SIN_METAS } from '../src/data/objetivosClub.js';
import { porcentaje } from '../src/data/estadisticas.js';

test('por defecto no hay ninguna meta fijada', () => {
  assert.equal(hayMetas(SIN_METAS), false);
  assert.equal(hayMetas(), false);
  assert.equal(hayMetas({}), false);
  assert.equal(metaDeZona('frontal', SIN_METAS), null);
  assert.equal(metaDeZona('frontal'), null);
});

test('una meta fijada se lee; las zonas sin meta siguen en null', () => {
  const metas = { frontal: 35 };
  assert.equal(hayMetas(metas), true);
  assert.equal(metaDeZona('frontal', metas), 35);
  assert.equal(metaDeZona('esq_izq', metas), null);
});

test('una meta de 0 es una meta, distinta de no tener ninguna', () => {
  assert.equal(metaDeZona('frontal', { frontal: 0 }), 0);
  assert.equal(hayMetas({ frontal: 0 }), true);
});

test('alcanzar la meta es llegar o pasarla', () => {
  assert.equal(alcanzaMeta(porcentaje(30, 100), 30), true);
  assert.equal(alcanzaMeta(porcentaje(31, 100), 30), true);
  assert.equal(alcanzaMeta(porcentaje(29, 100), 30), false);
});

test('sin meta o sin medición no se juzga: null, nunca "no llegó"', () => {
  assert.equal(alcanzaMeta(porcentaje(30, 100), null), null);
  assert.equal(alcanzaMeta(null, 30), null);
  assert.equal(alcanzaMeta(null, null), null);
});

test('el resumen cuenta sobre las zonas con meta, no sobre todas', () => {
  const zonas = [
    { id: 'a', valor: porcentaje(35, 100), meta: 30 },   // alcanzada
    { id: 'b', valor: porcentaje(20, 100), meta: 30 },   // no
    { id: 'c', valor: porcentaje(50, 100), meta: null }, // sin meta: no cuenta
  ];
  assert.deepEqual(resumenDeMetas(zonas), { alcanzadas: 1, conMeta: 2 });
});

test('una zona con meta pero sin medir no entra en el conteo', () => {
  const zonas = [
    { id: 'a', valor: porcentaje(35, 100), meta: 30 },
    { id: 'b', valor: null, meta: 30 },
  ];
  assert.deepEqual(resumenDeMetas(zonas), { alcanzadas: 1, conMeta: 1 });
});

test('sin ninguna meta el resumen es null y la card no muestra conteo', () => {
  assert.equal(resumenDeMetas([{ id: 'a', valor: porcentaje(35, 100), meta: null }]), null);
  assert.equal(resumenDeMetas([]), null);
  assert.equal(resumenDeMetas(null), null);
});

test('el campo vacío borra la meta, y no la convierte en cero', () => {
  assert.deepEqual(validarMeta(''), { ok: true, valor: null, error: null });
  assert.deepEqual(validarMeta('   '), { ok: true, valor: null, error: null });
  assert.deepEqual(validarMeta(null), { ok: true, valor: null, error: null });
  assert.equal(validarMeta('0').valor, 0);
});

test('la meta se valida entre 0 y 100 y se redondea a entero', () => {
  assert.equal(validarMeta('30').valor, 30);
  assert.equal(validarMeta('29,6').valor, 30);
  assert.equal(validarMeta('100').valor, 100);
  assert.equal(validarMeta('101').ok, false);
  assert.equal(validarMeta('-1').ok, false);
  assert.equal(validarMeta('treinta').ok, false);
});
