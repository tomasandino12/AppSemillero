import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grafico } from '../src/ui/componentes/graficos.js';

/**
 * grafico() sólo toca setAttribute/removeAttribute/style/innerHTML del
 * elemento que recibe: no hace falta jsdom, alcanza con un objeto falso que
 * los tenga. Es la función que la spec obligó a reescribir para la curva de
 * cero datos (0 y 1 punto no pueden romper), y hoy no la protegía ningún
 * test.
 */
function svgFalso() {
  return {
    atributos: {},
    style: {},
    innerHTML: '',
    setAttribute(nombre, valor) { this.atributos[nombre] = valor; },
    removeAttribute(nombre) { delete this.atributos[nombre]; },
  };
}

test('una serie vacía no dibuja nada y deja el svg en alto 0', () => {
  const svg = svgFalso();
  const resultado = grafico(svg, { etiquetas: [], series: [] });
  assert.equal(resultado, false);
  assert.equal(svg.innerHTML, '');
  assert.equal(svg.style.height, '0px');
  assert.ok(!('viewBox' in svg.atributos));
});

test('etiquetas con todas las series en null tampoco dibuja nada', () => {
  const svg = svgFalso();
  // Caso real: DATOS con un partido cargado pero sin una sola estadística
  // resuelta todavía (dos/tres/libres en null para esa fecha).
  const resultado = grafico(svg, {
    etiquetas: ['05/03', '10/03'],
    series: [
      { nombre: '2P', c: '#D9122E', d: [null, null] },
      { nombre: '3P', c: '#131316', d: [null, null] },
    ],
  });
  assert.equal(resultado, false);
  assert.equal(svg.innerHTML, '');
  assert.equal(svg.style.height, '0px');
});

test('un solo punto se centra y no intenta dibujar una polyline', () => {
  const svg = svgFalso();
  const resultado = grafico(svg, {
    etiquetas: ['05/03'],
    series: [{ nombre: 'Práctica', c: '#131316', d: [40] }],
  });
  assert.equal(resultado, true);
  // No puede dividir por (n - 1) con n = 1: si lo intentara, X sería NaN y
  // el punto no aparecería en el SVG (coordenadas "NaN,NaN").
  assert.ok(!svg.innerHTML.includes('NaN'));
  // Con un solo punto no hay línea que trazar entre dos coordenadas.
  assert.ok(!svg.innerHTML.includes('<polyline'));
  assert.ok(svg.innerHTML.includes('<circle'));
  assert.equal(svg.atributos.viewBox, '0 0 320 170');
});

test('dos o más puntos sí dibujan la polyline', () => {
  const svg = svgFalso();
  const resultado = grafico(svg, {
    etiquetas: ['05/03', '10/03'],
    series: [{ nombre: 'Práctica', c: '#131316', d: [40, 60] }],
  });
  assert.equal(resultado, true);
  assert.ok(svg.innerHTML.includes('<polyline'));
  assert.ok(!svg.innerHTML.includes('NaN'));
});

test('una serie con huecos (null) no rompe cuando el resto de puntos alcanza para dibujar', () => {
  const svg = svgFalso();
  const resultado = grafico(svg, {
    etiquetas: ['05/03', '10/03', '15/03'],
    series: [{ nombre: 'Partido', c: '#D9122E', dash: true, d: [30, null, 70] }],
  });
  assert.equal(resultado, true);
  assert.ok(!svg.innerHTML.includes('NaN'));
  // Los huecos se filtran antes de armar la polyline: con dos puntos reales
  // (30 y 70) separados por un null, la línea igual se dibuja entre esos dos.
  assert.ok(svg.innerHTML.includes('<polyline'));
});

test('con min y max la escala queda fija, sin depender de los datos', () => {
  const svg = svgFalso();
  grafico(svg, {
    etiquetas: ['01/03', '01/04'],
    series: [{ nombre: 'triples', c: '#D9122E', d: [40, 45] }],
  }, { min: 0, max: 100 });
  assert.match(svg.innerHTML, />0<\/text>/);
  assert.match(svg.innerHTML, />100<\/text>/);
});

test('sin min y max la escala sigue saliendo de los datos', () => {
  const svg = svgFalso();
  grafico(svg, {
    etiquetas: ['01/03', '01/04'],
    series: [{ nombre: 'triples', c: '#D9122E', d: [40, 45] }],
  });
  assert.doesNotMatch(svg.innerHTML, />100<\/text>/);
});

// Las etiquetas del eje X son los <text> en mayúsculas con formato DD/MM.
const fechasDelEje = (html) => [...html.matchAll(/>(\d\d\/\d\d)<\/text>/g)].map((m) => m[1]);
const fechas = (n) => Array.from({ length: n }, (_, i) => `${String(1 + (i % 28)).padStart(2, '0')}/${String(1 + Math.floor(i / 28)).padStart(2, '0')}`);

test('con pocas fechas se escriben todas', () => {
  const svg = svgFalso();
  grafico(svg, { etiquetas: fechas(5), series: [{ nombre: 'a', c: '#000', d: [1, 2, 3, 4, 5] }] });
  assert.deepEqual(fechasDelEje(svg.innerHTML), fechas(5));
});

test('con muchas fechas se escriben algunas, sin encimarse, y siempre la primera y la última', () => {
  // Caso real: cargas de fuerza, lunes y jueves durante cuatro meses.
  const svg = svgFalso();
  const e = fechas(32);
  grafico(svg, { etiquetas: e, series: [{ nombre: 'a', c: '#000', d: e.map((_, i) => i) }] });
  const eje = fechasDelEje(svg.innerHTML);
  assert.ok(eje.length <= 7, `se escribieron ${eje.length} fechas en 320 de ancho`);
  assert.equal(eje[0], e[0]);
  assert.equal(eje[eje.length - 1], e[31]);
  // Los puntos se dibujan todos igual: lo que se ralea es el texto.
  assert.equal((svg.innerHTML.match(/<circle/g) ?? []).length, 32);
});
