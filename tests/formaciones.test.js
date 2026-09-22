import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMACIONES } from '../src/data/formaciones.js';
import { validarJugada } from '../src/data/jugadas.js';

const porClave = (clave) => FORMACIONES.find((f) => f.clave === clave);
const cuantas = (f, tipo) => f.datos.fichas.filter((x) => x.tipo === tipo).length;

test('todas las formaciones son válidas', () => {
  assert.ok(FORMACIONES.length >= 8);
  for (const f of FORMACIONES) {
    assert.deepEqual(validarJugada(f.datos), { ok: true, errores: [] }, f.clave);
    assert.deepEqual(f.datos.pasos, [], `${f.clave} no tiene pasos`);
    if (cuantas(f, 'ataque') > 0) {
      const uno = f.datos.fichas.find((x) => x.tipo === 'ataque' && x.numero === 1);
      assert.equal(f.datos.pelota, uno.id, `${f.clave}: la pelota es del 1`);
    } else {
      assert.equal(f.datos.pelota, null, f.clave);
    }
  }
});

test('claves únicas', () => {
  const claves = FORMACIONES.map((f) => f.clave);
  assert.equal(new Set(claves).size, claves.length);
  assert.ok(FORMACIONES.every((f) => f.etiqueta));
});

test('la presión es de cancha entera', () => {
  const p = porClave('presion-1-2-1-1');
  assert.equal(p.datos.cancha, 'entera');
  assert.equal(cuantas(p, 'ataque'), 5);
  assert.equal(cuantas(p, 'defensa'), 5);
  assert.equal(porClave('vacia-entera').datos.cancha, 'entera');
  assert.equal(porClave('vacia-media').datos.cancha, 'media');
});

test('las zonas tienen cinco defensores', () => {
  for (const clave of ['zona-2-3', 'zona-3-2']) {
    assert.equal(cuantas(porClave(clave), 'defensa'), 5, clave);
    assert.equal(cuantas(porClave(clave), 'ataque'), 5, clave);
  }
});

test('las formaciones no comparten estado', () => {
  // El editor duplica los datos antes de tocarlos, pero por si acaso: cada una es un objeto propio.
  const datos = FORMACIONES.map((f) => f.datos);
  assert.equal(new Set(datos).size, datos.length);
});
