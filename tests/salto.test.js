import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  G, TV_MIN_S, TV_MAX_S, FPS_MIN,
  cuadrosEntre, tiempoDeVuelo, alturaDeSalto, validarTiempoDeVuelo,
  potenciaSamozino, mejorIntento, rangoDeIntentos, vigenteALaFecha, sesionesDeSalto,
  pareceSinCamaraLenta, ultimaYAnteriores,
} from '../src/data/salto.js';

const cerca = (real, esperado, tolerancia = 0.01) => assert.ok(
  Math.abs(real - esperado) < tolerancia,
  `${real} no está cerca de ${esperado}`,
);

test('constantes del protocolo', () => {
  assert.equal(G, 9.81);
  assert.equal(TV_MIN_S, 0.10);
  assert.equal(TV_MAX_S, 1.00);
  assert.equal(FPS_MIN, 120);
});

test('tv 0,5 s da 30,66 cm', () => {
  cerca(alturaDeSalto(0.5), 30.66);
});

test('cuadros se redondean al entero más cercano', () => {
  // El caso real del S24 FE: 104 cuadros de archivo a 33,33 ms.
  const intervalo = 1 / 30;
  assert.equal(cuadrosEntre(10, 10 + 104 * intervalo + 0.004, intervalo), 104);
  assert.equal(cuadrosEntre(10, 10 + 104 * intervalo - 0.004, intervalo), 104);
  assert.equal(cuadrosEntre(0, 0.34 * intervalo, intervalo), 0);
  cerca(tiempoDeVuelo(104, 240), 0.4333, 0.0001);
  cerca(alturaDeSalto(tiempoDeVuelo(104, 240)), 23.0, 0.05);
});

test('aterrizaje antes del despegue da cuadros negativos', () => {
  assert.equal(cuadrosEntre(2, 1, 0.5), -2);
});

test('tv fuera de rango se rechaza con motivo', () => {
  assert.deepEqual(validarTiempoDeVuelo(0.43), { ok: true, motivo: null });
  assert.equal(validarTiempoDeVuelo(TV_MIN_S).ok, true);
  assert.equal(validarTiempoDeVuelo(TV_MAX_S).ok, true);
  for (const tv of [0.05, 1.5, 0, -0.2, Number.NaN, null, undefined]) {
    const r = validarTiempoDeVuelo(tv);
    assert.equal(r.ok, false, `${tv} debería rechazarse`);
    assert.equal(typeof r.motivo, 'string');
  }
  // Un tv de 3,5 s casi siempre es un video de 30 fps tomado como si fuera 240.
  assert.match(validarTiempoDeVuelo(3.5).motivo, /fps/);
  assert.match(validarTiempoDeVuelo(-0.2).motivo, /después del despegue/);
});

test('potencia null si falta peso o pierna', () => {
  const completo = { masaKg: 60, alturaCm: 30, piernaCm: 95, piernaFlexionadaCm: 55 };
  assert.notEqual(potenciaSamozino(completo), null);
  for (const campo of Object.keys(completo)) {
    assert.equal(potenciaSamozino({ ...completo, [campo]: null }), null, `sin ${campo}`);
    assert.equal(potenciaSamozino({ ...completo, [campo]: undefined }), null, `sin ${campo}`);
  }
  // Pierna flexionada más larga que la extendida: dato imposible, no una potencia negativa.
  assert.equal(potenciaSamozino({ ...completo, piernaFlexionadaCm: 95 }), null);
});

test('potencia de un caso a mano', () => {
  // m = 60 kg, h = 0,30 m, hpo = 0,95 − 0,55 = 0,40 m.
  // F = 60·9,81·(0,30/0,40 + 1) = 1030,05 N; v = √(9,81·0,30/2) = 1,2131 m/s.
  const r = potenciaSamozino({ masaKg: 60, alturaCm: 30, piernaCm: 95, piernaFlexionadaCm: 55 });
  cerca(r.fuerzaN, 1030.05);
  cerca(r.velocidadMs, 1.2131, 0.0001);
  cerca(r.potenciaW, 1249.51);
  cerca(r.potenciaWKg, 20.83);
});

