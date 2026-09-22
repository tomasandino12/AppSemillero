import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPES, jugadaVacia, validarJugada, estadoAlInicioDelPaso, aplicarAccion,
  duplicarDatos, pantallaAptaParaEditar, diferenciaDeAsignacion, etiquetaDeTipo, nosotrosDefiende,
  proximoNumeroLibre, agregarFicha, quitarFicha, moverFicha, quitarAccion,
  fijarControlDeAccion, agregarPaso, quitarPaso, fijarNotaDePaso, ajustarFicha, resumenDePaso,
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

test('etiquetaDeTipo devuelve la etiqueta o el valor crudo', () => {
  assert.equal(etiquetaDeTipo('ataque'), 'Ataque');
  assert.equal(etiquetaDeTipo('lateral'), 'Salida de lateral');
  assert.equal(etiquetaDeTipo('inventado'), 'inventado');
  assert.equal(etiquetaDeTipo(null), '');
});

test('nosotrosDefiende sólo en Presión y Defensa', () => {
  assert.equal(nosotrosDefiende('presion'), true);
  assert.equal(nosotrosDefiende('defensa'), true);
  assert.equal(nosotrosDefiende('ataque'), false);
  assert.equal(nosotrosDefiende('lateral'), false);
  assert.equal(nosotrosDefiende('otro'), false);
});

test('proximoNumeroLibre da el más bajo libre y null si están los cinco', () => {
  const d = base(); // ataque 1 y 2 usados, defensa 1 usado
  assert.equal(proximoNumeroLibre(d, 'ataque'), 3);
  assert.equal(proximoNumeroLibre(d, 'defensa'), 2);
  for (let n = 1; n <= 5; n++) if (n !== 1 && n !== 2) d.fichas.push({ id: `a${n}`, tipo: 'ataque', numero: n, x: 0.1, y: 0.1 });
  assert.equal(proximoNumeroLibre(d, 'ataque'), null);
});

test('agregarFicha suma sin mutar y respeta el tope', () => {
  const d = base();
  const nuevo = agregarFicha(d, { id: 'c1', tipo: 'cono', x: 0.1, y: 0.1 });
  assert.equal(d.fichas.length, 3);
  assert.equal(nuevo.fichas.length, 4);
  assert.throws(() => agregarFicha(nuevo, { id: 'c1', tipo: 'cono', x: 0.1, y: 0.1 }), /repetida/);

  const lleno = base();
  for (let i = lleno.fichas.length; i < TOPES.fichas; i++) lleno.fichas.push({ id: `x${i}`, tipo: 'cono', x: 0.1, y: 0.1 });
  assert.throws(() => agregarFicha(lleno, { id: 'de-mas', tipo: 'cono', x: 0.1, y: 0.1 }), /fichas/);
});

test('quitarFicha borra la ficha y las acciones que la nombraban', () => {
  const d = conPaso([
    { tipo: 'corte', ficha: 'd1', hasta: { x: 0.3, y: 0.3 } },
    { tipo: 'pase', ficha: 'a1', a: 'a2' },
  ]);
  const nuevo = quitarFicha(d, 'a2');
  assert.ok(!nuevo.fichas.some((f) => f.id === 'a2'));
  assert.deepEqual(nuevo.pasos[0].acciones, [{ tipo: 'corte', ficha: 'd1', hasta: { x: 0.3, y: 0.3 } }]);

  const conPelota = quitarFicha(base(), 'a1');
  assert.equal(conPelota.pelota, null);
});

test('moverFicha cambia sólo esa ficha', () => {
  const d = base();
  const nuevo = moverFicha(d, 'a2', 0.7, 0.7);
  assert.deepEqual(nuevo.fichas.find((f) => f.id === 'a2'), { id: 'a2', tipo: 'ataque', numero: 2, x: 0.7, y: 0.7 });
  assert.equal(d.fichas.find((f) => f.id === 'a2').x, 0.2);
  assert.throws(() => moverFicha(d, 'fantasma', 0.5, 0.5), /no existe/);
  assert.throws(() => moverFicha(d, 'a2', 2, 0.5), /fuera de la cancha/);
});

const dosPasos = (acciones0 = [], acciones1 = []) => ({
  ...base(), pasos: [{ acciones: acciones0, nota: '' }, { acciones: acciones1, nota: '' }],
});

test('ajustarFicha en paso 0 delega en moverFicha', () => {
  const d = base();
  assert.deepEqual(ajustarFicha(d, 0, 'a2', 0.7, 0.7), moverFicha(d, 'a2', 0.7, 0.7));
});

