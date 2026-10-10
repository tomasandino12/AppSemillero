import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIAS, PISTAS, pasosDeGuia, estadoDePaso, guiaParaAbrir } from '../src/data/guias.js';

// chrome.js importa el DOM y no se carga en node: los ids de cada pestaña se
// leen del texto de cada lista.
const chrome = readFileSync(new URL('../src/ui/chrome.js', import.meta.url), 'utf8');
function idsDe(lista) {
  const bloque = chrome.match(new RegExp(`export const ${lista} = \\[([\\s\\S]*?)\\];`))[1];
  return [...bloque.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
}
const PESTANAS = {
  entrenar: idsDe('TABS'),
  coordinar: idsDe('TABS_COORDINACION'),
  jugar: idsDe('TABS_JUGADOR'),
};

test('cada guía tiene entre 1 y 3 pasos', () => {
  for (const [id, guia] of Object.entries(GUIAS)) {
    assert.ok(guia.pasos.length >= 1 && guia.pasos.length <= 3, id);
    assert.ok(Number.isInteger(guia.version) && guia.version >= 1, id);
  }
});

test('hay una guía por cada modo de la app', () => {
  assert.deepEqual(Object.keys(GUIAS).sort(), Object.keys(PESTANAS).sort());
});

test('cada paso apunta a una pestaña de su modo', () => {
  for (const [id, guia] of Object.entries(GUIAS)) {
    for (const paso of guia.pasos) {
      assert.ok(PESTANAS[id].includes(paso.pestana), `${id}: ${paso.pestana}`);
      assert.ok(paso.titulo && paso.texto, `${id}: ${paso.pestana}`);
    }
  }
});

test('la línea de cambio de modo sólo aparece si coordina', () => {
  const solo = pasosDeGuia('entrenar', { esEntrenador: true });
  const ambos = pasosDeGuia('entrenar', { esEntrenador: true, esCoordinador: true });
  assert.doesNotMatch(solo.at(-1).texto, /pasás a coordinar/);
  assert.match(ambos.at(-1).texto, /pasás a coordinar/);
  // No muta la guía: la próxima llamada sin coordinar vuelve a salir limpia.
  assert.doesNotMatch(pasosDeGuia('entrenar', {}).at(-1).texto, /pasás a coordinar/);
  assert.doesNotMatch(pasosDeGuia('coordinar', { esCoordinador: true }).at(-1).texto, /pasás a coordinar/);
});

test('una guía desconocida no tiene pasos', () => {
  assert.deepEqual(pasosDeGuia('otra'), []);
});

test('el último paso dice Empezar y el primero no tiene Anterior', () => {
  assert.deepEqual(estadoDePaso(0, 3), { contador: '1 de 3', hayAnterior: false, textoSiguiente: 'Siguiente' });
  assert.deepEqual(estadoDePaso(1, 3), { contador: '2 de 3', hayAnterior: true, textoSiguiente: 'Siguiente' });
  assert.deepEqual(estadoDePaso(2, 3), { contador: '3 de 3', hayAnterior: true, textoSiguiente: 'Empezar' });
  assert.equal(estadoDePaso(0, 1).textoSiguiente, 'Empezar');
});

test('cada pista tiene texto y no pasa de 160 caracteres', () => {
  for (const [id, texto] of Object.entries(PISTAS)) {
    assert.ok(texto.length > 0 && texto.length <= 160, id);
  }
});

test('el modo jugar abre la guía del jugador', () => {
  assert.equal(guiaParaAbrir({ modo: 'jugar', hojaAbierta: false, vista: false }), 'jugar');
  assert.equal(guiaParaAbrir({ modo: 'coordinar', hojaAbierta: false, vista: false }), 'coordinar');
  assert.equal(guiaParaAbrir({ modo: 'otro', hojaAbierta: false, vista: false }), null);
});

test('no se abre sobre otra hoja', () => {
  assert.equal(guiaParaAbrir({ modo: 'entrenar', hojaAbierta: true, vista: false }), null);
});

test('ya vista no se abre', () => {
  assert.equal(guiaParaAbrir({ modo: 'entrenar', hojaAbierta: false, vista: true }), null);
});
