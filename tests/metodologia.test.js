import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_APODOS, LARGO_APODO, etiquetaMetodologia } from '../src/data/metodologia.js';

test('los límites son 3 apodos de 20 caracteres', () => {
  assert.equal(MAX_APODOS, 3);
  assert.equal(LARGO_APODO, 20);
});

test('usa un apodo del club', () => {
  const club = { nombre: "Newell's", apodos: ['Leprosa'] };
  assert.equal(etiquetaMetodologia(club), 'Metodología Leprosa');
});

test('elige con el azar inyectado (0 → primero, 0.99 → último)', () => {
  const club = { nombre: "Newell's", apodos: ['Leprosa', 'NOB', 'Lepra'] };
  assert.equal(etiquetaMetodologia(club, () => 0), 'Metodología Leprosa');
  assert.equal(etiquetaMetodologia(club, () => 0.99), 'Metodología Lepra');
});

test('sin apodos usa club.nombre', () => {
  assert.equal(etiquetaMetodologia({ nombre: 'Atlético', apodos: [] }), 'Metodología Atlético');
  assert.equal(etiquetaMetodologia({ nombre: 'Atlético' }), 'Metodología Atlético');
  assert.equal(etiquetaMetodologia({ nombre: 'Atlético', apodos: null }), 'Metodología Atlético');
});

test('ignora apodos inválidos', () => {
  const club = { nombre: 'Atlético', apodos: ['', '   ', 5, null, 'x'.repeat(21), 'Decano'] };
  assert.equal(etiquetaMetodologia(club, () => 0.99), 'Metodología Decano');
  assert.equal(
    etiquetaMetodologia({ nombre: 'Atlético', apodos: ['', 7] }),
    'Metodología Atlético',
  );
});

test('sin club devuelve "Metodología del club"', () => {
  assert.equal(etiquetaMetodologia(null), 'Metodología del club');
  assert.equal(etiquetaMetodologia(undefined), 'Metodología del club');
});
