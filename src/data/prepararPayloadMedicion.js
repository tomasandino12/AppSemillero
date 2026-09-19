import { POSICIONES_BATERIA, INTENTOS_POR_POSICION } from './posiciones.js';
import { decimalEstricto } from './numeros.js';

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
export function prepararPayloadBateria({ clubId, plantelId, fecha, valores }) {
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

  return { clubId, plantelId, fecha, tipo: 'tiro', mediciones };
}

/**
 * Un decimal, siempre. Un cronómetro a mano tiene error humano de ~0.2s;
 * sobre 5 segundos eso es 4%. Mostrar centésimas sería precisión falsa.
 * Devuelve null para cualquier cosa que no sea un tiempo positivo.
 *
 * La coma se normaliza a punto antes de todo: el teclado numérico de un
 * celular en es-AR ofrece coma como tecla decimal, y Number('4,7') es NaN.
 * Sin esto, "4,7" se pierde en silencio y ese jugador no entra al payload.
 */
export function redondearSegundos(valor) {
  const n = decimalEstricto(valor);
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

/** Borrador de velocidad → payload. `valores` es { [jugadorId]: '4.7' }. */
export function prepararPayloadVelocidad({ clubId, plantelId, fecha, valores }) {
  const mediciones = [];
  for (const [jugadorId, crudo] of Object.entries(valores ?? {})) {
    const segundos = redondearSegundos(crudo);
    if (segundos == null) continue;
    mediciones.push({ jugadorId, segundos });
  }
  return { clubId, plantelId, fecha, tipo: 'velocidad', mediciones };
}
