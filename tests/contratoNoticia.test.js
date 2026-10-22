import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIMITE } from '../src/data/limites.js';

/**
 * 0064 le da al visitante sin sesión las noticias publicadas del club, con
 * fotos en un bucket público. Como 0058, lo mínimo: anon no recibe nada sobre
 * la tabla, sólo `execute` de dos funciones que devuelven filas publicadas.
 * Este test lee la migración y falla si eso se afloja, o si una regla que vive
 * en SQL y en JS (etiquetas, cantidad de fotos, largo del alt, tamaño y tipos
 * de archivo) se separa. Las constantes de JS las suma src/data/noticias.js
 * (Task 11): hasta entonces, sólo corren los tests de seguridad.
 * Spec: docs/superpowers/specs/2026-10-21-portal-multipagina-design.md.
 */
const sql = readFileSync('supabase/migrations/0064_noticias.sql', 'utf8').replace(/\r\n/g, '\n');
const codigo = sql.replace(/--.*$/gm, '');
const plano = (s) => s.replace(/\s+/g, ' ').trim();

function cuerpoDe(nombre) {
  const desde = codigo.indexOf(`create function ${nombre}(`);
  assert.ok(desde >= 0, `no encontré "create function ${nombre}("`);
  return codigo.slice(desde, codigo.indexOf('\n$fn$;', desde));
}

test('los grants sobre noticia son exactamente estos, por columna', () => {
  const grants = [...codigo.matchAll(/grant\s+(select|insert|update|delete|all|truncate|references|trigger)\b[^;]*\bon\s+noticia\b[^;]*;/gi)].map((m) => plano(m[0]));
  assert.deepEqual(grants, [
    'grant select on noticia to authenticated;',
    'grant insert (id, club_id, titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen, publicada) on noticia to authenticated;',
    'grant update (titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen, publicada) on noticia to authenticated;',
    'grant delete on noticia to authenticated;',
  ]);
  assert.match(codigo, /revoke\s+all\s+on\s+noticia\s+from\s+anon,\s*authenticated;/i);
});

test('anon sólo ejecuta las dos funciones públicas', () => {
  const aAnon = [...codigo.matchAll(/grant\s+[^;]*\bto\s+[^;]*\banon\b[^;]*;/gi)].map((m) => plano(m[0]));
  assert.deepEqual(aAnon, [
    'grant execute on function noticias_publicas(uuid, integer, timestamptz) to anon, authenticated;',
    'grant execute on function noticia_publica(uuid, uuid) to anon, authenticated;',
  ]);
  for (const f of ['fotos_de_noticia_validas(jsonb, uuid, uuid)', 'club_de_ruta_noticia(text)']) {
    assert.match(codigo, new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+${f.replace(/[()]/g, '\\$&')}\\s+from\\s+public,\\s*anon;`, 'i'), f);
  }
  assert.match(codigo, /revoke\s+execute\s+on\s+function\s+sellar_noticia\(\)\s+from\s+public,\s*anon,\s*authenticated;/i);
});

test('la tabla la leen, escriben y borran sólo los coordinadores del club', () => {
  const policies = [...codigo.matchAll(/create\s+policy\s+(\w+)\s+on\s+noticia\s+for\s+(\w+)([^;]*);/gi)];
  assert.deepEqual(policies.map((m) => m[2].toLowerCase()).sort(), ['delete', 'insert', 'select', 'update']);
  for (const m of policies) assert.match(m[3], /es_coordinador_de\(noticia\.club_id\)/, m[1]);
  assert.match(codigo, /alter table noticia enable row level security;/);
});

test('las fotos: suben, ven y borran sólo los coordinadores del club de la carpeta; sin update', () => {
  const policies = [...codigo.matchAll(/create\s+policy\s+(\w+)\s+on\s+storage\.objects\s+for\s+(\w+)\s+to\s+authenticated([^;]*);/gi)];
  assert.deepEqual(policies.map((m) => m[2].toLowerCase()).sort(), ['delete', 'insert', 'select']);
  for (const m of policies) {
    assert.match(m[3], /bucket_id = 'noticias'/, m[1]);
    assert.match(m[3], /public\.es_coordinador_de\(public\.club_de_ruta_noticia\(name\)\)/, m[1]);
  }
});

test('las funciones públicas devuelven sólo lo publicado del club pedido, sin autoría ni autorización', () => {
  for (const nombre of ['noticias_publicas', 'noticia_publica']) {
    const cuerpo = cuerpoDe(nombre);
    assert.match(cuerpo, /security definer/, nombre);
    assert.match(cuerpo, /set search_path = ''/, nombre);
    assert.match(cuerpo, /n\.club_id = p_club and/, nombre);
    assert.match(cuerpo, /\bn\.publicada\b/, nombre);
    assert.doesNotMatch(cuerpo, /creado_por|actualizado_por|autorizacion_imagen/, nombre);
  }
  assert.match(cuerpoDe('noticias_publicas'), /limit least\(greatest\(coalesce\(p_limite, 12\), 1\), 24\)/);
  assert.match(cuerpoDe('noticias_publicas'), /order by n\.publicada_en desc, n\.id/);
});

test('con fotos, la autorización de imagen es obligatoria (check de la base)', () => {
  assert.match(codigo, /constraint noticia_fotos_autorizadas check \(fotos = '\[\]'::jsonb or autorizacion_imagen\)/);
  assert.match(codigo, /constraint noticia_fotos_validas check \(fotos_de_noticia_validas\(fotos, club_id, id\)\)/);
});

test('la fecha de una noticia es la de su primera publicación, y la pone la base', () => {
  const cuerpo = cuerpoDe('sellar_noticia');
  assert.match(cuerpo, /if new\.publicada and new\.publicada_en is null then\s+new\.publicada_en := now\(\);/);
  assert.doesNotMatch(codigo, /grant[^;]*publicada_en/i, 'el cliente no la fija');
});

test('el largo de la descripción de cada foto es el de limites.js', () => {
  const m = cuerpoDe('fotos_de_noticia_validas').match(/char_length\(btrim\(coalesce\(f ->> 'alt', ''\)\)\) not between 1 and (\d+)/);
  assert.equal(Number(m?.[1]), LIMITE.altFoto);
});

// ---- Constantes que comparten SQL y JS (src/data/noticias.js, Task 11) ----

test('etiquetas, máximo de fotos, extensiones, tamaño y tipos del bucket: los mismos que src/data/noticias.js', async (t) => {
  let n;
  try {
    n = await import('../src/data/noticias.js');
  } catch {
    t.skip('src/data/noticias.js llega en la Task 11');
    return;
  }
  const etiquetas = codigo.match(/check \(etiqueta in \(([^)]*)\)\)/)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(etiquetas, n.ETIQUETAS_NOTICIA.map((e) => e.clave));
  assert.equal(Number(cuerpoDe('fotos_de_noticia_validas').match(/jsonb_array_length\(p_fotos\) <= (\d+)/)[1]), n.MAX_FOTOS);
  const extensiones = cuerpoDe('fotos_de_noticia_validas').match(/\\\.\(([\w|]+)\)\$/)[1].split('|');
  assert.deepEqual(extensiones.sort(), Object.values(n.TIPOS_FOTO_GUARDADA).sort());
  const bucket = codigo.match(/values \('noticias', 'noticias', true, (\d+), array\[([^\]]*)\]\)/);
  assert.equal(Number(bucket[1]), n.MAX_BYTES_FOTO);
  assert.deepEqual(bucket[2].match(/'([^']+)'/g).map((s) => s.slice(1, -1)).sort(), Object.keys(n.TIPOS_FOTO_GUARDADA).sort());
});
