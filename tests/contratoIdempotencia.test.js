import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 0038: un reintento después de un corte no duplica la sesión de medición ni
 * el recurso. El cliente manda el id que generó una vez (sesionId,
 * recursoIdNuevo) y la base contesta yaGuardada/yaGuardado. Esto fija los
 * nombres que el cliente usa; la prueba contra una base es
 * tests/verificarIdempotencia.sql.
 */

const sql = readFileSync('supabase/migrations/0038_guardados_idempotentes.sql', 'utf8')
  .replace(/\r\n/g, '\n').replace(/--.*$/gm, '');

test('guardar_sesion_medicion acepta sesionId y reconoce el reintento', () => {
  assert.match(sql, /payload->>'sesionId'/);
  assert.match(sql, /'yaGuardada', true/);
  assert.match(sql, /'SESION_AJENA'/);
});

test('guardar_recurso acepta recursoIdNuevo y reconoce el reintento', () => {
  assert.match(sql, /payload->>'recursoIdNuevo'/);
  assert.match(sql, /'yaGuardado', v_ya_guardado/);
  assert.match(sql, /'RECURSO_AJENO'/);
});

test('el id de un recurso nuevo tiene su grant de columna', () => {
  assert.match(sql, /grant insert \(id\) on recurso to authenticated;/);
});
