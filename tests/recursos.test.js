import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarMetadatos, contarPorTipo, filtrarPorTipo, claseDeEnlace, etiquetaDeTipo, SIN_TIPO } from '../src/data/recursos.js';

test('valida frecuencia y minutos con decimalEstricto', () => {
  assert.deepEqual(validarMetadatos({ tipo: 'tiro', frecuenciaSemanal: '3', minutos: '20' }).valor, { tipo: 'tiro', frecuenciaSemanal: 3, minutos: 20 });
  for (const malo of ['1e1', '0', '8', '2,5', 'abc', '0x2']) {
    assert.ok(validarMetadatos({ frecuenciaSemanal: malo }).error, `frecuencia ${malo}`);
  }
  for (const malo of ['181', '0', '1e2', '-5']) {
    assert.ok(validarMetadatos({ minutos: malo }).error, `minutos ${malo}`);
  }
  assert.ok(validarMetadatos({ tipo: 'inventado' }).error);
});

test('vacío es null, no 0', () => {
  assert.deepEqual(validarMetadatos({ tipo: '', frecuenciaSemanal: '', minutos: '  ' }).valor, { tipo: null, frecuenciaSemanal: null, minutos: null });
  assert.deepEqual(validarMetadatos().valor, { tipo: null, frecuenciaSemanal: null, minutos: null });
});

const RECURSOS = [{ tipo: 'tiro' }, { tipo: 'tiro' }, { tipo: 'pies' }, { tipo: null }, {}];

test('cuenta por tipo incluyendo sin tipo', () => {
  const c = contarPorTipo(RECURSOS);
  assert.equal(c.todos, 5);
  assert.equal(c.tiro, 2);
  assert.equal(c.pies, 1);
  assert.equal(c.manejo, 0);
  assert.equal(c[SIN_TIPO], 2);
});

test('filtra por tipo, por sin tipo y sin filtro', () => {
  assert.equal(filtrarPorTipo(RECURSOS, 'tiro').length, 2);
  assert.equal(filtrarPorTipo(RECURSOS, SIN_TIPO).length, 2);
  assert.equal(filtrarPorTipo(RECURSOS, 'todos').length, 5);
  assert.equal(filtrarPorTipo(RECURSOS, '').length, 5);
});

test('clasifica links de YouTube, Drive y PDF', () => {
  assert.equal(claseDeEnlace('https://youtu.be/dQw4w9WgXcQ'), 'youtube');
  assert.equal(claseDeEnlace('https://drive.google.com/file/d/abc/view'), 'drive');
  assert.equal(claseDeEnlace('https://club.com/plan.PDF'), 'pdf');
  assert.equal(claseDeEnlace('https://ejemplo.com/nota'), 'otro');
  assert.equal(claseDeEnlace(''), null);
  assert.equal(claseDeEnlace(null), null);
});

test('etiqueta de tipo, null si no existe', () => {
  assert.equal(etiquetaDeTipo('fisico'), 'Físico');
  assert.equal(etiquetaDeTipo('x'), null);
});
