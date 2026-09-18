import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as XLSX from 'xlsx';
import {
  parsearPlanFisico,
  fechaDesdeSerial,
  normalizarEncabezado,
  esHojaDeFuerza,
} from '../src/parser/parserFisico.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUTA_REAL = path.join(__dirname, 'fixtures', 'fisico.xlsx');
const SKIP_SIN_REAL = {
  skip: !existsSync(RUTA_REAL) && 'tests/fixtures/fisico.xlsx no está presente (el plan de fuerza real del club)',
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Oráculo independiente del parser. El parser convierte el serial de Excel con
// su propia cuenta en UTC; el oráculo usa el conversor de SheetJS, que hace
// otra cuenta con otra aritmética. Si coinciden, no es porque compartan el
// mismo error. (El conversor sólo lo exporta la versión CommonJS del paquete.)
const { SSF } = createRequire(import.meta.url)('xlsx');
const oraculo = (s) => {
  const p = SSF.parse_date_code(s);
  return { fecha: `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`, diaSemana: DIAS[p.q] };
};
const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;

let cacheReal = null;
const real = () => (cacheReal ??= parsearPlanFisico(readFileSync(RUTA_REAL), 'fisico.xlsx'));
const libroReal = () => XLSX.read(readFileSync(RUTA_REAL), { type: 'buffer' });
const ejerciciosReales = () => real().sesiones.flatMap((s) => s.ejercicios);

/* ---------- libros sintéticos, armados en memoria ---------- */

const ENC = ['Fecha', 'Bloque', '#', 'Ejercicio', 'Series', 'Reps', 'Carga Sugerida', 'Pausa', 'Notas Técnicas'];
const BIB = [
  ['BLOQUE', 'EJERCICIO', 'LINK'],
  ['FUERZA', 'Press Plano (Manc)', 'https://example.com/press'],
  ['FUERZA', 'Sentadilla Búlgara', 'https://example.com/bulgara'],
];
const filaEj = (fecha, bloque, orden, nombre) => [fecha, bloque, orden, nombre, 3, '8', 'PC', "60''", 'nota'];

function libro(hojas) {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

/* ================= contra el archivo real ================= */

test('el plan real se lee entero, sin errores y sin lanzar', SKIP_SIN_REAL, () => {
  const r = real();
  assert.deepEqual(r.errores, []);
  assert.equal(r.exito, true);
  assert.deepEqual(r.origen.hojasFuerza, ['Marzo (Fuerza)', 'Abril (Fuerza)']);
  assert.equal(r.origen.hojaBiblioteca, 'Ejercicios');
  assert.deepEqual(r.origen.hojasIgnoradas, ['Marzo (Intermitente)']);
});

test('el conteo de sesiones por día sale de contar fechas, no de un número fijo', SKIP_SIN_REAL, () => {
  const wb = libroReal();
  const esperado = {};
  for (const hoja of real().origen.hojasFuerza) {
    const g = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: null, raw: true });
    const columnasFecha = g[0].map((c, j) => (c === 'Fecha' ? j : -1)).filter((j) => j >= 0);
    for (const fila of g.slice(1)) {
      for (const c of columnasFecha) {
        if (typeof fila?.[c] !== 'number') continue;
        const clave = `${hoja} · ${oraculo(fila[c]).diaSemana}`;
        esperado[clave] = (esperado[clave] ?? 0) + 1;
      }
    }
  }
  const parser = {};
  for (const s of real().sesiones) {
    const clave = `${s.hoja} · ${s.diaSemana}`;
    parser[clave] = (parser[clave] ?? 0) + 1;
  }
  assert.deepEqual(parser, esperado);
});

test('cada sesión tiene la fecha y el día que dice su propia celda', SKIP_SIN_REAL, () => {
  const wb = libroReal();
  for (const s of real().sesiones) {
    const cel = wb.Sheets[s.hoja][`${s.columna}${s.fila}`];
    const donde = `${s.hoja} ${s.columna}${s.fila}`;
    assert.equal(cel?.t, 'n', donde);
    assert.deepEqual({ fecha: s.fecha, diaSemana: s.diaSemana }, oraculo(cel.v), donde);
    // Y día y mes coinciden con lo que la planilla muestra en pantalla ("02/03").
    assert.equal(cel.w, `${s.fecha.slice(8, 10)}/${s.fecha.slice(5, 7)}`, donde);
  }
});

