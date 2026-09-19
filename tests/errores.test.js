import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIN_CONEXION, textoDeError, avisoDeError, mensajeAlGuardar,
} from '../src/ui/errores.js';

const errorDeRed = new TypeError('Failed to fetch');

test('un error de red siempre dice lo mismo, sea cual sea el texto genérico', () => {
  assert.equal(textoDeError(errorDeRed, 'No se pudo cargar.'), SIN_CONEXION);
});

test('cualquier otro error muestra el texto genérico', () => {
  assert.equal(textoDeError(new Error('boom'), 'No se pudo cargar.'), 'No se pudo cargar.');
});

test('avisoDeError arma el bloque de la pantalla y escapa el texto', () => {
  assert.equal(
    avisoDeError(new Error('x'), 'No se pudo <cargar>.'),
    '<div class="pad"><div class="al"><div class="tx">No se pudo &lt;cargar&gt;.</div></div></div>',
  );
  assert.ok(avisoDeError(errorDeRed, 'x').includes(SIN_CONEXION));
});

test('mensajeAlGuardar: red, reglas de la pantalla, permiso y genérico, en ese orden', () => {
  const reglas = [[/SIN_CATEGORIAS/, 'Marcá al menos una categoría.']];
  assert.equal(mensajeAlGuardar(errorDeRed, { reglas }), SIN_CONEXION);
  assert.equal(mensajeAlGuardar(new Error('SIN_CATEGORIAS'), { reglas }), 'Marcá al menos una categoría.');
  assert.equal(mensajeAlGuardar(new Error('new row violates row-level security policy')), 'No tenés permiso para hacer eso.');
  assert.equal(mensajeAlGuardar({ code: '42501', message: '' }), 'No tenés permiso para hacer eso.');
  assert.equal(mensajeAlGuardar(new Error('otra cosa')), 'No se pudo guardar. Probá de nuevo.');
});

test('mensajeAlGuardar: la pantalla puede decir qué mensaje cuenta como falta de permiso', () => {
  const permiso = /NO_SE_PUDO/;
  assert.equal(mensajeAlGuardar(new Error('NO_SE_PUDO_X'), { permiso }), 'No tenés permiso para hacer eso.');
  assert.equal(mensajeAlGuardar(new Error('otra'), { permiso, generico: 'Falló.' }), 'Falló.');
});
