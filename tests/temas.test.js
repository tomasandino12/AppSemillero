import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMAS, nombreDeTema, esTemaValido } from '../src/data/temas.js';

test('hay una lista corta de temas, cada uno con id y nombre', () => {
  assert.ok(TEMAS.length >= 5 && TEMAS.length <= 12, 'la lista tiene que ser corta');
  for (const t of TEMAS) {
    assert.equal(typeof t.id, 'string');
    assert.equal(typeof t.nombre, 'string');
    assert.ok(t.id.length && t.nombre.length);
  }
});

test('los ids de tema no se repiten', () => {
  assert.equal(new Set(TEMAS.map((t) => t.id)).size, TEMAS.length);
});

test('esTemaValido acepta lo que está en la lista y rechaza el resto', () => {
  assert.equal(esTemaValido(TEMAS[0].id), true);
  assert.equal(esTemaValido('no_existe'), false);
  assert.equal(esTemaValido(''), false);
  assert.equal(esTemaValido(null), false);
  assert.equal(esTemaValido(undefined), false);
});

test('nombreDeTema devuelve el nombre, y el id crudo si no lo conoce', () => {
  assert.equal(nombreDeTema(TEMAS[0].id), TEMAS[0].nombre);
  // Un tema viejo guardado en la base cuando la lista era otra no puede
  // desaparecer de la pantalla: se muestra su id antes que nada.
  assert.equal(nombreDeTema('tema_viejo'), 'tema_viejo');
  assert.equal(nombreDeTema(null), '');
});
