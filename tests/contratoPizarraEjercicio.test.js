import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOPES } from '../src/data/jugadas.js';

/**
 * La pizarra de un ejercicio vive en dos lugares: los check de 0053 (los hace
 * cumplir la base) y src/data/pizarraEjercicio.js (lo que valida el editor).
 * Reusa los topes de la jugada, así que un solo número gobierna las dos.
 * Modelo: contratoJugada.test.js.
 */

const sql = readFileSync('supabase/migrations/0053_pizarra_ejercicio.sql', 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = sql.replace(/--.*$/gm, '');

test('el tope de bytes de la pizarra es el mismo que el de la jugada', () => {
  const m = sinComentarios.match(/octet_length\(pizarra::text\) <= (\d+)/);
  assert.ok(m, 'no encontré el check de tamaño en 0053: ¿cambió la migración?');
  assert.equal(Number(m[1]), TOPES.bytes);
});

test('las notas de la pizarra se validan con la misma función que las de la jugada', () => {
  assert.match(sinComentarios, /public\.jugada_notas_validas\(pizarra\)/);
});

test('sólo se puede escribir la pizarra en un update, y no se abre el insert', () => {
  assert.match(sinComentarios, /grant update \(pizarra\) on ejercicio to authenticated;/);
  assert.doesNotMatch(sinComentarios, /grant insert/);
  assert.doesNotMatch(sinComentarios, /grant all/i);
});
