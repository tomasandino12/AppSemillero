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

test('un ajuste no dibuja ningún trazo, a diferencia de un corte', () => {
  const datos = {
    ...jugadaVacia(),
    fichas: [{ id: 'd1', tipo: 'defensa', numero: 1, x: 0.5, y: 0.5 }],
    pasos: [{ acciones: [{ tipo: 'ajuste', ficha: 'd1', hasta: { x: 0.3, y: 0.3 } }], nota: '' }],
  };
  // data-accion-indice sólo lo agrega dibujarTrazo: la cancha de fondo también
  // trae algún <path> (el arco de tres), por eso no alcanza con buscar "<path".
  const svgAjuste = svgFalso();
  dibujarPizarra(svgAjuste, datos, estadoAlInicioDelPaso(datos, 0), { paso: 0 });
  assert.ok(!svgAjuste.innerHTML.includes('data-accion-indice'), 'un ajuste no debería dibujar el trazo de la acción');
  assert.ok(!svgAjuste.innerHTML.includes('pz-trazo'), 'un ajuste no debería traer ninguna clase pz-trazo');

  const conCorte = { ...datos, pasos: [{ acciones: [{ tipo: 'corte', ficha: 'd1', hasta: { x: 0.3, y: 0.3 } }], nota: '' }] };
  const svgCorte = svgFalso();
  dibujarPizarra(svgCorte, conCorte, estadoAlInicioDelPaso(conCorte, 0), { paso: 0 });
  assert.ok(svgCorte.innerHTML.includes('data-accion-indice'), 'un corte sí debería dibujar el trazo de la acción');
});

test('con fantasmas dibuja el ajuste en su destino', () => {
  const datos = {
    ...jugadaVacia(),
    fichas: [{ id: 'd1', tipo: 'defensa', numero: 1, x: 0.5, y: 0.5 }],
    pasos: [{ acciones: [{ tipo: 'ajuste', ficha: 'd1', hasta: { x: 0.3, y: 0.3 } }], nota: '' }],
  };
  const svg = svgFalso();
  dibujarPizarra(svg, datos, estadoAlInicioDelPaso(datos, 0), { paso: 0, fantasmas: true });
  assert.ok(svg.innerHTML.includes('pz-fantasma'), 'debería dibujar el fantasma');
  assert.ok(svg.innerHTML.includes('data-accion-indice="0"'), 'el fantasma lleva el índice de su ajuste');
});

test('sin fantasmas el ajuste no dibuja nada', () => {
  const datos = {
    ...jugadaVacia(),
    fichas: [{ id: 'd1', tipo: 'defensa', numero: 1, x: 0.5, y: 0.5 }],
    pasos: [{ acciones: [{ tipo: 'ajuste', ficha: 'd1', hasta: { x: 0.3, y: 0.3 } }], nota: '' }],
  };
  const svg = svgFalso();
  dibujarPizarra(svg, datos, estadoAlInicioDelPaso(datos, 0), { paso: 0 });
  assert.ok(!svg.innerHTML.includes('pz-fantasma'), 'sin fantasmas:true no debería dibujar el fantasma');
});

test('cada tipo de acción usa su propio marker de flecha', () => {
  for (const tipo of TIPOS_ACCION) {
    const svg = iconoDeAccion(tipo);
    assert.ok(svg.includes(`<marker id="pz-flecha-icono-${tipo}"`), `${tipo}: falta su <marker>`);
    assert.ok(svg.includes(`class="pz-flecha-${tipo}"`), `${tipo}: el path del marker no tiene su clase`);
  }
});

test('el ícono de la barra usa la misma clase de trazo que la cancha', () => {
  const datos = {
    ...jugadaVacia(),
    fichas: [{ id: 'd1', tipo: 'defensa', numero: 1, x: 0.5, y: 0.5 }],
    pasos: [{ acciones: [{ tipo: 'corte', ficha: 'd1', hasta: { x: 0.3, y: 0.3 } }], nota: '' }],
  };
  const svg = svgFalso();
  dibujarPizarra(svg, datos, estadoAlInicioDelPaso(datos, 0), { paso: 0 });
  assert.ok(svg.innerHTML.includes('class="pz-trazo pz-trazo-corte"'));
  assert.ok(iconoDeAccion('corte').includes('class="pz-trazo pz-trazo-corte"'));
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
