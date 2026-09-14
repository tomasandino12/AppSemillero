import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * El "ver detalle" es un componente y no un patrón que cada pantalla copia.
 * Dos implementaciones fue exactamente el problema: una quedó a medias y la
 * ficha del jugador mostraba el historial siempre desplegado, con el
 * encabezado "Práctica" repetido debajo de la leyenda del gráfico.
 */
const PANTALLAS = ['src/ui/pantallas/coordPanorama.js', 'src/ui/pantallas/fichaJugador.js'];

test('ninguna pantalla escribe su propio <details>', () => {
  const ofensores = PANTALLAS.filter((p) => /<details/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(ofensores, []);
});

test('las dos pantallas usan el componente compartido', () => {
  for (const p of PANTALLAS) {
    assert.match(readFileSync(p, 'utf8'), /detalleColapsableHtml/, `${p} no usa el componente`);
  }
});
