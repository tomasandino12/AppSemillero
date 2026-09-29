import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPES_EJERCICIO, ejercicioVacio, validarEjercicio, estadoAlInicioEjercicio, esEjercicio,
  agregarFichaEjercicio, quitarFichaEjercicio, alternarPelota, fijarCantidadDeFila, fijarRotacion, quitarRotacion,
} from '../src/data/pizarraEjercicio.js';
import {
  validarJugada, estadoAlInicioDelPaso, aplicarAccion, ajustarFicha, agregarPaso,
} from '../src/data/jugadas.js';
import { LIMITE } from '../src/data/limites.js';

// Entrada en dos filas: la del tiro (con pelota) y la del rebote.
const base = () => ({
  ...ejercicioVacio('media'),
  fichas: [
    { id: 'tiro', tipo: 'fila', cantidad: 4, x: 0.3, y: 0.7 },
    { id: 'reb', tipo: 'fila', cantidad: 3, x: 0.7, y: 0.7 },
    { id: 'c', tipo: 'entrenador', x: 0.5, y: 0.3 },
  ],
  pelotas: ['tiro'],
});
const conPasos = (...pasos) => ({ ...base(), pasos: pasos.map((acciones) => ({ acciones, nota: '' })) });
const hayError = (datos, patron) => {
  const r = validarEjercicio(datos);
  assert.equal(r.ok, false, 'tendría que ser inválida');
  assert.ok(r.errores.some((e) => patron.test(e)), r.errores.join(' | '));
};

test('valida una pizarra mínima y la base', () => {
  assert.deepEqual(validarEjercicio(ejercicioVacio('entera')), { ok: true, errores: [] });
  assert.deepEqual(validarEjercicio(base()), { ok: true, errores: [] });
  assert.equal(esEjercicio(base()), true);
});

test('nunca lanza, aunque le pasen cualquier cosa', () => {
  for (const x of [null, undefined, 5, 'x', [], {}]) assert.equal(validarEjercicio(x).ok, false);
});

test('exige el modo, las pelotas y la cancha', () => {
  hayError({ ...base(), modo: 'jugada' }, /no es de un ejercicio/);
  hayError({ ...base(), pelotas: undefined }, /Faltan las pelotas/);
  hayError({ ...base(), cancha: 'x' }, /cancha/);
});

test('una fila es de 2 a 9 chicos', () => {
  for (const cantidad of [1, 10, 2.5, undefined]) {
    const d = base();
    d.fichas[0].cantidad = cantidad;
    hayError(d, /fila tiene que ser de 2 a 9/);
  }
  const d = base();
  d.fichas[0].cantidad = 9;
  assert.equal(validarEjercicio(d).ok, true);
});

test('el número de atacante y defensor es opcional, pero si viene tiene rango y no se repite', () => {
  const d = base();
  d.fichas.push({ id: 'a', tipo: 'ataque', x: 0.4, y: 0.5 }, { id: 'd', tipo: 'defensa', x: 0.5, y: 0.5 });
  assert.equal(validarEjercicio(d).ok, true);
  d.fichas.push({ id: 'a2', tipo: 'ataque', numero: 9, x: 0.4, y: 0.5 });
  hayError(d, /tiene que ser del 1 al 5/);
  d.fichas.pop();
  d.fichas.push({ id: 'a3', tipo: 'ataque', numero: 2, x: 0.4, y: 0.5 }, { id: 'a4', tipo: 'ataque', numero: 2, x: 0.4, y: 0.5 });
  hayError(d, /dos atacantes con el número 2/);
});

test('la pelota es de una ficha que existe y que puede tenerla', () => {
  hayError({ ...base(), pelotas: ['nadie'] }, /no existe/);
  const d = base();
  d.fichas.push({ id: 'd', tipo: 'defensa', x: 0.5, y: 0.5 });
  hayError({ ...d, pelotas: ['d'] }, /pueden tener la pelota/);
  hayError({ ...d, pelotas: ['tiro', 'tiro'] }, /dos pelotas/);
  assert.equal(validarEjercicio({ ...d, pelotas: ['tiro', 'reb', 'c'] }).ok, true, 'varias pelotas a la vez');
});

test('tiro deja la pelota suelta y el rebote, en un paso siguiente, se la da a otra fila', () => {
  const d = conPasos([{ tipo: 'tiro', ficha: 'tiro' }], [{ tipo: 'rebote', ficha: 'reb' }]);
  assert.equal(validarEjercicio(d).ok, true);
  assert.deepEqual(estadoAlInicioEjercicio(d, 0).pelotas, ['tiro']);
  assert.deepEqual(estadoAlInicioEjercicio(d, 1).pelotas, [null]);
  assert.deepEqual(estadoAlInicioEjercicio(d, 2).pelotas, ['reb']);
});

