import { POSICIONES_BATERIA, INTENTOS_POR_POSICION } from './posiciones.js';
import { DISTANCIAS_SPRINT } from './sprint.js';

/**
 * Borrador de batería → payload de guardar_sesion_medicion.
 *
 * `valores` es { [jugadorId]: { ausente?: boolean, esq_izq?: 0..10, ... } }.
 *
 * Tres estados distintos, y el esquema los distingue a propósito:
 * - Jugador ausente        → 6 filas con anotados null (estuvo, no midió).
 * - Posición sin cargar    → sin fila (no se llegó a medir esa posición).
 * - Jugador sin nada       → sin ninguna fila (la sesión nunca llegó a él).
 *
 * Un 0 cargado SÍ genera fila: 0 de 10 es un dato real.
 */
export function prepararPayloadBateria({ clubId, plantelId, fecha, valores, sesionId }) {
  const mediciones = [];

  for (const [jugadorId, datos] of Object.entries(valores ?? {})) {
    if (datos?.ausente) {
      for (const pos of POSICIONES_BATERIA) {
        mediciones.push({ jugadorId, posicion: pos.id, anotados: null, intentos: INTENTOS_POR_POSICION });
      }
      continue;
    }
    for (const pos of POSICIONES_BATERIA) {
      const anotados = datos?.[pos.id];
      if (anotados == null) continue;
      mediciones.push({ jugadorId, posicion: pos.id, anotados, intentos: INTENTOS_POR_POSICION });
    }
  }

  return { clubId, plantelId, fecha, tipo: 'tiro', mediciones, sesionId };
}

/**
 * Borrador de salto → payload. `valores[jugadorId]` es `{ ausente: true }` o
 * `{ intentos: [{ tiempoVueloMs, fpsCaptura }] }`.
 *
 * Igual que en batería: ausente es una fila sin tiempo ni fps (estuvo, no
 * saltó); un chico sin ningún intento cargado no genera nada (la sesión no
 * llegó a él). Un intento sin tiempo o sin fps no viaja: los checks de la base
 * exigen que vayan juntos, y los que sí viajan se numeran 1..n sin huecos.
 */
export function prepararPayloadSalto({ sesionId, clubId, plantelId, fecha, testSalto, valores }) {
  const mediciones = [];
  for (const [jugadorId, datos] of Object.entries(valores ?? {})) {
    if (datos?.ausente) {
      mediciones.push({ jugadorId, intento: 1 });
      continue;
    }
    const cargados = (datos?.intentos ?? []).filter(
      (i) => i?.tiempoVueloMs != null && i?.fpsCaptura != null,
    );
    cargados.forEach((i, idx) => {
      mediciones.push({
        jugadorId,
        intento: idx + 1,
        tiempoVueloMs: i.tiempoVueloMs,
        fpsCaptura: i.fpsCaptura,
      });
    });
  }
  return { clubId, plantelId, fecha, tipo: 'salto', testSalto, mediciones, sesionId };
}

/**
 * Borrador de sprint (ida y vuelta) → payload. `valores[jugadorId]` es
 * `{ ausente: true }` o `{ intentos: [{ parcialMs, tiempoMs } | null, ...] }`:
 * por intento, el tiempo de la ida (`parcialMs`) y el total (`tiempoMs`), en ms.
 *
 * Igual que en el salto: ausente es una sola fila sin tiempos (estuvo, no
 * corrió); un chico sin ningún intento cargado no genera nada; un intento sin
 * total no viaja y los que sí viajan se numeran 1..n sin huecos.
 */
export function prepararPayloadSprint({
  sesionId, clubId, plantelId, fecha, distanciaSprintM, valores,
}) {
  if (!DISTANCIAS_SPRINT.includes(distanciaSprintM)) {
    throw new Error(`Distancia de sprint inválida: ${distanciaSprintM}`);
  }
  const mediciones = [];
  for (const [jugadorId, datos] of Object.entries(valores ?? {})) {
    if (datos?.ausente) {
      mediciones.push({ jugadorId, intento: 1, tiempoMs: null, parcialMs: null });
      continue;
    }
    const cargados = (datos?.intentos ?? []).filter((i) => i?.tiempoMs != null);
    cargados.forEach((i, idx) => {
      mediciones.push({
        jugadorId, intento: idx + 1, tiempoMs: i.tiempoMs, parcialMs: i.parcialMs ?? null,
      });
    });
  }
  return { clubId, plantelId, fecha, tipo: 'sprint', distanciaSprintM, mediciones, sesionId };
}

/**
 * Borrador de Yo-Yo → payload. `valores[jugadorId]` es `{ ausente: true }` o
 * `{ idas: n }` (las idas completas al quedar afuera).
 *
 * Una fila por jugador. Ausente es `idas: null` (estuvo, no corrió); 0 idas es
 * un dato real (quedó afuera en la primera). Un jugador sin nada en el
 * borrador no viaja: la sesión no llegó a él.
 */
export function prepararPayloadYoyo({ sesionId, clubId, plantelId, fecha, valores }) {
  const mediciones = [];
  for (const [jugadorId, datos] of Object.entries(valores ?? {})) {
    if (datos?.ausente) {
      mediciones.push({ jugadorId, idas: null });
    } else if (datos?.idas != null) {
      mediciones.push({ jugadorId, idas: datos.idas });
    }
  }
  return { clubId, plantelId, fecha, tipo: 'yoyo', mediciones, sesionId };
}
