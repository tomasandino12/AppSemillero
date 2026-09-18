import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esEnlaceWeb } from '../src/data/enlaces.js';

/**
 * esEnlaceWeb() es la regla de "un link se puede abrir": la misma que el CHECK
 * de la base (0027). Si las dos se separan, la app deja pasar algo que la base
 * rechaza (error al guardar) o la base guarda algo que la app esconde.
 */

test('http y https pasan, sin importar mayúsculas', () => {
  assert.equal(esEnlaceWeb('https://www.youtube.com/shorts/abc'), true);
  assert.equal(esEnlaceWeb('http://example.com'), true);
  assert.equal(esEnlaceWeb('HTTPS://EXAMPLE.COM'), true);
});

test('cualquier otro esquema no pasa: javascript:, data:, vbscript:', () => {
  assert.equal(esEnlaceWeb('javascript:alert(1)'), false);
  assert.equal(esEnlaceWeb('JavaScript:alert(1)'), false);
  assert.equal(esEnlaceWeb('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(esEnlaceWeb('vbscript:msgbox(1)'), false);
});

test('sin esquema no pasa: el navegador lo tomaría como ruta de la app', () => {
  assert.equal(esEnlaceWeb('www.youtube.com/watch?v=1'), false);
  assert.equal(esEnlaceWeb('//evil.com'), false);
});

test('espacios adelante no pasan: la base compara desde el primer carácter', () => {
  assert.equal(esEnlaceWeb(' https://example.com'), false);
});

test('vacío, null y no-strings no pasan', () => {
  assert.equal(esEnlaceWeb(''), false);
  assert.equal(esEnlaceWeb(null), false);
  assert.equal(esEnlaceWeb(undefined), false);
  assert.equal(esEnlaceWeb(42), false);
});

test('la migración 0027 usa la misma expresión que esEnlaceWeb', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
  const archivo = readdirSync(dir).find((f) => f.startsWith('0027_'));
  assert.ok(archivo, 'falta la migración 0027');
  const sql = readFileSync(path.join(dir, archivo), 'utf8');
  for (const [tabla, columna] of [['recurso', 'enlace'], ['ejercicio', 'enlace'], ['ejercicio_fuerza', 'link']]) {
    assert.match(sql, new RegExp(`alter table ${tabla}[\\s\\S]*?check \\(${columna} is null or ${columna} ~\\* '\\^https\\?://'\\)`),
      `${tabla}.${columna} sin el CHECK esperado`);
  }
});

test('ningún href de la UI se arma con un link sin pasar por esEnlaceWeb', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'pantallas');
  for (const f of readdirSync(dir)) {
    const codigo = readFileSync(path.join(dir, f), 'utf8');
    for (const m of codigo.matchAll(/\$\{([^}]*?)\s*\?\s*`[^`]*href="\$\{escaparHtml\(([^)]+)\)\}"/g)) {
      assert.match(m[1], /esEnlaceWeb\(/, `${f}: el href de ${m[2]} se dibuja sin esEnlaceWeb`);
    }
  }
});
