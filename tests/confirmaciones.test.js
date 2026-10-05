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

test('cambiar de categoría con el Yo-Yo corriendo pide confirmación y no fija el plantel antes', () => {
  const chrome = fuente('src/ui/chrome.js');
  assert.doesNotMatch(chrome, /setPlantelActivoId/);
  assert.match(chrome, /alElegirPlantel\(boton\.dataset\.plantel\)/);
  const cambiar = cuerpoDe(main, 'export async function cambiarPlantel(');
  assert.match(cambiar, /frenaLaSalida\(/);
  assert.ok(cambiar.indexOf('frenaLaSalida(') < cambiar.indexOf('setPlantelActivoId('));
  assert.match(main, /onPlantel: \(id\) => cambiarPlantel\(id\)/);
});

/** Los borrados de datos cargados por el usuario: [archivo, selector del botón, acción que borra]. */
const BORRADOS = [
  ['src/ui/pantallas/medir.js', '[data-descartar]', 'borrarBorrador('],
  ['src/ui/pantallas/ejercicio.js', '[data-nota]', 'borrarNota('],
  ['src/ui/pantallas/ejercicio.js', '[data-borrar-variacion]', 'borrarVariacion('],
  ['src/ui/pantallas/fichaJugador.js', '[data-borrar]', 'borrarMedicionCorporal('],
];

for (const [ruta, selector, accion] of BORRADOS) {
  test(`${selector} en ${ruta.split('/').pop()} no borra sin confirmar`, () => {
    const src = fuente(ruta);
    const ini = src.indexOf(`querySelectorAll('${selector}')`);
    assert.notStrictEqual(ini, -1, `no está el handler de ${selector}`);
    const fin = src.indexOf('\n  });', ini);
    const handler = src.slice(ini, fin);
    const iConfirmar = handler.indexOf('confirmarEnHoja(');
    const iAlConfirmar = handler.indexOf('alConfirmar');
    assert.ok(iConfirmar !== -1, 'el handler no pasa por confirmarEnHoja');
    assert.ok(handler.indexOf(accion) > iAlConfirmar, `${accion} se llama fuera de alConfirmar`);
  });
}
