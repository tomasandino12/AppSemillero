import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { patron, destino, cabeceras, archivoPedido } from '../scripts/servir.mjs';

/**
 * scripts/servir.mjs sirve el repo como Vercel: con los rewrites y las
 * cabeceras de vercel.json, CSP incluida. Sin esto, en local /ayuda da 404
 * y una CSP rota recién se ve en producción.
 */
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));

test('patron: el comodín (.*) de vercel.json, anclado', () => {
  assert.ok(patron('/src/(.*)').test('/src/ui/portal.js'));
  assert.ok(!patron('/src/(.*)').test('/srcx/ui.js'));
  assert.ok(patron('/').test('/'));
  assert.ok(!patron('/').test('/app'));
  assert.ok(patron('/public/index.html').test('/public/index.html'));
  assert.ok(!patron('/public/index.html').test('/public/indexXhtml'), 'el punto es literal');
});

test('destino: los rewrites de vercel.json; lo demás, tal cual', () => {
  assert.equal(destino('/', vercel.rewrites), '/public/portal.html');
  assert.equal(destino('/app', vercel.rewrites), '/public/index.html');
  assert.equal(destino('/consultas?x=1', vercel.rewrites), '/public/consultas.html');
  assert.equal(destino('/public/css/base.css', vercel.rewrites), '/public/css/base.css');
});

test('cabeceras: se suman todas las reglas que coinciden, CSP incluida', () => {
  const h = cabeceras('/', vercel.headers);
  assert.equal(h['Cache-Control'], 'no-store');
  assert.match(h['Content-Security-Policy'], /default-src 'self'/);
  assert.equal(cabeceras('/src/ui/portal.js', vercel.headers)['Cache-Control'], 'no-cache');
});

test('archivoPedido: nunca sale de la carpeta del repo', () => {
  const raiz = path.resolve('.');
  assert.equal(archivoPedido(raiz, '/', vercel.rewrites), path.join(raiz, 'public', 'portal.html'));
  // new URL() ya resuelve los %2e%2e antes de llegar al disco: queda adentro (o null si algo se cuela).
  const intento = archivoPedido(raiz, '/%2e%2e/%2e%2e/secreto.txt', vercel.rewrites);
  assert.ok(intento === null || intento.startsWith(raiz + path.sep));
});

test('archivoPedido: sólo /public y /src (lo que publica Vercel); .env, .git, tests y % mal formado, no', () => {
  const raiz = path.resolve('.');
  for (const url of ['/.env', '/.git/config', '/tests/fixtures/x.xlsx', '/package.json', '/%E0%A4%A']) {
    assert.equal(archivoPedido(raiz, url, vercel.rewrites), null, url);
  }
  assert.ok(archivoPedido(raiz, '/src/ui/portal.js', vercel.rewrites));
  assert.ok(archivoPedido(raiz, '/public/css/base.css', vercel.rewrites));
});
