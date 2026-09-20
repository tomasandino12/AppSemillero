import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { puedeHaberSesion, CLAVE_DE_SESION } from '../src/data/sesionGuardada.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('sin nada en la URL ni en el storage, no puede haber sesión', () => {
  assert.equal(puedeHaberSesion({ search: '', hash: '', claves: [] }), false);
});

test('un token guardado de supabase-js es una sesión posible', () => {
  assert.equal(puedeHaberSesion({ claves: ['sb-lseqvbtdzebomxwtqhwu-auth-token'] }), true);
});

test('otras claves del storage no cuentan', () => {
  // El borrador de medición vive en localStorage y no dice nada de la sesión.
  assert.equal(puedeHaberSesion({ claves: ['borrador-medicion', 'sb-algo', 'auth-token'] }), false);
});

test('el ?code= con el que vuelve Google se espera', () => {
  assert.equal(puedeHaberSesion({ search: '?code=abc123', claves: [] }), true);
});

test('el hash de recuperar contraseña se espera', () => {
  assert.equal(puedeHaberSesion({ hash: '#access_token=abc&type=recovery', claves: [] }), true);
});

test('un error del proveedor también se espera, para que lo procese Supabase', () => {
  assert.equal(puedeHaberSesion({ search: '?error=access_denied', claves: [] }), true);
});

/**
 * El contrato de verdad: la forma de la clave la decide supabase-js, no
 * nosotros. Si una actualización del bundle vendorizado la cambia, el efecto
 * es silencioso y sólo en producción —un usuario con sesión abierta cae en la
 * landing— porque en local nadie corre el bundle. Este test lo agarra antes.
 */
test('CLAVE_DE_SESION reconoce la clave que arma el supabase-js vendorizado', () => {
  const bundle = readFileSync(path.join(raiz, 'public', 'vendor', 'supabase-js.mjs'), 'utf8');
  const plantilla = bundle.match(/`(sb-\$\{[^`]*\}-auth-token)`/)?.[1];
  assert.ok(plantilla, 'supabase-js ya no arma la clave como `sb-${...}-auth-token`: revisar sesionGuardada.js');
  // Se reemplaza el ${...} por un nombre de proyecto cualquiera para tener una
  // clave concreta contra la cual probar el patrón.
  const claveReal = plantilla.replace(/\$\{[^}]*\}/g, 'lseqvbtdzebomxwtqhwu');
  assert.match(claveReal, CLAVE_DE_SESION);
});