test('misma fila no es misma semana: Abril empareja un lunes con el viernes anterior', SKIP_SIN_REAL, () => {
  const fila2 = real().sesiones.filter((s) => s.hoja === 'Abril (Fuerza)' && s.fila === 2);
  assert.deepEqual(
    Object.fromEntries(fila2.map((s) => [s.fecha, s.diaSemana])),
    { '2026-04-06': 'lunes', '2026-04-03': 'viernes' },
  );
});

test('ningún ejercicio con nombre se pierde', SKIP_SIN_REAL, () => {
  const wb = libroReal();
  let esperados = 0;
  for (const hoja of real().origen.hojasFuerza) {
    const g = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: '' });
    const columnas = g[0].map((c, j) => (c === 'Ejercicio' ? j : -1)).filter((j) => j >= 0);
    for (const fila of g.slice(1)) for (const c of columnas) if (String(fila[c] ?? '').trim()) esperados++;
  }
  assert.equal(ejerciciosReales().length, esperados);
});

test('cada ejercicio trae todos sus campos, y escalonKg siempre en null', SKIP_SIN_REAL, () => {
  const ejercicios = ejerciciosReales();
  assert.ok(ejercicios.length > 0);
  for (const e of ejercicios) {
    const donde = `${e.hoja} ${e.columna}${e.fila}`;
    assert.match(e.fecha, /^\d{4}-\d{2}-\d{2}$/, donde);
    assert.ok(DIAS.includes(e.diaSemana), donde);
    assert.equal(typeof e.bloque, 'string', donde);
    assert.equal(typeof e.orden, 'number', donde);
    assert.equal(typeof e.nombreOriginal, 'string', donde);
    assert.ok(e.referencia === null || typeof e.referencia === 'object', donde);
    assert.equal(typeof e.series, 'number', donde);
    for (const campo of ['reps', 'cargaSugerida', 'pausa', 'notas']) {
      assert.ok(e[campo] === null || typeof e[campo] === 'string', `${donde} ${campo}`);
    }
    assert.ok('escalonKg' in e, donde);
    assert.equal(e.escalonKg, null, donde);
  }
});

test('reps y carga quedan como texto, tal cual vienen', SKIP_SIN_REAL, () => {
  const ejercicios = ejerciciosReales();
  const reps = new Set(ejercicios.map((e) => e.reps));
  const cargas = new Set(ejercicios.map((e) => e.cargaSugerida));
  for (const v of ['5xL', "45''", 'Fallo', 'Fallo-2', '3+3', "30''xL", '10tot', '16 tot']) {
    assert.ok(reps.has(v), `reps "${v}"`);
  }
  for (const v of ['PC', 'Media', 'Alta', 'Máxima', 'Barra + Disc', 'Disco 5/10kg']) assert.ok(cargas.has(v), `carga "${v}"`);
  // Un número de reps también llega como texto: no hay dos tipos para el mismo campo.
  assert.ok(reps.has('6'));
});

test('"Press Plano" no rompe el parseo aunque no coincida con "Press Plano (Manc)"', SKIP_SIN_REAL, () => {
  const r = real();
  const plano = ejerciciosReales().filter((e) => e.nombreOriginal.trim() === 'Press Plano');
  const manc = ejerciciosReales().filter((e) => e.nombreOriginal.trim() === 'Press Plano (Manc)');
  assert.ok(plano.length > 0 && manc.length > 0);
  for (const e of plano) assert.equal(e.referencia, null);
  for (const e of manc) assert.equal(e.referencia?.nombre, 'Press Plano (Manc)');
  const pendiente = r.sinMatchear.find((x) => x.nombresOriginales.includes('Press Plano'));
  assert.equal(pendiente?.motivo, 'sin_coincidencia');
  assert.equal(pendiente.ocurrencias.length, plano.length);
  assert.equal(r.exito, true);
});

