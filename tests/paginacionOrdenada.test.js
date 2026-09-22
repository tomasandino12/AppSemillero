import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * .range() sin .order() no garantiza un orden estable entre páginas: Postgres
 * puede devolver la misma fila dos veces o saltear una si dos páginas se
 * piden en momentos distintos. Este test exige que toda cadena .from()...
 * .range() de los repos declare un .order() explícito.
 */

const DIR = 'src/data/repos';

test('toda cadena .from()...range() de los repos tiene un .order()', () => {
  const archivos = readdirSync(DIR).filter((a) => a.endsWith('.js'));
  let revisados = 0;
  for (const archivo of archivos) {
    const codigo = readFileSync(`${DIR}/${archivo}`, 'utf8');
    for (const sentencia of codigo.split(';')) {
      if (!sentencia.includes('.from(') || !sentencia.includes('.range(')) continue;
      revisados += 1;
      assert.match(sentencia, /\.order\(/, `${archivo}: hay una cadena .from()...range() sin .order()`);
    }
  }
  assert.ok(revisados >= 3, 'se esperaban al menos las tres cadenas paginadas conocidas (mediciones y partidos)');
});
