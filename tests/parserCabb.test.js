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
import { readFileSync } from 'node:fs';
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

test('los 4 archivos reales parsean sin errores', () => {
  for (const archivo of ARCHIVOS) {
    const resultado = parsearPartidoCabb(fixture(archivo), archivo);
    assert.deepStrictEqual(resultado.errores, [], `${archivo}: ${JSON.stringify(resultado.errores)}`);
  }
});

test('cada archivo detecta exactamente 2 equipos', () => {
  for (const archivo of ARCHIVOS) {
    const resultado = parsearPartidoCabb(fixture(archivo), archivo);
    assert.strictEqual(resultado.equipos.length, 2, archivo);
  }
});

test('el título del partido se propaga igual que parsearTitulo en los 4 archivos', () => {
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

test('el matcheo por nombre une el plantel de Newells a través de 3 partidos U21M', () => {
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

test('un jugador que cambió de número de camiseta mantiene el mismo nombreClave', () => {
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

test('idPartidoCabb sólo matchea el patrón real de la CABB, nunca basura de WhatsApp', () => {
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
