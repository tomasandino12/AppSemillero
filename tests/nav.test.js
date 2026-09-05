import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoPorcentaje, formatearFechaCorta } from '../src/ui/nav.js';
import { porcentaje } from '../src/data/estadisticas.js';

/**
 * nav.js se importa sin problema en Node: su nivel superior no toca el DOM,
 * sólo lo hacen los CUERPOS de mostrarPantalla() y toast(), que acá no se
 * ejecutan. Por eso el test importa nav.js directo, sin mockear document ni
 * mover estas funciones a otro archivo.
 *
 * textoPorcentaje() es el único punto por donde pasa la regla "ningún
 * porcentaje sin sus intentos": es lo más barato de testear y lo más caro de
 * romper sin darse cuenta.
 */

test('textoPorcentaje con null dice "sin datos", nunca 0% ni un guión ambiguo', () => {
  assert.equal(textoPorcentaje(null), '<span class="sin">sin datos</span>');
});

test('textoPorcentaje con un porcentaje normal muestra el denominador al lado', () => {
  const p = porcentaje(7, 10);
  const texto = textoPorcentaje(p);
  assert.ok(texto.includes('70%'));
  assert.ok(texto.includes('7/10'));
  // Sobre el umbral: no lleva la marca de muestra chica.
  assert.ok(!texto.includes('poco-tag'));
});

test('textoPorcentaje con una muestra chica lleva la marca de "pocos datos"', () => {
  // 1 de 1: exactamente el caso del triple de partido que UMBRAL_INTENTOS
  // existe para no confundir con un 25/50 de práctica.
  const p = porcentaje(1, 1);
  const texto = textoPorcentaje(p);
  assert.ok(texto.includes('100%'));
  assert.ok(texto.includes('1/1'));
  assert.ok(texto.includes('poco-tag'));
  assert.ok(texto.includes('pocos datos'));
});

test('formatearFechaCorta convierte YYYY-MM-DD a DD/MM sin pasar por Date (huso horario)', () => {
  assert.equal(formatearFechaCorta('2026-03-05'), '05/03');
  assert.equal(formatearFechaCorta('2026-12-31'), '31/12');
});
