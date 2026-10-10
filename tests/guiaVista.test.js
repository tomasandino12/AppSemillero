import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveGuia, yaVista, marcarVista } from '../src/ui/guiaVista.js';

function almacenFalso() {
  const mapa = new Map();
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, v),
  };
}

function almacenQueTira() {
  return {
    getItem() { throw new Error('modo privado'); },
    setItem() { throw new Error('modo privado'); },
  };
}

test('sin registro no está vista', () => {
  assert.equal(yaVista(claveGuia('u1', 'entrenar'), 1, almacenFalso()), false);
});

test('misma versión está vista', () => {
  const alm = almacenFalso();
  const clave = claveGuia('u1', 'entrenar');
  assert.equal(marcarVista(clave, 1, alm), true);
  assert.equal(yaVista(clave, 1, alm), true);
});

test('subir la versión la vuelve a mostrar', () => {
  const alm = almacenFalso();
  const clave = claveGuia('u1', 'entrenar');
  marcarVista(clave, 1, alm);
  assert.equal(yaVista(clave, 2, alm), false);
});

test('JSON roto no está vista', () => {
  const alm = almacenFalso();
  const clave = claveGuia('u1', 'entrenar');
  alm.setItem(clave, '{roto');
  assert.equal(yaVista(clave, 1, alm), false);
  alm.setItem(clave, JSON.stringify({ version: '1' }));
  assert.equal(yaVista(clave, 1, alm), false);
});

test('almacén que tira no rompe', () => {
  const clave = claveGuia('u1', 'entrenar');
  assert.equal(yaVista(clave, 1, almacenQueTira()), false);
  assert.equal(marcarVista(clave, 1, almacenQueTira()), false);
  assert.equal(yaVista(clave, 1, null), false);
  assert.equal(marcarVista(clave, 1, null), false);
});

test('cada usuario tiene su clave', () => {
  const alm = almacenFalso();
  marcarVista(claveGuia('u1', 'entrenar'), 1, alm);
  assert.equal(yaVista(claveGuia('u2', 'entrenar'), 1, alm), false);
  assert.notEqual(claveGuia('u1', 'entrenar'), claveGuia('u1', 'coordinar'));
  assert.match(claveGuia(null, 'jugar'), /sin-cuenta/);
});
