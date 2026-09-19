import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decimalEstricto } from '../src/data/numeros.js';
import { validarMeta } from '../src/data/objetivosClub.js';
import { redondearSegundos } from '../src/data/prepararPayloadMedicion.js';
import { validarMedicion } from '../src/data/antropometria.js';

/**
 * La coerción de JavaScript acepta como número cosas que nadie quiso escribir
 * como número: Number("1e2") es 100, Number("0x10") es 16, Number(true) es 1.
 * Estos tests fijan que toda lectura de números tecleados pase por
 * decimalEstricto y rechace esas formas.
 */

test('decimalEstricto acepta punto o coma decimal, con espacios y con signo', () => {
  assert.equal(decimalEstricto('4,7'), 4.7);
  assert.equal(decimalEstricto('4.7'), 4.7);
  assert.equal(decimalEstricto('  12  '), 12);
  assert.equal(decimalEstricto('-3'), -3);
  assert.equal(decimalEstricto('+3'), 3);
  assert.equal(decimalEstricto('0'), 0);
  assert.equal(decimalEstricto(5), 5);
});

test('decimalEstricto: vacío es null, no cero', () => {
  for (const vacio of ['', '   ', null, undefined]) {
    assert.equal(decimalEstricto(vacio), null, JSON.stringify(vacio));
  }
});

test('decimalEstricto rechaza notación científica, hexadecimal, texto y tipos que no son números', () => {
  const hostiles = ['1e2', '1E2', '0x10', '0b11', '0o7', 'Infinity', '-Infinity', 'NaN', 'true',
    '12abc', '1,2,3', '1..2', '.5', '5.', '1_000', '٣', true, false, [5], {}, () => 1];
  for (const h of hostiles) {
    assert.ok(Number.isNaN(decimalEstricto(h)), `debería rechazar ${String(h)}`);
  }
  assert.ok(Number.isNaN(decimalEstricto(Infinity)));
  assert.ok(Number.isNaN(decimalEstricto(NaN)));
});

test('validarMeta no toma "1e2" ni "0x10" como un porcentaje', () => {
  for (const h of ['1e2', '0x10', 'true', true]) {
    const r = validarMeta(h);
    assert.equal(r.ok, false, String(h));
    assert.equal(r.error, 'Tiene que ser un número.');
  }
  assert.equal(validarMeta('85,5').valor, 86);
  assert.equal(validarMeta('').valor, null);
});

test('redondearSegundos no toma true, "1e1" ni "0x5" como un tiempo', () => {
  for (const h of [true, '1e1', '0x5', [4], Infinity, {}]) {
    assert.equal(redondearSegundos(h), null, String(h));
  }
  assert.equal(redondearSegundos('4,66'), 4.7);
  assert.equal(redondearSegundos(4.66), 4.7);
});

test('validarMedicion no toma "1e2" como altura ni "0x40" como peso', () => {
  const r = validarMedicion({ fechaMedicion: '2026-01-01', altura: '1e2', peso: '0x40' }, '2026-09-19');
  assert.equal(r.ok, false);
  assert.ok(r.errores.includes('La altura tiene que ser un número.'));
  assert.ok(r.errores.includes('El peso tiene que ser un número.'));
});
