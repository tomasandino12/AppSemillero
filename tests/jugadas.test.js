import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPES, jugadaVacia, validarJugada, estadoAlInicioDelPaso, aplicarAccion,
  duplicarDatos, pantallaAptaParaEditar, diferenciaDeAsignacion,
} from '../src/data/jugadas.js';
import { LIMITE } from '../src/data/limites.js';

const base = () => ({
  cancha: 'media',
  fichas: [
    { id: 'a1', tipo: 'ataque', numero: 1, x: 0.5, y: 0.8 },
    { id: 'a2', tipo: 'ataque', numero: 2, x: 0.2, y: 0.6 },
    { id: 'd1', tipo: 'defensa', numero: 1, x: 0.5, y: 0.5 },
  ],
  pelota: 'a1',
  pasos: [],
});
const conPaso = (acciones, extra = {}) => ({ ...base(), pasos: [{ acciones, nota: '' }], ...extra });
const hayError = (datos, patron) => {
  const r = validarJugada(datos);
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => patron.test(e)), r.errores.join(' | '));
};

test('valida una jugada mínima', () => {
  assert.deepEqual(validarJugada(jugadaVacia('entera')), { ok: true, errores: [] });
  const r = validarJugada(conPaso([{ tipo: 'pase', ficha: 'a1', a: 'a2' }]));
  assert.deepEqual(r, { ok: true, errores: [] });
});

test('rechaza ids duplicados', () => {
  const d = base();
  d.fichas.push({ id: 'a1', tipo: 'cono', x: 0.1, y: 0.1 });
  hayError(d, /repetida/);
});

test('rechaza coordenadas fuera de rango', () => {
  const d = base();
  d.fichas[0].x = 1.2;
  hayError(d, /fuera de la cancha/);
  hayError(conPaso([{ tipo: 'corte', ficha: 'a2', hasta: { x: 0.5, y: -0.1 } }]), /fuera de la cancha/);
  hayError(conPaso([{ tipo: 'corte', ficha: 'a2', hasta: { x: 0.5, y: 0.5 }, control: { x: 2, y: 0 } }]), /control/);
});

test('rechaza pase de quien no tiene la pelota', () => {
  hayError(conPaso([{ tipo: 'pase', ficha: 'a2', a: 'a1' }]), /no tiene la pelota/);
  hayError(conPaso([{ tipo: 'dribbling', ficha: 'a2', hasta: { x: 0.3, y: 0.3 } }]), /no tiene la pelota/);
  hayError(conPaso([{ tipo: 'pase', ficha: 'a1', a: 'a1' }]), /a sí mismo/);
  hayError({ ...base(), pelota: 'd1' }, /atacante/);
  hayError(conPaso([{ tipo: 'pase', ficha: 'a1', a: 'd1' }]), /atacante puede recibir/);
  hayError(conPaso([{ tipo: 'tiro', ficha: 'a2' }]), /no tiene la pelota/);
});

test('rechaza dos movimientos de la misma ficha en un paso', () => {
  hayError(conPaso([
    { tipo: 'corte', ficha: 'a2', hasta: { x: 0.3, y: 0.3 } },
    { tipo: 'cortina', ficha: 'a2', hasta: { x: 0.4, y: 0.4 } },
  ]), /se mueve dos veces/);
  hayError(conPaso([{ tipo: 'corte', ficha: 'fantasma', hasta: { x: 0.3, y: 0.3 } }]), /no existe/);
});

test('rechaza topes excedidos', () => {
  const muchasFichas = base();
  for (let i = 0; i < TOPES.fichas; i++) muchasFichas.fichas.push({ id: `c${i}`, tipo: 'cono', x: 0.1, y: 0.1 });
  hayError(muchasFichas, /fichas/);

  const muchosPasos = base();
  muchosPasos.pasos = Array.from({ length: TOPES.pasos + 1 }, () => ({ acciones: [], nota: '' }));
  hayError(muchosPasos, /pasos/);

  const muchasAcciones = conPaso(Array.from({ length: TOPES.accionesPorPaso + 1 }, () => (
    { tipo: 'cortina', ficha: 'a2', hasta: { x: 0.3, y: 0.3 } })));
  hayError(muchasAcciones, /acciones por paso/);
});

