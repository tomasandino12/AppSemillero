import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 0044 reemplazó enteras guardar_sesion_medicion (de 0038) y mi_progreso (de
 * 0030) para sumar el salto, 0045 las volvió a reemplazar para sacar la
 * velocidad, 0048 para sumar el sprint y 0049 el yoyo. Un reemplazo entero puede perder en silencio una rama o una
 * garantía vieja, y los contratos de 0030 y 0038 siguen leyendo esas
 * migraciones. Este test fija en la última versión lo que ya garantizaban.
 *
 * Si una migración posterior vuelve a reemplazar alguna, actualizar la ruta.
 */

const MIGRACION = 'supabase/migrations/0049_yoyo.sql';
const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (sql) => sql.replace(/--.*$/gm, '');
const sql = sinComentarios(leer(MIGRACION));

function cuerpoDe(nombre, cierre) {
  const desde = sql.indexOf(`create or replace function ${nombre}(`);
  assert.ok(desde >= 0, `no encontré "create or replace function ${nombre}(" en ${MIGRACION}`);
  const hasta = sql.indexOf(`\n${cierre};`, desde);
  assert.ok(hasta > desde, `no encontré el cierre de ${nombre}`);
  return sql.slice(desde, hasta);
}

const guardar = cuerpoDe('guardar_sesion_medicion', '$$');
const progreso = cuerpoDe('mi_progreso', '$fn$');

test('guardar_sesion_medicion guarda tiro, salto, sprint y yoyo, y ya no velocidad', () => {
  assert.match(guardar, /v_tipo not in \('tiro', 'salto', 'sprint', 'yoyo'\)/);
  assert.match(guardar, /insert into medicion_tiro \(club_id, sesion_id, jugador_id, posicion, anotados, intentos\)/);
  assert.doesNotMatch(guardar, /velocidad/);
  assert.match(guardar, /insert into medicion_salto \(club_id, sesion_id, jugador_id, intento, tiempo_vuelo_ms, fps_captura\)/);
  assert.match(guardar, /security invoker/, 'corre con los permisos y la RLS de quien guarda');
});

test('guardar_sesion_medicion sigue siendo idempotente por sesionId', () => {
  assert.match(guardar, /payload->>'sesionId'/);
  assert.match(guardar, /'yaGuardada', true/);
  assert.match(guardar, /'SESION_AJENA'/);
  // Un reintento sólo es "el mismo" si además coincide el test de salto.
  assert.match(guardar, /v_existente\.test_salto is not distinct from v_test_salto/);
});

test('el test de salto es obligatorio en salto y prohibido en los demás', () => {
  assert.match(guardar, /payload->>'testSalto'/);
  assert.match(guardar, /\(v_tipo = 'salto'\) <> \(v_test_salto is not null\)/);
  assert.match(guardar, /'TEST_DE_SALTO_INVALIDO'/);
});

test('mi_progreso conserva las garantías de 0030', () => {
  assert.match(progreso, /security definer/);
  assert.match(progreso, /set search_path = ''/);
  assert.match(progreso, /v_jugador uuid := public\.mi_jugador\(\)/);
  assert.match(progreso, /if v_jugador is null then/);
  assert.doesNotMatch(progreso, /medicion_corporal/, 'sin peso, altura ni pierna: por eso el salto va sin potencia');
  assert.doesNotMatch(progreso, /jugador_id\s*(<>|!=|in\s*\()/i);
});

test('mi_progreso conserva sus claves, sin velocidad', () => {
  for (const clave of ['partidos', 'tiro', 'escalones', 'saltos']) {
    assert.match(progreso, new RegExp(`'${clave}', coalesce\\(`), `falta la clave ${clave}`);
  }
  assert.doesNotMatch(progreso, /velocidad/);
  assert.doesNotMatch(progreso, /fps_captura/);
});

test('0045 borró la tabla y el tipo de sesión de velocidad', () => {
  const borrado = sinComentarios(leer('supabase/migrations/0045_borrar_velocidad.sql'));
  assert.match(borrado, /drop table medicion_velocidad;/);
  assert.match(borrado, /delete from sesion_medicion where tipo = 'velocidad';/);
  assert.match(borrado, /check \(tipo in \('tiro', 'salto'\)\)/);
});

test('los dos siguen ejecutables sólo por authenticated', () => {
  for (const firma of ['guardar_sesion_medicion\\(jsonb\\)', 'mi_progreso\\(\\)']) {
    assert.match(sql, new RegExp(`revoke execute on function ${firma} from public, anon;`));
    assert.match(sql, new RegExp(`grant\\s+execute on function ${firma} to authenticated;`));
  }
});
