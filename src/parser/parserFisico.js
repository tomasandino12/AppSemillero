import * as XLSX from 'xlsx';
// Mismo criterio de normalización que el nombreClave de los jugadores, y de la
// misma fuente: si alguna vez cambia cómo se normaliza un nombre, cambia en
// los dos lados a la vez.
import { clavearNombre } from './parserCabb.js';
import { esEnlaceWeb } from '../data/enlaces.js';

/*
 * Parser del plan de fuerza del club (Físico.xlsx).
 *
 * Mismo contrato de fondo que parserCabb.js: recibe los bytes del archivo,
 * nunca lanza, y devuelve lo que pudo leer junto con sus errores y
 * advertencias. No toca la base ni el disco.
 *
 * Tres principios, los mismos que rigen el resto del proyecto:
 *
 * 1. Nada por posición. Las columnas se ubican por el texto de su encabezado,
 *    y el día de la semana sale de la fecha de cada celda. En el archivo real
 *    la fila 2 de Abril tiene el lunes 06/04 a la izquierda y el viernes 03/04
 *    —anterior— a la derecha: ni "izquierda = lunes" ni "misma fila = misma
 *    semana" son supuestos seguros. Cada rutina se lee por su cuenta.
 *
 * 2. Nada inventado. Reps y carga quedan como texto ("5xL", "45''", "Fallo",
 *    "PC", "Media"): forzarlas a número sería fabricar una precisión que el
 *    dato no tiene. Un nombre que no coincide con la biblioteca queda sin
 *    referencia; no se busca el más parecido, lo resuelve el profe. Una fecha
 *    escrita como texto, sin año, no se completa con un año supuesto.
 *
 * 3. Los huecos del dato se informan, no se tapan. Un casillero con número y
 *    sin ejercicio es una advertencia: ni una fila fantasma ni un silencio.
 *
 * Salida (contrato "1.0"):
 *
 * {
 *   contrato: '1.0',
 *   exito: boolean,                 // true si y sólo si no hubo errores
 *   origen: { archivo, hojasFuerza: [...], hojaBiblioteca, hojasIgnoradas: [...] },
 *   biblioteca: [ { clave, nombre, bloque, link, fila } ],
 *   sesiones: [ {
 *     hoja, columna, fila,          // dónde está su celda de fecha
 *     fecha: 'AAAA-MM-DD' | null,
 *     diaSemana: 'lunes' | ... | null,
 *     bloques: [ 'POTENCIA', ... ], // en orden de aparición
 *     ejercicios: [ Ejercicio ],
 *   } ],
 *   sinMatchear: [ {
 *     nombreClave, nombresOriginales: [...],
 *     motivo: 'sin_coincidencia' | 'ambiguo',
 *     ocurrencias: [ { hoja, columna, fila, fecha } ],
 *   } ],
 *   advertencias: [ { hoja, fila, campo, mensaje: '[CODIGO] ...' } ],
 *   errores:      [ { hoja, fila, campo, mensaje: '[CODIGO] ...' } ],
 * }
 *
 * Ejercicio:
 *
 * {
 *   hoja, columna, fila, fecha, diaSemana, bloque,
 *   orden: number | null,
 *   nombreOriginal,                 // el texto exacto de la celda, sin tocar
 *   nombreClave,                    // normalizado, sólo para buscar en la biblioteca
 *   referencia: <entrada de biblioteca> | null,
 *   series: number | null,
 *   reps: string | null,            // texto libre, sin normalizar
 *   cargaSugerida: string | null,   // texto libre, sin normalizar
 *   pausa: string | null,
 *   notas: string | null,
 *   escalonKg: null,
 * }
 *
 * `escalonKg` es siempre null. El escalón de carga lo pone el profe después,
 * por jugador: el mismo peso no le exige igual a dos cuerpos distintos. Este
 * parser deja el campo listo y no le corresponde llenarlo.
 */

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Los encabezados de cada rutina de una hoja de Fuerza. El orden de las
// columnas no importa: cada una se busca por su texto.
const ENCABEZADOS_RUTINA = [
  { texto: 'Fecha', campo: 'fecha' },
  { texto: 'Bloque', campo: 'bloque' },
  { texto: '#', campo: 'orden' },
  { texto: 'Ejercicio', campo: 'ejercicio' },
  { texto: 'Series', campo: 'series' },
  { texto: 'Reps', campo: 'reps' },
  { texto: 'Carga Sugerida', campo: 'cargaSugerida' },
  { texto: 'Pausa', campo: 'pausa' },
  { texto: 'Notas Técnicas', campo: 'notas' },
];
const CAMPO_DE_RUTINA = new Map(ENCABEZADOS_RUTINA.map((e) => [normalizarEncabezado(e.texto), e.campo]));

