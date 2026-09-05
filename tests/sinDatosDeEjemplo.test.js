import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function archivosJs(dir) {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return archivosJs(ruta);
    return ruta.endsWith('.js') ? [ruta] : [];
  });
}

test('no queda ningún dato de ejemplo en la app', () => {
  const ofensores = archivosJs('src').filter((ruta) => {
    const src = readFileSync(ruta, 'utf8');
    return /datosEjemplo|bannerEjemplo|JUGADORES_EJEMPLO|CARGADOS_EJEMPLO/.test(src);
  });
  assert.deepEqual(ofensores, [], `Estos archivos todavía referencian datos de ejemplo: ${ofensores.join(', ')}`);
});

test('la franja de datos de ejemplo no existe en el CSS', () => {
  const css = readFileSync('public/css/componentes.css', 'utf8');
  assert.equal(/\.banner-ejemplo/.test(css), false);
});
