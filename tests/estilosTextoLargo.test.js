import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Lo que escribe la gente (títulos, nombres, notas) puede traer una palabra
 * larguísima sin espacios. Sin `overflow-wrap: anywhere` en el body, esa
 * palabra ensancha la página entera y aparece un scroll horizontal (se vio en
 * producción con el título de un recurso). Medido en el navegador: una caja de
 * 600 px llegaba a 2871 px de contenido; con la regla, 600.
 *
 * Es un test de texto, no de render: sólo evita que la regla se borre sin
 * querer. `anywhere` y no `break-word`: además achica el ancho mínimo de las
 * cajas flexibles, que con `break-word` seguirían desbordando.
 */

test('el body parte las palabras largas en lugar de ensanchar la página', () => {
  const css = readFileSync('public/css/base.css', 'utf8');
  const cuerpo = css.match(/body\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(cuerpo, /overflow-wrap\s*:\s*anywhere/);
});