test('un rebote necesita una pelota suelta al empezar el paso', () => {
  hayError(conPasos([{ tipo: 'rebote', ficha: 'reb' }]), /rebote sin una pelota suelta/);
  // En el mismo paso del tiro todavía no está suelta: todo pasa a la vez.
  hayError(conPasos([{ tipo: 'tiro', ficha: 'tiro' }, { tipo: 'rebote', ficha: 'reb' }]), /rebote sin una pelota suelta/);
  hayError(conPasos([{ tipo: 'tiro', ficha: 'tiro' }], [{ tipo: 'rebote', ficha: 'reb' }, { tipo: 'rebote', ficha: 'c' }]), /rebote sin una pelota suelta/);
});

test('sólo quien tiene una pelota pasa, tira o pica, y una sola vez por paso', () => {
  hayError(conPasos([{ tipo: 'tiro', ficha: 'reb' }]), /no tiene una pelota/);
  hayError(conPasos([{ tipo: 'pase', ficha: 'c', a: 'reb' }]), /no tiene una pelota/);
  hayError(conPasos([{ tipo: 'pase', ficha: 'tiro', a: 'c' }, { tipo: 'tiro', ficha: 'tiro' }]), /se usa dos veces/);
});

test('el pase mueve la pelota; el receptor tiene que poder tenerla y no ser el mismo', () => {
  const d = conPasos([{ tipo: 'pase', ficha: 'tiro', a: 'c' }]);
  assert.equal(validarEjercicio(d).ok, true);
  assert.deepEqual(estadoAlInicioEjercicio(d, 1).pelotas, ['c']);
  hayError(conPasos([{ tipo: 'pase', ficha: 'tiro', a: 'tiro' }]), /a sí mismo/);
  hayError(conPasos([{ tipo: 'pase', ficha: 'tiro', a: 'nadie' }]), /no existe/);
  const conDefensa = conPasos([{ tipo: 'pase', ficha: 'tiro', a: 'd' }]);
  conDefensa.fichas.push({ id: 'd', tipo: 'defensa', x: 0.5, y: 0.5 });
  hayError(conDefensa, /pueden recibir la pelota/);
});

test('estrella de pases: varios pases a la vez y hasta un intercambio, pero nadie suma dos pelotas', () => {
  const dos = { ...base(), pelotas: ['tiro', 'reb'] };
  const cruce = { ...dos, pasos: [{ acciones: [{ tipo: 'pase', ficha: 'tiro', a: 'reb' }, { tipo: 'pase', ficha: 'reb', a: 'tiro' }], nota: '' }] };
  assert.equal(validarEjercicio(cruce).ok, true);
  assert.deepEqual(estadoAlInicioEjercicio(cruce, 1).pelotas, ['reb', 'tiro']);

  const tres = { ...dos, pasos: [{ acciones: [{ tipo: 'pase', ficha: 'tiro', a: 'c' }, { tipo: 'pase', ficha: 'reb', a: 'c' }], nota: '' }] };
  hayError(tres, /recibe dos pelotas/);
  const conMia = { ...dos, pasos: [{ acciones: [{ tipo: 'pase', ficha: 'tiro', a: 'reb' }], nota: '' }] };
  hayError(conMia, /recibe una pelota y ya tiene otra/);
});

test('el que pica se queda con su pelota', () => {
  const d = conPasos([{ tipo: 'dribbling', ficha: 'tiro', hasta: { x: 0.5, y: 0.4 } }]);
  assert.equal(validarEjercicio(d).ok, true);
  assert.deepEqual(estadoAlInicioEjercicio(d, 1).pelotas, ['tiro']);
  assert.deepEqual(estadoAlInicioEjercicio(d, 1).posiciones.get('tiro'), { x: 0.5, y: 0.4 });
});

test('la rotación tiene fichas existentes, una vez cada una y destino dentro de la cancha', () => {
  assert.equal(validarEjercicio({ ...base(), rotacion: [{ ficha: 'tiro', a: { x: 0.7, y: 0.7 } }] }).ok, true);
  hayError({ ...base(), rotacion: [{ ficha: 'nadie', a: { x: 0.5, y: 0.5 } }] }, /ficha que no existe/);
  hayError({ ...base(), rotacion: [{ ficha: 'tiro', a: { x: 0.5, y: 0.5 } }, { ficha: 'tiro', a: { x: 0.6, y: 0.5 } }] }, /rota dos veces/);
  hayError({ ...base(), rotacion: [{ ficha: 'tiro', a: { x: 9, y: 0.5 } }] }, /fuera de la cancha/);
  assert.equal(validarEjercicio({ ...base(), rotacion: undefined }).ok, true, 'sin rotación también vale');
});

test('respeta los topes de fichas, pasos y notas', () => {
  const muchas = base();
  for (let i = 0; i < TOPES_EJERCICIO.fichas; i++) muchas.fichas.push({ id: `k${i}`, tipo: 'cono', x: 0.5, y: 0.5 });
  hayError(muchas, /Máximo 16 fichas/);
  hayError({ ...base(), pasos: Array.from({ length: TOPES_EJERCICIO.pasos + 1 }, () => ({ acciones: [], nota: '' })) }, /Máximo 30 pasos/);
  hayError({ ...base(), pasos: [{ acciones: [], nota: 'x'.repeat(LIMITE.notaPaso + 1) }] }, /nota del paso 1/);
  assert.equal(validarEjercicio({ ...base(), pasos: [{ acciones: [], nota: 'x'.repeat(LIMITE.notaPaso) }] }).ok, true);
});

