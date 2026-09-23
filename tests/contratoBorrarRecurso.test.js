import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 0042: un recurso se podía crear pero no borrar. Sólo quien lo cargó puede
 * borrar lo suyo, mismo criterio que la biblioteca de ejercicios (0015).
 */

const sql = readFileSync('supabase/migrations/0042_borrar_recurso.sql', 'utf8')
  .replace(/\r\n/g, '\n').replace(/--.*$/gm, '');

test('sólo se borra lo propio, y siendo del club', () => {
  const m = sql.match(/create policy recurso_borrar_lo_propio on recurso[\s\S]*?;/);
  assert.ok(m, 'falta la policy recurso_borrar_lo_propio');
  assert.match(m[0], /for delete/);
  assert.match(m[0], /creado_por = auth\.uid\(\)/);
  assert.match(m[0], /miembro_club/);
});

test('el grant de delete existe', () => {
  assert.match(sql, /grant delete on recurso to authenticated;/);
});

test('el repo borra por club y por id, y pide de vuelta la fila', () => {
  const repo = readFileSync('src/data/repos/recursos.js', 'utf8');
  assert.match(repo, /export async function borrarRecurso/);
  assert.match(repo, /\.from\('recurso'\)\s*\n\s*\.delete\(\)/);
  assert.match(repo, /NO_ES_TUYO/);
});

test('la pantalla sólo ofrece Borrar en lo propio, con confirmación', () => {
  const pantalla = readFileSync('src/ui/pantallas/recursos.js', 'utf8');
  assert.match(pantalla, /esMio\(r\.creadoPor\)[\s\S]{0,90}data-borrar-recurso/);
  assert.match(pantalla, /Es para siempre/);
});