const CAMPO_DE_BIBLIOTECA = new Map([
  ['bloque', 'bloque'],
  ['ejercicio', 'ejercicio'],
  ['link', 'link'],
]);

// Dos rutinas en paralelo es lo que tiene el archivo real (lunes y viernes).
// Más que eso es una estructura que no se vio nunca, y no se adivina cómo
// leerla: la hoja se rechaza con un error.
const MAX_RUTINAS = 2;

/* ---------- helpers exportados, para poder testearlos sueltos ---------- */

/** Minúsculas, sin acentos, espacios colapsados. Para encabezados y nombres de hoja. */
export function normalizarEncabezado(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cualquier mes: lo que cuenta es que el nombre diga "(Fuerza)". */
export function esHojaDeFuerza(nombreHoja) {
  return /\(fuerza\)/i.test(String(nombreHoja ?? ''));
}

// Excel guarda una fecha como la cantidad de días desde una época: el
// 30/12/1899 en el sistema de siempre, 1462 días después en el "sistema 1904"
// de los Mac viejos. La cuenta es propia, en UTC, para que ninguna zona
// horaria corra el día y para no depender de que la versión de SheetJS que se
// cargue exporte su conversor (el import de ESM en Node no lo trae).
const EPOCA_1900_MS = Date.UTC(1899, 11, 30);
const DIAS_1904 = 1462;
const MS_POR_DIA = 86400000;

export function fechaDesdeSerial(serial, sistema1904 = false) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null;
  const f = new Date(EPOCA_1900_MS + (Math.floor(serial) + (sistema1904 ? DIAS_1904 : 0)) * MS_POR_DIA);
  const y = f.getUTCFullYear();
  // Un número chico en la columna Fecha (un 5 tipeado a mano) daría un día de
  // 1900: no es la fecha de un plan, es un dato mal cargado.
  if (y < 2000 || y > 2100) return null;
  const m = f.getUTCMonth() + 1;
  const d = f.getUTCDate();
  return {
    fecha: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    diaSemana: DIAS_SEMANA[f.getUTCDay()],
  };
}

/* ---------- lectura de celdas ---------- */

