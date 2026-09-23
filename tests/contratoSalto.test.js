import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TV_MIN_S, TV_MAX_S, FPS_MIN, FPS_MAX, TESTS_SALTO, INTENTOS_SALTO,
} from '../src/data/salto.js';
import {
  PIERNA_MIN_CM, PIERNA_MAX_CM, PIERNA_FLEXIONADA_MIN_CM, PIERNA_FLEXIONADA_MAX_CM,
} from '../src/data/antropometria.js';

/**
 * Los rangos del salto viven en dos lugares: los check de 0043_salto.sql (los
 * hace cumplir la base) y las constantes de salto.js y antropometria.js (con
 * las que la pantalla avisa antes de guardar). Si se desincronizan, el profe
 * marca un salto que la pantalla da por bueno y la base lo rechaza en el
 * gimnasio, o al revés. Este test lee el SQL y compara.
 */

const sql = readFileSync('supabase/migrations/0043_salto.sql', 'utf8').replace(/\r\n/g, '\n');

/** Los dos números de `columna ... between A and B`. */
function rango(columna) {
  const m = sql.match(new RegExp(`${columna}\\b[^\\n]*?between (\\d+) and (\\d+)`));
  assert.ok(m, `no encontré el between de ${columna} en 0043_salto.sql: ¿cambió la migración?`);
  return [Number(m[1]), Number(m[2])];
}

test('rangos de tiempo de vuelo coinciden', () => {
  // La base guarda ms; salto.js trabaja en segundos.
  assert.deepEqual(rango('tiempo_vuelo_ms'), [TV_MIN_S * 1000, TV_MAX_S * 1000]);
});

test('fps mínimo coincide', () => {
  assert.deepEqual(rango('fps_captura'), [FPS_MIN, FPS_MAX]);
});

test('rangos de pierna coinciden', () => {
  assert.deepEqual(rango('pierna_cm'), [PIERNA_MIN_CM, PIERNA_MAX_CM]);
  assert.deepEqual(rango('pierna_flexionada_cm'), [PIERNA_FLEXIONADA_MIN_CM, PIERNA_FLEXIONADA_MAX_CM]);
});

test('intentos y tests del salto coinciden', () => {
  assert.deepEqual(rango('intento'), [1, INTENTOS_SALTO]);
  const tests = sql.match(/test_salto text check \(test_salto in \(([^)]*)\)\)/);
  assert.ok(tests, 'no encontré el check de test_salto en 0043_salto.sql');
  assert.deepEqual([...tests[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort(), [...TESTS_SALTO].sort());
});