test('rechaza nota larga', () => {
  const d = conPaso([]);
  d.pasos[0].nota = 'x'.repeat(LIMITE.notaPaso);
  assert.equal(validarJugada(d).ok, true);
  d.pasos[0].nota += 'x';
  hayError(d, /nota/);
  hayError({ ...base(), cancha: 'playa' }, /cancha/);
});

test('el estado del paso k acumula movimientos', () => {
  const d = base();
  d.pasos = [
    { acciones: [{ tipo: 'corte', ficha: 'a2', hasta: { x: 0.3, y: 0.3 } }], nota: '' },
    { acciones: [{ tipo: 'dribbling', ficha: 'a1', hasta: { x: 0.6, y: 0.4 } }], nota: '' },
  ];
  assert.deepEqual(estadoAlInicioDelPaso(d, 0).posiciones.get('a2'), { x: 0.2, y: 0.6 });
  assert.deepEqual(estadoAlInicioDelPaso(d, 1).posiciones.get('a2'), { x: 0.3, y: 0.3 });
  assert.deepEqual(estadoAlInicioDelPaso(d, 1).posiciones.get('a1'), { x: 0.5, y: 0.8 });
  assert.deepEqual(estadoAlInicioDelPaso(d, 2).posiciones.get('a1'), { x: 0.6, y: 0.4 });
});

test('el pase transfiere la pelota', () => {
  const d = conPaso([{ tipo: 'pase', ficha: 'a1', a: 'a2' }]);
  assert.equal(estadoAlInicioDelPaso(d, 0).pelota, 'a1');
  assert.equal(estadoAlInicioDelPaso(d, 1).pelota, 'a2');
  const h = conPaso([{ tipo: 'handoff', ficha: 'a1', a: 'a2' }]);
  assert.equal(estadoAlInicioDelPaso(h, 1).pelota, 'a2');
});

test('el tiro deja la pelota sin dueño', () => {
  const d = conPaso([{ tipo: 'tiro', ficha: 'a1' }]);
  assert.equal(estadoAlInicioDelPaso(d, 1).pelota, null);
});

test('aplicarAccion es inmutable', () => {
  const d = conPaso([]);
  const congelado = JSON.stringify(d);
  const nuevo = aplicarAccion(d, 0, { tipo: 'corte', ficha: 'a2', hasta: { x: 0.3, y: 0.3 } });
  assert.equal(JSON.stringify(d), congelado);
  assert.equal(nuevo.pasos[0].acciones.length, 1);
  assert.throws(() => aplicarAccion(d, 0, { tipo: 'pase', ficha: 'a2', a: 'a1' }), /no tiene la pelota/);
  assert.throws(() => aplicarAccion(d, 3, { tipo: 'tiro', ficha: 'a1' }), /no existe/);
  assert.notEqual(duplicarDatos(d), d);
  assert.deepEqual(duplicarDatos(d), d);
});

test('pantallaAptaParaEditar usa el lado corto', () => {
  assert.equal(pantallaAptaParaEditar(1280, 800), true);
  assert.equal(pantallaAptaParaEditar(768, 1024), true);
  assert.equal(pantallaAptaParaEditar(375, 812), false);
  assert.equal(pantallaAptaParaEditar(1000, 599), false);
});

test('asignacion calcula altas y bajas', () => {
  assert.deepEqual(diferenciaDeAsignacion(['p1', 'p2'], ['p2', 'p3']), { altas: ['p3'], bajas: ['p1'] });
  assert.deepEqual(diferenciaDeAsignacion([], ['p1']), { altas: ['p1'], bajas: [] });
  assert.deepEqual(diferenciaDeAsignacion(['p1'], []), { altas: [], bajas: ['p1'] });
  assert.deepEqual(diferenciaDeAsignacion(['p1'], ['p1']), { altas: [], bajas: [] });
});
