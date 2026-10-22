import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  htmlTarjetaNoticia, htmlListaNoticias, htmlDetalleNoticia, htmlNoticiaNoEsta, htmlSinNoticias,
} from '../src/ui/portalNoticias.js';

/**
 * Lo que escribe la coordinación en una noticia lo ve cualquiera: todo sale
 * escapado, las fotos sólo del bucket de noticias del proyecto, y un ?n= que
 * no es un uuid no llega a la base. Sin noticias (o sin 0064 en la base), la
 * sección del inicio queda oculta y el resto anda.
 */
const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const modulo = leer('src/ui/portalNoticias.js');
const pagina = leer('public/noticias.html');
const BASE = 'https://x.supabase.co';
const ID = '22222222-2222-4222-8222-222222222222';
const FOTO = `${BASE}/storage/v1/object/public/noticias/c/n/f.webp`;
const R = { id: ID, titulo: 'Ganó la <U13>', resumen: 'Resumen "con" comillas', etiqueta: 'partidos', foto: { url: FOTO, alt: 'La <cancha>' }, fecha: '2026-10-21' };

test('tarjeta: link a su noticia, foto con su alt, etiqueta, título, resumen, fecha y "Leer"; todo escapado', () => {
  const out = htmlTarjetaNoticia(R, BASE).toString();
  assert.match(out, /^<article class="portal-not"><a href="\/noticias\?n=22222222-2222-4222-8222-222222222222">/);
  assert.match(out, /<img src="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/noticias\/c\/n\/f\.webp" alt="La &lt;cancha&gt;" loading="lazy">/);
  assert.match(out, /<span class="portal-not-et">Partidos<\/span>/);
  assert.match(out, /<h3>Ganó la &lt;U13&gt;<\/h3>/);
  assert.match(out, /<p>Resumen &quot;con&quot; comillas<\/p>/);
  assert.match(out, /<time datetime="2026-10-21">mié, 21 oct<\/time>/);
  assert.match(out, /Leer →/);
});

test('tarjeta: una foto que no es del bucket del proyecto no se muestra; sin foto, sin <img>', () => {
  assert.doesNotMatch(htmlTarjetaNoticia({ ...R, foto: { url: 'https://evil.com/x.webp', alt: 'x' } }, BASE).toString(), /<img/);
  assert.doesNotMatch(htmlTarjetaNoticia({ ...R, foto: null }, BASE).toString(), /<img/);
});

test('lista: sin noticias, nada (la sección queda oculta); una con id que no es uuid, afuera', () => {
  assert.equal(htmlListaNoticias([], BASE).toString(), '');
  const out = htmlListaNoticias([R, { ...R, id: 'abc' }], BASE).toString();
  assert.match(out, /^<div class="portal-nots">/);
  assert.equal((out.match(/<article /g) ?? []).length, 1);
});

const N = { titulo: '<script>alert(1)</script>', resumen: 'La bajada', cuerpo: `Primer párrafo\nsigue\n\nSegundo con ${'x'.repeat(300)}\n\n<b>tercero</b>`, etiqueta: 'club', fecha: '2026-10-21', fotos: [{ url: FOTO, alt: 'La cancha' }, { url: 'https://evil.com/y.webp', alt: 'mala' }] };

test('detalle: escapa todo, la fecha larga, las fotos válidas con su alt y el cuerpo en párrafos', () => {
  const out = htmlDetalleNoticia(N, BASE).toString();
  assert.match(out, /<a class="portal-art-volver" href="\/noticias">← Todas las noticias<\/a>/);
  assert.match(out, /<h1>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/h1>/);
  assert.doesNotMatch(out, /<script>|<b>/);
  assert.match(out, /<time datetime="2026-10-21">Miércoles 21 de octubre<\/time>/);
  assert.match(out, /<p class="portal-art-bajada">La bajada<\/p>/);
  assert.equal((out.match(/<figure><img /g) ?? []).length, 1, 'la foto de otro sitio no va');
  assert.match(out, /alt="La cancha"/);
  const parrafos = out.match(/<div class="portal-art-cuerpo">([\s\S]*?)<\/div>/)[1];
  assert.equal((parrafos.match(/<p>/g) ?? []).length, 3);
  assert.match(parrafos, /<p>Primer párrafo\nsigue<\/p>/);
  assert.match(parrafos, /<p>&lt;b&gt;tercero&lt;\/b&gt;<\/p>/);
});

