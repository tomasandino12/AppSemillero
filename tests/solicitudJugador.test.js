import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clubesDelCatalogo, fichaExistente, normalizarCodigo } from '../src/data/solicitudJugador.js';

const fila = (clubId, clubNombre, plantelId, categoriaNombre) => ({
  clubId, clubNombre, plantelId, categoriaCodigo: 'X', categoriaNombre,
});

test('clubesDelCatalogo agrupa las categorías por club, en el orden en que vienen', () => {
  const clubes = clubesDelCatalogo([
    fila('c1', 'Newell', 'p13', 'Sub-13'),
    fila('c1', 'Newell', 'p15', 'Sub-15'),
    fila('c2', 'Otro', 'q1', 'Sub-13'),
  ]);
  assert.deepEqual(clubes, [
    { clubId: 'c1', nombre: 'Newell', categorias: [{ plantelId: 'p13', nombre: 'Sub-13' }, { plantelId: 'p15', nombre: 'Sub-15' }] },
    { clubId: 'c2', nombre: 'Otro', categorias: [{ plantelId: 'q1', nombre: 'Sub-13' }] },
  ]);
});

test('clubesDelCatalogo: sin filas no hay clubes', () => {
  assert.deepEqual(clubesDelCatalogo([]), []);
  assert.deepEqual(clubesDelCatalogo(undefined), []);
});

const existentes = [
  { id: 'a', nombreClave: 'PEREZ JUAN', nombreLimpio: 'PÉREZ, Juan', plantelesActuales: ['p13'] },
  { id: 'b', nombreClave: 'GOMEZ LEO', nombreLimpio: 'GÓMEZ, Leo', plantelesActuales: [] },
];

test('fichaExistente: la del club con esa clave, y si ya está en el plantel', () => {
  assert.equal(fichaExistente(existentes, 'PEREZ JUAN', 'p13').jugador.id, 'a');
  assert.equal(fichaExistente(existentes, 'PEREZ JUAN', 'p13').enPlantel, true);
  assert.equal(fichaExistente(existentes, 'PEREZ JUAN', 'p15').enPlantel, false);
});

test('fichaExistente: una ficha sin categoría vigente no está en ningún plantel', () => {
  assert.equal(fichaExistente(existentes, 'GOMEZ LEO', 'p13').enPlantel, false);
});

test('fichaExistente: sin ficha con esa clave (o sin lista) es null', () => {
  assert.equal(fichaExistente(existentes, 'NADIE', 'p13'), null);
  assert.equal(fichaExistente(undefined, 'PEREZ JUAN', 'p13'), null);
});

test('fichaExistente compara la clave exacta: no adivina parecidos', () => {
  assert.equal(fichaExistente(existentes, 'PEREZ JUAN M', 'p13'), null);
});

test('normalizarCodigo saca espacios y pasa a mayúsculas', () => {
  assert.equal(normalizarCodigo('a1b2c3'), 'A1B2C3');
  assert.equal(normalizarCodigo(' a1 b2c3 '), 'A1B2C3');
  assert.equal(normalizarCodigo('A1B2C3'), 'A1B2C3');
});

test('normalizarCodigo: sin 6 caracteres (ya limpio), null', () => {
  assert.equal(normalizarCodigo('a1b2c'), null);
  assert.equal(normalizarCodigo('a1b2c33'), null);
  assert.equal(normalizarCodigo(''), null);
  assert.equal(normalizarCodigo(undefined), null);
  assert.equal(normalizarCodigo(null), null);
});
