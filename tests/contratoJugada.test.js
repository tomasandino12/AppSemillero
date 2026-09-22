import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPOS_JUGADA, TOPES } from '../src/data/jugadas.js';
import { LIMITE } from '../src/data/limites.js';

/**
 * La jugada vive en dos lugares: los check de 0035_jugadas.sql (los hace
 * cumplir la base) y src/data/jugadas.js (lo que valida y ofrece la pantalla).
 * Si se desincronizan, el editor deja armar algo que la base rechaza al
 * guardar. Este test lee el SQL y compara. Modelo: contratoMaterial.test.js.
 *
 * Además cuida la frontera del jugador: mis_jugadas() arranca por mi_jugador()
 * y no devuelve al autor.
 */

const sql = readFileSync('supabase/migrations/0035_jugadas.sql', 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = sql.replace(/--.*$/gm, '');

function cuerpoDe(nombre) {
  const desde = sinComentarios.indexOf(`create function ${nombre}(`);
  assert.ok(desde >= 0, `no encontré "create function ${nombre}(": ¿cambió la migración?`);
  return sinComentarios.slice(desde, sinComentarios.indexOf('\n$fn$;', desde));
}

const ordenados = (xs) => [...xs].sort();

test('los tipos de jugada coinciden con el check', () => {
  const m = sinComentarios.match(/tipo text not null check \(tipo in \(([^)]*)\)\)/);
  assert.ok(m, 'no encontré el check de tipo: ¿cambió la migración?');
  const enBase = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  assert.deepEqual(ordenados(enBase), ordenados(TIPOS_JUGADA.map((t) => t.clave)));
});

test('el tope de bytes coincide con TOPES', () => {
  const m = sinComentarios.match(/check \(octet_length\(datos::text\) <= (\d+)\)/);
  assert.ok(m, 'no encontré el check de tamaño');
  assert.equal(Number(m[1]), TOPES.bytes);
});

test('el largo de la nota coincide con LIMITE.notaPaso', () => {
  const m = cuerpoDe('jugada_notas_validas').match(/char_length\(coalesce\(p\.paso->>'nota', ''\)\) <= (\d+)/);
  assert.ok(m, 'no encontré la comparación de la nota');
  assert.equal(Number(m[1]), LIMITE.notaPaso);
  assert.match(sinComentarios, /check \(public\.jugada_notas_validas\(datos\)\)/);
});

test('el jugador no recibe grants de tabla: sólo authenticated y por columna en la escritura', () => {
  for (const tabla of ['jugada', 'jugada_plantel']) {
    assert.match(sinComentarios, new RegExp(`alter table ${tabla} enable row level security`));
    assert.match(sinComentarios, new RegExp(`revoke all on ${tabla} from anon, authenticated`));
  }
  assert.doesNotMatch(sinComentarios, /grant\s+[^;]*\bto\s+(anon|public)\b/i);
  assert.match(sinComentarios, /grant update \(nombre, tipo, datos\) on jugada to authenticated;/);
});

test('mis_jugadas corre como dueño, arranca por mi_jugador() y no devuelve al autor', () => {
  const cuerpo = cuerpoDe('mis_jugadas');
  assert.match(cuerpo, /security definer/);
  assert.match(cuerpo, /set search_path = ''/);
  assert.match(cuerpo, /v_jugador uuid := public\.mi_jugador\(\)/);
  assert.match(cuerpo, /if v_jugador is null then\s+return;/);
  assert.match(cuerpo, /pe\.jugador_id = v_jugador\s+and pe\.hasta is null/);
  assert.doesNotMatch(cuerpo, /creado_por/);
  assert.match(sinComentarios, /revoke execute on function mis_jugadas\(\) from public, anon;/);
  assert.match(sinComentarios, /grant execute on function mis_jugadas\(\) to authenticated;/);
});
