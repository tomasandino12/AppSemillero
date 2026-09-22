import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iconoDeAccion, dibujarPizarra } from '../src/ui/componentes/pizarra.js';
import { TIPOS_ACCION, jugadaVacia, estadoAlInicioDelPaso } from '../src/data/jugadas.js';

/** dibujarPizarra sólo necesita estos miembros de un <svg> real. */
function svgFalso() {
  return { dataset: {}, style: {}, setAttribute() {}, innerHTML: '' };
}

const conUnDefensor = () => ({
  ...jugadaVacia(),
  fichas: [{ id: 'd1', tipo: 'defensa', numero: 1, x: 0.5, y: 0.5 }],
});

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

test('el color de un defensor depende de nosotrosDefiende', () => {
  const datos = conUnDefensor();
  const estado = estadoAlInicioDelPaso(datos, 0);

  const rival = svgFalso();
  dibujarPizarra(rival, datos, estado, {});
  assert.ok(rival.innerHTML.includes('class="pz-rival" data-ficha-id="d1"'));
  assert.ok(!rival.innerHTML.includes('pz-nosotros'));

  const nuestro = svgFalso();
  dibujarPizarra(nuestro, datos, estado, { nosotrosDefiende: true });
  assert.ok(nuestro.innerHTML.includes('class="pz-nosotros" data-ficha-id="d1"'));
  assert.ok(!nuestro.innerHTML.includes('pz-rival'));
});
