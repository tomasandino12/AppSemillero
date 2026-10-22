import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Sin base local, el repo se ata por texto a 0064: los nombres de las
 * funciones y de sus parámetros, las columnas que se mandan (sólo las que
 * tienen grant) y que las fotos nunca se pisan.
 */
const repo = readFileSync('src/data/repos/noticias.js', 'utf8');
const sql = readFileSync('supabase/migrations/0064_noticias.sql', 'utf8');

test('llama a las funciones públicas con los parámetros de la migración', () => {
  assert.match(repo, /rpc\('noticias_publicas', \{ p_club: clubId, p_limite: limite, p_antes: antesDe \}\)/);
  assert.match(repo, /rpc\('noticia_publica', \{ p_club: clubId, p_id: id \}\)/);
  assert.match(sql, /create function noticias_publicas\(p_club uuid, p_limite integer default 12, p_antes timestamptz default null\)/);
  assert.match(sql, /create function noticia_publica\(p_club uuid, p_id uuid\)/);
});

test('crea y edita sólo con las columnas que la migración deja escribir', () => {
  const insert = repo.match(/\.insert\(\{([^}]*)\}\)/)[1];
  assert.deepEqual(insert.split(',').map((s) => s.trim().split(':')[0]).filter(Boolean).sort(),
    ['autorizacion_imagen', 'club_id', 'cuerpo', 'etiqueta', 'fotos', 'id', 'publicada', 'resumen', 'titulo']);
  const update = repo.match(/\.update\(\{([^}]*)\}\)/)[1];
  assert.deepEqual(update.split(',').map((s) => s.trim().split(':')[0]).filter(Boolean).sort(),
    ['autorizacion_imagen', 'cuerpo', 'etiqueta', 'fotos', 'publicada', 'resumen', 'titulo']);
});

test('las fotos van al bucket de noticias, sin pisar ninguna; borrar la noticia borra sus fotos después de la fila', () => {
  assert.match(repo, /upload\(ruta, blob, \{ contentType: blob\.type, upsert: false, cacheControl: '3600' \}\)/);
  const cuerpo = repo.slice(repo.indexOf('export async function borrarNoticia('));
  assert.ok(cuerpo.indexOf(".from('noticia').delete()") < cuerpo.indexOf('borrarFotosNoticia('), 'primero la fila: si falla, las fotos siguen');
});
