import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * Un `insert into jugador ... returning` dentro de una función invoker exige
 * que la fila nueva pase jugador_ver (0016), que pide una pertenencia que
 * todavía no existe: Postgres corta con 42501 y nadie puede dar de alta a un
 * chico. Pasó desde 0016 hasta 0036 sin que nada fallara en Node.
 *
 * Este test toma la ÚLTIMA definición de cada función de las migraciones y
 * falla si alguna vuelve a insertar en jugador con returning.
 */

const DIR = 'supabase/migrations';
const sinComentarios = (t) => t.replace(/--.*$/gm, '');

const ultimaDefinicion = new Map();
for (const archivo of readdirSync(DIR).filter((a) => a.endsWith('.sql')).sort()) {
  const sql = sinComentarios(readFileSync(`${DIR}/${archivo}`, 'utf8').replace(/\r\n/g, '\n'));
  for (const m of sql.matchAll(/create (?:or replace )?function (?:public\.)?(\w+)\s*\([\s\S]*?as (\$\w*\$)([\s\S]*?)\2/g)) {
    ultimaDefinicion.set(m[1], { archivo, cuerpo: m[3] });
  }
}

test('ninguna función vigente inserta en jugador con returning', () => {
  const conInsert = [...ultimaDefinicion].filter(([, d]) => /insert into (?:public\.)?jugador\s*\(/.test(d.cuerpo));
  assert.ok(conInsert.length >= 3, 'se esperaban al menos alta, import y aprobación de solicitud');
  for (const [nombre, { archivo, cuerpo }] of conInsert) {
    for (const insert of cuerpo.matchAll(/insert into (?:public\.)?jugador\s*\([\s\S]*?;/g)) {
      assert.doesNotMatch(insert[0], /\breturning\b/i, `${nombre} (${archivo}) inserta en jugador con returning`);
    }
  }
});

test('el import avisa con códigos propios cuando alguien cargó al chico mientras tanto', () => {
  const { cuerpo } = ultimaDefinicion.get('importar_partido');
  assert.match(cuerpo, /'JUGADOR_YA_EXISTE: %'/);
  assert.match(cuerpo, /'PERTENENCIA_YA_VIGENTE'/);
  assert.match(ultimaDefinicion.get('alta_jugador_manual').cuerpo, /'JUGADOR_YA_EXISTE'/);
});
