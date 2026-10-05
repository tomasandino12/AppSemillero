import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { saludoSegunHora } from '../src/data/saludo.js';

test('el saludo cambia con la hora', () => {
  assert.equal(saludoSegunHora(5), 'Buen día');
  assert.equal(saludoSegunHora(11), 'Buen día');
  assert.equal(saludoSegunHora(12), 'Buenas tardes');
  assert.equal(saludoSegunHora(19), 'Buenas tardes');
  assert.equal(saludoSegunHora(20), 'Buenas noches');
  assert.equal(saludoSegunHora(0), 'Buenas noches');
  assert.equal(saludoSegunHora(4), 'Buenas noches');
});

test('una hora inválida no rompe el saludo', () => {
  for (const h of [-1, 24, 3.5, NaN, undefined, null]) assert.equal(saludoSegunHora(h), 'Hola');
});

test('la pantalla Hoy saluda con la hora y no con un texto fijo', () => {
  const src = readFileSync('src/ui/pantallas/hoy.js', 'utf8');
  assert.match(src, /saludoSegunHora\(new Date\(\)\.getHours\(\)\)/);
  assert.doesNotMatch(src, /<h2 class="h2">Buen día<\/h2>/);
});

test('no queda "Cargando..." con tres puntos y cada cargando avisa con role=status', () => {
  const dir = 'src/ui/pantallas/';
  for (const f of readdirSync(dir)) {
    const src = readFileSync(dir + f, 'utf8');
    assert.doesNotMatch(src, /Cargando[^<'`\n]*\.\.\./, `${f}: "Cargando..." con tres puntos`);
    for (const m of src.matchAll(/<(?:div|span)[^>]*>\s*(?:\$\{[^}]*)?'?Cargando/g)) {
      assert.match(m[0], /role="status"/, `${f}: un "Cargando" sin role="status"`);
    }
  }
});
