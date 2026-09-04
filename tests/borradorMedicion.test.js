import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveBorrador, guardarBorrador, leerBorrador, borrarBorrador } from '../src/ui/borradorMedicion.js';

function almacenFalso() {
  const mapa = new Map();
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, v),
    removeItem: (k) => mapa.delete(k),
  };
}

function almacenQueTira() {
  return {
    getItem() { throw new Error('modo privado'); },
    setItem() { throw new Error('modo privado'); },
    removeItem() { throw new Error('modo privado'); },
  };
}

test('la clave separa club, plantel y tipo', () => {
  const a = claveBorrador('c1', 'pl1', 'tiro');
  const b = claveBorrador('c1', 'pl2', 'tiro');
  const c = claveBorrador('c1', 'pl1', 'velocidad');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test('lo que se guarda se lee igual', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('c1', 'pl1', 'tiro');
  const estado = { version: 1, fecha: '2026-03-05', valores: { j1: { esq_izq: 7 } } };
  assert.equal(guardarBorrador(clave, estado, alm), true);
  assert.deepEqual(leerBorrador(clave, alm), estado);
});

test('sin borrador guardado devuelve null', () => {
  assert.equal(leerBorrador(claveBorrador('c1', 'pl1', 'tiro'), almacenFalso()), null);
});

test('borrar deja el slot vacío', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('c1', 'pl1', 'tiro');
  guardarBorrador(clave, { version: 1, valores: {} }, alm);
  borrarBorrador(clave, alm);
  assert.equal(leerBorrador(clave, alm), null);
});

test('un borrador de otra versión se descarta en vez de romper', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('c1', 'pl1', 'tiro');
  alm.setItem(clave, JSON.stringify({ version: 99, valores: {} }));
  assert.equal(leerBorrador(clave, alm), null);
});

test('un borrador corrupto se descarta en vez de romper', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('c1', 'pl1', 'tiro');
  alm.setItem(clave, 'esto no es json');
  assert.equal(leerBorrador(clave, alm), null);
});

test('si el almacén tira, nada explota', () => {
  const alm = almacenQueTira();
  const clave = claveBorrador('c1', 'pl1', 'tiro');
  assert.equal(guardarBorrador(clave, { version: 1 }, alm), false);
  assert.equal(leerBorrador(clave, alm), null);
  assert.doesNotThrow(() => borrarBorrador(clave, alm));
});
