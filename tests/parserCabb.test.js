import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  limpiarNombre,
  clavearNombre,
  parsearFraccion,
  parsearEntero,
  parsearMinutos,
  parsearTitulo,
} from '../src/parser/parserCabb.js';

test('limpiarNombre limpia los casos sucios reales', () => {
  const casos = [
    ['SAGRA HASSEN,  JUAN IGNACIO', 'SAGRA HASSEN, JUAN IGNACIO', 'SAGRA HASSEN JUAN IGNACIO'],
    ['MUSSA,  RAMIRO', 'MUSSA, RAMIRO', 'MUSSA RAMIRO'],
    ['GIMÉNEZ , DAVID', 'GIMÉNEZ, DAVID', 'GIMENEZ DAVID'],
    ['NUÑEZ , IGNACIO', 'NUÑEZ, IGNACIO', 'NUNEZ IGNACIO'],
    ['DEMARCHI , MÁXIMO ANDRES', 'DEMARCHI, MÁXIMO ANDRES', 'DEMARCHI MAXIMO ANDRES'],
    ['TODESCHINI, , BAUTISTA', 'TODESCHINI, BAUTISTA', 'TODESCHINI BAUTISTA'],
    ['GUERRERO, TOMAS ', 'GUERRERO, TOMAS', 'GUERRERO TOMAS'],
    ['MILONE DELMENICO, VALENTINO ', 'MILONE DELMENICO, VALENTINO', 'MILONE DELMENICO VALENTINO'],
  ];
  for (const [crudo, limpioEsperado, claveEsperada] of casos) {
    const limpio = limpiarNombre(crudo);
    assert.strictEqual(limpio, limpioEsperado, crudo);
    assert.strictEqual(clavearNombre(limpio), claveEsperada, crudo);
  }
});

test('parsearFraccion parsea fracciones y rechaza vacíos', () => {
  assert.deepStrictEqual(parsearFraccion('7/14'), { anotados: 7, intentados: 14 });
  assert.deepStrictEqual(parsearFraccion('0/0'), { anotados: 0, intentados: 0 });
  assert.strictEqual(parsearFraccion(''), null);
});

test('parsearEntero conserva negativos y rechaza vacíos', () => {
  assert.strictEqual(parsearEntero('-3'), -3);
  assert.strictEqual(parsearEntero('5'), 5);
  assert.strictEqual(parsearEntero(''), null);
});

test('parsearMinutos convierte mm:ss a segundos', () => {
  assert.strictEqual(parsearMinutos('24:23'), 1463);
  assert.strictEqual(parsearMinutos('00:00'), 0);
});

test('parsearTitulo descompone los 4 títulos reales', () => {
  const casos = [
    {
      titulo: "Estadísticas - MUNICIPALIDAD DE PUERTO SAN MARTIN vs NEWELLS OLD BOYS - U21M - ARBB FORMATIVAS MASCULINO 2026 - CABB - 2026",
      local: 'MUNICIPALIDAD DE PUERTO SAN MARTIN',
      visitante: 'NEWELLS OLD BOYS',
      categoria: 'U21M',
    },
    {
      titulo: "Estadísticas - NEWELLS OLD BOYS vs ATLANTIC SPORTSMEN CLUB 'B' - U21M - ARBB FORMATIVAS MASCULINO 2026 - CABB - 2026",
      local: 'NEWELLS OLD BOYS',
      visitante: "ATLANTIC SPORTSMEN CLUB 'B'",
      categoria: 'U21M',
    },
    {
      titulo: "Estadísticas - TALLERES ARROYO SECO vs NEWELLS OLD BOYS - U17M - ARBB FORMATIVAS MASCULINO 2026 - CABB - 2026",
      local: 'TALLERES ARROYO SECO',
      visitante: 'NEWELLS OLD BOYS',
      categoria: 'U17M',
    },
  ];
  for (const caso of casos) {
    const resultado = parsearTitulo(caso.titulo);
    assert.strictEqual(resultado.error, null, caso.titulo);
    assert.strictEqual(resultado.local, caso.local, caso.titulo);
    assert.strictEqual(resultado.visitante, caso.visitante, caso.titulo);
    assert.strictEqual(resultado.categoria, caso.categoria, caso.titulo);
    assert.strictEqual(resultado.competencia, 'ARBB FORMATIVAS MASCULINO 2026', caso.titulo);
    assert.strictEqual(resultado.anio, 2026, caso.titulo);
  }
});

test('parsearTitulo devuelve error en un título no reconocible', () => {
  const resultado = parsearTitulo('esto no es un título de la CABB');
  assert.ok(resultado.error);
  assert.strictEqual(resultado.local, null);
  assert.strictEqual(resultado.visitante, null);
});
