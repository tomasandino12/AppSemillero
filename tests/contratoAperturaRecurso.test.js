import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Las aperturas de recursos son anónimas para el cuerpo técnico (plan del
 * rediseño de RECURSOS, Task 4). Este test lee 0034 y falla si alguien le abre
 * la tabla a un rol, si el resumen deja de pasar por el chequeo de plantel o si
 * empieza a devolver identificadores de jugador. Modelo:
 * tests/contratoAccesoJugador.test.js.
 */

const sql = readFileSync('supabase/migrations/0034_apertura_recurso.sql', 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = sql.replace(/--.*$/gm, '');

function cuerpoDe(nombre) {
  const desde = sinComentarios.indexOf(`create function ${nombre}(`);
  assert.ok(desde >= 0, `no encontré "create function ${nombre}(": ¿cambió la migración?`);
  return sinComentarios.slice(desde, sinComentarios.indexOf('\n$fn$;', desde));
}

test('la tabla queda cerrada: sin grants de tabla y sin policies', () => {
  assert.doesNotMatch(sinComentarios, /grant\s+(select|insert|update|delete|all|truncate)\b/i);
  assert.doesNotMatch(sinComentarios, /create\s+policy/i);
  assert.match(sinComentarios, /alter table apertura_recurso enable row level security/i);
  assert.match(sinComentarios, /revoke all on apertura_recurso from public, anon, authenticated/i);
});

test('sólo se otorgan las dos funciones, a authenticated', () => {
  const otorgadas = [...sinComentarios.matchAll(/grant\s+execute\s+on\s+function\s+([a-z_]+)\s*\([^)]*\)\s+to\s+([^;]+);/gi)];
  assert.deepEqual(otorgadas.map((m) => m[1]).sort(), ['registrar_apertura', 'resumen_recursos']);
  for (const m of otorgadas) assert.equal(m[2].trim(), 'authenticated');
});

test('registrar_apertura sólo anota un recurso enviado al propio jugador', () => {
  const cuerpo = cuerpoDe('registrar_apertura');
  assert.match(cuerpo, /public\.mi_jugador\(\)/);
  assert.match(cuerpo, /where e\.recurso_id = p_recurso_id and e\.jugador_id = v_jugador/);
  assert.doesNotMatch(cuerpo, /p_jugador/, 'el jugador no puede elegir por quién anota');
});

test('resumen_recursos exige ser entrenador del plantel y no devuelve ids de jugador', () => {
  const cuerpo = cuerpoDe('resumen_recursos');
  assert.match(cuerpo, /if not public\.puede_ver_plantel\(p_plantel_id\) then\s+return null;/);
  const salida = cuerpo.slice(cuerpo.indexOf('select jsonb_build_object'));
  assert.doesNotMatch(salida, /jugador_id|nombre|user_id/i, 'la salida no puede nombrar jugadores');
});

test('con menos de 3 cuentas no se informa cuántos abrieron', () => {
  const cuerpo = cuerpoDe('resumen_recursos');
  assert.match(cuerpo, /c_minimo constant integer := 3;/);
  for (const clave of ['abrieronAlguno', 'abrieron', 'primerasEsteMes', 'primerasMesAnterior']) {
    assert.match(cuerpo, new RegExp(`'${clave}',[^\\n]*>= c_minimo`), `${clave} sin el piso de cuentas`);
  }
});
