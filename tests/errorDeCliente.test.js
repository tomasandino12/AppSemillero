import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registroDeError, depurar, LARGO } from '../src/data/errorDeCliente.js';

/**
 * Lo que más importa probar acá no es el formato del registro sino la
 * depuración: es la única barrera entre un error de Postgres y el nombre de
 * un chico guardado en una tabla de logs que nadie mira hasta que pasa algo.
 */

test('el valor de un error de unicidad no queda en el texto', () => {
  const crudo = 'duplicate key value violates unique constraint "jugador_nombre_clave_key" '
    + 'Key (nombre_clave)=(Juan Perez) already exists.';
  const limpio = depurar(crudo);
  assert.ok(!limpio.includes('Juan Perez'), limpio);
  // La columna sí queda: es lo que sirve para diagnosticar, y no identifica.
  assert.ok(limpio.includes('Key (nombre_clave)=(…)'), limpio);
});

test('los mails se tapan', () => {
  assert.equal(depurar('no existe profe@club.com.ar en la base'), 'no existe …@… en la base');
});

test('los números largos se tapan: DNI, teléfono, fecha de nacimiento', () => {
  assert.equal(depurar('documento 38254119 invalido'), 'documento … invalido');
  // Los cortos quedan: un código de error o una cantidad no identifican a nadie.
  assert.equal(depurar('fallaron 3 de 12 filas'), 'fallaron 3 de 12 filas');
});

test('un Error normal se convierte en registro', () => {
  const e = new Error('no se pudo guardar');
  const r = registroDeError(e, { pantalla: 'p-ficha', agente: 'Mozilla/5.0' });
  assert.equal(r.mensaje, 'no se pudo guardar');
  assert.equal(r.pantalla, 'p-ficha');
  assert.equal(r.agente, 'Mozilla/5.0');
  assert.ok(r.stack.includes('Error'));
});

test('aguanta lo que no es un Error: string, objeto, null, undefined', () => {
  assert.equal(registroDeError('se rompió').mensaje, 'se rompió');
  assert.equal(registroDeError(null).mensaje, 'Error sin mensaje');
  assert.equal(registroDeError(undefined).mensaje, 'Error sin mensaje');
  assert.equal(registroDeError({}).mensaje, 'Error sin mensaje');
  // Un objeto raro no tiene que hacer explotar justo al reportar el error.
  assert.equal(registroDeError({ message: 'algo' }).mensaje, 'algo');
});

test('sin stack, el campo va en null y no en la cadena "undefined"', () => {
  assert.equal(registroDeError('pelado').stack, null);
});

test('nada supera el largo de su columna', () => {
  const r = registroDeError(Object.assign(new Error('m'.repeat(9000)), { stack: 's'.repeat(9000) }), {
    pantalla: 'p'.repeat(9000),
    agente: 'a'.repeat(9000),
  });
  assert.equal(r.mensaje.length, LARGO.mensaje);
  assert.equal(r.stack.length, LARGO.stack);
  assert.equal(r.pantalla.length, LARGO.pantalla);
  assert.equal(r.agente.length, LARGO.agente);
  assert.ok(r.mensaje.endsWith('…'), 'se avisa que quedó cortado');
});

test('el registro no arrastra más campos que los de la tabla', () => {
  const r = registroDeError(new Error('x'), { pantalla: 'p-hoy', agente: 'ua' });
  assert.deepEqual(Object.keys(r).sort(), ['agente', 'mensaje', 'pantalla', 'stack']);
});
