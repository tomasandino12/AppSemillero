import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararPayloadImportacion } from '../src/data/prepararPayloadImportacion.js';

function metricasFicticias() {
  return {
    numero: '10', nombreCrudo: 'X, Y', nombreLimpio: 'X, Y',
    minSegundos: 600, pts: 10,
    dosAnotados: 1, dosIntentados: 2, dosPorcentaje: 50,
    tresAnotados: 0, tresIntentados: 1, tresPorcentaje: 0,
    libresAnotados: 2, libresIntentados: 2, libresPorcentaje: 100,
    rebDef: 1, rebOf: 1, rebTot: 2,
    ast: 1, rec: 1, per: 1,
    tapCometidos: 0, tapRecibidos: 0, falCometidas: 1, falRecibidas: 1,
    val: 5, masMenos: 2,
  };
}

function resultadoMapeoBase() {
  return {
    error: null,
    partido: {
      clubId: 'club-1', plantelId: 'plantel-u21', fecha: '2026-05-01',
      condicionPropia: 'local', rivalNombre: 'RIVAL FC', puntosPropios: 50, puntosRival: 40,
    },
    estadisticas: [],
    jugadoresNuevos: [],
    jugadoresCoincidentes: [],
    sugerencias: [],
  };
}

const CONTEXTO = {
  temporadaId: 'temporada-1',
  hashArchivo: 'hash-abc',
  idPartidoCabb: '2026105023',
  nombreArchivo: 'archivo.xlsx',
  advertencias: [],
};

test('mapeo con error no se puede preparar', () => {
  const r = prepararPayloadImportacion({ error: 'algo falló' }, [], { sugerencias: {}, nuevosExcluidos: [] }, CONTEXTO);
  assert.ok(r.error);
  assert.strictEqual(r.payload, null);
});

test('sugerencia sin decisión: error, no arma payload', () => {
  const resultadoMapeo = resultadoMapeoBase();
  resultadoMapeo.sugerencias = [{
    nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN',
    candidato: { jugadorId: 'j-existente', nombreClave: 'PEREZ JUAN M', nombreLimpio: 'PEREZ, JUAN M' },
    razon: 'nombre_similar',
  }];
  const r = prepararPayloadImportacion(resultadoMapeo, [], { sugerencias: {}, nuevosExcluidos: [] }, CONTEXTO);
  assert.ok(r.error);
  assert.match(r.error, /PEREZ JUAN/);
  assert.strictEqual(r.payload, null);
});

test('sugerencia decidida "otro": pasa a jugadoresNuevos con pertenenciaPropuesta, estadisticas.jugadorId sigue null', () => {
  const resultadoMapeo = resultadoMapeoBase();
  resultadoMapeo.sugerencias = [{
    nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN',
    candidato: { jugadorId: 'j-existente', nombreClave: 'PEREZ JUAN M', nombreLimpio: 'PEREZ, JUAN M' },
    razon: 'nombre_similar',
  }];
  resultadoMapeo.estadisticas = [{ ...metricasFicticias(), nombreClave: 'PEREZ JUAN', jugadorId: null }];
  const decisiones = { sugerencias: { 'PEREZ JUAN': 'otro' }, nuevosExcluidos: [] };
  const r = prepararPayloadImportacion(resultadoMapeo, [], decisiones, CONTEXTO);
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.payload.jugadoresNuevos.length, 1);
  assert.strictEqual(r.payload.jugadoresNuevos[0].nombreClave, 'PEREZ JUAN');
  assert.deepStrictEqual(r.payload.jugadoresNuevos[0].pertenenciaPropuesta, {
    plantelId: 'plantel-u21', temporadaId: 'temporada-1', desde: '2026-05-01',
  });
  assert.strictEqual(r.payload.estadisticas[0].jugadorId, null);
});

test('sugerencia decidida "mismo", candidato ya en el plantel destino: sin pertenencia nueva, estadisticas resuelto', () => {
  const resultadoMapeo = resultadoMapeoBase();
  resultadoMapeo.sugerencias = [{
    nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN',
    candidato: { jugadorId: 'j-existente', nombreClave: 'PEREZ JUAN M', nombreLimpio: 'PEREZ, JUAN M' },
    razon: 'nombre_similar',
  }];
  resultadoMapeo.estadisticas = [{ ...metricasFicticias(), nombreClave: 'PEREZ JUAN', jugadorId: null }];
  const jugadoresExistentes = [{ id: 'j-existente', nombreClave: 'PEREZ JUAN M', nombreLimpio: 'PEREZ, JUAN M', plantelesActuales: ['plantel-u21'] }];
  const decisiones = { sugerencias: { 'PEREZ JUAN': 'mismo' }, nuevosExcluidos: [] };
  const r = prepararPayloadImportacion(resultadoMapeo, jugadoresExistentes, decisiones, CONTEXTO);
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.payload.pertenenciasNuevas.length, 0);
  assert.strictEqual(r.payload.estadisticas[0].jugadorId, 'j-existente');
  assert.strictEqual(r.payload.jugadoresNuevos.length, 0);
});

