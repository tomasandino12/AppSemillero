import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararPayloadPlanFisico } from '../src/data/prepararPayloadPlanFisico.js';
import { clavearNombre } from '../src/parser/parserCabb.js';

/*
 * La entrada de esta función es lo que devuelve parsearPlanFisico (contrato
 * "1.0", ver la cabecera de src/parser/parserFisico.js). Los helpers de acá
 * arman esa forma a mano: el parser no se toca ni se ejecuta en estos tests,
 * que son sobre la reconciliación y el armado del payload.
 */

const CONTEXTO = {
  clubId: 'club-1',
  plantelId: 'plantel-1',
  nombreArchivo: 'Fisico.xlsx',
  hashArchivo: 'hash-1',
};

// Una entrada de la hoja "Ejercicios" del archivo.
const enBiblioteca = (nombre, extra = {}) => ({
  clave: clavearNombre(nombre),
  nombre,
  bloque: 'FUERZA',
  link: 'https://example.com/' + clavearNombre(nombre).toLowerCase().replace(/\s+/g, '-'),
  fila: 2,
  ...extra,
});

// Una fila de ejercicio de una rutina. `referencia` es la entrada de la
// biblioteca del ARCHIVO, tal como la deja el parser (o null).
const ejercicio = (nombreOriginal, extra = {}) => ({
  hoja: 'Abril (Fuerza)',
  columna: 0,
  fila: 3,
  fecha: '2026-04-06',
  diaSemana: 'lunes',
  bloque: 'FUERZA',
  orden: 1,
  nombreOriginal,
  nombreClave: clavearNombre(nombreOriginal),
  referencia: null,
  series: 4,
  reps: '8',
  cargaSugerida: 'PC',
  pausa: "60''",
  notas: null,
  escalonKg: null,
  ...extra,
});

const sesion = (fecha, ejercicios) => ({
  hoja: 'Abril (Fuerza)',
  columna: 0,
  fila: 1,
  fecha,
  diaSemana: 'lunes',
  bloques: ['FUERZA'],
  ejercicios,
});

const resultado = (extra = {}) => ({
  contrato: '1.0',
  exito: true,
  origen: { archivo: 'Fisico.xlsx', hojasFuerza: ['Abril (Fuerza)'], hojaBiblioteca: 'Ejercicios', hojasIgnoradas: [] },
  biblioteca: [],
  sesiones: [],
  sinMatchear: [],
  advertencias: [],
  errores: [],
  ...extra,
});

const ejerciciosDel = (payload) => payload.sesiones.flatMap((s) => s.ejercicios);

/* ---------- la biblioteca del archivo contra la del club ---------- */

test('lo que ya está en la biblioteca del club se reusa: no se crea nada y los ejercicios van con su id', () => {
  const press = enBiblioteca('Press Plano (Manc)');
  const r = resultado({
    biblioteca: [press],
    sesiones: [sesion('2026-04-06', [ejercicio('Press Plano (Manc)', { referencia: press })])],
  });
  const club = [{ id: 'ej-press', clave: press.clave, nombre: press.nombre, bloque: 'FUERZA', link: null }];

  const { error, payload, resumen } = prepararPayloadPlanFisico(r, club, {}, CONTEXTO);

  assert.equal(error, null);
  assert.deepEqual(payload.ejerciciosNuevos, []);
  assert.equal(ejerciciosDel(payload)[0].ejercicioFuerzaId, 'ej-press');
  assert.equal(ejerciciosDel(payload)[0].claveNueva, null);
  assert.equal(resumen.ejerciciosNuevos, 0);
  assert.equal(resumen.pendientes, 0);
});

