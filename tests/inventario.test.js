import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPOS, tipoDe, validarMaterial, buscarIgual, agruparInventario,
  etiquetaDeFila, ultimoCambio, textoYaExiste,
} from '../src/data/inventario.js';

const fila = (extra) => ({
  id: 'x', tipo: 'mancuerna', pesoKg: 10, detalle: '', cantidad: 2,
  actualizadoPor: 'u1', actualizadoEn: '2026-09-18T12:00:00+00:00', ...extra,
});

/* ---------- tipos ---------- */

test('TIPOS son los once de la migración, en el mismo orden', () => {
  assert.deepEqual(TIPOS.map((t) => t.clave), [
    'mancuerna', 'disco', 'barra', 'pesa_rusa', 'balon_medicinal',
    'pelota', 'cono', 'soga', 'escalerita', 'banda', 'otro',
  ]);
});

test('el peso de cada tipo coincide con los check de 0026', () => {
  const peso = Object.fromEntries(TIPOS.map((t) => [t.clave, t.peso]));
  for (const c of ['mancuerna', 'disco', 'barra', 'pesa_rusa', 'balon_medicinal']) assert.equal(peso[c], 'obligatorio', c);
  for (const c of ['pelota', 'cono', 'soga', 'escalerita', 'banda']) assert.equal(peso[c], 'no', c);
  assert.equal(peso.otro, 'opcional');
});

test('tipoDe devuelve null para un tipo que no existe', () => {
  assert.equal(tipoDe('mancuerna').nombre, 'Mancuerna');
  assert.equal(tipoDe('valla'), null);
});

/* ---------- validar ---------- */

test('validarMaterial: mancuerna con peso decimal y coma', () => {
  assert.deepEqual(
    validarMaterial({ tipo: 'mancuerna', peso: '2,5', detalle: '', cantidad: '4' }),
    { error: null, fila: { tipo: 'mancuerna', pesoKg: 2.5, detalle: '', cantidad: 4 } },
  );
});

test('validarMaterial: un tipo con peso sin número da error', () => {
  const r = validarMaterial({ tipo: 'disco', peso: '', detalle: '', cantidad: '1' });
  assert.equal(r.fila, null);
  assert.match(r.error, /número/);
});

test('validarMaterial: en un tipo sin peso ignora lo que venga en peso', () => {
  const r = validarMaterial({ tipo: 'pelota', peso: '3', detalle: ' N° 7 ', cantidad: 15 });
  assert.deepEqual(r.fila, { tipo: 'pelota', pesoKg: null, detalle: 'N° 7', cantidad: 15 });
});

test('validarMaterial: "otro" exige nombre y deja el peso opcional', () => {
  assert.match(validarMaterial({ tipo: 'otro', peso: '', detalle: '  ', cantidad: '1' }).error, /qué es/);
  assert.equal(validarMaterial({ tipo: 'otro', peso: '', detalle: 'Vallas', cantidad: '8' }).fila.pesoKg, null);
  assert.equal(validarMaterial({ tipo: 'otro', peso: '5', detalle: 'Chaleco', cantidad: '3' }).fila.pesoKg, 5);
  assert.match(validarMaterial({ tipo: 'otro', peso: 'cinco', detalle: 'Chaleco', cantidad: '3' }).error, /kg/);
});

test('validarMaterial: la cantidad es un entero de 1 para arriba', () => {
  for (const cantidad of ['0', '-1', '1,5', '', 'dos']) {
    assert.match(validarMaterial({ tipo: 'cono', peso: '', detalle: '', cantidad }).error, /cantidad/i, cantidad);
  }
});

test('validarMaterial: sin tipo da error', () => {
  assert.match(validarMaterial({ tipo: '', peso: '', detalle: '', cantidad: '1' }).error, /tipo/);
});

/* ---------- buscar igual ---------- */

