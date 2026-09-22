import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iconoDeAccion } from '../src/ui/componentes/pizarra.js';
import { TIPOS_ACCION } from '../src/data/jugadas.js';

test('iconoDeAccion usa las clases del trazo real', () => {
  for (const tipo of TIPOS_ACCION) {
    const svg = iconoDeAccion(tipo);
    assert.ok(svg.includes(`pz-trazo-${tipo}`), `${tipo}: falta pz-trazo-${tipo}`);
    assert.ok(svg.includes('class="pz pz-icono"'), `${tipo}: falta class="pz pz-icono"`);
  }
});

test('el corte lleva flecha y la cortina su T', () => {
  const corte = iconoDeAccion('corte');
  assert.ok(corte.includes('marker-end="url(#pz-flecha-icono-corte)"'));
  assert.ok(corte.includes('<marker id="pz-flecha-icono-corte"'));

  const cortina = iconoDeAccion('cortina');
  const coincidenciasCortina = [...cortina.matchAll(/pz-trazo-cortina/g)];
  assert.equal(coincidenciasCortina.length, 2, 'el path del trazo y la línea de la T');

  for (const tipo of TIPOS_ACCION) {
    if (tipo === 'corte') continue;
    assert.ok(!iconoDeAccion(tipo).includes('marker-end'), `${tipo} no debería tener marker-end`);
  }
});

test('el dribbling es zigzag', () => {
  const dribbling = iconoDeAccion('dribbling');
  const dDribbling = dribbling.match(/<path d="([^"]+)" class="pz-trazo pz-trazo-dribbling"/)[1];
  const comandosL = [...dDribbling.matchAll(/L/g)];
  assert.ok(comandosL.length >= 4, `esperaba ≥4 comandos L, hubo ${comandosL.length}`);

  const pase = iconoDeAccion('pase');
  const dPase = pase.match(/<path d="([^"]+)" class="pz-trazo pz-trazo-pase"/)[1];
  const comandosLPase = [...dPase.matchAll(/L/g)];
  assert.equal(comandosLPase.length, 1);
});

test('el ícono no trae trazo de toque', () => {
  for (const tipo of TIPOS_ACCION) {
    const svg = iconoDeAccion(tipo);
    assert.ok(!svg.includes('pz-trazo-toque'), `${tipo} no debería traer pz-trazo-toque`);
    assert.ok(!svg.includes('data-accion-indice'), `${tipo} no debería traer data-accion-indice`);
  }
});

test('todos los íconos comparten el viewBox', () => {
  const viewBoxes = TIPOS_ACCION.map((tipo) => iconoDeAccion(tipo).match(/viewBox="([^"]+)"/)[1]);
  for (const vb of viewBoxes) assert.equal(vb, viewBoxes[0]);
});
