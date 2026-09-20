import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LARGO } from '../src/data/errorDeCliente.js';

/**
 * Los largos con los que el cliente recorta el registro de un error viven en
 * dos lugares: LARGO de src/data/errorDeCliente.js y los
 * `check (char_length(...) <= N)` de 0031_error_cliente.sql. Si se
 * desincronizan, el cliente manda un texto más largo del que la base acepta y
 * el insert falla justo cuando algo ya se había roto: el registro se pierde
 * sin que nadie se entere. Este test lee el SQL y compara.
 *
 * No están en src/data/limites.js a propósito: ese archivo es el espejo exacto
 * de 0028 y su propio test exige que las dos listas coincidan.
 */

const sql = readFileSync('supabase/migrations/0031_error_cliente.sql', 'utf8').replace(/\r\n/g, '\n');

/** 'columna' → N, leído de los check de la migración. */
const enLaBase = Object.fromEntries(
  [...sql.matchAll(/char_length\((\w+)\) <= (\d+)/g)].map((m) => [m[1], Number(m[2])]),
);

test('los largos del cliente son exactamente los que acepta la base', () => {
  assert.deepEqual(enLaBase, LARGO);
});

test('todas las columnas de texto de la tabla tienen un largo', () => {
  const columnas = [...sql.matchAll(/^ {2}(\w+) text/gm)].map((m) => m[1]);
  assert.deepEqual(columnas.sort(), Object.keys(LARGO).sort());
});