test('sugerencia decidida "mismo", candidato en otro plantel: pertenencia nueva propuesta', () => {
  const resultadoMapeo = resultadoMapeoBase();
  resultadoMapeo.sugerencias = [{
    nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN',
    candidato: { jugadorId: 'j-existente', nombreClave: 'PEREZ JUAN M', nombreLimpio: 'PEREZ, JUAN M' },
    razon: 'nombre_similar',
  }];
  resultadoMapeo.estadisticas = [{ ...metricasFicticias(), nombreClave: 'PEREZ JUAN', jugadorId: null }];
  const jugadoresExistentes = [{ id: 'j-existente', nombreClave: 'PEREZ JUAN M', nombreLimpio: 'PEREZ, JUAN M', plantelesActuales: ['plantel-u17'] }];
  const decisiones = { sugerencias: { 'PEREZ JUAN': 'mismo' }, nuevosExcluidos: [] };
  const r = prepararPayloadImportacion(resultadoMapeo, jugadoresExistentes, decisiones, CONTEXTO);
  assert.strictEqual(r.error, null);
  assert.deepStrictEqual(r.payload.pertenenciasNuevas, [
    { jugadorId: 'j-existente', plantelId: 'plantel-u21', temporadaId: 'temporada-1', desde: '2026-05-01' },
  ]);
  assert.strictEqual(r.payload.estadisticas[0].jugadorId, 'j-existente');
});

test('nuevosExcluidos saca al jugador de jugadoresNuevos y de estadisticas', () => {
  const resultadoMapeo = resultadoMapeoBase();
  resultadoMapeo.jugadoresNuevos = [{
    nombreClave: 'GOMEZ LUIS', nombreLimpio: 'GOMEZ, LUIS', nombreCrudo: 'GOMEZ, LUIS',
    pertenenciaPropuesta: { plantelId: 'plantel-u21', temporadaId: 'temporada-1', desde: '2026-05-01' },
  }];
  resultadoMapeo.estadisticas = [{ ...metricasFicticias(), nombreClave: 'GOMEZ LUIS', jugadorId: null }];
  const decisiones = { sugerencias: {}, nuevosExcluidos: ['GOMEZ LUIS'] };
  const r = prepararPayloadImportacion(resultadoMapeo, [], decisiones, CONTEXTO);
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.payload.jugadoresNuevos.length, 0);
  assert.strictEqual(r.payload.estadisticas.length, 0);
});

test('coincidente con requierePertenenciaNueva pasa a pertenenciasNuevas', () => {
  const resultadoMapeo = resultadoMapeoBase();
  resultadoMapeo.jugadoresCoincidentes = [{
    jugadorId: 'j-1', nombreClave: 'PEREZ JUAN', requierePertenenciaNueva: true,
    pertenenciaPropuesta: { plantelId: 'plantel-u21', temporadaId: 'temporada-1', desde: '2026-05-01' },
  }];
  resultadoMapeo.estadisticas = [{ ...metricasFicticias(), nombreClave: 'PEREZ JUAN', jugadorId: 'j-1' }];
  const r = prepararPayloadImportacion(resultadoMapeo, [], { sugerencias: {}, nuevosExcluidos: [] }, CONTEXTO);
  assert.strictEqual(r.error, null);
  assert.deepStrictEqual(r.payload.pertenenciasNuevas, [
    { jugadorId: 'j-1', plantelId: 'plantel-u21', temporadaId: 'temporada-1', desde: '2026-05-01' },
  ]);
});

test('caso feliz: arma el payload completo con los metadatos del archivo', () => {
  const resultadoMapeo = resultadoMapeoBase();
  const r = prepararPayloadImportacion(resultadoMapeo, [], { sugerencias: {}, nuevosExcluidos: [] }, CONTEXTO);
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.payload.clubId, 'club-1');
  assert.strictEqual(r.payload.hashArchivo, 'hash-abc');
  assert.strictEqual(r.payload.idPartidoCabb, '2026105023');
  assert.strictEqual(r.payload.nombreArchivo, 'archivo.xlsx');
  assert.deepStrictEqual(r.payload.partido, resultadoMapeo.partido);
});
