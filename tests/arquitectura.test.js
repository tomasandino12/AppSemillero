import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Las reglas de dependencias del proyecto, hechas test. Si una falla, el
 * mensaje dice qué archivo la rompe y por qué existe la regla: no se resuelve
 * silenciando el test sino moviendo el código a donde corresponde.
 *
 *   src/data/*.js        lógica pura: sin red, sin DOM, sin pantallas
 *   src/data/repos/*.js  único lugar que habla con Supabase
 *   src/data/repositorio.js  fachada: sólo re-exporta
 *   src/ui/**            pantallas: piden datos por repositorio.js, nunca a Supabase
 */

const jsDe = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? jsDe(p) : p.endsWith('.js') ? [p] : [];
});
const leer = (p) => readFileSync(p, 'utf8');
const rel = (p) => relative('.', p).replaceAll('\\', '/');
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const importsDe = (t) => [...t.matchAll(/(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

const PURO = jsDe('src/data').filter((p) => {
  const r = rel(p);
  return !r.startsWith('src/data/repos/') && r !== 'src/data/cliente.js' && r !== 'src/data/repositorio.js';
});
const REPOS = jsDe('src/data/repos');
const UI = jsDe('src/ui');

test('la lógica pura de src/data no toca red, DOM ni pantallas', () => {
  const rotos = [];
  for (const p of PURO) {
    const codigo = sinComentarios(leer(p));
    for (const destino of importsDe(codigo)) {
      if (/ui\/|repositorio|repos\/|cliente|supabase/.test(destino)) {
        rotos.push(`${rel(p)} importa '${destino}'`);
      }
    }
    if (/\b(document|window|localStorage|sessionStorage|fetch)\b\s*[.(]/.test(codigo)) {
      rotos.push(`${rel(p)} usa DOM o red`);
    }
  }
  assert.deepEqual(rotos, [], `Rompen "src/data es lógica pura, se prueba sin red":\n  ${rotos.join('\n  ')}`);
});

test('los repos sólo dependen del cliente, de lógica pura y de otros repos', () => {
  const rotos = [];
  for (const p of REPOS) {
    for (const destino of importsDe(sinComentarios(leer(p)))) {
      const permitido = destino === '../cliente.js' || /^\.\.\/[a-zA-Z]+\.js$/.test(destino) || /^\.\/[a-z]+\.js$/.test(destino);
      if (!permitido || /ui\//.test(destino) || destino === '../repositorio.js') {
        rotos.push(`${rel(p)} importa '${destino}'`);
      }
    }
  }
  assert.deepEqual(rotos, [], `Un repo no importa pantallas ni la fachada:\n  ${rotos.join('\n  ')}`);
});

test('repositorio.js es sólo la fachada y re-exporta todos los repos', () => {
  const lineas = sinComentarios(leer('src/data/repositorio.js')).split('\n').map((l) => l.trim()).filter(Boolean);
  const raras = lineas.filter((l) => !/^export \* from '\.\/repos\/[a-zA-Z]+\.js';$/.test(l));
  assert.deepEqual(raras, [], 'repositorio.js sólo puede tener líneas `export * from ./repos/x.js`; el código va en el repo de su área');
  const reexportados = lineas.map((l) => l.match(/repos\/([a-zA-Z]+)\.js/)[1]).sort();
  const existentes = REPOS.map((p) => p.replace(/^.*[\\/]/, '').replace('.js', '')).sort();
  assert.deepEqual(reexportados, existentes, 'hay repos que la fachada no re-exporta (o al revés)');
});

test('las pantallas piden los datos por repositorio.js: nunca hablan con Supabase', () => {
  const rotos = [];
  for (const p of UI) {
    const codigo = sinComentarios(leer(p));
    for (const destino of importsDe(codigo)) {
      if (/supabase|data\/cliente|data\/repos\//.test(destino)) rotos.push(`${rel(p)} importa '${destino}'`);
    }
    if (/\.(from|rpc)\(\s*'[a-z_]+'/.test(codigo)) rotos.push(`${rel(p)} consulta una tabla o función directo`);
  }
  assert.deepEqual(rotos, [], `La UI no accede a Supabase (eso es del repo del área):\n  ${rotos.join('\n  ')}`);
});

test('los helpers compartidos de la UI viven en un solo lugar', () => {
  const definenDolar = UI.filter((p) => /^(export )?const \$ *=/m.test(leer(p))).map(rel);
  assert.deepEqual(definenDolar, ['src/ui/dom.js'], '`$` se importa de ui/dom.js, no se redefine en cada pantalla');

  const conTextoDeRed = UI.filter((p) => leer(p).includes('Revisá tu wifi/datos e intentá de nuevo')).map(rel);
  assert.deepEqual(conTextoDeRed, ['src/ui/errores.js'], 'el texto de "sin conexión" es SIN_CONEXION de ui/errores.js');
});