test('detalle en la vista previa del panel: fotos blob: recién elegidas y sin "volver"', () => {
  const out = htmlDetalleNoticia({ ...N, fotos: [{ url: 'blob:http://localhost:5174/abc', alt: 'Nueva' }] }, BASE, { previa: true }).toString();
  assert.match(out, /<img src="blob:http:\/\/localhost:5174\/abc" alt="Nueva"/);
  assert.doesNotMatch(out, /portal-art-volver/);
  assert.doesNotMatch(htmlDetalleNoticia({ ...N, fotos: [{ url: 'blob:http://x/abc', alt: 'x' }] }, BASE).toString(), /blob:/, 'fuera de la vista previa, blob: no');
});

test('una noticia que no está: lo dice y vuelve a la lista; sin noticias: lo dice', () => {
  const out = htmlNoticiaNoEsta().toString();
  assert.match(out, /<h1>Esta noticia ya no está<\/h1>/);
  assert.match(out, /<a class="btn" href="\/noticias">Ver todas las noticias<\/a>/);
  assert.match(htmlSinNoticias().toString(), /Todavía no hay noticias publicadas\./);
});

test('un ?n= que no es un uuid no consulta la base', () => {
  const desde = modulo.indexOf('async function mostrarDetalle(');
  const cuerpo = modulo.slice(desde, modulo.indexOf('\n}\n', desde));
  assert.ok(cuerpo.indexOf('esIdNoticia(id)') > 0 && cuerpo.indexOf('esIdNoticia(id)') < cuerpo.indexOf('noticiaPublica('));
});

test('en el inicio, si la base falla (o no tiene 0064), la sección queda oculta y no se rompe nada', () => {
  const desde = modulo.indexOf('export async function iniciarUltimasNoticias(');
  const cuerpo = modulo.slice(desde, modulo.indexOf('\n}\n', desde));
  assert.match(cuerpo, /try \{[\s\S]*noticiasPublicas\(PORTAL\.clubId, \{ limite: 4 \}\)[\s\S]*\$\('noticias'\)\.hidden = !contenido;[\s\S]*\} catch \{/);
  const portal = leer('src/ui/portal.js');
  const inicio = portal.slice(portal.indexOf('export async function iniciarPortal('));
  assert.ok(inicio.indexOf('iniciarUltimasNoticias()') > inicio.indexOf('destinoDeAuth('), 'después de la guarda de login');
});

test('la página: la sección de papel con su h1, la lista, "Ver más" oculto y su arranque', () => {
  assert.match(pagina, /<h1 id="t-noticias">Lo último del básquet<\/h1>/);
  assert.match(pagina, /<div id="portal-noticias" aria-live="polite">/);
  assert.match(pagina, /<div class="portal-mas" id="noticias-mas" hidden><button type="button" class="btn sec" id="btn-noticias-mas">Ver más noticias<\/button><\/div>/);
  assert.match(pagina, /<script type="module" src="\/src\/ui\/noticiasArranque\.js"><\/script>/);
});

test('las tarjetas y las noticias no anulan el corte de palabras largas del body', () => {
  const reglas = leer('public/css/portal.css').split('\n').filter((l) => /\.portal-(not|art)/.test(l));
  for (const r of reglas) assert.doesNotMatch(r, /white-space\s*:\s*nowrap|overflow-wrap\s*:\s*normal|word-break\s*:\s*keep-all/, r);
});
