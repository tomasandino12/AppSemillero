import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION_LEGAL } from '../src/data/legal.js';

const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');

for (const pagina of ['privacidad', 'terminos']) {
  test(`${pagina}.html declara la versión vigente`, () => {
    const html = leer(`public/legal/${pagina}.html`);
    const versiones = [...html.matchAll(/data-version="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(versiones, [VERSION_LEGAL]);
  });
}

test('VERSION_LEGAL es una fecha válida, como la columna date de 0051', () => {
  const sql = leer('supabase/migrations/0051_aceptacion_legal.sql');
  assert.match(sql, /version date not null/);
  assert.match(VERSION_LEGAL, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${VERSION_LEGAL}T00:00:00Z`).toISOString().slice(0, 10), VERSION_LEGAL);
});

test('vercel.json sirve /privacidad y /terminos', () => {
  const { rewrites } = JSON.parse(leer('vercel.json'));
  const destino = Object.fromEntries(rewrites.map((r) => [r.source, r.destination]));
  assert.equal(destino['/privacidad'], '/public/legal/privacidad.html');
  assert.equal(destino['/terminos'], '/public/legal/terminos.html');
});
