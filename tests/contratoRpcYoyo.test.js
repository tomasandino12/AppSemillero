import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 0049 reemplazó enteras guardar_sesion_medicion y mi_progreso (partiendo de
 * las de 0048) para sumar el yoyo. Este test fija que no perdió ninguna rama
 * ni garantía: compara con 0048 los tramos que tienen que quedar iguales y
 * verifica lo nuevo.
 *
 * Si una migración posterior vuelve a reemplazar alguna, actualizar la ruta
 * (y contratoRpcSalto.test.js y contratoRpcSprint.test.js).
 */

const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n').replace(/--.*$/gm, '');
const nueva = leer('supabase/migrations/0049_yoyo.sql');
const previa = leer('supabase/migrations/0048_sprint.sql');

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

test('guardar_sesion_medicion conserva tiro, salto y sprint', () => {
  for (const tabla of ['medicion_tiro', 'medicion_salto', 'medicion_sprint']) {
    assert.equal(insertDe(guardar, tabla), insertDe(guardarPrevia, tabla), tabla);
  }
  assert.match(guardar, /security invoker/, 'corre con los permisos y la RLS de quien guarda');
  assert.match(guardar, /\(v_tipo = 'salto'\) <> \(v_test_salto is not null\)/);
  assert.match(guardar, /'TEST_DE_SALTO_INVALIDO'/);
  assert.match(guardar, /\(v_tipo = 'sprint'\) <> \(v_distancia is not null\)/);
  assert.match(guardar, /'DISTANCIA_DE_SPRINT_INVALIDA'/);
  assert.match(guardar, /v_existente\.test_salto is not distinct from v_test_salto/);
  assert.match(guardar, /v_existente\.distancia_sprint_m is not distinct from v_distancia/);
  assert.match(guardar, /'yaGuardada', true/);
  assert.match(guardar, /'SESION_AJENA'/);
  assert.doesNotMatch(guardar, /velocidad/);
});

test('la rama yoyo rechaza distancia y test', () => {
  assert.match(guardar, /v_tipo not in \('tiro', 'salto', 'sprint', 'yoyo'\)/);
  assert.match(guardar, /insert into medicion_yoyo \(club_id, sesion_id, jugador_id, idas\)/);
  assert.match(guardar, /\(m->>'idas'\)::smallint/);
  // El yoyo no lleva test ni distancia: las dos guardas prohíben cada columna
  // fuera de su tipo, y la sesión de yoyo sólo lleva `tipo`.
  assert.match(guardar, /\(v_tipo = 'sprint'\) <> \(v_distancia is not null\)/);
  assert.match(guardar, /\(v_tipo = 'salto'\) <> \(v_test_salto is not null\)/);
});

test('mi_progreso suma yoyos sin perder nada de 0048', () => {
  for (const clave of ['partidos', 'tiro', 'saltos', 'sprints', 'yoyos', 'escalones']) {
    assert.match(progreso, new RegExp(`'${clave}', coalesce\\(`), `falta la clave ${clave}`);
  }
  const tramo = (cuerpo, desde, hasta) => {
    const a = cuerpo.indexOf(`'${desde}', coalesce(`);
    const b = cuerpo.indexOf(`'${hasta}', coalesce(`);
    assert.ok(a >= 0 && b > a, `no encontré el tramo ${desde}`);
    return cuerpo.slice(a, b).replace(/\s+/g, ' ');
  };
  // Todo lo anterior a 'yoyos' es idéntico a 0048 hasta 'escalones'.
  assert.equal(tramo(progreso, 'partidos', 'yoyos'), tramo(progresoPrevia, 'partidos', 'escalones'));
});

test('mi_progreso sigue siendo sólo del propio jugador', () => {
  assert.match(progreso, /security definer/);
  assert.match(progreso, /set search_path = ''/);
  assert.match(progreso, /v_jugador uuid := public\.mi_jugador\(\)/);
  assert.match(progreso, /if v_jugador is null then/);
  assert.match(progreso, /my\.jugador_id = v_jugador/);
  assert.doesNotMatch(progreso, /medicion_corporal/);
  assert.doesNotMatch(progreso, /jugador_id\s*(<>|!=|in\s*\()/i);
});

test('los dos siguen ejecutables sólo por authenticated', () => {
  for (const firma of ['guardar_sesion_medicion\\(jsonb\\)', 'mi_progreso\\(\\)']) {
    assert.match(nueva, new RegExp(`revoke execute on function ${firma} from public, anon;`));
    assert.match(nueva, new RegExp(`grant\\s+execute on function ${firma} to authenticated;`));
  }
});
