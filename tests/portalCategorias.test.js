import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PORTAL, slugCategoria, categoriasConDetalle } from '../src/data/portal.js';
import { htmlCategoriaDetalle, htmlIndiceCategorias, htmlCategoriaDelAnio } from '../src/ui/portal.js';

/**
 * /categorias: el buscador por año arriba y una sección por categoría, con
 * su ancla (/categorias#u13). Sólo lo que está en src/data/portal.js: años,
 * horarios, sede. Nada inventado: sin horario dice "Horario a confirmar".
 */
const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const pagina = leer('public/categorias.html');
const vercel = JSON.parse(leer('vercel.json'));

test('slugCategoria: minúsculas, sin tildes, con guiones', () => {
  assert.equal(slugCategoria('U13'), 'u13');
  assert.equal(slugCategoria('Primera Femenino'), 'primera-femenino');
  assert.equal(slugCategoria('  Categoría  Ñ! '), 'categoria-n');
});

test('categoriasConDetalle: un ancla única por categoría; las dos Primeras se distinguen por la rama', () => {
  const c = categoriasConDetalle(PORTAL.categorias, 2027);
  assert.deepEqual(c.map((x) => x.ancla), ['u9', 'u11', 'u13', 'u15', 'u17', 'u21', 'primera-masculino', 'primera-femenino']);
  assert.deepEqual(c.filter((x) => x.nombre === 'Primera').map((x) => x.rotulo), ['Primera Masculino', 'Primera Femenino']);
  assert.equal(c.find((x) => x.ancla === 'u13').rotulo, 'U13');
  assert.equal(c.find((x) => x.ancla === 'u13').anios, '2014 y 2015');
});

test('categoriasConDetalle: el detalle sólo si el club lo pasó (hoy, ninguno); un grupo que no existe se descarta', () => {
  assert.ok(categoriasConDetalle(PORTAL.categorias, 2027).every((x) => x.detalle === null));
  assert.equal(categoriasConDetalle([{ grupo: 'U9', rama: 'Mixto', detalle: '  Traer pelota  ' }], 2027)[0].detalle, 'Traer pelota');
  assert.deepEqual(categoriasConDetalle([{ grupo: 'U10', rama: 'Mixto' }, null], 2027), []);
});

const U13 = { rotulo: 'U13', rama: 'Mixto', anios: '2014 y 2015', horario: 'Lun <18 h> · Mié 18 h', detalle: null, ancla: 'u13' };

test('detalle: sección con ancla, años, cada horario y la sede con mapa; escapado', () => {
  const out = htmlCategoriaDetalle(U13, { nombre: 'Estadio', mapa: 'https://maps.app.goo.gl/abc' }).toString();
  assert.match(out, /^<section class="portal-cat-sec" id="u13" aria-labelledby="t-u13">/);
  assert.match(out, /<div class="portal-st">Mixto<\/div>\s*<h2 id="t-u13">U13<\/h2>/);
  assert.match(out, /<dt>Nacidos<\/dt><dd>2014 y 2015<\/dd>/);
  assert.match(out, /<li>Lun &lt;18 h&gt;<\/li><li>Mié 18 h<\/li>/);
  assert.match(out, /<dt>Dónde<\/dt><dd>Estadio · <a href="https:\/\/maps\.app\.goo\.gl\/abc" target="_blank" rel="noopener">Cómo llegar<\/a><\/dd>/);
  assert.doesNotMatch(out, /portal-cat-detalle/);
});

test('detalle: sin horario, "Horario a confirmar."; sin sede, sin "Dónde"; con detalle del club, se muestra escapado', () => {
  const out = htmlCategoriaDetalle({ ...U13, horario: null, detalle: 'Traer <pelota>' }, null).toString();
  assert.match(out, /<span class="portal-cat-confirmar">Horario a confirmar\.<\/span>/);
  assert.doesNotMatch(out, /Dónde/);
  assert.match(out, /<p class="portal-cat-detalle">Traer &lt;pelota&gt;<\/p>/);
});

test('índice: un link por categoría a su ancla; con menos de dos, nada', () => {
  const out = htmlIndiceCategorias(categoriasConDetalle(PORTAL.categorias, 2027)).toString();
  assert.match(out, /^<a href="#u9">U9<\/a>/);
  assert.match(out, /<a href="#primera-femenino">Primera Femenino<\/a>$/);
  assert.equal(htmlIndiceCategorias([U13]).toString(), '');
});

test('categoría del año: con href, link a su sección; sin href, como antes', () => {
  const out = htmlCategoriaDelAnio(2014, [{ nombre: 'U13', rama: 'Mixto', anios: '2014 y 2015', horario: null, href: '#u13' }]).toString();
  assert.match(out, /<a class="portal-cat-ir" href="#u13">Ver horarios y sede de U13<\/a>/);
  assert.doesNotMatch(htmlCategoriaDelAnio(2014, [{ nombre: 'U13', rama: 'Mixto', anios: 'x', horario: null }]).toString(), /portal-cat-ir/);
});

test('la página: buscador con h1, índice, detalle oculto hasta tener datos, su arranque y su rewrite sin caché', () => {
  assert.match(pagina, /<h1 id="t-categorias">¿En qué categoría juega\?<\/h1>/);
  assert.match(pagina, /<div class="portal-buscador" id="portal-buscador"><\/div>/);
  assert.match(pagina, /<nav class="portal-cat-indice" id="portal-cat-indice" aria-label="Todas las categorías"><\/nav>/);
  assert.match(pagina.match(/<section [^>]*id="detalle"[^>]*>/)[0], /\bhidden\b/);
  assert.match(pagina, /<script type="module" src="\/src\/ui\/categoriasArranque\.js"><\/script>/);
  assert.ok(vercel.rewrites.some((r) => r.source === '/categorias' && r.destination === '/public/categorias.html'));
  for (const ruta of ['/categorias', '/public/categorias.html']) {
    assert.equal(vercel.headers.filter((h) => h.source === ruta).flatMap((h) => h.headers).find((h) => h.key === 'Cache-Control')?.value, 'no-store', ruta);
  }
});
