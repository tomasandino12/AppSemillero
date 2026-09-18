import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * La Content-Security-Policy de vercel.json sólo deja correr scripts del
 * propio dominio y el import map inline, identificado por su hash. Tocar un
 * espacio del import map cambia el hash y la app queda en blanco en
 * producción, sin que nada falle en local (la CSP la pone Vercel). Este test
 * es el que avisa.
 */

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// El parser de HTML normaliza CRLF a LF antes de calcular el hash.
const html = readFileSync(path.join(raiz, 'public', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const vercel = JSON.parse(readFileSync(path.join(raiz, 'vercel.json'), 'utf8'));

function csp() {
  const reglas = vercel.headers?.flatMap((h) => h.headers) ?? [];
  return reglas.find((h) => h.key.toLowerCase() === 'content-security-policy')?.value ?? '';
}

function directiva(nombre) {
  const d = csp().split(';').map((s) => s.trim()).find((s) => s.startsWith(`${nombre} `));
  return d ? d.split(/\s+/).slice(1) : null;
}

test('el hash del import map está en script-src', () => {
  const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(m, 'no hay import map');
  const hash = `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`;
  assert.ok(directiva('script-src')?.includes(hash), `script-src no tiene ${hash}: actualizarlo en vercel.json`);
});

test('no hay otros scripts inline: sólo el import map', () => {
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !/type="importmap"/.test(m[1]));
  assert.deepEqual(inline.map((m) => m[0]), []);
});

test('script-src no abre la puerta a inline, eval ni CDNs', () => {
  const s = directiva('script-src');
  assert.ok(s, 'falta script-src');
  for (const prohibido of ["'unsafe-inline'", "'unsafe-eval'", 'https:', '*']) assert.ok(!s.includes(prohibido), prohibido);
  assert.deepEqual(s.filter((v) => !v.startsWith("'sha256-")), ["'self'"]);
});

test('el import map apunta a archivos que existen en public/vendor', () => {
  const mapa = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  for (const [nombre, ruta] of Object.entries(mapa)) {
    assert.match(ruta, /^\/public\/vendor\//, nombre);
    assert.ok(existsSync(path.join(raiz, ruta)), `${nombre}: falta ${ruta} (npm run vendor)`);
  }
});

test('connect-src llega al proyecto de Supabase que usa la app', () => {
  const url = readFileSync(path.join(raiz, 'public', 'config.js'), 'utf8').match(/SUPABASE_URL = '([^']+)'/)[1];
  assert.ok(directiva('connect-src')?.includes(url), `connect-src sin ${url}`);
});

test('no se puede embeber la app en otra página', () => {
  assert.deepEqual(directiva('frame-ancestors'), ["'none'"]);
});
