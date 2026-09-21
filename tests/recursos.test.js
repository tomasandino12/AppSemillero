import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarMetadatos, contarPorTipo, filtrarPorTipo, claseDeEnlace, etiquetaDeTipo, alcanceDeRecurso, resumenDeImpacto, estadoDeEnvio, SIN_TIPO } from '../src/data/recursos.js';

test('valida frecuencia y minutos con decimalEstricto', () => {
  assert.deepEqual(validarMetadatos({ tipo: 'tiro', frecuenciaSemanal: '3', minutos: '20' }).valor, { tipo: 'tiro', frecuenciaSemanal: 3, minutos: 20 });
  for (const malo of ['1e1', '0', '8', '2,5', 'abc', '0x2']) {
    assert.ok(validarMetadatos({ frecuenciaSemanal: malo }).error, `frecuencia ${malo}`);
  }
  for (const malo of ['181', '0', '1e2', '-5']) {
    assert.ok(validarMetadatos({ minutos: malo }).error, `minutos ${malo}`);
  }
  assert.ok(validarMetadatos({ tipo: 'inventado' }).error);
});

test('vacío es null, no 0', () => {
  assert.deepEqual(validarMetadatos({ tipo: '', frecuenciaSemanal: '', minutos: '  ' }).valor, { tipo: null, frecuenciaSemanal: null, minutos: null });
  assert.deepEqual(validarMetadatos().valor, { tipo: null, frecuenciaSemanal: null, minutos: null });
});

const RECURSOS = [{ tipo: 'tiro' }, { tipo: 'tiro' }, { tipo: 'pies' }, { tipo: null }, {}];

test('cuenta por tipo incluyendo sin tipo', () => {
  const c = contarPorTipo(RECURSOS);
  assert.equal(c.todos, 5);
  assert.equal(c.tiro, 2);
  assert.equal(c.pies, 1);
  assert.equal(c.manejo, 0);
  assert.equal(c[SIN_TIPO], 2);
});

test('filtra por tipo, por sin tipo y sin filtro', () => {
  assert.equal(filtrarPorTipo(RECURSOS, 'tiro').length, 2);
  assert.equal(filtrarPorTipo(RECURSOS, SIN_TIPO).length, 2);
  assert.equal(filtrarPorTipo(RECURSOS, 'todos').length, 5);
  assert.equal(filtrarPorTipo(RECURSOS, '').length, 5);
});

test('clasifica links de YouTube, Drive y PDF', () => {
  assert.equal(claseDeEnlace('https://youtu.be/dQw4w9WgXcQ'), 'youtube');
  assert.equal(claseDeEnlace('https://drive.google.com/file/d/abc/view'), 'drive');
  assert.equal(claseDeEnlace('https://club.com/plan.PDF'), 'pdf');
  assert.equal(claseDeEnlace('https://ejemplo.com/nota'), 'otro');
  assert.equal(claseDeEnlace(''), null);
  assert.equal(claseDeEnlace(null), null);
});

test('etiqueta de tipo, null si no existe', () => {
  assert.equal(etiquetaDeTipo('fisico'), 'Físico');
  assert.equal(etiquetaDeTipo('x'), null);
});

test("sin jugadores con cuenta no calcula porcentaje (muestra 'sin datos')", () => {
  const sinCuentas = alcanceDeRecurso({ enviados: 5, conCuenta: 0, abrieron: 0 });
  assert.equal(sinCuentas.estado, 'sin-cuentas');
  assert.equal(sinCuentas.porcentaje, null);
  const pocos = alcanceDeRecurso({ enviados: 5, conCuenta: 2, abrieron: null });
  assert.equal(pocos.estado, 'pocos');
  assert.equal(pocos.porcentaje, null);
  assert.equal(alcanceDeRecurso(null).estado, 'sin-resumen');
  assert.equal(alcanceDeRecurso({ enviados: 0, conCuenta: 0, abrieron: null }).estado, 'sin-envios');
  assert.deepEqual(alcanceDeRecurso({ enviados: 6, conCuenta: 4, abrieron: 1 }), { estado: 'ok', enviados: 6, conCuenta: 4, abrieron: 1, porcentaje: 25 });
});

