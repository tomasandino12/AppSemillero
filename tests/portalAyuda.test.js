import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlContacto } from '../src/ui/portal.js';
import { PORTAL } from '../src/data/portal.js';

/**
 * /ayuda: las preguntas frecuentes (antes, una hoja encima del inicio) y la
 * sede con el alias. El WhatsApp del coordinador aparece una sola vez en todo
 * el portal: al final de las preguntas.
 */
const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const ayuda = leer('public/ayuda.html');
const seccion = (html, id) => html.match(new RegExp(`<section [^>]*id="${id}"[\\s\\S]*?</section>`))?.[0] ?? '';
const vercel = JSON.parse(leer('vercel.json'));

test('htmlContacto: la sede con "Cómo llegar" y el alias con Copiar; escapado; sin datos, nada', () => {
  const out = htmlContacto({ sede: { nombre: 'Estadio <Cubierto>', direccion: 'Parque', mapa: 'https://maps.app.goo.gl/abc' }, alias: { alias: 'NOB.BASQUET' } }).toString();
  assert.match(out, /<div class="portal-contacto-sede">[\s\S]*<b>Estadio &lt;Cubierto&gt;<\/b>[\s\S]*<p>Parque<\/p>/);
  assert.match(out, /href="https:\/\/maps\.app\.goo\.gl\/abc"[^>]*>Cómo llegar/);
  assert.match(out, /data-copiar="NOB\.BASQUET"/);
  assert.equal(htmlContacto({}).toString(), '');
  assert.equal(htmlContacto({ sede: { nombre: ' ' }, alias: { alias: 'mal alias' } }).toString(), '');
});

test('la página: h1 de preguntas frecuentes, la lista, el contacto oculto hasta tener datos y su arranque', () => {
  assert.match(ayuda, /<h1 id="t-ayuda">Preguntas frecuentes<\/h1>/);
  assert.match(ayuda, /<div class="portal-faqs" id="portal-ayuda-lista"><\/div>/);
  assert.match(seccion(ayuda, 'contacto').split('>')[0], /\bhidden\b/);
  assert.match(ayuda, /<script type="module" src="\/src\/ui\/ayudaArranque\.js"><\/script>/);
  assert.doesNotMatch(ayuda, /portalEntrada/, 'el reenvío de los links de login es sólo de "/"');
});

test('el coordinador aparece una sola vez en el portal: al final de las preguntas frecuentes', () => {
  for (const archivo of ['public/portal.html', 'public/ayuda.html']) {
    assert.doesNotMatch(leer(archivo).replace(/<!--[\s\S]*?-->/g, ''), /wa\.me|coordinador/i, archivo);
  }
  assert.doesNotMatch(leer('src/ui/portalMarco.js'), /enlaceContacto|PORTAL\.contacto/);
  assert.equal((leer('src/ui/portal.js').match(/enlaceContacto\(/g) ?? []).length, 1, 'sólo htmlAyuda arma el enlace');
  assert.doesNotMatch(htmlContacto({ sede: PORTAL.sede, alias: PORTAL.alias }).toString(), /wa\.me/);
});

test('vercel.json: /ayuda sirve su página y no se guarda en caché', () => {
  assert.ok(vercel.rewrites.some((r) => r.source === '/ayuda' && r.destination === '/public/ayuda.html'));
  for (const ruta of ['/ayuda', '/public/ayuda.html']) {
    const cache = vercel.headers.filter((h) => h.source === ruta).flatMap((h) => h.headers).find((h) => h.key === 'Cache-Control')?.value;
    assert.equal(cache, 'no-store', ruta);
  }
});