function rangoDe(ws) {
  return ws?.['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null;
}

function celda(ws, r, c) {
  return ws[XLSX.utils.encode_cell({ r, c })] ?? null;
}

// El texto tal como se ve en la planilla: para una celda numérica es el valor
// formateado ("6"), no el crudo. En una celda combinada, el valor vive sólo en
// la de arriba a la izquierda; las demás llegan vacías.
function textoCrudo(cel) {
  if (!cel) return '';
  if (cel.w != null) return String(cel.w);
  return cel.v == null ? '' : String(cel.v);
}

function texto(cel) {
  return textoCrudo(cel).trim();
}

function textoONull(cel) {
  const t = texto(cel);
  return t === '' ? null : t;
}

function leerEntero(cel) {
  const t = texto(cel);
  if (t === '') return { valor: null, invalido: false };
  if (cel.t === 'n' && Number.isInteger(cel.v)) return { valor: cel.v, invalido: false };
  if (/^\d+$/.test(t)) return { valor: parseInt(t, 10), invalido: false };
  return { valor: null, invalido: true };
}

/* ---------- avisos ---------- */

function advertir(salida, hoja, fila, campo, mensaje) {
  salida.advertencias.push({ hoja, fila, campo, mensaje });
}

function fallar(salida, hoja, fila, campo, mensaje) {
  salida.errores.push({ hoja, fila, campo, mensaje });
}

/* ---------- estructura de una hoja ---------- */

// Filas donde alguna celda entera dice el ancla (ya normalizada).
function filasConAncla(ws, rango, ancla) {
  const filas = [];
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      if (normalizarEncabezado(textoCrudo(celda(ws, r, c))) === ancla) {
        filas.push(r);
        break;
      }
    }
  }
  return filas;
}

// Una rutina empieza en cada "Fecha" de la fila de encabezados y sigue hacia la
// derecha hasta la primera columna sin encabezado, que es la que separa las dos
// rutinas en el archivo real (la J), o hasta la "Fecha" siguiente.
function ubicarRutinas(ws, rango, filaEncabezado) {
  const rutinas = [];
  for (let c = rango.s.c; c <= rango.e.c; c++) {
    if (normalizarEncabezado(textoCrudo(celda(ws, filaEncabezado, c))) !== 'fecha') continue;
    const columnas = {};
    const desconocidos = [];
    const repetidos = [];
    for (let k = c; k <= rango.e.c; k++) {
      const crudo = textoCrudo(celda(ws, filaEncabezado, k)).trim();
      const normalizado = normalizarEncabezado(crudo);
      if (normalizado === '' || (k > c && normalizado === 'fecha')) break;
      const campo = CAMPO_DE_RUTINA.get(normalizado);
      if (!campo) desconocidos.push(crudo);
      else if (campo in columnas) repetidos.push(crudo);
      else columnas[campo] = k;
    }
    rutinas.push({ inicio: c, columnas, desconocidos, repetidos });
  }
  return rutinas;
}

function problemasDeEncabezado(rutina) {
  const faltan = ENCABEZADOS_RUTINA.filter((e) => !(e.campo in rutina.columnas)).map((e) => e.texto);
  const partes = [];
  if (faltan.length) partes.push(`faltan ${faltan.map((t) => `"${t}"`).join(', ')}`);
  if (rutina.desconocidos.length) partes.push(`no reconocidos ${rutina.desconocidos.map((t) => `"${t}"`).join(', ')}`);
  if (rutina.repetidos.length) partes.push(`repetidos ${rutina.repetidos.map((t) => `"${t}"`).join(', ')}`);
  return partes.join('; ');
}

/* ---------- biblioteca ---------- */

function parsearBiblioteca(ws, hoja, salida) {
  const rango = rangoDe(ws);
  const [filaEncabezado] = rango ? filasConAncla(ws, rango, 'ejercicio') : [];
  if (filaEncabezado === undefined) {
    advertir(salida, hoja, null, null, '[BIBLIOTECA_SIN_ENCABEZADO] no se encontró la columna "Ejercicio": ningún ejercicio va a tener referencia');
    return;
  }
  const columnas = {};
  for (let c = rango.s.c; c <= rango.e.c; c++) {
    const campo = CAMPO_DE_BIBLIOTECA.get(normalizarEncabezado(textoCrudo(celda(ws, filaEncabezado, c))));
    if (campo && !(campo in columnas)) columnas[campo] = c;
  }
  for (let r = filaEncabezado + 1; r <= rango.e.r; r++) {
    const nombre = texto(celda(ws, r, columnas.ejercicio));
    if (!nombre) continue;
    const celLink = columnas.link === undefined ? null : celda(ws, r, columnas.link);
    // El hipervínculo real de la celda manda sobre el texto que muestra.
    let link = celLink?.l?.Target ?? textoONull(celLink);
    if (typeof link === 'string') link = link.trim() || null;
    // Un link que no es http(s) no se guarda: la base lo rechazaría y, peor,
    // un "javascript:" en un archivo que circula por WhatsApp se ejecutaría al
    // tocar "Ver video". El ejercicio entra igual, sin video.
    if (link !== null && !esEnlaceWeb(link)) {
      advertir(salida, hoja, r + 1, 'link',
        `[LINK_NO_WEB] el link de "${nombre}" no empieza con http:// o https://: se guarda sin video`);
      link = null;
    }
    salida.biblioteca.push({
      clave: clavearNombre(nombre),
      nombre,
      bloque: columnas.bloque === undefined ? null : textoONull(celda(ws, r, columnas.bloque)),
      link,
      fila: r + 1,
    });
  }
}