test('ajustarFicha sin movimiento crea un ajuste', () => {
  const d = dosPasos();
  const nuevo = ajustarFicha(d, 1, 'd1', 0.3, 0.3);
  assert.deepEqual(nuevo.pasos[1].acciones, [{ tipo: 'ajuste', ficha: 'd1', hasta: { x: 0.3, y: 0.3 } }]);
  assert.equal(d.pasos[1].acciones.length, 0);
});

test('ajustarFicha dos veces actualiza el mismo ajuste', () => {
  const d = dosPasos([], [{ tipo: 'ajuste', ficha: 'd1', hasta: { x: 0.2, y: 0.2 } }]);
  const nuevo = ajustarFicha(d, 1, 'd1', 0.35, 0.35);
  assert.equal(nuevo.pasos[1].acciones.length, 1);
  assert.deepEqual(nuevo.pasos[1].acciones[0], { tipo: 'ajuste', ficha: 'd1', hasta: { x: 0.35, y: 0.35 } });
});

test('ajustarFicha con corte en el paso mueve la punta del corte', () => {
  const d = dosPasos([], [{
    tipo: 'corte', ficha: 'd1', hasta: { x: 0.2, y: 0.2 }, control: { x: 0.25, y: 0.15 },
  }]);
  const nuevo = ajustarFicha(d, 1, 'd1', 0.35, 0.35);
  assert.equal(nuevo.pasos[1].acciones.length, 1, 'sigue siendo una sola acción, no una segunda que compita');
  assert.deepEqual(nuevo.pasos[1].acciones[0], {
    tipo: 'corte', ficha: 'd1', hasta: { x: 0.35, y: 0.35 }, control: { x: 0.25, y: 0.15 },
  });
});

test('quitarAccion saca sólo esa acción del paso', () => {
  const d = conPaso([
    { tipo: 'corte', ficha: 'a2', hasta: { x: 0.3, y: 0.3 } },
    { tipo: 'corte', ficha: 'd1', hasta: { x: 0.4, y: 0.4 } },
  ]);
  const nuevo = quitarAccion(d, 0, 0);
  assert.equal(nuevo.pasos[0].acciones.length, 1);
  assert.equal(nuevo.pasos[0].acciones[0].ficha, 'd1');
  assert.throws(() => quitarAccion(d, 5, 0), /no existe/);
});

test('fijarControlDeAccion ajusta la curva de una acción cargada', () => {
  const d = conPaso([{ tipo: 'corte', ficha: 'a2', hasta: { x: 0.3, y: 0.3 } }]);
  const nuevo = fijarControlDeAccion(d, 0, 0, { x: 0.4, y: 0.5 });
  assert.deepEqual(nuevo.pasos[0].acciones[0].control, { x: 0.4, y: 0.5 });
  assert.throws(() => fijarControlDeAccion(d, 0, 9, { x: 0.1, y: 0.1 }), /no existe/);
  assert.throws(() => fijarControlDeAccion(d, 0, 0, { x: 2, y: 0 }), /fuera de la cancha/);
});

test('agregarPaso y quitarPaso', () => {
  const d = conPaso([]);
  const conDos = agregarPaso(d);
  assert.equal(conDos.pasos.length, 2);
  assert.deepEqual(conDos.pasos[1], { acciones: [], nota: '' });
  assert.equal(quitarPaso(conDos, 0).pasos.length, 1);
  assert.throws(() => quitarPaso(d, 9), /no existe/);
});

test('fijarNotaDePaso guarda el texto del paso', () => {
  const d = conPaso([]);
  assert.equal(fijarNotaDePaso(d, 0, 'Pase y corte').pasos[0].nota, 'Pase y corte');
  assert.throws(() => fijarNotaDePaso(d, 0, 'x'.repeat(LIMITE.notaPaso + 1)), /nota/);
});

test('resumenDePaso usa la primera línea de la nota', () => {
  assert.deepEqual(resumenDePaso({ nota: 'Pase y corte\nDetalle que no importa acá' }, 1), { numero: 2, titulo: 'Pase y corte' });
});

test('resumenDePaso recorta notas largas con …', () => {
  const notaLarga = 'x'.repeat(60);
  const { titulo } = resumenDePaso({ nota: notaLarga }, 1);
  assert.equal(titulo, `${'x'.repeat(40)}…`);
});

test('resumenDePaso sin nota: formación inicial en el 0, sin indicaciones en el resto', () => {
  assert.deepEqual(resumenDePaso({ nota: '' }, 0), { numero: 1, titulo: 'Formación inicial' });
  assert.deepEqual(resumenDePaso({ nota: '' }, 2), { numero: 3, titulo: 'Sin indicaciones' });
  assert.deepEqual(resumenDePaso({ nota: '   ' }, 0), { numero: 1, titulo: 'Formación inicial' });
});
