/**
 * Metas de tiro por zona, fijadas por el cuerpo técnico.
 *
 * La app NUNCA afirma cuál es el porcentaje correcto para una categoría: no
 * existen normas confiables para estas edades y no se inventan. Eso está
 * decidido para todo el proyecto.
 *
 * Una meta que fija el entrenador es otra cosa y es legítima: "vamos a llegar
 * a 30% desde el arco" es una decisión de entrenamiento. La app la registra y
 * la muestra rotulada como lo que es —la meta del cuerpo técnico—, nunca como
 * un estándar propio.
 *
 * **La app no sugiere metas.** Ni a partir del promedio histórico ni de nada:
 * sugerir un número sería inventar una norma por la puerta de atrás. Por eso
 * acá no hay ningún valor por defecto y no existe ninguna función que
 * proponga uno. El default es no tener meta.
 *
 * Los valores viven en la tabla `meta_zona` (0013), por plantel — o sea por
 * categoría y temporada. Este módulo sólo tiene la lógica pura de leerlos.
 */

import { decimalEstricto } from './numeros.js';

/** Sin metas fijadas. Es el estado en el que arranca el piloto. */
export const SIN_METAS = {};

/** El porcentaje meta de una zona, o null si el cuerpo técnico no fijó ninguno. */
export function metaDeZona(zonaId, metas = SIN_METAS) {
  const valor = metas?.[zonaId];
  return typeof valor === 'number' ? valor : null;
}

/** true si hay al menos una meta fijada. Si no, la card no habla del tema. */
export function hayMetas(metas = SIN_METAS) {
  return Object.values(metas ?? {}).some((v) => typeof v === 'number');
}

/**
 * Si una zona alcanzó su meta. null cuando no hay meta o no hay dato: sin
 * meta no se juzga, y sin medición no se inventa un "no llegó".
 *
 * Alcanzar es llegar o pasar: una meta de 30% con 30% exacto está cumplida.
 */
export function alcanzaMeta(valor, meta) {
  if (valor == null || meta == null) return null;
  return valor.pct >= meta;
}

/**
 * Cuántas zonas alcanzaron su meta, sobre el total de zonas CON meta fijada.
 * Devuelve null si no hay ninguna meta: la card entonces no muestra el conteo.
 */
export function resumenDeMetas(zonas) {
  const conMeta = (zonas ?? []).filter((z) => z.meta != null && z.valor != null);
  if (!conMeta.length) return null;
  return {
    alcanzadas: conMeta.filter((z) => alcanzaMeta(z.valor, z.meta)).length,
    conMeta: conMeta.length,
  };
}

/**
 * Valida lo que el profe escribió en la pantalla de edición.
 *
 * Vacío es válido y significa "sin meta" — así se borra una. Cero también es
 * válido y es distinto de vacío, aunque en la práctica nadie ponga 0%.
 */
export function validarMeta(entrada) {
  if (entrada == null || String(entrada).trim() === '') {
    return { ok: true, valor: null, error: null };
  }
  const n = decimalEstricto(entrada);
  if (!Number.isFinite(n)) return { ok: false, valor: null, error: 'Tiene que ser un número.' };
  if (n < 0 || n > 100) return { ok: false, valor: null, error: 'Tiene que estar entre 0 y 100.' };
  return { ok: true, valor: Math.round(n), error: null };
}
