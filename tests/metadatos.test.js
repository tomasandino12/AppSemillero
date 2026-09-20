import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Los metadatos del <head> viven duplicados por diseño: el título está en
 * <title> y en og:title, la descripción en dos lados, y las medidas de la
 * imagen están escritas a mano aunque el PNG ya las tenga. Nada falla si se
 * desincronizan — la página sigue andando y la tarjeta de WhatsApp sale mal
 * semanas después, cuando alguien la comparte. Este test los compara.
 */

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(raiz, 'public', 'index.html'), 'utf8');

/** El content= de un <meta property="og:...">. */
function og(propiedad) {
  return html.match(new RegExp(`<meta property="${propiedad}" content="([^"]*)">`))?.[1] ?? null;
}

function meta(nombre) {
  return html.match(new RegExp(`<meta name="${nombre}" content="([^"]*)">`))?.[1] ?? null;
}

const canonical = html.match(/<link rel="canonical" href="([^"]*)">/)?.[1] ?? null;

test('hay un canonical absoluto: / y /public/index.html sirven lo mismo', () => {
  assert.ok(canonical, 'falta <link rel="canonical">');
  assert.match(canonical, /^https:\/\/[^/]+\/$/, 'el canonical tiene que ser la raíz absoluta del sitio');
});

test('og:url apunta al canonical', () => {
  assert.equal(og('og:url'), canonical);
});

test('el título y la descripción no se desincronizan con los de Open Graph', () => {
  assert.equal(og('og:title'), html.match(/<title>([^<]*)<\/title>/)[1]);
  assert.equal(og('og:description'), meta('description'));
});

test('og:image es absoluta, del mismo dominio que el canonical, y el archivo existe', () => {
  const imagen = og('og:image');
  assert.ok(imagen?.startsWith(canonical), `og:image tiene que colgar de ${canonical}: quien la busca es un servidor ajeno, no el navegador`);
  const ruta = imagen.slice(canonical.length - 1); // deja la barra inicial
  assert.ok(existsSync(path.join(raiz, ruta)), `falta ${ruta}`);
});

test('las medidas declaradas de og:image son las del PNG', () => {
  const ruta = og('og:image').slice(canonical.length - 1);
  // Cabecera IHDR de un PNG: ancho y alto en big-endian, en los bytes 16 y 20.
  const png = readFileSync(path.join(raiz, ruta));
  assert.equal(og('og:image:width'), String(png.readUInt32BE(16)));
  assert.equal(og('og:image:height'), String(png.readUInt32BE(20)));
});
