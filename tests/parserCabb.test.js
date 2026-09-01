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
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { parsearPartidoCabb } from '../src/parser/parserCabb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (nombre) => readFileSync(path.join(__dirname, 'fixtures', nombre));

const ARCHIVOS = [
  'estadisticaPartido_2026105023.xlsx',
  'estadisticaPartido_2026105329.xlsx',
  'DOC-20260901-WA0002.xlsx',
  'estadisticaPartido_2026105541sub17.xlsx',
];

const FIXTURES_DISPONIBLES = ARCHIVOS.every((archivo) => existsSync(path.join(__dirname, 'fixtures', archivo)));
const SKIP_SIN_FIXTURES = { skip: !FIXTURES_DISPONIBLES && 'tests/fixtures/*.xlsx no están presentes (excluidos deliberadamente del repo — ver PARSER.md)' };

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

test('los 4 archivos reales parsean sin errores', SKIP_SIN_FIXTURES, () => {
  for (const archivo of ARCHIVOS) {
    const resultado = parsearPartidoCabb(fixture(archivo), archivo);
    assert.deepStrictEqual(resultado.errores, [], `${archivo}: ${JSON.stringify(resultado.errores)}`);
  }
});

test('cada archivo detecta exactamente 2 equipos', SKIP_SIN_FIXTURES, () => {
  for (const archivo of ARCHIVOS) {
    const resultado = parsearPartidoCabb(fixture(archivo), archivo);
    assert.strictEqual(resultado.equipos.length, 2, archivo);
  }
});

test('el título del partido se propaga igual que parsearTitulo en los 4 archivos', SKIP_SIN_FIXTURES, () => {
  const esperado = {
    'estadisticaPartido_2026105023.xlsx': { local: 'MUNICIPALIDAD DE PUERTO SAN MARTIN', visitante: 'NEWELLS OLD BOYS', categoria: 'U21M' },
    'estadisticaPartido_2026105329.xlsx': { local: 'NEWELLS OLD BOYS', visitante: 'UNION Y PROGRESO', categoria: 'U21M' },
    'DOC-20260901-WA0002.xlsx': { local: 'NEWELLS OLD BOYS', visitante: "ATLANTIC SPORTSMEN CLUB 'B'", categoria: 'U21M' },
    'estadisticaPartido_2026105541sub17.xlsx': { local: 'TALLERES ARROYO SECO', visitante: 'NEWELLS OLD BOYS', categoria: 'U17M' },
  };
  for (const archivo of ARCHIVOS) {
    const resultado = parsearPartidoCabb(fixture(archivo), archivo);
    assert.strictEqual(resultado.partido.local, esperado[archivo].local, archivo);
    assert.strictEqual(resultado.partido.visitante, esperado[archivo].visitante, archivo);
    assert.strictEqual(resultado.partido.categoria, esperado[archivo].categoria, archivo);
    assert.strictEqual(resultado.partido.competencia, 'ARBB FORMATIVAS MASCULINO 2026', archivo);
    assert.strictEqual(resultado.partido.anio, 2026, archivo);
  }
});

test('el matcheo por nombre une el plantel de Newells a través de 3 partidos U21M', SKIP_SIN_FIXTURES, () => {
  const archivosU21M = [
    'estadisticaPartido_2026105023.xlsx',
    'estadisticaPartido_2026105329.xlsx',
    'DOC-20260901-WA0002.xlsx',
  ];
  const clavesPorPartido = archivosU21M.map((archivo) => {
    const resultado = parsearPartidoCabb(fixture(archivo), archivo);
    const equipoNewells = resultado.equipos.find((e) => e.nombre === 'NEWELLS OLD BOYS');
    assert.ok(equipoNewells, archivo);
    return equipoNewells.jugadores.map((j) => j.nombreClave);
  });
  for (const claves of clavesPorPartido) {
    assert.ok(claves.length <= 12, `no debería haber más de 12 jugadores por partido (hay ${claves.length})`);
  }
  const union = new Set(clavesPorPartido.flat());
  assert.strictEqual(union.size, 13);
});

test('un jugador que cambió de número de camiseta mantiene el mismo nombreClave', SKIP_SIN_FIXTURES, () => {
  const casos = [
    { archivo: 'DOC-20260901-WA0002.xlsx', numeroEsperado: '16' },
    { archivo: 'estadisticaPartido_2026105023.xlsx', numeroEsperado: '15' },
    { archivo: 'estadisticaPartido_2026105329.xlsx', numeroEsperado: '10' },
  ];
  for (const { archivo, numeroEsperado } of casos) {
    const resultado = parsearPartidoCabb(fixture(archivo), archivo);
    const equipoNewells = resultado.equipos.find((e) => e.nombre === 'NEWELLS OLD BOYS');
    const jugador = equipoNewells.jugadores.find((j) => j.nombreClave === 'PALUMBO BAUTISTA');
    assert.ok(jugador, archivo);
    assert.strictEqual(jugador.numero, numeroEsperado, archivo);
  }
});

test('idPartidoCabb sólo matchea el patrón real de la CABB, nunca basura de WhatsApp', SKIP_SIN_FIXTURES, () => {
  const cabb = parsearPartidoCabb(fixture('estadisticaPartido_2026105023.xlsx'), 'estadisticaPartido_2026105023.xlsx');
  assert.strictEqual(cabb.origen.idPartidoCabb, '2026105023');

  const whatsapp = parsearPartidoCabb(fixture('DOC-20260901-WA0002.xlsx'), 'DOC-20260901-WA0002.xlsx');
  assert.strictEqual(whatsapp.origen.idPartidoCabb, null);
  assert.notStrictEqual(whatsapp.origen.idPartidoCabb, cabb.origen.idPartidoCabb);

  const sub17 = parsearPartidoCabb(fixture('estadisticaPartido_2026105541sub17.xlsx'), 'estadisticaPartido_2026105541sub17.xlsx');
  assert.strictEqual(sub17.origen.idPartidoCabb, '2026105541');
});

