import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 0048 reemplazó enteras guardar_sesion_medicion y mi_progreso (partiendo de
 * las de 0045) para sumar el sprint, y 0049 las volvió a reemplazar para el
 * yoyo, y 0050 para el parcial del sprint. Este test fija en la última versión que no se perdió ninguna rama ni
 * garantía: compara con 0045 los tramos que tienen que quedar iguales y
 * verifica lo nuevo del sprint.
 *
 * Si una migración posterior vuelve a reemplazar alguna, actualizar la ruta
 * (y contratoRpcSalto.test.js).
 */

const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n').replace(/--.*$/gm, '');
const nueva = leer('supabase/migrations/0050_sprint_ida_y_vuelta.sql');
const previa = leer('supabase/migrations/0045_borrar_velocidad.sql');

function cuerpoDe(sql, nombre, cierre) {
  const desde = sql.indexOf(`create or replace function ${nombre}(`);
  assert.ok(desde >= 0, `no encontré la función ${nombre}`);
  const hasta = sql.indexOf(`\n${cierre};`, desde);
  assert.ok(hasta > desde, `no encontré el cierre de ${nombre}`);
  return sql.slice(desde, hasta);
}

const guardar = cuerpoDe(nueva, 'guardar_sesion_medicion', '$$');
const guardarPrevia = cuerpoDe(previa, 'guardar_sesion_medicion', '$$');
const progreso = cuerpoDe(nueva, 'mi_progreso', '$fn$');
const progresoPrevia = cuerpoDe(previa, 'mi_progreso', '$fn$');

/** El `insert into <tabla> ... );` de una función, sin espacios de más. */
const insertDe = (cuerpo, tabla) => {
  const m = cuerpo.match(new RegExp(`insert into ${tabla} \\([^)]*\\)\\s+values \\([\\s\\S]*?\\n\\s*\\);`));
  assert.ok(m, `no encontré el insert de ${tabla}`);
  return m[0].replace(/\s+/g, ' ');
};

test('guardar_sesion_medicion conserva las ramas tiro y salto de 0045', () => {
  assert.equal(insertDe(guardar, 'medicion_tiro'), insertDe(guardarPrevia, 'medicion_tiro'));
  assert.equal(insertDe(guardar, 'medicion_salto'), insertDe(guardarPrevia, 'medicion_salto'));
  assert.match(guardar, /security invoker/, 'corre con los permisos y la RLS de quien guarda');
  assert.match(guardar, /v_tipo not in \('tiro', 'salto', 'sprint', 'yoyo'\)/);
  assert.match(guardar, /\(v_tipo = 'salto'\) <> \(v_test_salto is not null\)/);
  assert.match(guardar, /'TEST_DE_SALTO_INVALIDO'/);
  assert.doesNotMatch(guardar, /velocidad/);
});

test('la rama sprint exige distancia y la idempotencia la compara', () => {
  assert.match(guardar, /payload->>'distanciaSprintM'/);
  assert.match(guardar, /\(v_tipo = 'sprint'\) <> \(v_distancia is not null\)/);
  assert.match(guardar, /'DISTANCIA_DE_SPRINT_INVALIDA'/);
  assert.match(guardar, /insert into medicion_sprint \(club_id, sesion_id, jugador_id, intento, tiempo_ms, parcial_ms\)/);
  assert.match(guardar, /\(m->>'parcialMs'\)::int/);
  assert.match(guardar, /\(m->>'tiempoMs'\)::int/);
  // El reintento sólo es "el mismo" si coinciden plantel, tipo, test y distancia.
  assert.match(guardar, /payload->>'sesionId'/);
  assert.match(guardar, /'yaGuardada', true/);
  assert.match(guardar, /'SESION_AJENA'/);
  assert.match(guardar, /v_existente\.test_salto is not distinct from v_test_salto/);
  assert.match(guardar, /v_existente\.distancia_sprint_m is not distinct from v_distancia/);
});

test('mi_progreso conserva partidos, tiro, saltos y escalones y suma sprints', () => {
  for (const clave of ['partidos', 'tiro', 'saltos', 'sprints', 'escalones']) {
    assert.match(progreso, new RegExp(`'${clave}', coalesce\\(`), `falta la clave ${clave}`);
  }
  // Los tramos que ya existían quedan idénticos a 0045.
  const tramo = (cuerpo, desde, hasta) => {
    const a = cuerpo.indexOf(`'${desde}', coalesce(`);
    const b = cuerpo.indexOf(`'${hasta}', coalesce(`);
    assert.ok(a >= 0 && b > a, `no encontré el tramo ${desde}`);
    return cuerpo.slice(a, b).replace(/\s+/g, ' ');
  };
  assert.equal(tramo(progreso, 'partidos', 'tiro'), tramo(progresoPrevia, 'partidos', 'tiro'));
  assert.equal(tramo(progreso, 'tiro', 'saltos'), tramo(progresoPrevia, 'tiro', 'saltos'));
  assert.equal(tramo(progreso, 'saltos', 'sprints'), tramo(progresoPrevia, 'saltos', 'escalones'));
});

test('mi_progreso sigue siendo sólo del propio jugador', () => {
  assert.match(progreso, /security definer/);
  assert.match(progreso, /set search_path = ''/);
  assert.match(progreso, /v_jugador uuid := public\.mi_jugador\(\)/);
  assert.match(progreso, /if v_jugador is null then/);
  assert.match(progreso, /mp\.jugador_id = v_jugador/);
  assert.doesNotMatch(progreso, /medicion_corporal/);
  assert.doesNotMatch(progreso, /jugador_id\s*(<>|!=|in\s*\()/i);
});

test('los dos siguen ejecutables sólo por authenticated', () => {
  for (const firma of ['guardar_sesion_medicion\\(jsonb\\)', 'mi_progreso\\(\\)']) {
    assert.match(nueva, new RegExp(`revoke execute on function ${firma} from public, anon;`));
    assert.match(nueva, new RegExp(`grant\\s+execute on function ${firma} to authenticated;`));
  }
});