// Clave normalizada -> entradas. Más de una entrada con la misma clave es una
// ambigüedad que decide una persona, no el parser.
function indexarBiblioteca(salida) {
  const porClave = new Map();
  for (const entrada of salida.biblioteca) {
    if (!porClave.has(entrada.clave)) porClave.set(entrada.clave, []);
    porClave.get(entrada.clave).push(entrada);
  }
  for (const [clave, entradas] of porClave) {
    if (entradas.length > 1) {
      advertir(salida, salida.origen.hojaBiblioteca, entradas[0].fila, 'ejercicio',
        `[BIBLIOTECA_DUPLICADA] "${clave}" está en las filas ${entradas.map((e) => e.fila).join(', ')}: `
        + 'los ejercicios con ese nombre quedan sin referencia hasta que se resuelva cuál es');
    }
  }
  return porClave;
}

/* ---------- sesiones ---------- */

function registrarSinMatch(ctx, ejercicio, motivo) {
  let entrada = ctx.sinMatch.get(ejercicio.nombreClave);
  if (!entrada) {
    entrada = { nombreClave: ejercicio.nombreClave, nombresOriginales: new Set(), motivo, ocurrencias: [] };
    ctx.sinMatch.set(ejercicio.nombreClave, entrada);
  }
  entrada.nombresOriginales.add(ejercicio.nombreOriginal.trim());
  entrada.ocurrencias.push({ hoja: ejercicio.hoja, columna: ejercicio.columna, fila: ejercicio.fila, fecha: ejercicio.fecha });
}

