import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = (rel) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('confirmacionImport nunca appendea botonVolver() con beforeend', () => {
  const lineas = fuente('src/ui/pantallas/confirmacionImport.js').split('\n');
  const ofensivas = lineas.filter((l) => l.includes('botonVolver()') && l.includes("insertAdjacentHTML('beforeend'"));
  assert.deepStrictEqual(
    ofensivas,
    [],
    'appendear botonVolver() con beforeend apila un segundo .pie-fijo sobre el existente: es el bug de footers superpuestos de la Etapa 2B',
  );
});

test('avanzarAJugadores limpia los restos del intento anterior antes de reinsertar', () => {
  const src = fuente('src/ui/pantallas/confirmacionImport.js');
  assert.match(src, /getElementById\('cargando-jugadores'\)\?\.remove\(\)/);
  assert.match(src, /getElementById\('btn-volver-inicio'\)\?\.remove\(\)/);
});

test('el router no conoce ni toca el botón de volver del contenido', () => {
  const src = fuente('src/ui/main.js');
  assert.ok(
    !src.includes('btn-volver-inicio'),
    'un solo dueño por afordancia: la vuelta del chrome es del router, la del contenido es de la pantalla',
  );
});
