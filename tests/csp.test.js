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

// El calendario del portal le pide los eventos a la API de Google Calendar.
// Además de Supabase, es el único host de connect-src.
test('connect-src: Supabase y la API de Google Calendar, nada más', async () => {
  const { HOST_AGENDA } = await import('../src/data/agenda.js');
  const url = readFileSync(path.join(raiz, 'public', 'config.js'), 'utf8').match(/SUPABASE_URL = '([^']+)'/)[1];
  const otros = directiva('connect-src').filter((h) => h !== "'self'" && h !== url && h !== url.replace('https://', 'wss://'));
  assert.deepEqual(otros, [`https://${HOST_AGENDA}`]);
});

test('connect-src llega al proyecto de Supabase que usa la app', () => {
  const url = readFileSync(path.join(raiz, 'public', 'config.js'), 'utf8').match(/SUPABASE_URL = '([^']+)'/)[1];
  assert.ok(directiva('connect-src')?.includes(url), `connect-src sin ${url}`);
});

// El marcador de salto reproduce el video elegido como objectURL. Sin
// media-src rige default-src 'self', que bloquea blob:, y el video queda en
// negro sólo en producción.
test('media-src deja reproducir el video del marcador (blob:) y el del hero del portal (\'self\'), y nada más', () => {
  assert.deepEqual(directiva('media-src'), ['\'self\'', 'blob:']);
});

// Si el navegador guarda el HTML, lo revalida con el ETag, y el 304 de Vercel
// no trae la CSP: el navegador sigue aplicando la cabecera vieja aunque
// vercel.json cambie, hasta que cambie el HTML. Pasó con media-src.
test('el HTML no se guarda en caché, para que cada CSP nueva llegue', () => {
  for (const ruta of ['/', '/public/index.html']) {
    const reglas = vercel.headers.filter((h) => h.source === ruta).flatMap((h) => h.headers);
    const cache = reglas.find((h) => h.key.toLowerCase() === 'cache-control')?.value ?? '';
    assert.match(cache, /\bno-store\b/, `${ruta} sin Cache-Control: no-store`);
  }
});

test('no se puede embeber la app en otra página', () => {
  assert.deepEqual(directiva('frame-ancestors'), ["'none'"]);
});

// Las fuentes viven en public/fonts/: pedirlas a Google le pasaba la IP de
// cada persona que abre la app, algo que la política de privacidad no cubre.
test('las fuentes se sirven desde el propio dominio, sin Google Fonts', () => {
  assert.deepEqual(directiva('font-src'), ["'self'"]);
  assert.deepEqual(directiva('style-src'), ["'self'", "'unsafe-inline'"]);
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
  const tokens = readFileSync(path.join(raiz, 'public', 'css', 'tokens.css'), 'utf8');
  const archivos = [...tokens.matchAll(/url\((\/public\/fonts\/[^)]+)\)/g)].map((m) => m[1]);
  assert.equal(archivos.length, 13);
  for (const ruta of archivos) assert.ok(existsSync(path.join(raiz, ruta)), `falta ${ruta}`);
});

// El calendario del portal ya no es un iframe de Google: lo arma la página con
// los eventos que pide a la API (connect-src). frame-src deja YouTube sin
// cookies y el mapa de "Dónde se entrena" (www.google.com/maps, que el portal
// carga recién cuando la persona toca "Ver mapa").
test('frame-src sólo deja YouTube sin cookies y el mapa de Google, sin comodines', () => {
  const f = directiva('frame-src');
  assert.ok(f, 'falta frame-src');
  assert.ok(!f.some((v) => v.includes('*') || v === 'https:'), f.join(' '));
  assert.deepEqual([...f].sort(), ['https://www.google.com', 'https://www.youtube-nocookie.com']);
});

// El portal (public/portal.html) también lee la base, así que lleva el mismo
// import map. Si alguien lo toca en un solo lado, el hash cambia y el portal
// queda sin formularios en producción (la CSP la pone Vercel, no el local).
test('el import map del portal tiene su hash en script-src y no hay otros scripts inline', () => {
  const portal = readFileSync(path.join(raiz, 'public', 'portal.html'), 'utf8').replace(/\r\n/g, '\n');
  const m = portal.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(m, 'el portal no tiene import map');
  const hash = `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`;
  assert.ok(directiva('script-src')?.includes(hash), `script-src no tiene ${hash} del portal`);
  const inline = [...portal.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((x) => !/type="importmap"/.test(x[1]));
  assert.deepEqual(inline.map((x) => x[0]), []);
});

// Lo mismo para /consultas: lee la lista de formularios, así que lleva el mismo import map.
test('el import map de /consultas tiene su hash en script-src y no hay otros scripts inline', () => {
  const pagina = readFileSync(path.join(raiz, 'public', 'consultas.html'), 'utf8').replace(/\r\n/g, '\n');
  const m = pagina.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(m, 'consultas.html no tiene import map');
  const hash = `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`;
  assert.ok(directiva('script-src')?.includes(hash), `script-src no tiene ${hash} de consultas.html`);
  const inline = [...pagina.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((x) => !/type="importmap"/.test(x[1]));
  assert.deepEqual(inline.map((x) => x[0]), []);
});

// Las fotos de las noticias (0064) se sirven desde el bucket público del
// proyecto de Supabase. blob: es la vista previa del panel y del marcador.
test('img-src: el sitio, blob, las miniaturas de YouTube y el Storage de Supabase, nada más', () => {
  const url = readFileSync(path.join(raiz, 'public', 'config.js'), 'utf8').match(/SUPABASE_URL = '([^']+)'/)[1];
  assert.deepEqual(directiva('img-src'), ["'self'", 'blob:', 'https://i.ytimg.com', url]);
});
