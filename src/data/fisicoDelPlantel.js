/**
 * Velocidad, salto y resistencia del PLANTEL, una serie por prueba: por cada
 * sesión, el promedio de lo mejor que hizo cada chico que midió ese día.
 * Funciones puras: sin red, sin DOM.
 *
 * Es un promedio de quienes estuvieron, no de un grupo fijo: por eso cada
 * punto lleva cuántos chicos entraron (`chicos`) y la pantalla lo muestra. Un
 * ausente (valor null) no entra al promedio: "no se sabe" nunca es 0. Nunca se
 * compara un chico con otro; para eso está la ficha de cada uno.
 */
import { alturaDeSalto } from './salto.js';
import { metrosDe } from './yoyo.js';

const sabido = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Agrupa por sesión, se queda con el mejor valor de cada jugador (`mejor`
 * decide entre dos) y promedia. Sale de la fecha más vieja a la más nueva.
 * Sesiones sin ningún valor no aparecen.
 */
function serie(filas, valorDe, mejor) {
  const porSesion = new Map();
  for (const f of filas) {
    const v = valorDe(f);
    if (!sabido(v)) continue;
    if (!porSesion.has(f.sesionId)) porSesion.set(f.sesionId, { fecha: f.fecha, jugadores: new Map() });
    const { jugadores } = porSesion.get(f.sesionId);
    const previo = jugadores.get(f.jugadorId);
    jugadores.set(f.jugadorId, previo === undefined ? v : mejor(previo, v));
  }
  return [...porSesion.entries()]
    .map(([sesionId, { fecha, jugadores }]) => {
      const valores = [...jugadores.values()];
      return { sesionId, fecha, valor: valores.reduce((a, b) => a + b, 0) / valores.length, chicos: valores.length };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Tiempo total (ida y vuelta) en ms de una distancia; gana el menor de cada chico. */
export function serieSprintDelPlantel(intentos, distanciaM) {
  return serie(
    (intentos ?? []).filter((i) => i.distanciaM === distanciaM),
    (i) => i.tiempoMs,
    Math.min,
  );
}

/** Altura en cm de un test; gana el mejor intento de cada chico. */
export function serieSaltoDelPlantel(intentos, test) {
  return serie(
    (intentos ?? []).filter((i) => i.testSalto === test),
    (i) => (sabido(i.tiempoVueloMs) ? alturaDeSalto(i.tiempoVueloMs / 1000) : null),
    Math.max,
  );
}

/** Metros recorridos en el Yo-Yo. */
export function serieYoyoDelPlantel(resultados) {
  return serie(resultados ?? [], (r) => (sabido(r.idas) ? metrosDe(r.idas) : null), Math.max);
}
