export const SIN_BLOQUE = 'Sin bloque';

const redondear = (n) => Math.round(n * 10) / 10;
const promedio = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Cómo evolucionó cada bloque del plan de fuerza (FUERZA, POTENCIA, CORE…).
 *
 * El número es el % que subió cada chico en cada ejercicio respecto de SU
 * arranque en ese ejercicio, promediado dentro del bloque. No se promedian kg:
 * la sentadilla va con 60 y el press con 20, así que el día que entra un
 * ejercicio liviano el promedio en kg del bloque se desploma aunque todos
 * hayan subido. En %, un ejercicio nuevo entra en 0 y sube con los chicos.
 *
 * El arranque es el primer movimiento, por fecha, de ese chico en ese ejercicio (el que
 * siembra el import, o el que anotó el profe). Entre movimientos, cada chico
 * conserva su último peso: el promedio de un día incluye a todos los que ya
 * tenían peso, se hayan movido ese día o no.
 *
 * Como toda curva del proyecto, une los puntos observados y nada más.
 *
 * movimientos: [{ jugadorId, pasoId, kg, fecha: 'YYYY-MM-DD', orden }]
 * ejercicios:  [{ pasoId, nombre, bloque }]  (bloque null → "Sin bloque")
 */
export function cargasPorBloque(movimientos, ejercicios) {
  const porPaso = new Map((ejercicios ?? []).map((e) => [e.pasoId, e]));
  // Por fecha y, dentro del mismo día, por orden de llegada. Sólo por orden
  // fallaría con un movimiento fechado antes que llegó después; sólo por
  // fecha no desempata dos del mismo día.
  const ordenados = [...(movimientos ?? [])]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);

  // bloque → (jugador|paso) → movimientos en ese orden
  const bloques = new Map();
  for (const m of ordenados) {
    const bloque = porPaso.get(m.pasoId)?.bloque || SIN_BLOQUE;
    if (!bloques.has(bloque)) bloques.set(bloque, new Map());
    const pares = bloques.get(bloque);
    const clave = `${m.jugadorId}|${m.pasoId}`;
    if (!pares.has(clave)) pares.set(clave, []);
    pares.get(clave).push(m);
  }

  const resultado = [...bloques].map(([bloque, pares]) => resumenDeBloque(bloque, pares, porPaso));
  // En el orden en que aparecen; lo que el archivo dejó sin bloque, al final.
  return [
    ...resultado.filter((b) => b.bloque !== SIN_BLOQUE),
    ...resultado.filter((b) => b.bloque === SIN_BLOQUE),
  ];
}

function resumenDeBloque(bloque, pares, porPaso) {
  const listas = [...pares.values()];
  const fechas = [...new Set(listas.flat().map((m) => m.fecha))].sort();

  const serie = fechas.map((fecha) => {
    const pcts = [];
    const pasos = new Set();
    for (const movs of listas) {
      // Ya ordenados: el último con fecha <= a la del punto.
      const hasta = movs.filter((m) => m.fecha <= fecha);
      if (!hasta.length) continue;
      const arranque = Number(movs[0].kg);
      pcts.push(((Number(hasta[hasta.length - 1].kg) - arranque) / arranque) * 100);
      pasos.add(movs[0].pasoId);
    }
    return { fecha, pct: redondear(promedio(pcts)), ejercicios: pasos.size };
  });

  const porEjercicio = new Map();
  for (const movs of listas) {
    const pasoId = movs[0].pasoId;
    if (!porEjercicio.has(pasoId)) porEjercicio.set(pasoId, { arranques: [], actuales: [] });
    porEjercicio.get(pasoId).arranques.push(Number(movs[0].kg));
    porEjercicio.get(pasoId).actuales.push(Number(movs[movs.length - 1].kg));
  }
  const detalle = [...porEjercicio].map(([pasoId, e]) => ({
    nombre: porPaso.get(pasoId)?.nombre ?? pasoId,
    chicos: e.arranques.length,
    arranqueKg: redondear(promedio(e.arranques)),
    actualKg: redondear(promedio(e.actuales)),
  })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return {
    bloque,
    serie,
    pct: serie[serie.length - 1].pct,
    chicos: new Set(listas.map((movs) => movs[0].jugadorId)).size,
    ejercicios: detalle,
  };
}

/**
 * El bloque de cada ejercicio, por clave: el de su aparición más reciente en
 * las sesiones del plan (ejercicio_asignado), no el de la hoja "Ejercicios".
 * Esa hoja no trae todos los ejercicios con el mismo nombre (PRESS PLANO no
 * está) y a veces quedó vieja: si el profe lo reclasificó, lo último es lo
 * que vale.
 *
 * - Por fecha de sesión; el mismo día, gana la línea que va más abajo
 *   (`orden` mayor).
 * - Una aparición sin bloque no pisa a las anteriores.
 * - El valor va tal cual: AUX/CORE es un bloque más, no se reparte.
 * - Una clave sin bloque en ninguna aparición no entra (→ "Sin bloque").
 *
 * lineas: [{ clave, bloque, fecha: 'YYYY-MM-DD', orden }]
 */
export function bloquesPorClave(lineas) {
  const elegida = new Map();
  for (const l of lineas ?? []) {
    const bloque = typeof l.bloque === 'string' ? l.bloque.trim() : '';
    if (!bloque || !l.clave) continue;
    const previa = elegida.get(l.clave);
    const orden = l.orden ?? -Infinity;
    if (!previa || l.fecha > previa.fecha || (l.fecha === previa.fecha && orden > previa.orden)) {
      elegida.set(l.clave, { bloque, fecha: l.fecha, orden });
    }
  }
  return new Map([...elegida].map(([clave, e]) => [clave, e.bloque]));
}
