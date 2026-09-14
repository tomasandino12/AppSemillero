import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detalleColapsableHtml } from '../src/ui/componentes/detalleColapsable.js';

test('sin tablas no hay botón', () => {
  assert.equal(detalleColapsableHtml([]), '');
  assert.equal(detalleColapsableHtml(null), '');
  assert.equal(detalleColapsableHtml([{ nombre: 'Práctica', html: '' }]), '');
});

test('arranca cerrado y nombra cada tabla', () => {
  const html = detalleColapsableHtml([
    { nombre: 'Práctica', html: '<div class="tabla-ev">A</div>' },
    { nombre: 'Partido', html: '<div class="tabla-ev">B</div>' },
  ]);
  assert.match(html, /<details class="detalle-colapsable">/);
  assert.doesNotMatch(html, /\sopen[\s>]/);
  assert.match(html, />Práctica</);
  assert.match(html, />Partido</);
  assert.ok(html.includes('<div class="tabla-ev">A</div>'));
  assert.ok(html.includes('<div class="tabla-ev">B</div>'));
});

test('el texto del botón es el mismo en toda la app', () => {
  const html = detalleColapsableHtml([{ nombre: 'X', html: '<p>x</p>' }]);
  assert.match(html, /Ver detalles/);
  assert.match(html, /Ocultar detalles/);
});

test('una tabla vacía no entra, las demás sí', () => {
  const html = detalleColapsableHtml([
    { nombre: 'Práctica', html: '' },
    { nombre: 'Partido', html: '<div>B</div>' },
  ]);
  assert.doesNotMatch(html, />Práctica</);
  assert.match(html, />Partido</);
});

test('el nombre se escapa: viene de datos, no del código', () => {
  const html = detalleColapsableHtml([{ nombre: '<script>', html: '<div>B</div>' }]);
  assert.doesNotMatch(html, /<script>/);
});
