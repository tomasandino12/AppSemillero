import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

/**
 * Los tests de Node importan módulos sueltos de src/data/. El navegador, en
 * cambio, resuelve el grafo entero de imports de src/ui/ al cargar la página,
 * y si un solo import nombrado no existe en su archivo de origen la app queda
 * en blanco — sin que ningún test se entere.
 *
 * Ya pasó: hoy.js importaba `obtenerMetasDelPlantel` de repositorio.js, la
 * función nunca llegó al archivo, y 139 tests seguían en verde con la
 * pantalla rota. Este test cierra ese agujero: recorre cada import nombrado
 * de src/ y verifica que el archivo de origen lo exporte de verdad.
 *
 * No reemplaza a un navegador —no detecta errores en tiempo de ejecución—
 * pero sí atrapa la clase de error que deja la app sin arrancar.
 */

function archivosJs(dir) {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return archivosJs(ruta);
    return ruta.endsWith('.js') ? [ruta] : [];
  });
}

/**
 * Los nombres que un módulo exporta, en cualquiera de las formas que usa el
 * repo. Si se pasa la ruta del archivo, también sigue `export * from './x.js'`
 * (así funciona la fachada src/data/repositorio.js).
 */
function exportsDe(src, ruta = null) {
  const nombres = new Set();

  // export * from './x.js'  →  todo lo que exporta x.js
  if (ruta) {
    for (const m of src.matchAll(/^export\s*\*\s*from\s*['"](\.[^'"]*)['"]/gm)) {
      const destino = resolve(dirname(ruta), m[1]);
      if (existsSync(destino)) {
        for (const n of exportsDe(readFileSync(destino, 'utf8'), destino)) nombres.add(n);
      }
    }
  }

  // export function x / export async function x / export const x / export class x
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm)) {
    nombres.add(m[1]);
  }
  // export { a, b as c }
  for (const bloque of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const parte of bloque[1].split(',')) {
      const limpio = parte.trim();
      if (!limpio) continue;
      const alias = limpio.split(/\s+as\s+/);
      nombres.add((alias[1] ?? alias[0]).trim());
    }
  }
  return nombres;
}

/** Los imports nombrados desde rutas relativas: [{ desde, nombres }]. */
function importsRelativosDe(src) {
  const encontrados = [];
  // import { a, b as c } from './x.js'   (permite saltos de línea adentro)
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]*)['"]/g)) {
    const nombres = m[1]
      .split(',')
      .map((p) => p.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    encontrados.push({ desde: m[2], nombres });
  }
  return encontrados;
}

test('todo import nombrado de src/ existe como export en su archivo de origen', () => {
  const rotos = [];

  for (const archivo of archivosJs('src')) {
    const src = readFileSync(archivo, 'utf8');
    for (const { desde, nombres } of importsRelativosDe(src)) {
      const destino = resolve(dirname(archivo), desde);
      if (!existsSync(destino)) {
        rotos.push(`${archivo}: importa de '${desde}', que no existe`);
        continue;
      }
      const disponibles = exportsDe(readFileSync(destino, 'utf8'), destino);
      for (const nombre of nombres) {
        if (!disponibles.has(nombre)) {
          rotos.push(`${archivo}: importa '${nombre}' de '${desde}', que no lo exporta`);
        }
      }
    }
  }

  assert.deepEqual(rotos, [], `Imports rotos:\n  ${rotos.join('\n  ')}`);
});

test('el detector reconoce las formas de export que usa el repo', () => {
  // Si esta prueba falla, el test de arriba puede estar pasando por no
  // entender el archivo, no porque esté todo bien.
  const nombres = exportsDe([
    'export function uno() {}',
    'export async function dos() {}',
    'export const tres = 1;',
    'export class Cuatro {}',
    'export { cinco, seis as siete };',
  ].join('\n'));
  assert.deepEqual([...nombres].sort(), ['Cuatro', 'cinco', 'dos', 'siete', 'tres', 'uno']);
});

test('el detector sigue las re-exportaciones de la fachada del repositorio', () => {
  const ruta = resolve('src/data/repositorio.js');
  const nombres = exportsDe(readFileSync(ruta, 'utf8'), ruta);
  // Uno de cada área: si falta alguno, la fachada perdió un `export * from`.
  for (const esperado of ['iniciarSesion', 'obtenerJugadoresDelClub', 'obtenerMaterial', 'moverEscalon']) {
    assert.ok(nombres.has(esperado), `la fachada no re-exporta ${esperado}`);
  }
});

test('el detector encuentra los imports nombrados relativos y saltea los bare', () => {
  const encontrados = importsRelativosDe([
    "import { a, b as c } from './x.js';",
    "import { d } from '../y/z.js';",
    "import { createClient } from '@supabase/supabase-js';",
    "import * as todo from './ns.js';",
  ].join('\n'));
  assert.equal(encontrados.length, 2);
  assert.deepEqual(encontrados[0], { desde: './x.js', nombres: ['a', 'b'] });
  assert.deepEqual(encontrados[1], { desde: '../y/z.js', nombres: ['d'] });
});