test('mejor intento ignora ausentes', () => {
  const intentos = [
    { tiempoVueloMs: 420, fpsCaptura: 240 },
    null,
    { tiempoVueloMs: null, fpsCaptura: 240 },
    { tiempoVueloMs: 445.83, fpsCaptura: 240 },
    { tiempoVueloMs: 433.33, fpsCaptura: 240 },
  ];
  assert.deepEqual(mejorIntento(intentos), { tiempoVueloMs: 445.83, fpsCaptura: 240 });
  assert.equal(mejorIntento([null, { tiempoVueloMs: null }]), null);
  assert.equal(mejorIntento([]), null);
  assert.equal(mejorIntento(undefined), null);
});

test('el rango de intentos es la diferencia de altura entre el mejor y el peor', () => {
  const intentos = [{ tiempoVueloMs: 400 }, null, { tiempoVueloMs: 500 }, { tiempoVueloMs: 450 }];
  cerca(rangoDeIntentos(intentos), alturaDeSalto(0.5) - alturaDeSalto(0.4));
  assert.equal(rangoDeIntentos([{ tiempoVueloMs: 400 }, null]), null, 'con uno solo no hay rango');
  assert.equal(rangoDeIntentos([]), null);
});

test('vigente toma el último con fecha menor o igual', () => {
  const mediciones = [
    { fechaMedicion: '2026-03-01', pesoKg: 55, piernaCm: null },
    { fechaMedicion: '2026-09-23', pesoKg: 58, piernaCm: 92 },
    { fechaMedicion: '2026-06-10', pesoKg: 57, piernaCm: 90 },
    { fechaMedicion: '2026-08-01', pesoKg: null, piernaCm: 91 },
    { fechaMedicion: '2026-10-01', pesoKg: 60, piernaCm: 93 },
  ];
  assert.equal(vigenteALaFecha(mediciones, '2026-09-23', 'pesoKg'), 58, 'el mismo día cuenta');
  assert.equal(vigenteALaFecha(mediciones, '2026-09-01', 'pesoKg'), 57, 'salta la que no tiene peso');
  assert.equal(vigenteALaFecha(mediciones, '2026-09-01', 'piernaCm'), 91);
  assert.equal(vigenteALaFecha(mediciones, '2026-04-01', 'piernaCm'), null, 'no se sabe, no 0');
  assert.equal(vigenteALaFecha(mediciones, '2026-01-01', 'pesoKg'), null);
  assert.equal(vigenteALaFecha([], '2026-01-01', 'pesoKg'), null);
});

test('serie de salto toma el mejor por sesión', () => {
  const intentos = [
    { sesionId: 'a', fecha: '2026-06-01', testSalto: 'cmj', intento: 1, tiempoVueloMs: 400 },
    { sesionId: 'a', fecha: '2026-06-01', testSalto: 'cmj', intento: 2, tiempoVueloMs: 480 },
    { sesionId: 'b', fecha: '2026-09-01', testSalto: 'cmj', intento: 1, tiempoVueloMs: null },
    { sesionId: 'c', fecha: '2026-09-10', testSalto: 'abalakov', intento: 1, tiempoVueloMs: 500 },
  ];
  const corporales = [
    { fechaMedicion: '2026-05-01', pesoKg: 60, piernaCm: 90, piernaFlexionadaCm: 40 },
  ];
  const serie = sesionesDeSalto(intentos, corporales);
  assert.deepEqual(serie.map((s) => s.sesionId), ['c', 'b', 'a'], 'la más reciente primero');
  const a = serie[2];
  assert.equal(a.mejor.tiempoVueloMs, 480);
  cerca(a.mejor.alturaCm, alturaDeSalto(0.48));
  cerca(a.rangoCm, alturaDeSalto(0.48) - alturaDeSalto(0.4));
  assert.ok(a.mejor.potenciaWKg > 0, 'con peso y piernas hay potencia');
  assert.equal(serie[1].mejor, null, 'la sesión de ausente no tiene mejor');
  assert.equal(serie[1].intentos.length, 1);
  assert.equal(serie[0].testSalto, 'abalakov');
});

