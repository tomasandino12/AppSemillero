import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarJugada } from '../src/data/jugadas.js';
import { JUGADA_DEMO_LANDING } from '../src/data/jugadaDemoLanding.js';

test('la jugada de la landing es válida para el motor de la pizarra', () => {
  const { ok, errores } = validarJugada(JUGADA_DEMO_LANDING);
  assert.ok(ok, errores.join(' | '));
});

test('la jugada de la landing termina con un tiro', () => {
  const ultimo = JUGADA_DEMO_LANDING.pasos.at(-1).acciones;
  assert.ok(ultimo.some((a) => a.tipo === 'tiro'));
});