test('quitar una ficha se lleva sus acciones, su pelota y su rotación', () => {
  const d = {
    ...conPasos([{ tipo: 'pase', ficha: 'tiro', a: 'c' }]),
    rotacion: [{ ficha: 'c', a: { x: 0.5, y: 0.5 } }, { ficha: 'reb', a: { x: 0.3, y: 0.7 } }],
  };
  const sin = quitarFichaEjercicio(d, 'c');
  assert.deepEqual(sin.pasos[0].acciones, []);
  assert.deepEqual(sin.rotacion.map((r) => r.ficha), ['reb']);
  const sinLaDeLaPelota = quitarFichaEjercicio(base(), 'tiro');
  assert.deepEqual(sinLaDeLaPelota.pelotas, []);
  assert.equal(base().fichas.length, 3, 'no toca el original');
});

test('quitar al dueño de la pelota avisa si un paso siguiente dependía de ella', () => {
  const d = conPasos([{ tipo: 'pase', ficha: 'tiro', a: 'c' }], [{ tipo: 'tiro', ficha: 'c' }]);
  assert.throws(() => quitarFichaEjercicio(d, 'tiro'), /no tiene una pelota/);
});

test('alternar la pelota la da, la saca y rechaza a quien no puede tenerla', () => {
  const d = base();
  d.fichas.push({ id: 'd', tipo: 'defensa', x: 0.5, y: 0.5 });
  assert.deepEqual(alternarPelota(d, 'reb').pelotas, ['tiro', 'reb']);
  assert.deepEqual(alternarPelota(d, 'tiro').pelotas, []);
  assert.throws(() => alternarPelota(d, 'd'), /pueden tener la pelota/);
  assert.throws(() => alternarPelota(conPasos([{ tipo: 'tiro', ficha: 'tiro' }]), 'tiro'), /no tiene una pelota/);
});

test('cantidad de la fila: rango, y sólo en filas', () => {
  assert.equal(fijarCantidadDeFila(base(), 'tiro', 6).fichas[0].cantidad, 6);
  assert.throws(() => fijarCantidadDeFila(base(), 'tiro', 12), /de 2 a 9/);
  assert.throws(() => fijarCantidadDeFila(base(), 'c', 3), /no es una fila/);
});

test('la rotación de una ficha se reemplaza, no se duplica, y se puede quitar', () => {
  const uno = fijarRotacion(base(), 'tiro', { x: 0.7, y: 0.7 });
  const dos = fijarRotacion(uno, 'tiro', { x: 0.5, y: 0.5 });
  assert.equal(dos.rotacion.length, 1);
  assert.deepEqual(dos.rotacion[0].a, { x: 0.5, y: 0.5 });
  assert.deepEqual(quitarRotacion(dos, 0).rotacion, []);
  assert.throws(() => quitarRotacion(dos, 3), /no existe/);
  assert.throws(() => fijarRotacion(base(), 'nadie', { x: 0.5, y: 0.5 }), /no existe/);
});

test('agregar una ficha valida (tope) y no toca el original', () => {
  const d = base();
  const con = agregarFichaEjercicio(d, { id: 'k', tipo: 'cono', x: 0.5, y: 0.5 });
  assert.equal(con.fichas.length, 4);
  assert.equal(d.fichas.length, 3);
  assert.throws(() => agregarFichaEjercicio(d, { id: 'x', tipo: 'fila', x: 0.5, y: 0.5 }), /fila tiene que ser/);
});

test('jugadas.js despacha a este módulo: validarJugada y estadoAlInicioDelPaso sirven para las dos', () => {
  const d = conPasos([{ tipo: 'tiro', ficha: 'tiro' }]);
  assert.deepEqual(validarJugada(d), validarEjercicio(d));
  assert.deepEqual(estadoAlInicioDelPaso(d, 1).pelotas, [null]);
  // Las mutaciones genéricas de jugadas.js validan con las reglas del ejercicio.
  assert.equal(aplicarAccion(d, 0, { tipo: 'corte', ficha: 'reb', hasta: { x: 0.5, y: 0.5 } }).pasos[0].acciones.length, 2);
  assert.throws(() => aplicarAccion(d, 0, { tipo: 'rebote', ficha: 'reb' }), /rebote sin una pelota suelta/);
  const paso2 = agregarPaso(d);
  assert.deepEqual(ajustarFicha(paso2, 1, 'reb', 0.6, 0.6).pasos[1].acciones, [{ tipo: 'ajuste', ficha: 'reb', hasta: { x: 0.6, y: 0.6 } }]);
});
