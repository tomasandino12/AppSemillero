import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlBarraAcciones, htmlSedePie } from '../src/ui/portalMarco.js';
import { PAGINAS_PORTAL, paginaDeAncla, paginaActual } from '../src/data/portal.js';

/**
 * Lo común a las cinco páginas del portal: la barra con las dos acciones que
 * más usan las familias, el pie y la navegación. Las acciones se tienen que
 * ver sin scrollear: en el celular la barra va fija abajo (portal.css).
 */

const marco = readFileSync('src/ui/portalMarco.js', 'utf8');
const A = (tipo, url, comprobante = null) => ({ primera: { tipo, url }, comprobante: { url: comprobante } });

test('barra: inscripción abierta → "Inscribir a mi hijo o hija" y "Enviar comprobante", a sus formularios', () => {
  const out = htmlBarraAcciones(A('inscribir', 'https://forms.gle/Ins1', 'https://forms.gle/Com1')).toString();
  assert.match(out, /^<a class="portal-acc-btn principal" href="https:\/\/forms\.gle\/Ins1" target="_blank" rel="noopener">Inscribir a mi hijo o hija<\/a>/);
  assert.match(out, /<a class="portal-acc-btn pago" href="https:\/\/forms\.gle\/Com1" target="_blank" rel="noopener">Enviar comprobante<\/a>$/);
});

test('barra: inscripción cerrada → "Quiero jugar en Newell\'s"; el comprobante sin formulario, apagado con "Pronto"', () => {
  const out = htmlBarraAcciones(A('jugar', 'https://forms.gle/Jug1')).toString();
  assert.match(out, /<a class="portal-acc-btn principal" href="https:\/\/forms\.gle\/Jug1"[^>]*>Quiero jugar en Newell&#39;s<\/a>/);
  assert.match(out, /<span class="portal-acc-btn apagada" aria-disabled="true">Enviar comprobante<small>Pronto<\/small><\/span>/);
});

test('barra: sin ningún formulario abierto, no hay barra', () => {
  assert.equal(htmlBarraAcciones(A('jugar', null)).toString(), '');
});

test('pie: la sede con "Cómo llegar"; un mapa que no es de Google, sin link; sin sede, nada', () => {
  const out = htmlSedePie({ nombre: 'Estadio <Cubierto>', direccion: 'Parque', mapa: 'https://maps.app.goo.gl/abc' }).toString();
  assert.match(out, /<b>Estadio &lt;Cubierto&gt;<\/b>/);
  assert.match(out, /<a href="https:\/\/maps\.app\.goo\.gl\/abc" target="_blank" rel="noopener">Cómo llegar<\/a>/);
  assert.doesNotMatch(htmlSedePie({ nombre: 'X', mapa: 'https://evil.com/maps' }).toString(), /<a /);
  assert.equal(htmlSedePie(null).toString(), '');
});

test('paginaDeAncla: los links viejos de la página única llevan a su página; nada más', () => {
  assert.equal(paginaDeAncla('#ayuda'), '/ayuda');
  assert.equal(paginaDeAncla('#categorias'), '/categorias');
  assert.equal(paginaDeAncla('#calendario'), '/calendario');
  for (const otro of ['', '#', '#colaborar', '#access_token=abc&type=recovery', '#constructor', '#__proto__', undefined, null]) {
    assert.equal(paginaDeAncla(otro), null, String(otro));
  }
});

test('paginaActual: la ruta limpia o el .html de cada página; lo demás, null', () => {
  assert.equal(paginaActual('/'), '/');
  assert.equal(paginaActual('/public/portal.html'), '/');
  assert.equal(paginaActual('/ayuda'), '/ayuda');
  assert.equal(paginaActual('/ayuda/'), '/ayuda');
  assert.equal(paginaActual('/public/noticias.html'), '/noticias');
  assert.equal(paginaActual('/app'), null);
  assert.deepEqual(PAGINAS_PORTAL.map((p) => p.href), ['/', '/noticias', '/categorias', '/calendario', '/ayuda']);
});

test('el marco no lee la base si la URL es la vuelta de un login, y sólo pide datos por el repositorio', () => {
  const guarda = marco.indexOf('destinoDeAuth(window.location.search, window.location.hash)');
  assert.ok(guarda > 0 && guarda < marco.indexOf('resolverFormularios('), 'la guarda va antes de leer la base');
  const imports = [...marco.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(imports.filter((i) => /repos\/|cliente|supabase/.test(i)), []);
  assert.doesNotMatch(marco, /\bfetch\s*\(/);
});

test('la barra del inicio se esconde sólo con el hero entero a la vista (letra agrandada: las tarjetas no entran)', () => {
  assert.match(marco, /threshold: 1/);
  assert.match(marco, /intersectionRatio >= 1/);
});