test('lo que el archivo trae y el club no tiene se da de alta una sola vez, aunque aparezca en varias sesiones', () => {
  const bulgara = enBiblioteca('Sentadilla Búlgara');
  const r = resultado({
    biblioteca: [bulgara],
    sesiones: [
      sesion('2026-04-06', [ejercicio('Sentadilla Búlgara', { referencia: bulgara })]),
      sesion('2026-04-09', [ejercicio('Sentadilla Búlgara', { referencia: bulgara, orden: 2 })]),
    ],
  });

  const { error, payload } = prepararPayloadPlanFisico(r, [], {}, CONTEXTO);

  assert.equal(error, null);
  assert.equal(payload.ejerciciosNuevos.length, 1);
  assert.deepEqual(payload.ejerciciosNuevos[0], {
    clave: bulgara.clave,
    nombre: bulgara.nombre,
    bloque: bulgara.bloque,
    link: bulgara.link,
  });
  for (const e of ejerciciosDel(payload)) {
    assert.equal(e.ejercicioFuerzaId, null);
    assert.equal(e.claveNueva, bulgara.clave);
  }
});

test('la biblioteca del archivo se reconcilia por nombre normalizado, no por texto exacto', () => {
  const entrada = enBiblioteca('Sentadilla  BÚLGARA');
  const r = resultado({
    biblioteca: [entrada],
    sesiones: [sesion('2026-04-06', [ejercicio('Sentadilla  BÚLGARA', { referencia: entrada })])],
  });
  const club = [{ id: 'ej-bulgara', clave: clavearNombre('Sentadilla Búlgara'), nombre: 'Sentadilla Búlgara', bloque: 'FUERZA', link: null }];

  const { error, payload } = prepararPayloadPlanFisico(r, club, {}, CONTEXTO);

  assert.equal(error, null);
  assert.deepEqual(payload.ejerciciosNuevos, []);
  assert.equal(ejerciciosDel(payload)[0].ejercicioFuerzaId, 'ej-bulgara');
});

/* ---------- las decisiones del profe ---------- */

test('una decisión "existente" resuelve todas las apariciones del mismo nombre', () => {
  const filas = [1, 2, 3, 4, 5, 6].map((orden) => ejercicio('Press Plano', { orden }));
  const r = resultado({ sesiones: [sesion('2026-04-06', filas)] });
  const club = [{ id: 'ej-press', clave: clavearNombre('Press Plano'), nombre: 'Press Plano', bloque: 'FUERZA', link: null }];
  const decisiones = { porClave: { [clavearNombre('Press Plano')]: { tipo: 'existente', ejercicioId: 'ej-press' } } };

  const { error, payload, resumen } = prepararPayloadPlanFisico(r, club, decisiones, CONTEXTO);

  assert.equal(error, null);
  assert.equal(ejerciciosDel(payload).length, 6);
  for (const e of ejerciciosDel(payload)) assert.equal(e.ejercicioFuerzaId, 'ej-press');
  assert.equal(resumen.pendientes, 0);
});

test('una decisión "nueva" suma un alta con su clave normalizada y los ejercicios la referencian por claveNueva', () => {
  const r = resultado({
    sesiones: [sesion('2026-04-06', [ejercicio('Hip thrust'), ejercicio('Hip  THRUST', { orden: 2 })])],
  });
  const decisiones = {
    porClave: {
      [clavearNombre('Hip thrust')]: { tipo: 'nueva', nombre: 'Hip Thrust', bloque: 'POTENCIA', link: 'https://example.com/hip' },
    },
  };

  const { error, payload, resumen } = prepararPayloadPlanFisico(r, [], decisiones, CONTEXTO);

  assert.equal(error, null);
  assert.deepEqual(payload.ejerciciosNuevos, [
    { clave: clavearNombre('Hip Thrust'), nombre: 'Hip Thrust', bloque: 'POTENCIA', link: 'https://example.com/hip' },
  ]);
  for (const e of ejerciciosDel(payload)) {
    assert.equal(e.claveNueva, clavearNombre('Hip Thrust'));
    assert.equal(e.ejercicioFuerzaId, null);
  }
  assert.equal(resumen.ejerciciosNuevos, 1);
});

