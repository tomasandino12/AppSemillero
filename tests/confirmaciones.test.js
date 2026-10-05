import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Contratos sobre el texto fuente (no hay navegador en node --test): lo que
 * se rompe sin que nadie lo note es que un handler vuelva a llamar a la acción
 * directo, sin pasar por la hoja de confirmación.
 */
const fuente = (ruta) => readFileSync(ruta, 'utf8');
const yoyo = fuente('src/ui/pantallas/medirYoyo.js');
const main = fuente('src/ui/main.js');

/** Cuerpo de una función de nivel superior: desde su firma hasta la siguiente. */
function cuerpoDe(texto, firma) {
  const ini = texto.indexOf(firma);
  assert.notStrictEqual(ini, -1, `no está ${firma}`);
  const sig = texto.indexOf('\n}\n', ini);
  return texto.slice(ini, sig);
}

test('confirmarEnHoja pone Cancelar, el verbo y protege el doble toque', () => {
  const src = fuente('src/ui/componentes/confirmar.js');
  assert.match(src, />Cancelar</);
  assert.match(src, />\$\{verbo\}</);
  assert.match(src, /if \(boton\.disabled\) return;\s*boton\.disabled = true;/);
});

test('medirYoyo confirma antes de terminar', () => {
  assert.doesNotMatch(yoyo, /btn-yoyo-terminar'\)\.addEventListener\('click', terminar\)/);
  assert.match(yoyo, /btn-yoyo-terminar'\)\.addEventListener\('click', pedirTerminar\)/);
  assert.match(cuerpoDe(yoyo, 'function pedirTerminar'), /confirmarEnHoja\(/);
});

test('el texto de terminar dice cuántos quedan en carrera', () => {
  assert.match(cuerpoDe(yoyo, 'function pedirTerminar'), /Quedan \$\{quedan\}/);
});

test('la hoja de terminar usa la hora del toque, no la de confirmar', () => {
  assert.match(cuerpoDe(yoyo, 'function pedirTerminar'), /terminar\(t\)/);
});

test('salir del Yo-Yo con la prueba en curso pasa por la confirmación', () => {
  assert.match(fuente('src/ui/pantallas/registro.js'), /p-medir-yoyo'[^)]*confirmarSalida: confirmarSalidaYoyo/);
  assert.match(cuerpoDe(main, 'export async function ir('), /frenaLaSalida\(/);
  assert.match(cuerpoDe(main, 'export async function volver('), /frenaLaSalida\(/);
  assert.match(cuerpoDe(yoyo, 'export function confirmarSalidaYoyo'), /no se puede retomar/);
});

test('Deshacer y Terminar no quedan mitad y mitad', () => {
  const css = fuente('public/css/componentes.css');
  assert.match(css, /\.yoyo-pie\{[^}]*gap:var\(--sp-6\)/);
});
