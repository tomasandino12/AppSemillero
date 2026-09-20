import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FUNCIONES_OTORGADAS, LECTURA_DEL_JUGADOR } from '../src/data/accesoJugador.js';

/**
 * La frontera de datos del jugador (spec 2026-09-20, sección 3): no lee ninguna
 * tabla de dominio, sólo ejecuta funciones. Este test lee las migraciones 0029
 * y 0030 y falla si alguien otorga algo que no está declarado en
 * src/data/accesoJugador.js (o declara algo que nadie otorga), o si la lectura
 * del jugador deja de pasar por mi_jugador().
 *
 * Modelo: tests/contratoMaterial.test.js.
 */

const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const sql0029 = leer('supabase/migrations/0029_cuenta_jugador.sql');
const sql0030 = leer('supabase/migrations/0030_lectura_jugador.sql');

/** Sin los comentarios de línea: un `grant` dentro de un comentario no otorga nada. */
const sinComentarios = (sql) => sql.replace(/--.*$/gm, '');

/** Nombres de las funciones con `grant execute on function nombre(...) to authenticated`. */
function funcionesOtorgadas(sql) {
  return [...sinComentarios(sql).matchAll(/grant\s+execute\s+on\s+function\s+([a-z_]+)\s*\([^)]*\)\s+to\s+([^;]+);/gi)]
    .filter((m) => /\bauthenticated\b/.test(m[2]))
    .map((m) => m[1]);
}

/** El cuerpo de `create function nombre(`, hasta el `$fn$;` que lo cierra. */
function cuerpoDe(sql, nombre) {
  const desde = sql.indexOf(`create function ${nombre}(`);
  assert.ok(desde >= 0, `no encontré "create function ${nombre}(": ¿cambió la migración?`);
  const hasta = sql.indexOf('\n$fn$;', desde);
  assert.ok(hasta > desde, `no encontré el cierre de ${nombre}`);
  return sql.slice(desde, hasta);
}

const ordenados = (xs) => [...xs].sort();

test('los grant execute de 0029 y 0030 son exactamente los declarados', () => {
  const otorgadas = [...funcionesOtorgadas(sql0029), ...funcionesOtorgadas(sql0030)];
  assert.deepEqual(ordenados(otorgadas), ordenados(FUNCIONES_OTORGADAS));
});

test('ninguna función se otorga dos veces', () => {
  const otorgadas = [...funcionesOtorgadas(sql0029), ...funcionesOtorgadas(sql0030)];
  assert.equal(new Set(otorgadas).size, otorgadas.length);
});

test('0030 no otorga ningún permiso sobre tablas ni crea policies', () => {
  const sql = sinComentarios(sql0030);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all|truncate)\b/i);
  assert.doesNotMatch(sql, /create\s+policy/i);
  assert.doesNotMatch(sql, /alter\s+table/i);
});

test('mi_jugador() no se otorga a nadie', () => {
  assert.ok(!funcionesOtorgadas(sql0030).includes('mi_jugador'));
  assert.match(sinComentarios(sql0030), /revoke\s+execute\s+on\s+function\s+mi_jugador\(\)\s+from\s+public,\s*anon,\s*authenticated/i);
});

for (const nombre of LECTURA_DEL_JUGADOR) {
  test(`${nombre}() corre como dueño, con search_path vacío, y arranca por mi_jugador()`, () => {
    const cuerpo = cuerpoDe(sql0030, nombre);
    assert.match(cuerpo, /security definer/);
    assert.match(cuerpo, /set search_path = ''/);
    assert.match(cuerpo, /v_jugador uuid := public\.mi_jugador\(\)/);
    assert.match(cuerpo, /if v_jugador is null then/);
  });
}

test('la lectura del jugador no toca las medidas corporales ni de otros chicos', () => {
  const lectura = LECTURA_DEL_JUGADOR.map((n) => cuerpoDe(sql0030, n)).join('\n');
  assert.doesNotMatch(lectura, /medicion_corporal/);
  // Todo lo que sale de una tabla con jugador_id se filtra por el propio.
  assert.doesNotMatch(lectura, /jugador_id\s*(<>|!=|in\s*\()/i);
});
