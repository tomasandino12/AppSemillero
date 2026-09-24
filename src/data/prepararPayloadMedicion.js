import { POSICIONES_BATERIA, INTENTOS_POR_POSICION } from './posiciones.js';

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
