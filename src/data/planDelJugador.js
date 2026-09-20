import { claveDeEjercicio } from './escalones.js';

/*
 * Lógica pura de la pantalla FÍSICO del jugador: qué sesión le toca y qué peso
 * lleva en cada línea. Sin red, sin DOM. El plan ya viene elegido de la base
 * (mi_plan(), 0030); acá sólo se ordena y se elige "la próxima".
 *
 * Las fechas son 'AAAA-MM-DD' y se comparan como texto, que en ese formato
 * ordena igual que las fechas. `hoy` lo pasa quien llama (escalones.fechaLocal):
 * "hoy" es el día del dispositivo, no el de UTC.
 */

/** Todas las sesiones de los planes, por fecha, cada una con la categoría de su plan. */
export function sesionesDeLosPlanes(planes) {
  return sesionesOrdenadas((planes ?? []).flatMap((p) =>
    p.sesiones.map((s) => ({ ...s, plantelId: p.plantelId, categoria: p.categoria }))));
}

/** Por fecha, la más próxima primero. No toca la lista original. */
export function sesionesOrdenadas(sesiones) {
  return [...(sesiones ?? [])].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

/**
 * La sesión de hoy si la hay; si no, la primera futura; si ya pasaron todas (o
 * no hay ninguna), null. Con dos planteles y sesión hoy en los dos, la primera
 * en el orden que traiga la lista.
 */
export function proximaSesion(sesiones, hoy) {
  const ordenadas = sesionesOrdenadas(sesiones);
  return ordenadas.find((s) => s.fecha === hoy) ?? ordenadas.find((s) => s.fecha > hoy) ?? null;
}

/**
 * El último peso del jugador en una línea del plan, o null si no tiene. Línea y
 * ejercicio se unen por la clave del nombre, igual que en FÍSICO del profe
 * (escalones.pasoDeLinea): un nombre distinto es otro ejercicio.
 */
export function pesoDeLinea(linea, pesos) {
  const clave = claveDeEjercicio(linea.nombreOriginal);
  const peso = (pesos ?? []).find((p) => p.clave === clave);
  return peso ? peso.kg : null;
}
