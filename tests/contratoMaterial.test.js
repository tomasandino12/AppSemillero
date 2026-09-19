import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPOS } from '../src/data/inventario.js';

/**
 * Los tipos de material y sus reglas de peso viven en dos lugares: los check de
 * 0026_material.sql (los hace cumplir la base) y TIPOS de src/data/inventario.js
 * (lo que ofrece la pantalla). Si se desincronizan, o la pantalla ofrece algo
 * que la base rechaza, o la base acepta algo que la pantalla no sabe mostrar,
 * y nada avisa. Este test lee el SQL y compara.
 *
 * Si algún día una migración posterior cambia los tipos, actualizar la ruta.
 */

const sql = readFileSync('supabase/migrations/0026_material.sql', 'utf8').replace(/\r\n/g, '\n');
const lista = (texto) => [...texto.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

/** Los tipos entre comillas dentro del paréntesis que sigue a `ancla`. */
function tiposDespuesDe(ancla) {
  const desde = sql.indexOf(ancla);
  assert.ok(desde >= 0, `no encontré "${ancla}" en 0026_material.sql: ¿cambió la migración?`);
  const cierre = sql.indexOf(')', desde);
  return lista(sql.slice(desde, cierre));
}

const ordenados = (xs) => [...xs].sort();
const clavesDeTipos = (peso) => TIPOS.filter((t) => t.peso === peso).map((t) => t.clave);

test('los tipos de la pantalla son exactamente los que acepta la base', () => {
  assert.deepEqual(ordenados(tiposDespuesDe('tipo in (')), ordenados(TIPOS.map((t) => t.clave)));
});

test('los tipos que exigen peso son los mismos en la pantalla y en la base', () => {
  assert.deepEqual(
    ordenados(tiposDespuesDe('constraint material_peso_obligatorio check (\n    tipo not in (')),
    ordenados(clavesDeTipos('obligatorio')),
  );
});

test('los tipos que prohíben peso son los mismos en la pantalla y en la base', () => {
  assert.deepEqual(
    ordenados(tiposDespuesDe('constraint material_sin_peso check (\n    tipo not in (')),
    ordenados(clavesDeTipos('no')),
  );
});

test('"otro" es el único tipo con peso opcional', () => {
  assert.deepEqual(clavesDeTipos('opcional'), ['otro']);
});