test('el casillero sin ejercicio del 02/03 se informa: no se inventa ni se calla', SKIP_SIN_REAL, () => {
  const r = real();
  assert.ok(r.advertencias.some((a) => a.mensaje.startsWith('[EJERCICIO_VACIO]') && a.hoja === 'Marzo (Fuerza)' && a.fila === 3));
  const sesion = r.sesiones.find((s) => s.hoja === 'Marzo (Fuerza)' && s.fecha === '2026-03-02');
  assert.ok(!sesion.ejercicios.some((e) => e.orden === 2));
  // Y es el único tipo de aviso que deja el archivo real.
  const codigos = new Set(r.advertencias.map((a) => a.mensaje.match(/^\[[A-Z_]+\]/)[0]));
  assert.deepEqual([...codigos], ['[EJERCICIO_VACIO]']);
});

test('el bloque se arrastra hacia abajo, también sobre una celda combinada de 4 filas', SKIP_SIN_REAL, () => {
  const en = (hoja, columna, fila) => ejerciciosReales().find((e) => e.hoja === hoja && e.columna === columna && e.fila === fila);
  assert.equal(en('Marzo (Fuerza)', 'A', 16).bloque, 'AUX/CORE'); // B14:B17
  assert.equal(en('Marzo (Fuerza)', 'K', 3).bloque, 'POTENCIA'); // L2:L3
});

