import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NIVEL } from '../src/data/variaciones.js';

/**
 * El rango de nivel vive en el check de 0052 (lo hace cumplir la base) y en
 * NIVEL de src/data/variaciones.js (lo que ofrece la pantalla). Si se
 * desincronizan, la pantalla ofrece un nivel que la base rechaza y nada avisa.
 */

const sql = readFileSync('supabase/migrations/0052_variacion_ejercicio.sql', 'utf8').replace(/\r\n/g, '\n');

test('el rango de nivel es el mismo en SQL y en JS', () => {
  const m = sql.match(/nivel smallint not null check \(nivel between (\d+) and (\d+)\)/);
  assert.ok(m, 'no encontré el check de nivel en 0052: ¿cambió la migración?');
  assert.deepEqual({ min: Number(m[1]), max: Number(m[2]) }, NIVEL);
});

test('la tabla tiene revoke all, RLS y trigger de sellado', () => {
  assert.match(sql, /alter table variacion_ejercicio enable row level security;/);
  assert.match(sql, /revoke all on variacion_ejercicio from anon, authenticated;/);
  assert.match(sql, /create trigger variacion_ejercicio_sellar\s+before insert or update on variacion_ejercicio/);
  // Ni la autoría ni el club ni el ejercicio se mandan en un update.
  const update = sql.match(/grant update \(([^)]*)\) on variacion_ejercicio/);
  assert.ok(update);
  for (const col of ['club_id', 'ejercicio_id', 'creado_por', 'creado_en']) {
    assert.ok(!update[1].includes(col), `${col} no puede estar en el grant de update`);
  }
});
