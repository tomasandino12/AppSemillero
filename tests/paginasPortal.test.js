import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PAGINAS_PORTAL } from '../src/data/portal.js';

/**
 * Las páginas del portal son HTML escrito a mano: encabezado, barra y pie
 * están copiados en cada una (así se ven sin JS). Este test avisa si una
 * copia se separa de las otras, o si a una página le falta su rewrite, su
 * Cache-Control o el import map exacto (sin él, en producción queda sin datos
 * y en local anda igual: la CSP la pone Vercel).
 */
const PAGINAS = {
  '/': 'public/portal.html',
  '/categorias': 'public/categorias.html',
  '/calendario': 'public/calendario.html',
  '/ayuda': 'public/ayuda.html',
  '/noticias': 'public/noticias.html',
};

const leer = (r) => readFileSync(r, 'utf8').replace(/\r\n/g, '\n');
const html = Object.fromEntries(Object.entries(PAGINAS).map(([ruta, archivo]) => [ruta, leer(archivo)]));
const vercel = JSON.parse(leer('vercel.json'));
const sitemap = leer('public/sitemap.xml');
const bloque = (texto, re) => texto.match(re)?.[0] ?? null;
const IMPORT_MAP = /<script type="importmap">[\s\S]*?<\/script>/;
const ENCABEZADO = /<header class="portal-barra">[\s\S]*?<\/header>/;
const BARRA = '<div class="portal-acc-barra" id="portal-acc-barra" hidden></div>';
const PIE = /<footer class="portal-pie">[\s\S]*?<\/footer>/;
const SITIO = 'https://app-semillero.vercel.app';
const cache = (ruta) => vercel.headers.filter((h) => h.source === ruta).flatMap((h) => h.headers).find((h) => h.key === 'Cache-Control')?.value;
const meta = (t, atributo, nombre) => t.match(new RegExp(`<meta ${atributo}="${nombre}" content="([^"]*)">`))?.[1] ?? null;

test('cada página lleva el import map de la app letra por letra, antes de los módulos, y config.js', () => {
  const app = bloque(leer('public/index.html'), IMPORT_MAP);
  for (const [ruta, t] of Object.entries(html)) {
    assert.equal(bloque(t, IMPORT_MAP), app, `${ruta}: import map distinto (cambia el hash de la CSP)`);
    assert.ok(t.indexOf('type="importmap"') < t.indexOf('type="module"'), `${ruta}: el import map va antes`);
    assert.match(t, /<script src="\/public\/config\.js"><\/script>/, ruta);
  }
});

test('ninguna página tiene script inline aparte del import map, ni manifest, ni service worker, ni iframe', () => {
  for (const [ruta, t] of Object.entries(html)) {
    const inline = [...t.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !/type="importmap"/.test(m[1]));
    assert.deepEqual(inline.map((m) => m[0]), [], ruta);
    assert.doesNotMatch(t, /rel="manifest"|serviceWorker|<iframe/, ruta);
  }
});

test('encabezado, barra y pie idénticos en todas las páginas', () => {
  const ref = html['/'];
  for (const [ruta, t] of Object.entries(html)) {
    assert.equal(bloque(t, ENCABEZADO), bloque(ref, ENCABEZADO), `${ruta}: encabezado distinto del de /`);
    assert.ok(t.includes(BARRA), `${ruta}: falta la barra de acciones`);
    assert.equal(bloque(t, PIE), bloque(ref, PIE), `${ruta}: pie distinto del de /`);
  }
});

test('la navegación del encabezado y la del pie son PAGINAS_PORTAL, en orden', () => {
  const links = (t) => [...t.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);
  const esperado = PAGINAS_PORTAL.map((p) => [p.href, p.texto]);
  assert.deepEqual(links(bloque(html['/'], /<nav class="portal-nav"[\s\S]*?<\/nav>/)), esperado);
  assert.deepEqual(links(bloque(html['/'], /<nav class="portal-pie-nav"[\s\S]*?<\/nav>/)), esperado);
});

test('cada página tiene su rewrite y no-store en la ruta y en el .html', () => {
  for (const [ruta, archivo] of Object.entries(PAGINAS)) {
    assert.ok(vercel.rewrites.some((r) => r.source === ruta && r.destination === `/${archivo}`), `${ruta}: falta el rewrite`);
    assert.equal(cache(ruta), 'no-store', ruta);
    assert.equal(cache(`/${archivo}`), 'no-store', `/${archivo}`);
  }
});

test('cada página está en el sitemap', () => {
  for (const ruta of Object.keys(PAGINAS)) assert.ok(sitemap.includes(`<loc>${SITIO}${ruta}</loc>`), ruta);
});

test('cada página tiene title, description, canonical y og:url propios', () => {
  const titulos = new Set();
  for (const [ruta, t] of Object.entries(html)) {
    const titulo = t.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(titulo && !titulos.has(titulo), `${ruta}: title vacío o repetido`);
    titulos.add(titulo);
    assert.ok(meta(t, 'name', 'description'), `${ruta}: falta description`);
    assert.match(t, new RegExp(`<link rel="canonical" href="${SITIO}${ruta}">`), ruta);
    assert.equal(meta(t, 'property', 'og:url'), `${SITIO}${ruta}`, ruta);
  }
});

test('sólo "/" lleva portalEntrada.js (los mails de login apuntan ahí), y es su primer módulo', () => {
  for (const [ruta, t] of Object.entries(html)) {
    const modulos = [...t.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((m) => m[1]);
    if (ruta === '/') assert.equal(modulos[0], '/src/ui/portalEntrada.js');
    else assert.ok(!modulos.includes('/src/ui/portalEntrada.js'), ruta);
  }
});

test('cada página carga portal.css y un arranque que existe', () => {
  for (const [ruta, t] of Object.entries(html)) {
    assert.match(t, /<link rel="stylesheet" href="\/public\/css\/portal\.css">/, ruta);
    const arranque = [...t.matchAll(/<script type="module" src="\/(src\/ui\/\w+Arranque\.js)"><\/script>/g)].map((m) => m[1]);
    assert.equal(arranque.length, 1, `${ruta}: un arranque`);
    assert.ok(existsSync(arranque[0]), `${ruta}: falta ${arranque[0]}`);
  }
});

test('ninguna página ni el código del portal dice "Próximamente"', () => {
  const codigo = ['src/ui/portal.js', 'src/ui/portalMarco.js'].map(leer);
  for (const t of [...Object.values(html), ...codigo]) assert.doesNotMatch(t, /Próximamente/i);
});

test('los módulos del portal sólo piden datos por el repositorio', () => {
  for (const archivo of ['src/ui/portal.js', 'src/ui/portalMarco.js', ...Object.values(html).flatMap((t) => [...t.matchAll(/src="\/(src\/ui\/\w+\.js)"/g)].map((m) => m[1]))]) {
    const codigo = leer(archivo);
    const imports = [...codigo.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(imports.filter((i) => /repos\/|cliente|supabase/.test(i)), [], archivo);
    assert.doesNotMatch(codigo, /\bfetch\s*\(/, archivo);
  }
});
