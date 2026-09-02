import * as XLSX from 'xlsx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADER_ROW = ['Num.', 'Nombre', 'MIN', 'PTS', 'A/I', '%', 'A/I', '%', 'A/I', '%', 'DEF', 'OF', 'Tot.', 'AST', 'REC', 'PER', 'TC', 'TR', 'FC', 'FR', 'VAL', '+/-'];
const AGRUPADORES_ROW = ['', '', '', '', 'TC 2P', '', 'TC 3P', '', 'TL'];

// Nombres inventados, conservando la suciedad de formato real documentada en
// PARSER.md: espacio antes de coma, coma duplicada, apellido compuesto,
// doble espacio tras la coma, acentos y Ñ.
const JUGADORES_EQUIPO_A = [
  ['4', 'PÉREZ , FRANCO', '15:23', '8', '3/5', '60', '0/1', '0', '2/2', '100', '2', '1', '3', '2', '1', '0', '0', '0', '1', '2', '10', '4'],
  ['5', 'GONZÁLEZ, , MORENA', '12:10', '4', '2/4', '50', '0/0', '0', '0/0', '0', '1', '0', '1', '1', '0', '1', '0', '0', '0', '0', '4', '-1'],
  ['6', 'RODRÍGUEZ SOSA, VALENTINA ', '20:00', '12', '4/7', '57', '1/3', '33', '1/2', '50', '3', '2', '5', '0', '2', '1', '1', '0', '2', '1', '12', '6'],
];

const JUGADORES_EQUIPO_B = [
  ['7', 'FERNÁNDEZ,  IGNACIO', '18:45', '6', '2/3', '67', '0/2', '0', '2/2', '100', '2', '0', '2', '1', '1', '0', '0', '0', '0', '1', '6', '-3'],
  ['8', 'NÚÑEZ, ROCÍO', '10:00', '2', '1/2', '50', '0/0', '0', '0/0', '0', '0', '1', '1', '0', '0', '0', '0', '0', '0', '0', '2', '0'],
  ['9', 'MARTÍNEZ, LEANDRO', '22:30', '15', '5/9', '56', '1/4', '25', '2/2', '100', '4', '3', '7', '2', '0', '2', '0', '1', '2', '2', '15', '8'],
];

function sumarColumna(jugadores, indice, esFraccionAnotados) {
  return jugadores.reduce((acc, fila) => {
    const val = fila[indice];
    if (val.includes('/')) {
      const [anotados, intentados] = val.split('/').map(Number);
      return acc + (esFraccionAnotados ? anotados : intentados);
    }
    return acc + Number(val);
  }, 0);
}

function construirFilaTotales(jugadores) {
  const minTotal = jugadores.reduce((acc, f) => {
    const [m, s] = f[2].split(':').map(Number);
    return acc + m * 60 + s;
  }, 0);
  const minTexto = `${String(Math.floor(minTotal / 60)).padStart(2, '0')}:${String(minTotal % 60).padStart(2, '0')}`;
  const dosAn = sumarColumna(jugadores, 4, true), dosInt = sumarColumna(jugadores, 4, false);
  const tresAn = sumarColumna(jugadores, 6, true), tresInt = sumarColumna(jugadores, 6, false);
  const libAn = sumarColumna(jugadores, 8, true), libInt = sumarColumna(jugadores, 8, false);
  return [
    '', 'TOTALES', minTexto,
    String(sumarColumna(jugadores, 3)),
    `${dosAn}/${dosInt}`, String(dosInt ? Math.round((dosAn / dosInt) * 100) : 0),
    `${tresAn}/${tresInt}`, String(tresInt ? Math.round((tresAn / tresInt) * 100) : 0),
    `${libAn}/${libInt}`, String(libInt ? Math.round((libAn / libInt) * 100) : 0),
    String(sumarColumna(jugadores, 10)), String(sumarColumna(jugadores, 11)), String(sumarColumna(jugadores, 12)),
    String(sumarColumna(jugadores, 13)), String(sumarColumna(jugadores, 14)), String(sumarColumna(jugadores, 15)),
    String(sumarColumna(jugadores, 16)), String(sumarColumna(jugadores, 17)),
    String(sumarColumna(jugadores, 18)), String(sumarColumna(jugadores, 19)),
    String(sumarColumna(jugadores, 20)), String(sumarColumna(jugadores, 21)),
  ];
}

function construirLibro({ omitirTotalesA = false, omitirNombreB = false } = {}) {
  const aoa = [
    [],
    ['', '', 'CONFEDERACIÓN ARGENTINA DE BASQUETBOL'],
    [],
    [],
    ['Estadísticas - EQUIPO SINTÉTICO A vs EQUIPO SINTÉTICO B - U21M - LIGA SINTETICA DE PRUEBA 2026 - CABB - 2026'],
    [],
    [],
    [],
    ['TOTALES'],
    [],
    ['EQUIPO SINTÉTICO A'],
    AGRUPADORES_ROW,
    HEADER_ROW,
    ...JUGADORES_EQUIPO_A,
  ];
  if (!omitirTotalesA) aoa.push(construirFilaTotales(JUGADORES_EQUIPO_A));
  aoa.push([], []);
  if (!omitirNombreB) aoa.push(['EQUIPO SINTÉTICO B']);
  aoa.push(AGRUPADORES_ROW, HEADER_ROW, ...JUGADORES_EQUIPO_B, construirFilaTotales(JUGADORES_EQUIPO_B));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Estadísticas-');
  return wb;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'fixtures', 'sintetico');

XLSX.writeFile(construirLibro({}), path.join(outDir, 'partido_ok.xlsx'));
XLSX.writeFile(construirLibro({ omitirTotalesA: true }), path.join(outDir, 'partido_sin_totales.xlsx'));
XLSX.writeFile(construirLibro({ omitirNombreB: true }), path.join(outDir, 'partido_sin_nombre_equipo.xlsx'));

console.log('Generados en', outDir);