const fila = (recursoId, abrieron, este = 0, ant = 0) => ({ recursoId, enviados: 5, conCuenta: 5, abrieron, primerasEsteMes: este, primerasMesAnterior: ant });
const CATALOGO = [
  { id: 'a', titulo: 'Viejo', creadoEn: '2026-08-01T10:00:00Z' },
  { id: 'b', titulo: 'Nuevo', creadoEn: '2026-09-10T10:00:00Z' },
  { id: 'c', titulo: 'Poco abierto', creadoEn: '2026-09-15T10:00:00Z' },
];

test('el más abierto desempata por más reciente', () => {
  const r = resumenDeImpacto(CATALOGO, { conCuenta: 5, abrieronAlguno: 4, recursos: [fila('a', 3), fila('b', 3), fila('c', 1)] });
  assert.equal(r.masAbierto.recursoId, 'b');
  assert.equal(r.masAbierto.abrieron, 3);
  assert.equal(r.conCuenta, 5);
  assert.equal(r.abrieronAlguno, 4);
  assert.equal(r.ofrecidos, 3);
});

test('nadie abrió nada: no hay recurso más abierto', () => {
  const r = resumenDeImpacto(CATALOGO, { conCuenta: 5, abrieronAlguno: 0, recursos: [fila('a', 0), fila('b', 0)] });
  assert.equal(r.masAbierto, null);
});

test('tendencia null si no hay mes anterior', () => {
  const sinAnterior = resumenDeImpacto(CATALOGO, { conCuenta: 5, abrieronAlguno: 2, recursos: [fila('a', 2, 2, 0)] });
  assert.equal(sinAnterior.tendencia, null);
  const conAnterior = resumenDeImpacto(CATALOGO, { conCuenta: 5, abrieronAlguno: 4, recursos: [fila('a', 2, 3, 2), fila('b', 2, 1, 1)] });
  assert.deepEqual(conAnterior.tendencia, { esteMes: 4, mesAnterior: 3, delta: 1 });
  const pocos = resumenDeImpacto(CATALOGO, { conCuenta: 2, abrieronAlguno: null, recursos: [{ recursoId: 'a', enviados: 2, conCuenta: 2, abrieron: null, primerasEsteMes: null, primerasMesAnterior: null }] });
  assert.equal(pocos.tendencia, null);
  assert.equal(pocos.abrieronAlguno, null);
});

test('sin resumen el panel muestra sólo cuántos recursos hay', () => {
  assert.deepEqual(resumenDeImpacto(CATALOGO, null), { ofrecidos: 3, conCuenta: null, abrieronAlguno: null, masAbierto: null, tendencia: null });
});

const PLANTEL = [{ id: 'j1' }, { id: 'j2' }, { id: 'j3' }];

test('enviado a todo el plantel: nadie falta y no hay a quién ofrecerle de nuevo', () => {
  const e = estadoDeEnvio([{ jugadorId: 'j1', fecha: '2026-09-01' }, { jugadorId: 'j2', fecha: '2026-09-03' }, { jugadorId: 'j3', fecha: '2026-09-01' }], PLANTEL);
  assert.equal(e.estado, 'todos');
  assert.deepEqual(e.faltan, []);
  assert.equal(e.enviados, 3);
  assert.equal(e.ultimaFecha, '2026-09-03');
});

test('enviado a algunos: faltan los demás', () => {
  const e = estadoDeEnvio([{ jugadorId: 'j2', fecha: '2026-09-01' }], PLANTEL);
  assert.equal(e.estado, 'parcial');
  assert.deepEqual(e.faltan.map((j) => j.id), ['j1', 'j3']);
  assert.equal(e.total, 3);
});

test('los envíos a jugadores de otros planteles no cuentan en éste', () => {
  const e = estadoDeEnvio([{ jugadorId: 'otro', fecha: '2026-09-10' }], PLANTEL);
  assert.equal(e.estado, 'ninguno');
  assert.equal(e.enviados, 0);
  assert.equal(e.ultimaFecha, null);
  assert.equal(e.faltan.length, 3);
});

test('plantel sin jugadores: no hay estado de envío que mostrar', () => {
  assert.equal(estadoDeEnvio([], []).estado, 'sin-plantel');
});
