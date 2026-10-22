import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * /calendario: la grilla del mes, "Lo que viene" y suscribirse, movidos del
 * inicio sin cambiar cómo andan (los armadores ya los cubre portalPagina).
 * Acá se ata la página y que la caché de eventos se comparte.
 */
const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const pagina = leer('public/calendario.html');
const portal = leer('src/ui/portal.js');
const vercel = JSON.parse(leer('vercel.json'));
const cuerpoDe = (nombre) => {
  const desde = portal.indexOf(`export async function ${nombre}(`);
  assert.ok(desde >= 0, `falta ${nombre}`);
  return portal.slice(desde, portal.indexOf('\n}\n', desde));
};

test('la página: sección con h1, "Lo que viene" y la grilla, oculta hasta saber si hay calendario; su arranque', () => {
  const seccion = pagina.match(/<section [^>]*id="calendario"[\s\S]*?<\/section>/)[0];
  assert.match(seccion.split('>')[0], /\bhidden\b/);
  assert.match(seccion, /<h1 id="t-calendario">Calendario<\/h1>/);
  assert.match(seccion, /<div id="portal-proximo"><\/div>\s*<div id="portal-calendario"><\/div>/);
  assert.match(pagina, /<script type="module" src="\/src\/ui\/calendarioArranque\.js"><\/script>/);
});

test('la página arma una sola agenda y la comparten la grilla, "Lo que viene" y el botón iPhone', () => {
  const cuerpo = cuerpoDe('iniciarPaginaCalendario');
  assert.equal((cuerpo.match(/crearAgenda\(/g) ?? []).length, 1);
  assert.match(cuerpo, /cablearIcs\(\$\('calendario'\), agenda\)/);
  assert.match(cuerpo, /iniciarCalendario\(agenda\)/);
  assert.match(cuerpo, /mostrarProximo\(agenda\)/);
});

test('vercel.json: /calendario sirve su página y no se guarda en caché', () => {
  assert.ok(vercel.rewrites.some((r) => r.source === '/calendario' && r.destination === '/public/calendario.html'));
  for (const ruta of ['/calendario', '/public/calendario.html']) {
    assert.equal(vercel.headers.filter((h) => h.source === ruta).flatMap((h) => h.headers).find((h) => h.key === 'Cache-Control')?.value, 'no-store', ruta);
  }
});
