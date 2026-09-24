import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_APODOS, LARGO_APODO } from '../src/data/metodologia.js';

/**
 * Los límites de los apodos viven en dos lugares: apodos_validos de
 * 0046_apodos_club.sql (los hace cumplir la base) y metodologia.js (lo que
 * filtra la pantalla). Este test lee el SQL y compara.
 */

const sql = readFileSync('supabase/migrations/0046_apodos_club.sql', 'utf8').replace(/\r\n/g, '\n');

test('los límites de apodos_validos coinciden con metodologia.js', () => {
  const cardinalidad = sql.match(/array_length\(p_apodos, 1\) between (\d+) and (\d+)/);
  assert.ok(cardinalidad, 'no encontré la cardinalidad en 0046: ¿cambió la migración?');
  assert.equal(Number(cardinalidad[1]), 1);
  assert.equal(Number(cardinalidad[2]), MAX_APODOS);
  const largo = sql.match(/char_length\(a\) > (\d+)/);
  assert.ok(largo, 'no encontré el largo en 0046: ¿cambió la migración?');
  assert.equal(Number(largo[1]), LARGO_APODO);
});

test('0046 no agrega grants de escritura sobre club', () => {
  const grants = sql.split('\n').filter((l) => /^\s*grant\b/i.test(l));
  for (const g of grants) {
    assert.doesNotMatch(g, /\bon\s+(table\s+)?club\b/i, `grant sobre club: ${g}`);
    assert.match(g, /execute on function apodos_validos/i);
  }
});
