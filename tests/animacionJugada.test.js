import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AROS, puntoEnTrazo, trazoSvg, estadoEn,
} from '../src/data/animacionJugada.js';
import { estadoAlInicioDelPaso } from '../src/data/jugadas.js';

const cerca = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
const igualPunto = (p, q) => { cerca(p.x, q.x); cerca(p.y, q.y); };

const jugada = () => ({
  cancha: 'media',
  fichas: [
    { id: 'a1', tipo: 'ataque', numero: 1, x: 0.5, y: 0.8 },
    { id: 'a2', tipo: 'ataque', numero: 2, x: 0.2, y: 0.6 },
  ],
  pelota: 'a1',
  pasos: [
    { acciones: [
      { tipo: 'corte', ficha: 'a2', hasta: { x: 0.4, y: 0.4 } },
      { tipo: 'pase', ficha: 'a1', a: 'a2' },
    ], nota: '' },
    { acciones: [{ tipo: 'tiro', ficha: 'a2' }], nota: '' },
    { acciones: [], nota: '' },
  ],
});

test('recta sin punto de control', () => {
  igualPunto(puntoEnTrazo({ x: 0, y: 0 }, { x: 1, y: 0.5 }, null, 0.5), { x: 0.5, y: 0.25 });
  assert.equal(trazoSvg({ x: 0, y: 0 }, { x: 1, y: 0.5 }, null, 'corte'), 'M 0 0 L 1 0.5');
});

test('curva pasa por el punto medio esperado', () => {
  // B(0.5) = 0.25·P0 + 0.5·C + 0.25·P2
  igualPunto(puntoEnTrazo({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }, 0.5), { x: 0.5, y: 0.5 });
  assert.equal(trazoSvg({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }, 'pase'), 'M 0 0 Q 0.5 1 1 0');
});

test('t=0 coincide con el inicio del paso', () => {
  const d = jugada();
  for (let k = 0; k < d.pasos.length; k++) {
    const inicio = estadoAlInicioDelPaso(d, k);
    const en0 = estadoEn(d, k, 0);
    for (const [id, p] of inicio.posiciones) igualPunto(en0.posiciones.get(id), p);
  }
  igualPunto(estadoEn(d, 0, 0).pelotaEn, { x: 0.5, y: 0.8 });
});

test('t=1 coincide con el paso siguiente', () => {
  const d = jugada();
  for (let k = 0; k < d.pasos.length; k++) {
    const siguiente = estadoAlInicioDelPaso(d, k + 1);
    const en1 = estadoEn(d, k, 1);
    for (const [id, p] of siguiente.posiciones) igualPunto(en1.posiciones.get(id), p);
  }
});

test('la pelota viaja entre pasador y receptor', () => {
  const d = jugada();
  // a1 queda quieto en (0.5, 0.8); a2 va de (0.2, 0.6) a (0.4, 0.4).
  const a2EnMedio = { x: 0.3, y: 0.5 };
  igualPunto(estadoEn(d, 0, 0.5).posiciones.get('a2'), a2EnMedio);
  igualPunto(estadoEn(d, 0, 0.5).pelotaEn, { x: (0.5 + 0.3) / 2, y: (0.8 + 0.5) / 2 });
  igualPunto(estadoEn(d, 0, 1).pelotaEn, { x: 0.4, y: 0.4 });
});

test('el tiro va al aro de media cancha', () => {
  const d = jugada();
  igualPunto(estadoEn(d, 1, 1).pelotaEn, AROS.media);
  // Ya tirada, la pelota se queda en el aro en los pasos siguientes.
  igualPunto(estadoEn(d, 2, 0.5).pelotaEn, AROS.media);
});

test('trazo de dribbling es zigzag', () => {
  const d = trazoSvg({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, null, 'dribbling');
  const puntos = [...d.matchAll(/[ML] ([\d.-]+) ([\d.-]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  assert.ok(puntos.length >= 6);
  assert.deepEqual(puntos[0], { x: 0, y: 0.5 });
  assert.deepEqual(puntos.at(-1), { x: 1, y: 0.5 });
  const lados = puntos.slice(1, -1).map((p) => Math.sign(p.y - 0.5));
  assert.ok(lados.every((s) => s !== 0));
  assert.ok(lados.every((s, i) => i === 0 || s !== lados[i - 1]), 'alterna de lado en cada diente');
});

test('ajuste interpola igual que corte (recta sin control)', () => {
  const base = jugada();
  const conCorte = { ...base, pasos: [{ acciones: [{ tipo: 'corte', ficha: 'a2', hasta: { x: 0.4, y: 0.4 } }], nota: '' }] };
  const conAjuste = { ...base, pasos: [{ acciones: [{ tipo: 'ajuste', ficha: 'a2', hasta: { x: 0.4, y: 0.4 } }], nota: '' }] };
  igualPunto(estadoEn(conAjuste, 0, 0.5).posiciones.get('a2'), estadoEn(conCorte, 0, 0.5).posiciones.get('a2'));
  igualPunto(estadoEn(conAjuste, 0, 1).posiciones.get('a2'), { x: 0.4, y: 0.4 });
});

test('t se recorta a 0–1', () => {
  igualPunto(puntoEnTrazo({ x: 0, y: 0 }, { x: 1, y: 1 }, null, -3), { x: 0, y: 0 });
  igualPunto(puntoEnTrazo({ x: 0, y: 0 }, { x: 1, y: 1 }, null, 7), { x: 1, y: 1 });
  const d = jugada();
  igualPunto(estadoEn(d, 0, 9).posiciones.get('a2'), { x: 0.4, y: 0.4 });
});
