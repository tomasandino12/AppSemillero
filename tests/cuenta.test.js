import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LARGO_MAXIMO_NOMBRE, normalizarNombre, nombreDeUsuario, necesitaNombre,
  nombreSugerido, inicialesDeNombre, rolesLegibles,
} from '../src/data/cuenta.js';

test('normalizar un nombre saca espacios de más y respeta el tope', () => {
  assert.equal(normalizarNombre('  Tomás    Andino '), 'Tomás Andino');
  assert.equal(normalizarNombre(null), '');
  assert.equal(normalizarNombre('   '), '');
  assert.equal(normalizarNombre('a'.repeat(200)).length, LARGO_MAXIMO_NOMBRE);
});

test('el nombre del usuario sale de user_metadata.nombre y de ningún otro lado', () => {
  assert.equal(nombreDeUsuario({ user_metadata: { nombre: ' Nacho Armas ' } }), 'Nacho Armas');
  assert.equal(nombreDeUsuario({ user_metadata: { full_name: 'Ignacio Armas' } }), null);
  assert.equal(nombreDeUsuario({ user_metadata: {} }), null);
  assert.equal(nombreDeUsuario(null), null);
});

test('una cuenta nueva sin nombre tiene que cargarlo, venga de donde venga', () => {
  assert.equal(necesitaNombre({ user_metadata: {} }), true);
  // Entrar con Google trae full_name, y eso NO cuenta como nombre cargado.
  assert.equal(necesitaNombre({ user_metadata: { full_name: 'Ignacio Armas' } }), true);
  assert.equal(necesitaNombre({ user_metadata: { nombre: '   ' } }), true);
});

test('con nombre, o si la cuenta es anterior al cambio, no se la frena', () => {
  assert.equal(necesitaNombre({ user_metadata: { nombre: 'Nacho' } }), false);
  assert.equal(necesitaNombre({ user_metadata: { cuenta_anterior_al_nombre: true } }), false);
  assert.equal(necesitaNombre(null), false);
});

test('lo de Google sólo se sugiere', () => {
  assert.equal(nombreSugerido({ user_metadata: { full_name: 'Ignacio  Armas' } }), 'Ignacio Armas');
  assert.equal(nombreSugerido({ user_metadata: { name: 'Nacho' } }), 'Nacho');
  assert.equal(nombreSugerido({ user_metadata: {} }), '');
});

test('las iniciales son la primera y la última palabra', () => {
  assert.equal(inicialesDeNombre('Tomás Andino'), 'TA');
  assert.equal(inicialesDeNombre('ignacio de la torre'), 'IT');
  assert.equal(inicialesDeNombre('Nacho'), 'N');
  assert.equal(inicialesDeNombre('Ángel Ñuñez'), 'ÁÑ');
  assert.equal(inicialesDeNombre(''), '');
});

test('los roles se leen en orden fijo', () => {
  assert.deepEqual(rolesLegibles({ esEntrenador: true, esCoordinador: true }), ['Entrenador', 'Coordinación']);
  assert.deepEqual(rolesLegibles({ esCoordinador: true }), ['Coordinación']);
  assert.deepEqual(rolesLegibles(), []);
});
