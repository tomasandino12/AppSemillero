import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDAS_MAX } from '../src/data/yoyo.js';
import { ORIGENES_SPRINT } from '../src/data/sprint.js';

/**
 * El tope de idas vive en dos lugares: el check de 0049_yoyo.sql (lo hace
 * cumplir la base) y IDAS_MAX de yoyo.js (con el que la pantalla avisa antes
 * de guardar). Si se desincronizan, la pantalla da por bueno un resultado que
 * la base rechaza, o al revés. Este test lee el SQL y compara.
 */

const ruta = 'supabase/migrations/0049_yoyo.sql';
const sql = readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n').replace(/--.*$/gm, '');

test('el tope de idas de 0049 es IDAS_MAX de yoyo.js', () => {
  const m = sql.match(/idas smallint check \(idas is null or idas between (\d+) and (\d+)\)/);
  assert.ok(m, `no encontré el between de idas en ${ruta}: ¿cambió la migración?`);
  assert.deepEqual([Number(m[1]), Number(m[2])], [0, IDAS_MAX]);
});

test('los orígenes son los mismos que los del sprint', () => {
  const m = sql.match(/origen text not null default 'propio' check \(origen in \(([^)]*)\)\)/);
  assert.ok(m, 'no encontré el check de origen');
  assert.deepEqual([...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort(), [...ORIGENES_SPRINT].sort());
});

test('insert sin grant sobre origen', () => {
  const grant = sql.match(/grant insert \(([^)]*)\) on medicion_yoyo to authenticated;/);
  assert.ok(grant, 'no encontré el grant insert por columna');
  assert.deepEqual(grant[1].split(',').map((c) => c.trim()), ['club_id', 'sesion_id', 'jugador_id', 'idas']);
  assert.match(sql, /revoke all on medicion_yoyo from anon, authenticated;/);
  assert.doesNotMatch(sql, /grant (update|delete|all)[^;]*on medicion_yoyo/);
});

test('la tabla tiene RLS, sellado y una fila por jugador', () => {
  assert.match(sql, /alter table medicion_yoyo enable row level security;/);
  assert.match(sql, /create trigger medicion_yoyo_sellar\s+before insert on medicion_yoyo/);
  assert.match(sql, /unique \(sesion_id, jugador_id\)/);
  assert.match(sql, /s\.tipo = 'yoyo'\s+and puede_escribir_plantel\(s\.plantel_id\)/);
  assert.match(sql, /check \(tipo in \('tiro', 'salto', 'sprint', 'yoyo'\)\)/);
});