test('la biblioteca se lee entera, con el link real de cada celda', SKIP_SIN_REAL, () => {
  const g = XLSX.utils.sheet_to_json(libroReal().Sheets['Ejercicios'], { header: 1, defval: '' });
  const filasConNombre = g.slice(1).filter((f) => String(f[1]).trim()).length;
  const biblioteca = real().biblioteca;
  assert.equal(biblioteca.length, filasConNombre);
  for (const e of biblioteca) {
    assert.ok(e.clave && e.nombre);
    assert.match(e.link, /^https:\/\//);
  }
});

test('las referencias apuntan a la biblioteca, y los sin-match cierran la cuenta', SKIP_SIN_REAL, () => {
  const r = real();
  for (const e of ejerciciosReales()) if (e.referencia) assert.ok(r.biblioteca.includes(e.referencia));
  const sinReferencia = ejerciciosReales().filter((e) => !e.referencia).length;
  assert.equal(r.sinMatchear.reduce((n, x) => n + x.ocurrencias.length, 0), sinReferencia);
});

/* ================= casos armados en memoria ================= */

test('nunca lanza, aunque le llegue algo que no es un xlsx', () => {
  for (const malo of [null, undefined, new Uint8Array([1, 2, 3]), new Uint8Array(0), 'hola', 42]) {
    let r;
    assert.doesNotThrow(() => { r = parsearPlanFisico(malo, 'x.xlsx'); }, String(malo));
    assert.equal(r.exito, false, String(malo));
    assert.ok(r.errores.length > 0, String(malo));
  }
});

test('sin ninguna hoja de Fuerza es un error, no un plan vacío', () => {
  const r = parsearPlanFisico(libro({ 'Marzo (Intermitente)': [['Fecha', 'Distancia'], [serial(2026, 3, 4), '30 mts']] }), 'x.xlsx');
  assert.equal(r.exito, false);
  assert.ok(r.errores.some((e) => e.mensaje.startsWith('[SIN_HOJAS_FUERZA]')));
});

test('el día sale de la fecha aunque el viernes esté a la izquierda', () => {
  // En el archivo real la izquierda es siempre lunes, así que "calcular por
  // fecha" y "asumir por posición" dan lo mismo y no se pueden distinguir.
  // Este caso sí los distingue.
  const r = parsearPlanFisico(libro({
    Ejercicios: BIB,
    'Mayo (Fuerza)': [
      [...ENC, null, ...ENC],
      [...filaEj(serial(2026, 5, 8), 'FUERZA', 1, 'Press Plano (Manc)'), null, ...filaEj(serial(2026, 5, 4), 'FUERZA', 1, 'Sentadilla Búlgara')],
    ],
  }), 'x.xlsx');
  assert.equal(r.exito, true);
  assert.deepEqual(Object.fromEntries(r.sesiones.map((s) => [s.columna, s.diaSemana])), { A: 'viernes', K: 'lunes' });
});

test('más de dos rutinas en paralelo es un error, no una adivinanza', () => {
  const r = parsearPlanFisico(libro({
    'Mayo (Fuerza)': [
      [...ENC, null, ...ENC, null, ...ENC],
      [...filaEj(serial(2026, 5, 4), 'FUERZA', 1, 'A'), null, ...filaEj(serial(2026, 5, 6), 'FUERZA', 1, 'B'), null, ...filaEj(serial(2026, 5, 8), 'FUERZA', 1, 'C')],
    ],
  }), 'x.xlsx');
  assert.equal(r.exito, false);
  assert.ok(r.errores.some((e) => e.mensaje.startsWith('[ESTRUCTURA_INESPERADA]')));
  assert.deepEqual(r.sesiones, []);
});

test('un encabezado distinto frena la hoja en vez de leerla a medias', () => {
  const encabezados = ENC.map((h) => (h === 'Pausa' ? 'Descanso' : h));
  const r = parsearPlanFisico(libro({ 'Mayo (Fuerza)': [encabezados, filaEj(serial(2026, 5, 4), 'FUERZA', 1, 'A')] }), 'x.xlsx');
  assert.equal(r.exito, false);
  const error = r.errores.find((e) => e.mensaje.startsWith('[ENCABEZADOS_INVALIDOS]'));
  assert.match(error.mensaje, /"Pausa"/);
  assert.match(error.mensaje, /"Descanso"/);
  assert.deepEqual(r.sesiones, []);
});

test('una fecha escrita como texto no se completa con un año inventado', () => {
  const r = parsearPlanFisico(libro({ Ejercicios: BIB, 'Mayo (Fuerza)': [ENC, filaEj('04/05', 'FUERZA', 1, 'Press Plano (Manc)')] }), 'x.xlsx');
  assert.equal(r.exito, true);
  assert.equal(r.sesiones[0].fecha, null);
  assert.equal(r.sesiones[0].diaSemana, null);
  assert.ok(r.advertencias.some((a) => a.mensaje.startsWith('[FECHA_SIN_ANIO]')));
});

test('la coincidencia ignora mayúsculas, acentos y espacios de más, y el nombre original queda intacto', () => {
  const r = parsearPlanFisico(libro({ Ejercicios: BIB, 'Mayo (Fuerza)': [ENC, filaEj(serial(2026, 5, 4), 'FUERZA', 1, 'sentadilla   BULGARA')] }), 'x.xlsx');
  const e = r.sesiones[0].ejercicios[0];
  assert.equal(e.referencia?.nombre, 'Sentadilla Búlgara');
  assert.equal(e.nombreOriginal, 'sentadilla   BULGARA');
  assert.deepEqual(r.sinMatchear, []);
});

test('dos entradas de la biblioteca con el mismo nombre normalizado: sin referencia, y avisado', () => {
  const r = parsearPlanFisico(libro({
    Ejercicios: [...BIB, ['FUERZA', 'press plano (MANC)', 'https://example.com/otro']],
    'Mayo (Fuerza)': [ENC, filaEj(serial(2026, 5, 4), 'FUERZA', 1, 'Press Plano (Manc)')],
  }), 'x.xlsx');
  assert.ok(r.advertencias.some((a) => a.mensaje.startsWith('[BIBLIOTECA_DUPLICADA]')));
  assert.equal(r.sesiones[0].ejercicios[0].referencia, null);
  assert.equal(r.sinMatchear[0].motivo, 'ambiguo');
});

test('un link de la biblioteca que no es http(s) se descarta y se avisa, el ejercicio queda', () => {
  const r = parsearPlanFisico(libro({
    Ejercicios: [BIB[0], ['FUERZA', 'Press Plano (Manc)', 'javascript:alert(1)'], BIB[2]],
    'Mayo (Fuerza)': [ENC, filaEj(serial(2026, 5, 4), 'FUERZA', 1, 'Press Plano (Manc)')],
  }), 'x.xlsx');
  const press = r.biblioteca.find((e) => e.nombre === 'Press Plano (Manc)');
  assert.equal(press.link, null);
  assert.equal(r.sesiones[0].ejercicios[0].referencia, press);
  const aviso = r.advertencias.find((a) => a.mensaje.startsWith('[LINK_NO_WEB]'));
  assert.ok(aviso);
  assert.equal(aviso.fila, 2);
  assert.equal(r.biblioteca.find((e) => e.nombre === 'Sentadilla Búlgara').link, 'https://example.com/bulgara');
});

test('el hipervínculo real de la celda también se filtra, no sólo el texto', () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([BIB[0], ['FUERZA', 'Press Plano (Manc)', 'Ver video']]);
  ws.C2.l = { Target: 'javascript:fetch("//x")' };
  XLSX.utils.book_append_sheet(wb, ws, 'Ejercicios');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ENC, filaEj(serial(2026, 5, 4), 'FUERZA', 1, 'Press Plano (Manc)')]), 'Mayo (Fuerza)');
  const r = parsearPlanFisico(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), 'x.xlsx');
  assert.equal(r.biblioteca[0].link, null);
  assert.ok(r.advertencias.some((a) => a.mensaje.startsWith('[LINK_NO_WEB]')));
});

