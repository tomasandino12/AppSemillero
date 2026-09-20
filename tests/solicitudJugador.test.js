import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clubesDelCatalogo } from '../src/data/solicitudJugador.js';

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
