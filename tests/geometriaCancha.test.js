import { test } from 'node:test';
import assert from 'node:assert/strict';
import { W, ALTO, altoDe, AROS, formasDeUnExtremo } from '../src/data/geometriaCancha.js';

const cerca = (a, b, tol = 0.2) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);
const distancia = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

test('radio del triple + distancia lateral no pasa la mitad del ancho', () => {
  const { triple, aro } = formasDeUnExtremo();
  assert.ok(triple.rectaIzq.x >= 0 && triple.rectaIzq.x <= W);
  assert.ok(triple.rectaDer.x >= 0 && triple.rectaDer.x <= W);
  // El arco, tal como se dibuja (entre las dos rectas), no sale del ancho: lo
  // recortan las rectas antes de llegar a los extremos izquierdo/derecho del
  // círculo completo.
  assert.ok(triple.arco.desde.x >= 0 && triple.arco.hasta.x <= W);
  // La punta del arco (su punto más al sur) no llega a la mitad de la cancha entera.
  assert.ok(aro.cy + triple.arco.r <= ALTO.media);
});

test('ninguna forma sale de la cancha', () => {
  for (const cancha of ['media', 'entera']) {
    const alto = altoDe(cancha);
    const { zona, circuloLibres, triple, aro, tablero, circuloCentral } = formasDeUnExtremo();

    const dentro = (minX, maxX, minY, maxY) => {
      assert.ok(minX >= -0.01 && maxX <= W + 0.01, `x fuera de [0,${W}]: ${minX}..${maxX}`);
      assert.ok(minY >= -0.01 && maxY <= alto + 0.01, `y fuera de [0,${alto}]: ${minY}..${maxY}`);
    };

    dentro(zona.x, zona.x + zona.ancho, zona.y, zona.y + zona.alto);
    dentro(circuloLibres.cx - circuloLibres.r, circuloLibres.cx + circuloLibres.r, circuloLibres.cy - circuloLibres.r, circuloLibres.cy + circuloLibres.r);
    dentro(triple.rectaIzq.x, triple.rectaDer.x, Math.min(triple.rectaIzq.y1, triple.rectaDer.y1), Math.max(triple.rectaIzq.y2, triple.rectaDer.y2));
    // El arco dibujado (entre las dos rectas) va de y2 (arriba) a cy+r (su punto más al sur), no del círculo completo.
    dentro(triple.arco.desde.x, triple.arco.hasta.x, triple.arco.desde.y, triple.arco.cy + triple.arco.r);
    dentro(aro.cx - aro.r, aro.cx + aro.r, aro.cy - aro.r, aro.cy + aro.r);
    dentro(tablero.x1, tablero.x2, tablero.y, tablero.y);
    // El semicírculo central: sólo se chequea en x (cae centrado en W/2), la
    // otra mitad queda fuera de esta cancha a propósito (la dibuja pizarra.js).
    assert.ok(W / 2 - circuloCentral.r >= -0.01 && W / 2 + circuloCentral.r <= W + 0.01);

    if (cancha === 'entera') {
      // El extremo reflejado (alto - y) tampoco se sale.
      dentro(zona.x, zona.x + zona.ancho, alto - (zona.y + zona.alto), alto - zona.y);
      dentro(aro.cx - aro.r, aro.cx + aro.r, alto - (aro.cy + aro.r), alto - (aro.cy - aro.r));
    }
  }
});

test('las rectas del triple tocan el arco', () => {
  const { triple, aro } = formasDeUnExtremo();
  const RADIO_TRIPLE_PX = 6.75 * 20;
  cerca(distancia({ x: triple.rectaIzq.x, y: triple.rectaIzq.y2 }, { x: aro.cx, y: aro.cy }), RADIO_TRIPLE_PX);
  cerca(distancia({ x: triple.rectaDer.x, y: triple.rectaDer.y2 }, { x: aro.cx, y: aro.cy }), RADIO_TRIPLE_PX);
  assert.deepEqual(triple.arco.desde, { x: triple.rectaIzq.x, y: triple.rectaIzq.y2 });
  assert.deepEqual(triple.arco.hasta, { x: triple.rectaDer.x, y: triple.rectaDer.y2 });
});

test('AROS coincide con el aro dibujado', () => {
  const { aro } = formasDeUnExtremo();
  for (const cancha of ['media', 'entera']) {
    cerca(AROS[cancha].y * altoDe(cancha), aro.cy);
    cerca(AROS[cancha].x * W, aro.cx);
  }
});

test('altoDe cae en media con una cancha desconocida', () => {
  assert.equal(altoDe('desconocida'), ALTO.media);
  assert.equal(altoDe(undefined), ALTO.media);
});
