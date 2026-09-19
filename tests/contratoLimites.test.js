import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIMITE, LIMITES_POR_COLUMNA } from '../src/data/limites.js';

/**
 * Los límites de largo viven en dos lugares: los check de 0028 (los hace
 * cumplir la base) y src/data/limites.js (lo que usa la interfaz para
 * `maxlength`). Este test lee el SQL y compara: si un número cambia de un lado
 * sólo, o falta una columna en uno de los dos, falla.
 */

const sql = readFileSync('supabase/migrations/0028_limites_de_largo.sql', 'utf8').replace(/\r\n/g, '\n');

const enBase = {};
for (const m of sql.matchAll(/alter table (\w+)\s+add constraint\s+\w+\s+check \(char_length\((\w+)\) <= (\d+)\) not valid;/g)) {
  enBase[`${m[1]}.${m[2]}`] = Number(m[3]);
}

test('la base y la interfaz limitan exactamente las mismas columnas', () => {
  assert.deepEqual(Object.keys(enBase).sort(), Object.keys(LIMITES_POR_COLUMNA).sort());
});

test('cada columna tiene el mismo número en la base y en la interfaz', () => {
  assert.deepEqual(enBase, LIMITES_POR_COLUMNA);
});

test('todos los límites son enteros positivos y ninguno es absurdo', () => {
  for (const [nombre, n] of Object.entries(LIMITE)) {
    assert.ok(Number.isInteger(n) && n > 0 && n <= 10000, `${nombre}: ${n}`);
  }
});

test('los RPC de escritura quedan sin acceso anónimo', () => {
  for (const f of ['importar_partido', 'alta_jugador_manual', 'guardar_sesion_medicion',
    'guardar_recurso', 'guardar_metas_plantel', 'importar_plan_fisico']) {
    assert.match(sql, new RegExp(`revoke execute on function ${f}\\(jsonb\\)\\s+from public, anon;`), f);
    assert.match(sql, new RegExp(`grant execute on function ${f}\\(jsonb\\)\\s+to authenticated;`), f);
  }
});