test('nunca lanza excepción con un archivo vacío', () => {
  assert.doesNotThrow(() => {
    const resultado = parsearPartidoCabb(new ArrayBuffer(0), 'vacio.xlsx');
    assert.ok(resultado.errores.length > 0);
  });
});

test('nunca lanza excepción con un xlsx que no es de la CABB', () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['hola', 'mundo']]);
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  assert.doesNotThrow(() => {
    const resultado = parsearPartidoCabb(buffer, 'otro.xlsx');
    assert.strictEqual(resultado.equipos.length, 0);
    assert.ok(resultado.errores.length > 0);
  });
});

test('cuando falta la fila TOTALES de un bloque, el bloque no invade al siguiente equipo', () => {
  const headerRow = ['Num.', 'Nombre', 'MIN', 'PTS', 'A/I', '%', 'A/I', '%', 'A/I', '%', 'DEF', 'OF', 'Tot.', 'AST', 'REC', 'PER', 'TC', 'TR', 'FC', 'FR', 'VAL', '+/-'];
  const agrupadoresRow = ['', '', '', '', 'TC 2P', '', 'TC 3P', '', 'TL'];
  const aoa = [
    ["Estadísticas - TEAM A vs TEAM B - CAT - COMP - X - CABB - 2026"],
    [],
    ['TEAM A'],
    agrupadoresRow,
    headerRow,
    ['4', 'PEREZ, JUAN', '10:00', '5', '2/4', '50', '0/1', '0', '1/2', '50', '1', '1', '2', '1', '0', '0', '0', '0', '1', '1', '5', '2'],
    ['5', 'GOMEZ, LUIS', '8:00', '3', '1/2', '50', '0/0', '0', '1/1', '100', '0', '1', '1', '0', '1', '0', '0', '0', '0', '0', '3', '1'],
    // la fila TOTALES del equipo A falta a propósito: el bloque de TEAM B arranca inmediatamente
    ['TEAM B'],
    agrupadoresRow,
    headerRow,
    ['7', 'LOPEZ, ANA', '6:00', '2', '1/1', '100', '0/0', '0', '0/0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '2', '0'],
    ['', 'TOTALES', '6:00', '2', '1/1', '100', '0/0', '0', '0/0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '2', '0'],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Estadísticas - Test');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const resultado = parsearPartidoCabb(buffer, 'sinTotales.xlsx');

  const equipoA = resultado.equipos.find((e) => e.nombre === 'TEAM A');
  assert.ok(equipoA, 'debería encontrar el equipo TEAM A');
  assert.strictEqual(equipoA.totales, null);
  assert.deepStrictEqual(equipoA.jugadores.map((j) => j.nombreClave), ['PEREZ JUAN', 'GOMEZ LUIS']);

  const advertenciaSinTotales = resultado.advertencias.find((a) => a.mensaje.includes('SIN_TOTALES'));
  assert.ok(advertenciaSinTotales, `se esperaba una advertencia SIN_TOTALES: ${JSON.stringify(resultado.advertencias)}`);
});

test('cuando falta el nombre del segundo equipo, no se cuela un número de jugador ni el nombre del bloque anterior', () => {
  const headerRow = ['Num.', 'Nombre', 'MIN', 'PTS', 'A/I', '%', 'A/I', '%', 'A/I', '%', 'DEF', 'OF', 'Tot.', 'AST', 'REC', 'PER', 'TC', 'TR', 'FC', 'FR', 'VAL', '+/-'];
  const agrupadoresRow = ['', '', '', '', 'TC 2P', '', 'TC 3P', '', 'TL'];
  const aoa = [
    ["Estadísticas - TEAM A vs TEAM B - CAT - COMP - X - CABB - 2026"],
    [],
    ['TEAM A'],
    agrupadoresRow,
    headerRow,
    // TEAM A no tiene jugadores: TOTALES llega justo después del header
    ['', 'TOTALES', '0:00', '0', '0/0', '0', '0/0', '0', '0/0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0'],
    // la fila con el nombre de TEAM B falta a propósito: el bloque arranca directo en agrupadores+header
    agrupadoresRow,
    headerRow,
    ['7', 'LOPEZ, ANA', '6:00', '2', '1/1', '100', '0/0', '0', '0/0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '2', '0'],
    ['', 'TOTALES', '6:00', '2', '1/1', '100', '0/0', '0', '0/0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '2', '0'],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Estadísticas - Test');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const resultado = parsearPartidoCabb(buffer, 'sinNombreEquipo.xlsx');

  assert.strictEqual(resultado.equipos.length, 2);
  const equipoB = resultado.equipos[1];
  assert.strictEqual(equipoB.condicion, 'visitante');
  assert.strictEqual(equipoB.nombre, null, 'no debería colarse un número de jugador ni el nombre de TEAM A');
  assert.strictEqual(equipoB.filaNombre, null);
  assert.deepStrictEqual(equipoB.jugadores.map((j) => j.nombreClave), ['LOPEZ ANA']);

  const advertenciaSinNombre = resultado.advertencias.find((a) => a.mensaje.includes('SIN_NOMBRE_EQUIPO'));
  assert.ok(advertenciaSinNombre, `se esperaba una advertencia SIN_NOMBRE_EQUIPO: ${JSON.stringify(resultado.advertencias)}`);
});
