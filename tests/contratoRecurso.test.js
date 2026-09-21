import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPOS_RECURSO, RANGO_FRECUENCIA, RANGO_MINUTOS } from '../src/data/recursos.js';

/**
 * El tipo de recurso y los rangos de veces por semana y minutos viven en dos
 * lugares: los check de 0033_recurso_metadatos.sql (los hace cumplir la base)
 * y src/data/recursos.js (lo que valida y ofrece la pantalla). Este test lee
 * el SQL y compara.
 */

const sql = readFileSync('supabase/migrations/0033_recurso_metadatos.sql', 'utf8').replace(/\r\n/g, '\n');

function checkDe(nombre) {
  const desde = sql.indexOf(`constraint ${nombre}`);
  assert.ok(desde >= 0, `no encontré la constraint ${nombre} en 0033: ¿cambió la migración?`);
  return sql.slice(desde, sql.indexOf(';', desde));
}

test('los tipos de recurso coinciden con la migración', () => {
  const enBase = [...checkDe('recurso_tipo_lista').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...enBase].sort(), TIPOS_RECURSO.map((t) => t.clave).sort());
});

test('los rangos de frecuencia y minutos coinciden con la migración', () => {
  const rango = (nombre) => checkDe(nombre).match(/between (\d+) and (\d+)/).slice(1).map(Number);
  assert.deepEqual(rango('recurso_frecuencia_rango'), [RANGO_FRECUENCIA.min, RANGO_FRECUENCIA.max]);
  assert.deepEqual(rango('recurso_minutos_rango'), [RANGO_MINUTOS.min, RANGO_MINUTOS.max]);
});
