import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TIEMPO_SPRINT_MIN_MS, TIEMPO_SPRINT_MAX_MS, INTENTOS_SPRINT, DISTANCIAS_SPRINT, ORIGENES_SPRINT,
} from '../src/data/sprint.js';

/**
 * Los rangos del sprint viven en dos lugares: los check de 0048_sprint.sql
 * (los hace cumplir la base) y las constantes de sprint.js (con las que la
 * pantalla avisa antes de guardar). Si se desincronizan, la pantalla da por
 * bueno un tiempo que la base rechaza en la cancha, o al revés. Este test lee
 * el SQL y compara.
 */

const ruta = 'supabase/migrations/0048_sprint.sql';
const sql = readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n').replace(/--.*$/gm, '');

const valores = (texto) => [...texto.matchAll(/(\d+|'[a-z]+')/g)]
  .map((m) => (m[1].startsWith("'") ? m[1].slice(1, -1) : Number(m[1])));

test('rango de tiempo coincide', () => {
  const m = sql.match(/tiempo_ms integer check \(tiempo_ms is null or tiempo_ms between (\d+) and (\d+)\)/);
  assert.ok(m, `no encontré el between de tiempo_ms en ${ruta}: ¿cambió la migración?`);
  assert.deepEqual([Number(m[1]), Number(m[2])], [TIEMPO_SPRINT_MIN_MS, TIEMPO_SPRINT_MAX_MS]);
});

test('intentos coinciden', () => {
  const m = sql.match(/intento smallint not null check \(intento between (\d+) and (\d+)\)/);
  assert.ok(m, 'no encontré el check de intento');
  assert.deepEqual([Number(m[1]), Number(m[2])], [1, INTENTOS_SPRINT]);
});

test('distancias coinciden', () => {
  const m = sql.match(/distancia_sprint_m smallint check \(distancia_sprint_m in \(([^)]*)\)\)/);
  assert.ok(m, 'no encontré el check de distancia_sprint_m');
  assert.deepEqual(valores(m[1]).sort(), [...DISTANCIAS_SPRINT].sort());
});

test('orígenes coinciden', () => {
  const m = sql.match(/origen text not null default 'propio' check \(origen in \(([^)]*)\)\)/);
  assert.ok(m, 'no encontré el check de origen');
  assert.deepEqual(valores(m[1]).sort(), [...ORIGENES_SPRINT].sort());
});

test('insert sin grant sobre origen', () => {
  const grant = sql.match(/grant insert \(([^)]*)\) on medicion_sprint to authenticated;/);
  assert.ok(grant, 'no encontré el grant insert por columna');
  const columnas = grant[1].split(',').map((c) => c.trim());
  assert.deepEqual(columnas, ['club_id', 'sesion_id', 'jugador_id', 'intento', 'tiempo_ms']);
  assert.match(sql, /revoke all on medicion_sprint from anon, authenticated;/);
  assert.doesNotMatch(sql, /grant (update|delete|all)[^;]*on medicion_sprint/);
});

test('la tabla tiene RLS, sellado y un ausente es una sola fila', () => {
  assert.match(sql, /alter table medicion_sprint enable row level security;/);
  assert.match(sql, /create trigger medicion_sprint_sellar\s+before insert on medicion_sprint/);
  assert.match(sql, /check \(tiempo_ms is not null or intento = 1\)/);
  assert.match(sql, /unique \(sesion_id, jugador_id, intento\)/);
  // El insert exige que la sesión sea de sprint y que el usuario escriba el plantel.
  assert.match(sql, /s\.tipo = 'sprint'\s+and puede_escribir_plantel\(s\.plantel_id\)/);
});

test('la distancia va sólo en las sesiones de sprint', () => {
  assert.match(sql, /check \(tipo in \('tiro', 'salto', 'sprint'\)\)/);
  assert.match(sql, /check \(\(tipo = 'sprint'\) = \(distancia_sprint_m is not null\)\)/);
});
