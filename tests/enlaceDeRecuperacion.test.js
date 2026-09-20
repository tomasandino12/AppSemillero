import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerEnlaceDeRecuperacion, pantallaDeRecuperacion } from '../src/data/enlaceDeRecuperacion.js';

const HASH_OK = '#access_token=abc123&expires_in=3600&refresh_token=xyz&token_type=bearer&type=recovery';
const HASH_VENCIDO = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';

test('el hash con token de recuperación se reconoce y no trae error', () => {
  assert.deepEqual(leerEnlaceDeRecuperacion(HASH_OK), { esRecuperacion: true, trajoError: false });
});

test('el redirect de error de Supabase cuenta como vuelta del mail, aunque no traiga type', () => {
  assert.deepEqual(leerEnlaceDeRecuperacion(HASH_VENCIDO), { esRecuperacion: true, trajoError: true });
});

test('una visita normal no es una recuperación', () => {
  for (const hash of ['', '#', undefined, null, '#algo=1']) {
    assert.deepEqual(leerEnlaceDeRecuperacion(hash), { esRecuperacion: false, trajoError: false }, String(hash));
  }
});

test('un error de otro tipo de link (confirmar el mail) no se toma como recuperación', () => {
  const hash = '#error=access_denied&error_code=otp_expired&type=signup';
  assert.deepEqual(leerEnlaceDeRecuperacion(hash), { esRecuperacion: false, trajoError: true });
});

test('con token válido y sesión abierta se pide la contraseña nueva', () => {
  assert.equal(pantallaDeRecuperacion(HASH_OK, true), 'nueva-clave');
});

test('el token que no abrió sesión avisa que el link venció, en vez de caer callado en la landing', () => {
  assert.equal(pantallaDeRecuperacion(HASH_OK, false), 'link-vencido');
  assert.equal(pantallaDeRecuperacion(HASH_VENCIDO, false), 'link-vencido');
});

test('un hash con error avisa aunque haya sesión: esa sesión es de antes, no del link', () => {
  assert.equal(pantallaDeRecuperacion(HASH_VENCIDO, true), 'link-vencido');
});

test('sin hash de recuperación el arranque sigue normal, con sesión o sin ella', () => {
  assert.equal(pantallaDeRecuperacion('', true), null);
  assert.equal(pantallaDeRecuperacion('', false), null);
});
