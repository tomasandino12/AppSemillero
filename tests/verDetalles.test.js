import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verDetallesHtml } from '../src/ui/componentes/verDetalles.js';

test('sin tablas no hay botón', () => {
  assert.equal(verDetallesHtml('Tiro', []), '');
  assert.equal(verDetallesHtml('Tiro', null), '');
  assert.equal(verDetallesHtml('Tiro', [{ nombre: 'Práctica', html: '' }]), '');
});

test('abre una hoja, no despliega en la pantalla', () => {
  const html = verDetallesHtml('Tiro', [{ nombre: 'Práctica', html: '<div class="tabla-ev">A</div>' }]);
  assert.doesNotMatch(html, /<details/);
  assert.match(html, /<button type="button" class="ver-detalles" data-ver-detalles/);
});

test('las tablas viajan en un <template>: no ocupan lugar en la pantalla', () => {
  const html = verDetallesHtml('Tiro', [
    { nombre: 'Práctica', html: '<div class="tabla-ev">A</div>' },
    { nombre: 'Partido', html: '<div class="tabla-ev">B</div>' },
  ]);
  const plantilla = html.match(/<template>([\s\S]*)<\/template>/);
  assert.ok(plantilla, 'falta el <template>');
  assert.match(plantilla[1], />Práctica</);
  assert.match(plantilla[1], />Partido</);
  assert.ok(plantilla[1].includes('<div class="tabla-ev">A</div>'));
  assert.ok(plantilla[1].includes('<div class="tabla-ev">B</div>'));
});

test('el texto del botón es el mismo en toda la app', () => {
  assert.match(verDetallesHtml('X', [{ nombre: 'X', html: '<p>x</p>' }]), />Ver detalles</);
});

test('el título de la hoja va en el botón', () => {
  assert.match(verDetallesHtml('Tiro del equipo', [{ nombre: 'X', html: '<p>x</p>' }]), /data-titulo="Tiro del equipo"/);
});

test('una tabla vacía no entra, las demás sí', () => {
  const html = verDetallesHtml('Tiro', [
    { nombre: 'Práctica', html: '' },
    { nombre: 'Partido', html: '<div>B</div>' },
  ]);
  assert.doesNotMatch(html, />Práctica</);
  assert.match(html, />Partido</);
});

test('título y nombre se escapan: vienen de datos, no del código', () => {
  const html = verDetallesHtml('"><script>', [{ nombre: '<script>', html: '<div>B</div>' }]);
  assert.doesNotMatch(html, /<script>/);
});
