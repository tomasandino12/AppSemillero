import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapearImportacion,
  distanciaLevenshtein,
  calcularHashArchivo,
  esDuplicado,
} from '../src/data/mapearImportacion.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearPartidoCabb } from '../src/parser/parserCabb.js';

function jugadorFicticio({ numero, nombreClave, nombreLimpio, pts = 10 }) {
  const [apellido, nombre] = nombreLimpio.split(',').map((s) => s.trim());
  return {
    fila: 1,
    numero,
    nombreCrudo: nombreLimpio,
    nombreLimpio,
    apellido,
    nombre: nombre ?? '',
    nombreClave,
    min: { texto: '10:00', segundos: 600 },
    pts,
    dos: { anotados: 1, intentados: 2, porcentaje: 50 },
    tres: { anotados: 0, intentados: 1, porcentaje: 0 },
    libres: { anotados: 2, intentados: 2, porcentaje: 100 },
    reb: { def: 1, of: 1, tot: 2 },
    ast: 1,
    rec: 1,
    per: 1,
    tap: { cometidos: 0, recibidos: 0 },
    fal: { cometidas: 1, recibidas: 1 },
    val: 5,
    masMenos: 2,
  };
}

function resultadoParserFicticio({
  localJugadores,
  visitanteJugadores,
  localTotales = { pts: 50 },
  visitanteTotales = { pts: 40 },
  localNombre = 'LOCAL FC',
  visitanteNombre = 'VISITANTE FC',
}) {
  return {
    errores: [],
    equipos: [
      { condicion: 'local', nombre: localNombre, filaNombre: 1, jugadores: localJugadores, totales: localTotales },
      { condicion: 'visitante', nombre: visitanteNombre, filaNombre: 1, jugadores: visitanteJugadores, totales: visitanteTotales },
    ],
  };
}

test('condicionPropia inválida devuelve error, no adivina', () => {
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [], visitanteJugadores: [] }),
    { condicionPropia: 'rival' },
    [],
  );
  assert.ok(r.error);
  assert.strictEqual(r.partido, null);
  assert.deepStrictEqual(r.estadisticas, []);
});

test('nombreClave duplicado en el archivo devuelve error, no adivina', () => {
  const jA = jugadorFicticio({ numero: '4', nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN' });
  const jB = jugadorFicticio({ numero: '9', nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [jA, jB], visitanteJugadores: [] }),
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    [],
  );
  assert.ok(r.error);
  assert.ok(r.error.includes('PEREZ JUAN'), 'el error debe nombrar el nombreClave duplicado');
  assert.strictEqual(r.partido, null);
  assert.deepStrictEqual(r.estadisticas, []);
  assert.deepStrictEqual(r.jugadoresNuevos, []);
  assert.deepStrictEqual(r.jugadoresCoincidentes, []);
  assert.deepStrictEqual(r.sugerencias, []);
});

test('contexto sin fecha devuelve error, no adivina', () => {
  const archivoJ = jugadorFicticio({ numero: '10', nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [archivoJ], visitanteJugadores: [] }),
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'p1', temporadaId: 't1' },
    [],
  );
  assert.ok(r.error);
  assert.ok(r.error.includes('fecha'), 'el error debe nombrar el campo faltante');
  assert.strictEqual(r.partido, null);
  assert.deepStrictEqual(r.estadisticas, []);
  assert.deepStrictEqual(r.jugadoresNuevos, []);
  assert.deepStrictEqual(r.jugadoresCoincidentes, []);
  assert.deepStrictEqual(r.sugerencias, []);
});

test('resultadoParser con errores no se mapea', () => {
  const resultado = resultadoParserFicticio({ localJugadores: [], visitanteJugadores: [] });
  resultado.errores = [{ fila: null, campo: null, mensaje: '[TITULO_INVALIDO] x' }];
  const r = mapearImportacion(
    resultado,
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    [],
  );
  assert.ok(r.error);
});

