import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoEjercicioEn, totalFases, esFaseDeRotacion } from '../src/data/animacionEjercicio.js';
import { estadoAlInicioEjercicio, validarEjercicio } from '../src/data/pizarraEjercicio.js';
import { AROS } from '../src/data/animacionJugada.js';

const cerca = (a, b) => Math.abs(a - b) < 1e-9;
const igual = (p, q) => assert.ok(cerca(p.x, q.x) && cerca(p.y, q.y), `${JSON.stringify(p)} != ${JSON.stringify(q)}`);

// Fila que tira, fila que rebota, un entrenador con otra pelota; después rota.
const ejercicio = () => ({
  modo: 'ejercicio',
  cancha: 'media',
  fichas: [
    { id: 'tiro', tipo: 'fila', cantidad: 4, x: 0.3, y: 0.7 },
    { id: 'reb', tipo: 'fila', cantidad: 3, x: 0.7, y: 0.7 },
    { id: 'c', tipo: 'entrenador', x: 0.5, y: 0.3 },
    { id: 'p', tipo: 'ataque', x: 0.2, y: 0.3 },
  ],
  pelotas: ['tiro', 'c'],
  pasos: [
    { acciones: [{ tipo: 'corte', ficha: 'reb', hasta: { x: 0.6, y: 0.5 } }, { tipo: 'tiro', ficha: 'tiro' }, { tipo: 'pase', ficha: 'c', a: 'p' }], nota: '' },
    { acciones: [{ tipo: 'rebote', ficha: 'reb' }], nota: '' },
  ],
  rotacion: [{ ficha: 'tiro', a: { x: 0.7, y: 0.7 } }],
});

test('la base del test es una pizarra válida', () => {
  assert.equal(validarEjercicio(ejercicio()).ok, true);
});

test('en t=0 coincide con el estado al inicio del paso, y en t=1 con el del paso siguiente', () => {
  const d = ejercicio();
  for (const k of [0, 1]) {
    const ini = estadoAlInicioEjercicio(d, k);
    const fin = estadoAlInicioEjercicio(d, k + 1);
    const a0 = estadoEjercicioEn(d, k, 0);
    const a1 = estadoEjercicioEn(d, k, 1);
    for (const [id, p] of ini.posiciones) igual(a0.posiciones.get(id), p);
    for (const [id, p] of fin.posiciones) igual(a1.posiciones.get(id), p);
    a1.pelotasEn.forEach((p, i) => {
      const dueno = fin.pelotas[i];
      igual(p, dueno === null ? AROS.media : fin.posiciones.get(dueno));
    });
  }
});

test('cada pelota va por su lado: una al aro, la otra con el pase', () => {
  const d = ejercicio();
  const mitad = estadoEjercicioEn(d, 0, 0.5);
  assert.equal(mitad.pelotasEn.length, 2);
  const [tirada, pasada] = mitad.pelotasEn;
  igual(tirada, { x: (0.3 + AROS.media.x) / 2, y: (0.7 + AROS.media.y) / 2 });
  igual(pasada, { x: (0.5 + 0.2) / 2, y: 0.3 });
});

test('la pelota suelta espera en el aro y el rebote la lleva hasta quien la agarra', () => {
  const d = ejercicio();
  igual(estadoEjercicioEn(d, 1, 0).pelotasEn[0], AROS.media);
  const mitad = estadoEjercicioEn(d, 1, 0.5).pelotasEn[0];
  const reb = estadoAlInicioEjercicio(d, 1).posiciones.get('reb');
  igual(mitad, { x: (AROS.media.x + reb.x) / 2, y: (AROS.media.y + reb.y) / 2 });
  igual(estadoEjercicioEn(d, 1, 1).pelotasEn[0], reb);
});

test('la fase de rotación mueve a quien rota y arrastra su pelota', () => {
  const d = ejercicio();
  assert.equal(totalFases(d), 3);
  assert.equal(esFaseDeRotacion(d, 2), true);
  assert.equal(esFaseDeRotacion(d, 1), false);
  const fin = estadoAlInicioEjercicio(d, 2);
  const mitad = estadoEjercicioEn(d, 2, 0.5);
  igual(mitad.posiciones.get('tiro'), { x: (0.3 + 0.7) / 2, y: 0.7 });
  igual(mitad.posiciones.get('c'), fin.posiciones.get('c'));
  igual(estadoEjercicioEn(d, 2, 1).posiciones.get('tiro'), { x: 0.7, y: 0.7 });
});

test('sin rotación no hay fase extra', () => {
  const d = { ...ejercicio(), rotacion: [] };
  assert.equal(totalFases(d), 2);
  assert.equal(esFaseDeRotacion(d, 2), false);
});

test('t se recorta a 0–1', () => {
  const d = ejercicio();
  igual(estadoEjercicioEn(d, 0, 7).posiciones.get('reb'), { x: 0.6, y: 0.5 });
  igual(estadoEjercicioEn(d, 0, -3).posiciones.get('reb'), { x: 0.7, y: 0.7 });
});
