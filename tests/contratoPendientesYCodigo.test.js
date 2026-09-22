import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 0037: la lista de pendientes de coordinación no muestra chicos, y una
 * solicitud de jugador no se aprueba sin el código que ve sólo el chico. Lo
 * impone la base; esto evita que una migración futura lo afloje sin querer.
 * La verificación contra una base real es tests/verificarPendientesYCodigo.sql.
 */

const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const codigo = leer('supabase/migrations/0037_pendientes_y_codigo_solicitud.sql').replace(/--.*$/gm, '');

const cuerpoDe = (nombre) => {
  const m = codigo.match(new RegExp(`create (?:or replace )?function ${nombre}\\([\\s\\S]*?as (\\$\\w*\\$)([\\s\\S]*?)\\1`));
  assert.ok(m, `falta la función ${nombre} en 0037`);
  return m[2];
};

test('usuarios_pendientes deja afuera a todo el que pasó por el flujo del jugador', () => {
  const cuerpo = cuerpoDe('usuarios_pendientes');
  assert.match(cuerpo, /not exists \(select 1 from public\.solicitud_jugador s where s\.user_id = u\.id\)/);
  assert.match(cuerpo, /not exists \(select 1 from public\.cuenta_jugador c where c\.user_id = u\.id\)/);
});

test('buscar_jugador_para_habilitar es sólo de coordinación y por mail exacto', () => {
  const cuerpo = cuerpoDe('buscar_jugador_para_habilitar');
  assert.match(cuerpo, /^\s*begin\s+if not public\.es_coordinador_de\(p_club_id\)/);
  assert.match(cuerpo, /lower\(u\.email\) = lower\(btrim\(p_email\)\)/);
});

test('el código no se lee desde el cliente y el profe no lo recibe', () => {
  assert.match(codigo, /revoke select on solicitud_jugador from authenticated;/);
  const grant = codigo.match(/grant select \(([^)]*)\)\s+on solicitud_jugador to authenticated;/);
  assert.ok(grant, 'falta el grant de select por columna');
  assert.doesNotMatch(grant[1], /codigo/);
  assert.doesNotMatch(codigo.match(/create function solicitudes_del_plantel[\s\S]*?returns table \(([^)]*)\)/)[1], /codigo/);
  assert.match(codigo.match(/create function mi_solicitud_jugador[\s\S]*?returns table \(([^)]*)\)/)[1], /codigo text/);
});

test('aprobar exige el código antes de tocar nada', () => {
  const cuerpo = cuerpoDe('aprobar_solicitud_jugador');
  const chequeo = cuerpo.indexOf('CODIGO_INCORRECTO');
  assert.ok(chequeo > 0, 'falta CODIGO_INCORRECTO');
  assert.ok(chequeo < cuerpo.indexOf('insert into'), 'el código se chequea después de escribir');
  assert.doesNotMatch(cuerpo, /select \* into/, 'select * falla: quien aprueba no lee la columna codigo');
});

test('el repo llama a buscar_jugador_para_habilitar con club y mail', () => {
  const repo = leer('src/data/repos/coordinacion.js');
  assert.match(repo, /\.rpc\(\s*'buscar_jugador_para_habilitar'\s*,\s*\{\s*p_club_id:\s*clubId,\s*p_email:\s*email\s*\}\s*\)/);
});