test('sin decisión, el ejercicio queda pendiente y conserva su nombre original', () => {
  const r = resultado({ sesiones: [sesion('2026-04-06', [ejercicio('Ejercicio Raro del Profe')])] });

  const { error, payload, resumen } = prepararPayloadPlanFisico(r, [], {}, CONTEXTO);

  assert.equal(error, null);
  const [e] = ejerciciosDel(payload);
  assert.equal(e.ejercicioFuerzaId, null);
  assert.equal(e.claveNueva, null);
  assert.equal(e.nombreOriginal, 'Ejercicio Raro del Profe');
  assert.equal(resumen.pendientes, 1);
});

test('un alta nueva que choca con una de la biblioteca del club es error: hay que elegir la existente', () => {
  const r = resultado({ sesiones: [sesion('2026-04-06', [ejercicio('Press plano')])] });
  const club = [{ id: 'ej-press', clave: clavearNombre('Press Plano'), nombre: 'Press Plano', bloque: 'FUERZA', link: null }];
  const decisiones = {
    porClave: { [clavearNombre('Press plano')]: { tipo: 'nueva', nombre: 'Press Plano', bloque: 'FUERZA', link: null } },
  };

  const { error, payload } = prepararPayloadPlanFisico(r, club, decisiones, CONTEXTO);

  assert.match(error, /Press Plano/);
  assert.equal(payload, null);
});

test('una decisión que apunta a un ejercicio que no está en la biblioteca del club es error', () => {
  const r = resultado({ sesiones: [sesion('2026-04-06', [ejercicio('Press Plano')])] });
  const decisiones = { porClave: { [clavearNombre('Press Plano')]: { tipo: 'existente', ejercicioId: 'ej-fantasma' } } };

  const { error, payload } = prepararPayloadPlanFisico(r, [], decisiones, CONTEXTO);

  assert.match(error, /ej-fantasma/);
  assert.equal(payload, null);
});

/* ---------- lo que no se importa ---------- */

test('un parser con errores no se importa', () => {
  const r = resultado({
    exito: false,
    errores: [{ hoja: null, fila: null, campo: null, mensaje: '[SIN_HOJAS_FUERZA] ninguna hoja tiene "(Fuerza)" en el nombre' }],
    sesiones: [sesion('2026-04-06', [ejercicio('Press Plano')])],
  });

  const { error, payload } = prepararPayloadPlanFisico(r, [], {}, CONTEXTO);

  assert.match(error, /SIN_HOJAS_FUERZA/);
  assert.equal(payload, null);
});

test('una sesión sin fecha es error, y el mensaje dice cuántas son', () => {
  const r = resultado({
    sesiones: [
      sesion('2026-04-06', [ejercicio('Press Plano')]),
      sesion(null, [ejercicio('Press Plano')]),
      sesion(null, [ejercicio('Press Plano')]),
    ],
  });

  const { error, payload } = prepararPayloadPlanFisico(r, [], {}, CONTEXTO);

  assert.match(error, /2/);
  assert.equal(payload, null);
});

test('un plan sin sesiones es error, no un import vacío', () => {
  const { error, payload } = prepararPayloadPlanFisico(resultado(), [], {}, CONTEXTO);

  assert.ok(error);
  assert.equal(payload, null);
});

test('falta clubId, plantelId o hashArchivo: error', () => {
  const r = resultado({ sesiones: [sesion('2026-04-06', [ejercicio('Press Plano')])] });
  for (const campo of ['clubId', 'plantelId', 'hashArchivo']) {
    const contexto = { ...CONTEXTO, [campo]: null };
    const { error, payload } = prepararPayloadPlanFisico(r, [], {}, contexto);
    assert.match(error, new RegExp(campo), `tendría que quejarse por ${campo}`);
    assert.equal(payload, null);
  }
});

