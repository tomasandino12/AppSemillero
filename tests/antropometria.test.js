import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALTURA_MIN_CM, ALTURA_MAX_CM, PESO_MIN_KG, PESO_MAX_KG,
  edadEnAnios, ultimaMedicion, ultimaMedicionPorJugador, ordenarMediciones,
  validarMedicion, validarFechaNacimiento,
} from '../src/data/antropometria.js';

const HOY = '2026-09-05';

test('la edad no cuenta el año si todavía no cumplió', () => {
  assert.equal(edadEnAnios('2010-09-04', HOY), 16);   // cumplió ayer
  assert.equal(edadEnAnios('2010-09-05', HOY), 16);   // cumple hoy
  assert.equal(edadEnAnios('2010-09-06', HOY), 15);   // cumple mañana
  assert.equal(edadEnAnios('2010-12-31', HOY), 15);
});

test('sin fecha de nacimiento no hay edad, y no es cero', () => {
  assert.equal(edadEnAnios(null, HOY), null);
  assert.equal(edadEnAnios('', HOY), null);
  assert.equal(edadEnAnios(undefined, HOY), null);
});

test('la última medición es la de fecha más alta, no la última de la lista', () => {
  const m = [
    { fechaMedicion: '2026-03-01', alturaCm: 180 },
    { fechaMedicion: '2026-08-01', alturaCm: 184 },
    { fechaMedicion: '2026-05-01', alturaCm: 182 },
  ];
  assert.equal(ultimaMedicion(m).alturaCm, 184);
  assert.equal(ultimaMedicion([]), null);
  assert.equal(ultimaMedicion(null), null);
});

test('una medición por jugador, la más reciente de cada uno', () => {
  const mapa = ultimaMedicionPorJugador([
    { jugadorId: 'a', fechaMedicion: '2026-03-01', alturaCm: 180 },
    { jugadorId: 'a', fechaMedicion: '2026-08-01', alturaCm: 184 },
    { jugadorId: 'b', fechaMedicion: '2026-04-01', alturaCm: 175 },
  ]);
  assert.equal(mapa.get('a').alturaCm, 184);
  assert.equal(mapa.get('b').alturaCm, 175);
  assert.equal(mapa.get('c'), undefined);
  assert.equal(ultimaMedicionPorJugador([]).size, 0);
});

test('el histórico se muestra de la más reciente a la más vieja', () => {
  const orden = ordenarMediciones([
    { fechaMedicion: '2026-03-01' }, { fechaMedicion: '2026-08-01' }, { fechaMedicion: '2026-05-01' },
  ]).map((m) => m.fechaMedicion);
  assert.deepEqual(orden, ['2026-08-01', '2026-05-01', '2026-03-01']);
});

test('una medición válida se normaliza: altura entera, peso a un decimal', () => {
  const r = validarMedicion({ fechaMedicion: '2026-09-01', altura: '183', peso: '76,45' }, HOY);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
  assert.equal(r.valores.alturaCm, 183);
  assert.equal(r.valores.pesoKg, 76.5);
});

test('altura y peso son independientes: se puede cargar una sola', () => {
  const soloAltura = validarMedicion({ fechaMedicion: '2026-09-01', altura: '183', peso: '' }, HOY);
  assert.equal(soloAltura.ok, true);
  assert.equal(soloAltura.valores.pesoKg, null);

  const soloPeso = validarMedicion({ fechaMedicion: '2026-09-01', altura: '', peso: '70' }, HOY);
  assert.equal(soloPeso.ok, true);
  assert.equal(soloPeso.valores.alturaCm, null);
});

test('un campo vacío es null, nunca cero', () => {
  const r = validarMedicion({ fechaMedicion: '2026-09-01', altura: '180', peso: '  ' }, HOY);
  assert.equal(r.valores.pesoKg, null);
  assert.notEqual(r.valores.pesoKg, 0);
});

test('una fecha sola, sin ningún dato, no es una medición', () => {
  const r = validarMedicion({ fechaMedicion: '2026-09-01', altura: '', peso: '' }, HOY);
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /altura, peso o largo de pierna/);
});

test('la fecha de medición no puede ser futura', () => {
  const r = validarMedicion({ fechaMedicion: '2026-09-06', altura: '180', peso: '' }, HOY);
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /futura/);
  // Hoy sí es válida.
  assert.equal(validarMedicion({ fechaMedicion: HOY, altura: '180', peso: '' }, HOY).ok, true);
});

test('sin fecha no se guarda nada', () => {
  const r = validarMedicion({ fechaMedicion: '', altura: '180', peso: '70' }, HOY);
  assert.equal(r.ok, false);
});

test('altura y peso fuera de rango se rechazan, y los bordes se aceptan', () => {
  const base = { fechaMedicion: '2026-09-01' };
  assert.equal(validarMedicion({ ...base, altura: String(ALTURA_MIN_CM - 1), peso: '' }, HOY).ok, false);
  assert.equal(validarMedicion({ ...base, altura: String(ALTURA_MAX_CM + 1), peso: '' }, HOY).ok, false);
  assert.equal(validarMedicion({ ...base, altura: String(ALTURA_MIN_CM), peso: '' }, HOY).ok, true);
  assert.equal(validarMedicion({ ...base, altura: String(ALTURA_MAX_CM), peso: '' }, HOY).ok, true);

  assert.equal(validarMedicion({ ...base, altura: '', peso: String(PESO_MIN_KG - 1) }, HOY).ok, false);
  assert.equal(validarMedicion({ ...base, altura: '', peso: String(PESO_MAX_KG + 1) }, HOY).ok, false);
  assert.equal(validarMedicion({ ...base, altura: '', peso: String(PESO_MIN_KG) }, HOY).ok, true);
});

test('lo que no es un número se rechaza en vez de guardarse como null', () => {
  const r = validarMedicion({ fechaMedicion: '2026-09-01', altura: 'ciento ochenta', peso: '' }, HOY);
  assert.equal(r.ok, false);
  assert.match(r.errores.join(' '), /número/);
});

test('la fecha de nacimiento vacía es válida: significa que no se sabe', () => {
  const r = validarFechaNacimiento('', HOY);
  assert.equal(r.ok, true);
  assert.equal(r.valor, null);
});

test('la fecha de nacimiento no puede ser futura ni de hace 80 años', () => {
  assert.equal(validarFechaNacimiento('2026-09-06', HOY).ok, false);
  assert.equal(validarFechaNacimiento('1940-01-01', HOY).ok, false);
  assert.equal(validarFechaNacimiento('2009-06-15', HOY).ok, true);
});

test('validarMedicion acepta el largo de pierna y exige flexionada < extendida', () => {
  const ok = validarMedicion({ fechaMedicion: '2026-09-01', pierna: '92,5', piernaFlexionada: '41' }, '2026-09-23');
  assert.equal(ok.ok, true);
  assert.equal(ok.valores.piernaCm, 92.5);
  assert.equal(ok.valores.piernaFlexionadaCm, 41);
  assert.equal(ok.valores.alturaCm, null);
  const mal = validarMedicion({ fechaMedicion: '2026-09-01', pierna: '60', piernaFlexionada: '70' }, '2026-09-23');
  assert.equal(mal.ok, false);
  const fuera = validarMedicion({ fechaMedicion: '2026-09-01', pierna: '200' }, '2026-09-23');
  assert.equal(fuera.ok, false);
  const vacia = validarMedicion({ fechaMedicion: '2026-09-01' }, '2026-09-23');
  assert.equal(vacia.ok, false);
});
