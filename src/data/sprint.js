/**
 * Sprint de 30 m: validación del tiempo tecleado o cronometrado, velocidad
 * media y armado de las sesiones de un jugador. Funciones puras: sin red, sin DOM.
 *
 * En la base se guarda el tiempo en milisegundos (0048), nunca la velocidad:
 * la cuenta vive sólo acá. Menos tiempo es mejor: la variación negativa es
 * una mejora.
 */
import { decimalEstricto } from './numeros.js';

/** 20 m sólo si no hay 30 despejados. Sesiones de distinta distancia no se comparan. */
export const DISTANCIAS_SPRINT = [20, 30];
export const DISTANCIA_SPRINT_PREDETERMINADA = 30;
export const INTENTOS_SPRINT = 2;

/**
 * Tiempos posibles de un chico sobre 20 a 30 m. Fuera de eso casi siempre es
 * un dedo que se pasó. Los mismos números están como check en la base
 * (0048); tests/contratoSprint.test.js los compara.
 */
export const TIEMPO_SPRINT_MIN_MS = 2500;
export const TIEMPO_SPRINT_MAX_MS = 12000;

/** 'crear' = medido con las fotocélulas del CReAR (más exacto que el cronómetro del celular). */
export const ORIGENES_SPRINT = ['propio', 'crear'];

const sabido = (v) => typeof v === 'number' && Number.isFinite(v);

/** Segundos tecleados ("4,5", "4.53") → `{ ok, ms, error }`. */
export function validarTiempoSprint(texto) {
  const segundos = decimalEstricto(texto);
  if (segundos === null) return { ok: false, ms: null, error: 'Falta el tiempo.' };
  if (Number.isNaN(segundos)) {
    return { ok: false, ms: null, error: 'Escribí el tiempo en segundos, por ejemplo 4,5.' };
  }
  const ms = Math.round(segundos * 1000);
  if (ms < TIEMPO_SPRINT_MIN_MS || ms > TIEMPO_SPRINT_MAX_MS) {
    return {
      ok: false,
      ms: null,
      error: `El tiempo tiene que estar entre ${String(TIEMPO_SPRINT_MIN_MS / 1000).replace('.', ',')} y ${TIEMPO_SPRINT_MAX_MS / 1000} segundos.`,
    };
  }
  return { ok: true, ms, error: null };
}

/** 4530 → "4,5 s". */
export function formatearTiempoSprint(ms) {
  if (!sabido(ms)) return null;
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

/** m/s con un decimal. null si falta el tiempo o la distancia. */
export function velocidadMedia(ms, distanciaM) {
  if (!sabido(ms) || !sabido(distanciaM) || ms <= 0 || distanciaM <= 0) return null;
  return Math.round((distanciaM / (ms / 1000)) * 10) / 10;
}

/** El de menor tiempo. null si no corrió. */
export function mejorIntentoSprint(intentos) {
  const validos = (intentos ?? []).filter((i) => sabido(i?.tiempoMs));
  if (!validos.length) return null;
  return validos.reduce((mejor, i) => (i.tiempoMs < mejor.tiempoMs ? i : mejor));
}

/**
 * Los intentos de UN jugador agrupados por sesión, la más reciente primero.
 * `origen` de la sesión es 'crear' si algún intento lo es.
 */
export function sesionesDeSprint(intentos) {
  const porSesion = new Map();
  for (const i of intentos ?? []) {
    if (!porSesion.has(i.sesionId)) {
      porSesion.set(i.sesionId, {
        sesionId: i.sesionId, fecha: i.fecha, distanciaM: i.distanciaM, origen: 'propio', intentos: [],
      });
    }
    const sesion = porSesion.get(i.sesionId);
    if (i.origen === 'crear') sesion.origen = 'crear';
    sesion.intentos.push(i);
  }
  return [...porSesion.values()]
    .map((s) => {
      s.intentos.sort((a, b) => a.intento - b.intento);
      return { ...s, mejor: mejorIntentoSprint(s.intentos) };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * De las sesiones de UNA distancia (la más reciente primero, como las deja
 * `sesionesDeSprint`) que tienen tiempo: la última y las anteriores.
 * `variacionMs` = última − anterior (negativo = mejoró); null con una sola.
 */
export function ultimaYAnterioresSprint(sesiones, distanciaM) {
  const conDato = (sesiones ?? []).filter((s) => s.distanciaM === distanciaM && s.mejor);
  if (!conDato.length) return null;
  const [ultima, ...anteriores] = conDato;
  const variacionMs = anteriores.length
    ? ultima.mejor.tiempoMs - anteriores[0].mejor.tiempoMs
    : null;
  return { ultima, anteriores, variacionMs };
}

/**
 * Cómo se lee la variación entre dos sesiones de la misma distancia. Bajar el
 * tiempo es mejorar: `mejora` es true si bajó, false si subió y null si quedó
 * igual a la décima (que es lo que se muestra) o no hay con qué comparar.
 */
export function variacionSprint(variacionMs) {
  if (!sabido(variacionMs)) return { texto: null, mejora: null };
  const decimas = Math.round(Math.abs(variacionMs) / 100);
  if (decimas === 0) return { texto: 'igual', mejora: null };
  const signo = variacionMs < 0 ? '−' : '+';
  return { texto: `${signo}${(decimas / 10).toFixed(1).replace('.', ',')} s`, mejora: variacionMs < 0 };
}