/* ---------- el dato pasa tal cual ---------- */

test('series, reps, carga y pausa pasan como vienen: el texto no se convierte a número', () => {
  const r = resultado({
    sesiones: [sesion('2026-04-06', [
      ejercicio('Sentadilla', { series: 4, reps: '5xL', cargaSugerida: 'PC', pausa: "45''", notas: 'baja controlado' }),
      ejercicio('Plancha', { orden: 2, series: null, reps: "30''", cargaSugerida: null, pausa: null, notas: null }),
    ])],
  });

  const { error, payload } = prepararPayloadPlanFisico(r, [], {}, CONTEXTO);

  assert.equal(error, null);
  const [uno, dos] = ejerciciosDel(payload);
  assert.equal(uno.reps, '5xL');
  assert.equal(uno.cargaSugerida, 'PC');
  assert.equal(uno.pausa, "45''");
  assert.equal(uno.notas, 'baja controlado');
  assert.equal(uno.series, 4);
  assert.equal(dos.reps, "30''");
  assert.equal(dos.series, null);
  assert.equal(dos.cargaSugerida, null);
});

test('el payload no lleva escalón de carga: lo pone el profe después, por jugador', () => {
  const r = resultado({
    sesiones: [sesion('2026-04-06', [ejercicio('Sentadilla', { escalonKg: 40 })])],
  });

  const { error, payload } = prepararPayloadPlanFisico(r, [], {}, CONTEXTO);

  assert.equal(error, null);
  assert.equal('escalonKg' in ejerciciosDel(payload)[0], false);
  assert.equal('escalon_kg' in ejerciciosDel(payload)[0], false);
});

test('el payload lleva el contexto y las advertencias del parser tal cual', () => {
  const advertencias = [{ hoja: 'Abril (Fuerza)', fila: 7, campo: 'bloque', mensaje: '[SIN_BLOQUE] "Plancha" no tiene bloque' }];
  const r = resultado({ advertencias, sesiones: [sesion('2026-04-06', [ejercicio('Sentadilla')])] });

  const { payload, resumen } = prepararPayloadPlanFisico(r, [], {}, CONTEXTO);

  assert.equal(payload.clubId, 'club-1');
  assert.equal(payload.plantelId, 'plantel-1');
  assert.equal(payload.nombreArchivo, 'Fisico.xlsx');
  assert.equal(payload.hashArchivo, 'hash-1');
  assert.deepEqual(payload.advertencias, advertencias);
  assert.deepEqual(payload.sesiones.map((s) => s.fecha), ['2026-04-06']);
  assert.deepEqual(resumen, { sesiones: 1, ejercicios: 1, pendientes: 1, ejerciciosNuevos: 0 });
});

/* ---------- nunca lanza ---------- */

test('con entradas basura devuelve error, no excepción', () => {
  const basura = [
    [null, null, null, null],
    [undefined, [], {}, CONTEXTO],
    ['no soy un resultado', [], {}, CONTEXTO],
    [resultado({ sesiones: [sesion('2026-04-06', [ejercicio('X')])] }), null, null, null],
    [resultado({ sesiones: 'ninguna' }), [], {}, CONTEXTO],
    [resultado({ sesiones: [null] }), [], {}, CONTEXTO],
    [resultado({ sesiones: [sesion('2026-04-06', null)] }), [], {}, CONTEXTO],
    [resultado({ sesiones: [sesion('2026-04-06', [ejercicio('X')])] }), [], { porClave: 'nada' }, CONTEXTO],
    [resultado({ sesiones: [sesion('2026-04-06', [ejercicio('X')])] }), [], { porClave: { X: { tipo: 'otra cosa' } } }, CONTEXTO],
  ];
  for (const argumentos of basura) {
    const r = prepararPayloadPlanFisico(...argumentos);
    assert.ok(r.error, 'tendría que devolver error');
    assert.equal(r.payload, null);
  }
});