test('sin datos corporales la serie de salto no inventa potencia', () => {
  const intentos = [{ sesionId: 'a', fecha: '2026-06-01', testSalto: 'cmj', intento: 1, tiempoVueloMs: 400 }];
  const s = sesionesDeSalto(intentos, null)[0];
  assert.equal(s.mejor.potenciaW, null);
  assert.equal(s.mejor.potenciaWKg, null);
  cerca(s.mejor.alturaCm, alturaDeSalto(0.4));
});

test('pareceSinCamaraLenta: el vuelo sólo es posible leído a la velocidad del archivo', () => {
  const a30 = 1 / 30;
  // El caso real: 14 cuadros de un archivo que perdió la cámara lenta.
  assert.equal(pareceSinCamaraLenta(14, 240, a30), true);
  // Cámara lenta sana, estirada a 30 fps: 104 cuadros son 3,5 s de archivo.
  assert.equal(pareceSinCamaraLenta(104, 240, a30), false);
  // Archivo a 240 fps reales: 14 cuadros son 58 ms también a la velocidad del archivo.
  assert.equal(pareceSinCamaraLenta(14, 240, 1 / 240), false);
  // Si el vuelo ya es posible con los fps de captura, no hay nada que avisar.
  assert.equal(pareceSinCamaraLenta(100, 240, a30), false);
  assert.equal(pareceSinCamaraLenta(0, 240, a30), false);
});

test('el ejemplo de la guía da 1852 W y 19,5 W/kg (pivot) y 1485 W y 22,9 W/kg (base)', () => {
  const pivot = potenciaSamozino({
    masaKg: 95, alturaCm: 30, piernaCm: 105, piernaFlexionadaCm: 58,
  });
  assert.equal(Math.round(pivot.potenciaW), 1852);
  assert.equal(pivot.potenciaWKg.toFixed(1), '19.5');
  const base = potenciaSamozino({
    masaKg: 65, alturaCm: 35, piernaCm: 95, piernaFlexionadaCm: 50,
  });
  assert.equal(Math.round(base.potenciaW), 1485);
  assert.equal(base.potenciaWKg.toFixed(1), '22.9');
  assert.equal(alturaDeSalto(0.45).toFixed(1), '24.8');
});

test('ultimaYAnteriores separa la última de las anteriores', () => {
  const sesiones = [
    { sesionId: 'a', testSalto: 'cmj', mejor: { alturaCm: 30 } },
    { sesionId: 'b', testSalto: 'abalakov', mejor: { alturaCm: 35 } },
    { sesionId: 'c', testSalto: 'cmj', mejor: null },
    { sesionId: 'd', testSalto: 'cmj', mejor: { alturaCm: 28 } },
  ];
  const r = ultimaYAnteriores(sesiones, 'cmj');
  assert.equal(r.ultima.sesionId, 'a');
  assert.deepEqual(r.anteriores.map((s) => s.sesionId), ['c', 'd']);
});

test('ultimaYAnteriores sin sesiones de ese test devuelve null', () => {
  assert.equal(ultimaYAnteriores([], 'cmj'), null);
  assert.equal(ultimaYAnteriores([{ sesionId: 'a', testSalto: 'abalakov', mejor: { alturaCm: 1 } }], 'cmj'), null);
  assert.equal(ultimaYAnteriores([{ sesionId: 'a', testSalto: 'cmj', mejor: null }], 'cmj'), null);
});