test('las columnas se ubican por su encabezado, no por su lugar', () => {
  const encabezados = ['Fecha', '#', 'Bloque', 'Ejercicio', 'Reps', 'Series', 'Pausa', 'Carga Sugerida', 'Notas Técnicas'];
  const datos = [serial(2026, 5, 4), 1, 'FUERZA', 'Press Plano (Manc)', '8xL', 4, "90''", 'Manc 10kg', 'Codos a 45°'];
  const e = parsearPlanFisico(libro({ Ejercicios: BIB, 'Mayo (Fuerza)': [encabezados, datos] }), 'x.xlsx').sesiones[0].ejercicios[0];
  assert.equal(e.orden, 1);
  assert.equal(e.bloque, 'FUERZA');
  assert.equal(e.series, 4);
  assert.equal(e.reps, '8xL');
  assert.equal(e.pausa, "90''");
  assert.equal(e.cargaSugerida, 'Manc 10kg');
  assert.equal(e.notas, 'Codos a 45°');
});

test('un libro guardado con el sistema de fechas 1904 da las mismas fechas', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ENC, filaEj(serial(2026, 5, 4) - 1462, 'FUERZA', 1, 'A')]), 'Mayo (Fuerza)');
  wb.Workbook = { WBProps: { date1904: true } };
  const r = parsearPlanFisico(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), 'x.xlsx');
  assert.deepEqual(r.sesiones.map((s) => [s.fecha, s.diaSemana]), [['2026-05-04', 'lunes']]);
});

test('fechaDesdeSerial convierte el serial de Excel en fecha y día', () => {
  assert.deepEqual(fechaDesdeSerial(46083), { fecha: '2026-03-02', diaSemana: 'lunes' });
  assert.deepEqual(fechaDesdeSerial(46115), { fecha: '2026-04-03', diaSemana: 'viernes' });
  assert.deepEqual(fechaDesdeSerial(46083.75), { fecha: '2026-03-02', diaSemana: 'lunes' }); // con hora: cuenta el día
  // El mismo 02/03/2026 en un libro guardado con el sistema 1904.
  assert.deepEqual(fechaDesdeSerial(46083 - 1462, true), { fecha: '2026-03-02', diaSemana: 'lunes' });
  assert.equal(fechaDesdeSerial(5), null); // un 5 tipeado en la columna Fecha no es la fecha de un plan
  assert.equal(fechaDesdeSerial('02/03'), null);
  assert.equal(fechaDesdeSerial(Number.NaN), null);
});

test('normalizarEncabezado y esHojaDeFuerza', () => {
  assert.equal(normalizarEncabezado('  Notas   Técnicas '), 'notas tecnicas');
  assert.ok(esHojaDeFuerza('Mayo (FUERZA)'));
  assert.ok(!esHojaDeFuerza('Marzo (Intermitente)'));
  assert.ok(!esHojaDeFuerza('Fuerza sin paréntesis'));
});