test('condicionPropia "visitante" no devuelve ni un jugador del bloque local', () => {
  const localJ = jugadorFicticio({ numero: '4', nombreClave: 'PEREZ LOCAL', nombreLimpio: 'PEREZ, LOCAL' });
  const visJ = jugadorFicticio({ numero: '5', nombreClave: 'GOMEZ VISITA', nombreLimpio: 'GOMEZ, VISITA' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [localJ], visitanteJugadores: [visJ] }),
    { condicionPropia: 'visitante', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    [],
  );
  assert.strictEqual(r.error, null);
  const clavesDevueltas = [
    ...r.estadisticas.map((e) => e.nombreClave),
    ...r.jugadoresNuevos.map((j) => j.nombreClave),
    ...r.jugadoresCoincidentes.map((j) => j.nombreClave),
    ...r.sugerencias.map((s) => s.nombreClave),
  ];
  assert.ok(!clavesDevueltas.includes('PEREZ LOCAL'), 'no debería aparecer ningún dato del jugador local');
  assert.ok(clavesDevueltas.includes('GOMEZ VISITA'));
  assert.strictEqual(r.partido.rivalNombre, 'LOCAL FC');
  assert.strictEqual(r.partido.puntosPropios, 40);
  assert.strictEqual(r.partido.puntosRival, 50);
});

test('jugador existente en el club pero no en el plantel importado: requierePertenenciaNueva, no jugadorNuevo (caso U17 -> U21)', () => {
  const jugadoresExistentes = [
    { id: 'jugador-1', nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN', plantelesActuales: ['plantel-u17'] },
  ];
  const archivoJ = jugadorFicticio({ numero: '10', nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [archivoJ], visitanteJugadores: [] }),
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'plantel-u21', temporadaId: 't1', fecha: '2026-05-01' },
    jugadoresExistentes,
  );
  assert.strictEqual(r.jugadoresNuevos.length, 0, 'NO debe aparecer como jugador nuevo');
  assert.strictEqual(r.jugadoresCoincidentes.length, 1);
  assert.strictEqual(r.jugadoresCoincidentes[0].jugadorId, 'jugador-1');
  assert.strictEqual(r.jugadoresCoincidentes[0].requierePertenenciaNueva, true);
  assert.deepStrictEqual(r.jugadoresCoincidentes[0].pertenenciaPropuesta, {
    plantelId: 'plantel-u21',
    temporadaId: 't1',
    desde: '2026-05-01',
  });
  assert.strictEqual(r.estadisticas[0].jugadorId, 'jugador-1');
});

test('jugador existente y ya en el plantel importado: requierePertenenciaNueva es false, sin propuesta', () => {
  const jugadoresExistentes = [
    { id: 'jugador-1', nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN', plantelesActuales: ['plantel-u21'] },
  ];
  const archivoJ = jugadorFicticio({ numero: '10', nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [archivoJ], visitanteJugadores: [] }),
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'plantel-u21', temporadaId: 't1', fecha: '2026-05-01' },
    jugadoresExistentes,
  );
  assert.strictEqual(r.jugadoresCoincidentes[0].requierePertenenciaNueva, false);
  assert.ok(!('pertenenciaPropuesta' in r.jugadoresCoincidentes[0]));
});

test('sin coincidencia alguna: jugadorNuevo, nunca se crea solo', () => {
  const archivoJ = jugadorFicticio({ numero: '99', nombreClave: 'ZZZZZ COMPLETAMENTE NUEVO', nombreLimpio: 'ZZZZZ, COMPLETAMENTE NUEVO' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [archivoJ], visitanteJugadores: [] }),
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    [],
  );
  assert.strictEqual(r.jugadoresNuevos.length, 1);
  assert.strictEqual(r.jugadoresNuevos[0].nombreClave, 'ZZZZZ COMPLETAMENTE NUEVO');
  assert.deepStrictEqual(r.jugadoresNuevos[0].pertenenciaPropuesta, { plantelId: 'p1', temporadaId: 't1', desde: '2026-05-01' });
  assert.strictEqual(r.jugadoresCoincidentes.length, 0);
  assert.strictEqual(r.sugerencias.length, 0);
  assert.strictEqual(r.estadisticas[0].jugadorId, null);
});