test('buscarIgual usa la misma regla que el índice único', () => {
  const filas = [
    fila({ id: 'a' }),
    fila({ id: 'b', tipo: 'cono', pesoKg: null }),
    fila({ id: 'c', tipo: 'otro', pesoKg: null, detalle: 'Vallas' }),
  ];
  assert.equal(buscarIgual(filas, { tipo: 'mancuerna', pesoKg: 10, detalle: '' })?.id, 'a');
  assert.equal(buscarIgual(filas, { tipo: 'mancuerna', pesoKg: 12, detalle: '' }), null);
  assert.equal(buscarIgual(filas, { tipo: 'cono', pesoKg: null, detalle: '' })?.id, 'b');
  assert.equal(buscarIgual(filas, { tipo: 'otro', pesoKg: null, detalle: 'vallas' })?.id, 'c');
  assert.equal(buscarIgual(filas, { tipo: 'otro', pesoKg: 2, detalle: 'Vallas' }), null);
});

/* ---------- agrupar y mostrar ---------- */

test('agruparInventario: secciones en orden, grupos en el orden de TIPOS, sin vacíos', () => {
  const secciones = agruparInventario([
    fila({ id: 'v', tipo: 'otro', pesoKg: null, detalle: 'Vallas' }),
    fila({ id: 'p', tipo: 'pelota', pesoKg: null, detalle: 'N° 7' }),
    fila({ id: 'd', tipo: 'disco', pesoKg: 5 }),
    fila({ id: 'm', tipo: 'mancuerna', pesoKg: 10 }),
  ]);
  assert.deepEqual(secciones.map((s) => s.titulo), ['Con peso', 'Sin peso', 'Otros']);
  assert.deepEqual(secciones[0].grupos.map((g) => g.titulo), ['Mancuernas', 'Discos']);
  assert.deepEqual(secciones[1].grupos.map((g) => g.tipo), ['pelota']);
});

test('agruparInventario: dentro de un grupo, por peso y después por detalle', () => {
  const [conPeso] = agruparInventario([
    fila({ id: '10', pesoKg: 10 }),
    fila({ id: '2,5', pesoKg: 2.5 }),
    fila({ id: '5b', pesoKg: 5, detalle: 'hexagonal' }),
    fila({ id: '5a', pesoKg: 5, detalle: '' }),
  ]);
  assert.deepEqual(conPeso.grupos[0].filas.map((f) => f.id), ['2,5', '5a', '5b', '10']);
});

test('agruparInventario: sin filas, sin secciones', () => {
  assert.deepEqual(agruparInventario([]), []);
});

test('etiquetaDeFila: peso primero en los tipos fijos, nombre primero en "otro"', () => {
  assert.equal(etiquetaDeFila(fila({ tipo: 'barra', pesoKg: 10, detalle: 'EZ' })), '10 kg · EZ');
  assert.equal(etiquetaDeFila(fila({ tipo: 'disco', pesoKg: 1.25 })), '1,25 kg');
  assert.equal(etiquetaDeFila(fila({ tipo: 'pelota', pesoKg: null, detalle: 'N° 7' })), 'N° 7');
  assert.equal(etiquetaDeFila(fila({ tipo: 'otro', pesoKg: 5, detalle: 'Chaleco lastrado' })), 'Chaleco lastrado · 5 kg');
  assert.equal(etiquetaDeFila(fila({ tipo: 'cono', pesoKg: null })), '');
});

test('ultimoCambio: la fila con actualizadoEn más reciente', () => {
  const r = ultimoCambio([
    fila({ id: 'viejo', actualizadoEn: '2026-09-10T10:00:00+00:00' }),
    fila({ id: 'nuevo', actualizadoEn: '2026-09-18T09:00:00.5+00:00' }),
    fila({ id: 'medio', actualizadoEn: '2026-09-15T23:00:00-03:00' }),
  ]);
  assert.equal(r.id, 'nuevo');
  assert.equal(ultimoCambio([]), null);
});

test('textoYaExiste nombra el grupo, la variante y la cantidad', () => {
  assert.equal(
    textoYaExiste(fila({ pesoKg: 10, cantidad: 2 })),
    'Ya está en el inventario: Mancuernas · 10 kg (2 unid.).',
  );
  assert.equal(
    textoYaExiste(fila({ tipo: 'cono', pesoKg: null, cantidad: 20 })),
    'Ya está en el inventario: Conos (20 unid.).',
  );
});