function parsearRutina(ws, rango, filaEncabezado, rutina, hoja, ctx) {
  const { salida } = ctx;
  const col = rutina.columnas;
  const columnasDeLaRutina = Object.values(col);
  const columna = XLSX.utils.encode_col(rutina.inicio);
  let sesion = null;
  let bloque = null;

  for (let r = filaEncabezado + 1; r <= rango.e.r; r++) {
    if (columnasDeLaRutina.every((c) => texto(celda(ws, r, c)) === '')) continue;
    const fila = r + 1;

    // Una fecha no vacía abre la sesión siguiente. Fecha y bloque sólo están
    // en la primera fila de lo que abarcan: de ahí para abajo se arrastran.
    const celFecha = celda(ws, r, col.fecha);
    if (texto(celFecha) !== '') {
      const f = celFecha.t === 'n' ? fechaDesdeSerial(celFecha.v, ctx.sistema1904) : null;
      if (!f) {
        advertir(salida, hoja, fila, 'fecha', celFecha.t === 'n'
          ? `[FECHA_INVALIDA] ${celFecha.v} no es la fecha de un plan`
          : `[FECHA_SIN_ANIO] "${texto(celFecha)}" está escrita como texto: sin el año no hay día de la semana, y no se adivina`);
      }
      sesion = { hoja, columna, fila, fecha: f?.fecha ?? null, diaSemana: f?.diaSemana ?? null, bloques: [], ejercicios: [] };
      salida.sesiones.push(sesion);
      bloque = null;
    }

    const bloqueDeLaFila = texto(celda(ws, r, col.bloque));
    if (bloqueDeLaFila) bloque = bloqueDeLaFila;

    const nombreOriginal = textoCrudo(celda(ws, r, col.ejercicio));
    if (nombreOriginal.trim() === '') {
      const orden = texto(celda(ws, r, col.orden));
      advertir(salida, hoja, fila, 'ejercicio',
        `[EJERCICIO_VACIO] ${orden ? `el #${orden}` : 'la fila'}${sesion?.fecha ? ` del ${sesion.fecha}` : ''} tiene datos pero no tiene ejercicio`);
      continue;
    }
    if (!sesion) {
      advertir(salida, hoja, fila, 'fecha', `[EJERCICIO_SIN_FECHA] "${nombreOriginal.trim()}" aparece antes de cualquier fecha: no se sabe a qué sesión pertenece`);
      continue;
    }
    if (!bloque) advertir(salida, hoja, fila, 'bloque', `[SIN_BLOQUE] "${nombreOriginal.trim()}" no tiene bloque`);

    const orden = leerEntero(celda(ws, r, col.orden));
    if (orden.invalido) advertir(salida, hoja, fila, 'orden', `[ORDEN_INVALIDO] "${texto(celda(ws, r, col.orden))}" no es un número de orden`);
    const series = leerEntero(celda(ws, r, col.series));
    if (series.invalido) advertir(salida, hoja, fila, 'series', `[SERIES_INVALIDAS] "${texto(celda(ws, r, col.series))}" no es una cantidad entera de series`);

    const nombreClave = clavearNombre(nombreOriginal);
    const candidatos = ctx.indice.get(nombreClave) ?? [];
    const referencia = candidatos.length === 1 ? candidatos[0] : null;

    const ejercicio = {
      hoja,
      columna,
      fila,
      fecha: sesion.fecha,
      diaSemana: sesion.diaSemana,
      bloque,
      orden: orden.valor,
      nombreOriginal,
      nombreClave,
      referencia,
      series: series.valor,
      reps: textoONull(celda(ws, r, col.reps)),
      cargaSugerida: textoONull(celda(ws, r, col.cargaSugerida)),
      pausa: textoONull(celda(ws, r, col.pausa)),
      notas: textoONull(celda(ws, r, col.notas)),
      escalonKg: null,
    };
    sesion.ejercicios.push(ejercicio);
    if (bloque && !sesion.bloques.includes(bloque)) sesion.bloques.push(bloque);
    if (!referencia) registrarSinMatch(ctx, ejercicio, candidatos.length > 1 ? 'ambiguo' : 'sin_coincidencia');
  }
}

function parsearHojaFuerza(ws, hoja, ctx) {
  const { salida } = ctx;
  const rango = rangoDe(ws);
  if (!rango) {
    fallar(salida, hoja, null, null, '[HOJA_VACIA] la hoja no tiene celdas');
    return;
  }
  const filasEncabezado = filasConAncla(ws, rango, 'fecha');
  if (filasEncabezado.length === 0) {
    fallar(salida, hoja, null, null, '[SIN_ENCABEZADO] no se encontró una fila con el encabezado "Fecha"');
    return;
  }
  if (filasEncabezado.length > 1) {
    fallar(salida, hoja, null, null,
      `[ESTRUCTURA_INESPERADA] hay encabezados "Fecha" en más de una fila (${filasEncabezado.map((r) => r + 1).join(', ')}): tablas apiladas no son un formato conocido`);
    return;
  }
  const filaEncabezado = filasEncabezado[0];
  const rutinas = ubicarRutinas(ws, rango, filaEncabezado);
  if (rutinas.length > MAX_RUTINAS) {
    fallar(salida, hoja, filaEncabezado + 1, null,
      `[ESTRUCTURA_INESPERADA] hay ${rutinas.length} rutinas en paralelo y el formato conocido tiene hasta ${MAX_RUTINAS}`);
    return;
  }
  let valida = true;
  for (const rutina of rutinas) {
    const problemas = problemasDeEncabezado(rutina);
    if (problemas) {
      valida = false;
      fallar(salida, hoja, filaEncabezado + 1, null,
        `[ENCABEZADOS_INVALIDOS] la rutina que empieza en la columna ${XLSX.utils.encode_col(rutina.inicio)}: ${problemas}`);
    }
  }
  if (!valida) return;
  for (const rutina of rutinas) parsearRutina(ws, rango, filaEncabezado, rutina, hoja, ctx);
}

/* ---------- entrada ---------- */

function llenar(salida, datos) {
  // Sólo bytes. Cualquier otra cosa es un error de quien llama, y pasársela a
  // SheetJS no es inocuo: con un número intenta reservar un arreglo de ese
  // largo y tarda segundos en fallar.
  const bytes = datos instanceof ArrayBuffer ? new Uint8Array(datos) : datos instanceof Uint8Array ? datos : null;
  if (!bytes) {
    fallar(salida, null, null, null, '[LECTURA_FALLIDA] se esperaban los bytes del archivo (ArrayBuffer o Uint8Array)');
    return;
  }
  let workbook;
  try {
    workbook = XLSX.read(bytes, { type: 'array' });
  } catch (e) {
    fallar(salida, null, null, null, `[LECTURA_FALLIDA] no se pudo leer el archivo: ${e?.message ?? e}`);
    return;
  }

  const hojasFuerza = workbook.SheetNames.filter(esHojaDeFuerza);
  const hojaBiblioteca = workbook.SheetNames.find((n) => normalizarEncabezado(n) === 'ejercicios') ?? null;
  salida.origen.hojasFuerza = hojasFuerza;
  salida.origen.hojaBiblioteca = hojaBiblioteca;
  salida.origen.hojasIgnoradas = workbook.SheetNames.filter((n) => !esHojaDeFuerza(n) && n !== hojaBiblioteca);

  if (hojasFuerza.length === 0) {
    fallar(salida, null, null, null, '[SIN_HOJAS_FUERZA] ninguna hoja tiene "(Fuerza)" en el nombre');
    return;
  }

  if (hojaBiblioteca) parsearBiblioteca(workbook.Sheets[hojaBiblioteca], hojaBiblioteca, salida);
  else advertir(salida, null, null, null, '[SIN_BIBLIOTECA] no hay hoja "Ejercicios": ningún ejercicio va a tener referencia');

  const ctx = {
    salida,
    indice: indexarBiblioteca(salida),
    sinMatch: new Map(),
    sistema1904: Boolean(workbook.Workbook?.WBProps?.date1904),
  };
  // Un error en una hoja no frena a las demás: cada una se lee por su cuenta.
  for (const hoja of hojasFuerza) parsearHojaFuerza(workbook.Sheets[hoja], hoja, ctx);

  salida.sinMatchear = [...ctx.sinMatch.values()].map((e) => ({ ...e, nombresOriginales: [...e.nombresOriginales] }));
}

export function parsearPlanFisico(datos, nombreArchivo) {
  const salida = {
    contrato: '1.0',
    exito: false,
    origen: {
      archivo: typeof nombreArchivo === 'string' ? nombreArchivo : null,
      hojasFuerza: [],
      hojaBiblioteca: null,
      hojasIgnoradas: [],
    },
    biblioteca: [],
    sesiones: [],
    sinMatchear: [],
    advertencias: [],
    errores: [],
  };
  try {
    llenar(salida, datos);
  } catch (e) {
    fallar(salida, null, null, null, `[ERROR_INTERNO] ${e?.message ?? e}`);
  }
  salida.exito = salida.errores.length === 0;
  return salida;
}