test('distanciaLevenshtein cuenta ediciones de a un caracter', () => {
  assert.strictEqual(distanciaLevenshtein('FERNANDEZ MARTIN', 'FERNANDEZ MARTIN'), 0);
  assert.strictEqual(distanciaLevenshtein('FERNANDEZ MARTIN', 'FERNANDEZ MARTIM'), 1);
});

test('coincidencia parcial por distancia <= 2 se devuelve como sugerencia, nunca se resuelve sola', () => {
  const jugadoresExistentes = [
    { id: 'jugador-2', nombreClave: 'FERNANDEZ MARTIN', nombreLimpio: 'FERNANDEZ, MARTIN', plantelesActuales: [] },
  ];
  const archivoJ = jugadorFicticio({ numero: '7', nombreClave: 'FERNANDEZ MARTIM', nombreLimpio: 'FERNANDEZ, MARTIM' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [archivoJ], visitanteJugadores: [] }),
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    jugadoresExistentes,
  );
  assert.strictEqual(r.sugerencias.length, 1);
  assert.strictEqual(r.sugerencias[0].candidato.jugadorId, 'jugador-2');
  assert.strictEqual(r.jugadoresNuevos.length, 0);
  assert.strictEqual(r.jugadoresCoincidentes.length, 0);
  assert.strictEqual(r.estadisticas[0].jugadorId, null, 'no se resuelve sola');
});

test('mismo apellido con nombre distinto se devuelve como sugerencia aunque la distancia total sea grande', () => {
  const jugadoresExistentes = [
    { id: 'jugador-3', nombreClave: 'GONZALEZ TOMAS', nombreLimpio: 'GONZALEZ, TOMAS', plantelesActuales: [] },
  ];
  const archivoJ = jugadorFicticio({ numero: '8', nombreClave: 'GONZALEZ FRANCISCO', nombreLimpio: 'GONZALEZ, FRANCISCO' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [archivoJ], visitanteJugadores: [] }),
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    jugadoresExistentes,
  );
  assert.strictEqual(r.sugerencias.length, 1);
});

test('calcularHashArchivo: dos "archivos" con los mismos bytes y nombres distintos dan el mismo hash', async () => {
  const bytesOriginal = Buffer.from('contenido-de-un-xlsx-de-mentira');
  const bytesRenombrado = Buffer.from('contenido-de-un-xlsx-de-mentira');
  const hash1 = await calcularHashArchivo(bytesOriginal);
  const hash2 = await calcularHashArchivo(bytesRenombrado);
  assert.strictEqual(hash1, hash2);
  assert.strictEqual(esDuplicado(hash2, [hash1]), true);
  assert.strictEqual(esDuplicado('otro-hash-cualquiera', [hash1]), false);
});

test('calcularHashArchivo: contenidos distintos dan hashes distintos', async () => {
  const hashA = await calcularHashArchivo(Buffer.from('contenido A'));
  const hashB = await calcularHashArchivo(Buffer.from('contenido B'));
  assert.notStrictEqual(hashA, hashB);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('integración: la salida real del parser sobre partido_ok.xlsx se mapea sin error', () => {
  const datos = readFileSync(path.join(__dirname, 'fixtures', 'sintetico', 'partido_ok.xlsx'));
  const resultadoParser = parsearPartidoCabb(datos, 'partido_ok.xlsx');
  assert.deepStrictEqual(resultadoParser.errores, []);

  const r = mapearImportacion(
    resultadoParser,
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    [],
  );
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.partido.rivalNombre, 'EQUIPO SINTÉTICO B');
  assert.strictEqual(r.partido.puntosPropios, 24);
  assert.strictEqual(r.partido.puntosRival, 23);
  assert.strictEqual(r.estadisticas.length, 3);
  assert.strictEqual(r.jugadoresNuevos.length, 3, 'club vacío: los 3 jugadores propios son nuevos');
});
