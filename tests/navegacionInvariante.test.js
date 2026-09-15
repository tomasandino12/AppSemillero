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
  const idxRemoveCargando = src.indexOf("getElementById('cargando-jugadores')?.remove()");
  const idxRemoveBoton = src.indexOf("getElementById('btn-volver-inicio')?.remove()");
  const idxReinsercion = src.indexOf("insertAdjacentHTML('beforeend'");
  assert.notStrictEqual(idxRemoveCargando, -1, 'falta el remove() de #cargando-jugadores al tope de avanzarAJugadores');
  assert.notStrictEqual(idxRemoveBoton, -1, 'falta el remove() de #btn-volver-inicio al tope de avanzarAJugadores');
  assert.notStrictEqual(idxReinsercion, -1, 'falta la reinserción de #cargando-jugadores vía insertAdjacentHTML(\'beforeend\', ...)');
  assert.ok(
    idxRemoveCargando < idxReinsercion,
    'el remove() de #cargando-jugadores debe ejecutarse ANTES de la reinserción: si se mueve después (o a otra función), un segundo intento fallido deja dos nodos #cargando-jugadores y el mensaje de error se escribe en el que quedó muerto e invisible',
  );
  assert.ok(
    idxRemoveBoton < idxReinsercion,
    'el remove() de #btn-volver-inicio debe ejecutarse ANTES de la reinserción: es exactamente el bug de footers superpuestos de la Etapa 2B — si se mueve después de reinsertar, dos intentos fallidos seguidos apilan dos botones "Volver" con el mismo id y el que queda visible es el muerto',
  );
});

test('el router no conoce ni toca el botón de volver del contenido', () => {
  const src = fuente('src/ui/main.js');
  assert.ok(
    !src.includes('btn-volver-inicio'),
    'un solo dueño por afordancia: la vuelta del chrome es del router, la del contenido es de la pantalla',
  );
});

test('DATOS no tiene ningún rastro del plan físico: vive en la pestaña FÍSICO', () => {
  const src = fuente('src/ui/pantallas/datos.js');
  assert.doesNotMatch(src, /plan.?f[ií]sico|planFisico|plan-fisico/i);
});

test('FÍSICO va entre MEDIR y RECURSOS, con un ícono que no repite el de otra pestaña', async () => {
  const { TABS } = await import('../src/ui/chrome.js');
  const ids = TABS.map((t) => t.id);
  assert.ok(ids.includes('p-fisico'), 'falta la pestaña FÍSICO');
  assert.equal(ids.indexOf('p-fisico'), ids.indexOf('p-medir') + 1);
  assert.equal(ids.indexOf('p-recursos'), ids.indexOf('p-fisico') + 1);
  const iconos = TABS.map((t) => t.icono);
  assert.equal(new Set(iconos).size, iconos.length);
});

test('el plan físico vuelve por su propio retorno; el import de partido sigue con el suyo', () => {
  const plan = fuente('src/ui/pantallas/planFisico.js');
  assert.match(plan, /from '\.\/retornoPlanFisico\.js'/);
  assert.doesNotMatch(plan, /retornoImport\.js/);
  for (const archivo of ['confirmacionImport.js', 'resultadoImport.js']) {
    assert.match(fuente(`src/ui/pantallas/${archivo}`), /from '\.\/retornoImport\.js'/);
  }
});
