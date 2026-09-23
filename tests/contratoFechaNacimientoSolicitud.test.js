import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 0041: la fecha de nacimiento la escribe el chico al pedir acceso, no el
 * profe a mano por cada jugador. Evita que una migración futura la vuelva
 * opcional sin que nada falle en Node.
 */

const sql = readFileSync('supabase/migrations/0041_fecha_nacimiento_en_solicitud.sql', 'utf8')
  .replace(/\r\n/g, '\n').replace(/--.*$/gm, '');

const cuerpoDe = (nombre) => {
  const m = sql.match(new RegExp(`create (?:or replace )?function ${nombre}\\([\\s\\S]*?as (\\$\\w*\\$)([\\s\\S]*?)\\1`));
  assert.ok(m, `falta la función ${nombre} en 0041`);
  return m[2];
};

test('pedir acceso exige la fecha de nacimiento y la rechaza si es futura', () => {
  const cuerpo = cuerpoDe('crear_solicitud_jugador');
  assert.match(cuerpo, /FECHA_NACIMIENTO_REQUERIDA/);
  assert.match(cuerpo, /FECHA_NACIMIENTO_FUTURA/);
  assert.match(cuerpo, /insert into public\.solicitud_jugador \(club_id, plantel_id, fecha_nacimiento\)/);
});

test('aprobar con una ficha nueva exige la fecha de nacimiento', () => {
  const cuerpo = cuerpoDe('aprobar_solicitud_jugador');
  assert.match(cuerpo, /v_fecha_nacimiento is null[\s\S]*?FECHA_NACIMIENTO_REQUERIDA/);
  assert.match(cuerpo, /insert into jugador \(id, club_id, nombre_clave, nombre_limpio, desambiguador, fecha_nacimiento\)/);
});

test('el profe la ve precargada al listar las solicitudes del plantel', () => {
  assert.match(cuerpoDe('solicitudes_del_plantel'), /s\.fecha_nacimiento/);
});

test('fecha_nacimiento de solicitud_jugador no tiene grant de select', () => {
  assert.doesNotMatch(sql, /grant select[^;]*fecha_nacimiento/);
});

test('el repo manda la fecha de nacimiento al pedir acceso', () => {
  const repo = readFileSync('src/data/repos/clubes.js', 'utf8');
  assert.match(repo, /p_fecha_nacimiento:\s*fechaNacimiento/);
});

test('la pantalla de aprobar no deja confirmar sin fecha de nacimiento', () => {
  const pantalla = readFileSync('src/ui/pantallas/aprobarJugador.js', 'utf8');
  assert.match(pantalla, /Falta la fecha de nacimiento/);
});

test('la pantalla de pedir acceso no deja enviar sin fecha de nacimiento', () => {
  const pantalla = readFileSync('src/ui/pantallas/solicitudJugador.js', 'utf8');
  assert.match(pantalla, /Ingresá tu fecha de nacimiento/);
});
