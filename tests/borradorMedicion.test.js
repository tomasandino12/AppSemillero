import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claveBorrador, guardarBorrador, leerBorrador, borrarBorrador, descartarBorradoresAnteriores,
} from '../src/ui/borradorMedicion.js';

function almacenFalso() {
  const mapa = new Map();
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, v),
    removeItem: (k) => mapa.delete(k),
    key: (i) => [...mapa.keys()][i] ?? null,
    get length() { return mapa.size; },
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
  const a = claveBorrador('u1', 'c1', 'pl1', 'tiro');
  const b = claveBorrador('u1', 'c1', 'pl2', 'tiro');
  const c = claveBorrador('u1', 'c1', 'pl1', 'velocidad');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test('lo que se guarda se lee igual', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('u1', 'c1', 'pl1', 'tiro');
  const estado = { version: 1, fecha: '2026-03-05', valores: { j1: { esq_izq: 7 } } };
  assert.equal(guardarBorrador(clave, estado, alm), true);
  assert.deepEqual(leerBorrador(clave, alm), estado);
});

test('el sesionId sobrevive a guardar y leer el borrador', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('u1', 'c1', 'pl1', 'tiro');
  guardarBorrador(clave, { version: 1, fecha: '2026-03-05', valores: {}, sesionId: 'sesion-1' }, alm);
  assert.equal(leerBorrador(clave, alm).sesionId, 'sesion-1');
});

test('sin borrador guardado devuelve null', () => {
  assert.equal(leerBorrador(claveBorrador('u1', 'c1', 'pl1', 'tiro'), almacenFalso()), null);
});

test('borrar deja el slot vacío', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('u1', 'c1', 'pl1', 'tiro');
  guardarBorrador(clave, { version: 1, valores: {} }, alm);
  borrarBorrador(clave, alm);
  assert.equal(leerBorrador(clave, alm), null);
});

test('un borrador de otra versión se descarta en vez de romper', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('u1', 'c1', 'pl1', 'tiro');
  alm.setItem(clave, JSON.stringify({ version: 99, valores: {} }));
  assert.equal(leerBorrador(clave, alm), null);
});

test('un borrador corrupto se descarta en vez de romper', () => {
  const alm = almacenFalso();
  const clave = claveBorrador('u1', 'c1', 'pl1', 'tiro');
  alm.setItem(clave, 'esto no es json');
  assert.equal(leerBorrador(clave, alm), null);
});

test('si el almacén tira, nada explota', () => {
  const alm = almacenQueTira();
  const clave = claveBorrador('u1', 'c1', 'pl1', 'tiro');
  assert.equal(guardarBorrador(clave, { version: 1 }, alm), false);
  assert.equal(leerBorrador(clave, alm), null);
  assert.doesNotThrow(() => borrarBorrador(clave, alm));
});

test('la clave separa a cada usuario: otra cuenta en el mismo celular no ve el borrador', () => {
  const almacen = almacenFalso();
  const deAna = claveBorrador('ana', 'c1', 'pl1', 'tiro');
  const deLuis = claveBorrador('luis', 'c1', 'pl1', 'tiro');
  assert.notEqual(deAna, deLuis);
  guardarBorrador(deAna, { fecha: '2026-09-19', valores: { j1: { v: 3 } } }, almacen);
  assert.equal(leerBorrador(deLuis, almacen), null);
  assert.ok(leerBorrador(deAna, almacen));
});

test('sin cuenta la clave no se confunde con la de ningún usuario', () => {
  assert.notEqual(claveBorrador(null, 'c1', 'pl1', 'tiro'), claveBorrador('u1', 'c1', 'pl1', 'tiro'));
  assert.ok(claveBorrador(undefined, 'c1', 'pl1', 'tiro').includes('sin-cuenta'));
});

test('descartarBorradoresAnteriores borra los del formato sin usuario y deja los demás', () => {
  const almacen = almacenFalso();
  almacen.setItem('medicion.borrador.v1.c1.pl1.tiro', '{}');
  almacen.setItem('medicion.borrador.v1.c1.pl2.velocidad', '{}');
  almacen.setItem('otra.cosa', 'x');
  const vigente = claveBorrador('u1', 'c1', 'pl1', 'tiro');
  almacen.setItem(vigente, '{}');
  assert.equal(descartarBorradoresAnteriores(almacen), 2);
  assert.equal(almacen.getItem('medicion.borrador.v1.c1.pl1.tiro'), null);
  assert.equal(almacen.getItem('otra.cosa'), 'x');
  assert.equal(almacen.getItem(vigente), '{}');
});

test('descartarBorradoresAnteriores no rompe sin almacén o en modo privado', () => {
  assert.equal(descartarBorradoresAnteriores(null), 0);
  assert.equal(descartarBorradoresAnteriores(almacenQueTira()), 0);
});
