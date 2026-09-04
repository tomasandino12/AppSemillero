/**
 * Cálculos estadísticos. Funciones puras: sin red, sin DOM, sin estado.
 * Las vistas sólo dibujan lo que estas funciones devuelven.
 */

/**
 * Umbral de muestra chica: por debajo de esta cantidad de intentos, un
 * porcentaje se muestra atenuado y marcado como "pocos datos".
 *
 * 10 es el tamaño fijo de una posición de la batería. Un chico de U17 tira
 * pocos triples por partido: mostrar un 50% que sale de 1 de 2 le enseña al
 * entrenador a leer ruido como si fuera señal.
 *
 * Es el ÚNICO lugar donde vive este número. Para ajustarlo, se cambia acá.
 */
export const UMBRAL_INTENTOS = 10;

export function esMuestraChica(intentos) {
  return intentos == null || intentos < UMBRAL_INTENTOS;
}

/**
 * Nunca devuelve un número pelado: quien quiera pintar el porcentaje tiene
 * el denominador en la mano sí o sí. Es la forma de que "ningún porcentaje
 * sin sus intentos" sea estructural y no una regla que alguien recuerde.
 *
 * Devuelve null cuando no hay nada que mostrar (sin intentos, o sin medir).
 * OJO: 0 anotados sobre 10 intentos NO es null — es un dato real.
 */
export function porcentaje(anotados, intentos) {
  if (anotados == null || intentos == null || intentos === 0) return null;
  return {
    pct: Math.round((anotados / intentos) * 100),
    anotados,
    intentos,
    muestraChica: esMuestraChica(intentos),
  };
}

/**
 * Reparto de un campo acumulable (minutos, puntos) entre los jugadores del
 * plantel, ordenado de mayor a menor.
 *
 * Los NULL no suman y se cuentan aparte: un minuto que no se pudo leer del
 * archivo no es un minuto que no se jugó.
 */
export function repartoPorJugador(estadisticas, campo) {
  const porJugador = new Map();
  let filasSinDato = 0;

  for (const e of estadisticas) {
    const valor = e[campo];
    if (valor == null) { filasSinDato += 1; continue; }
    porJugador.set(e.jugadorId, (porJugador.get(e.jugadorId) ?? 0) + valor);
  }

  const total = [...porJugador.values()].reduce((s, v) => s + v, 0);
  const filas = [...porJugador.entries()]
    .map(([jugadorId, valor]) => ({
      jugadorId,
      valor,
      porcentajeDelTotal: total === 0 ? 0 : (valor / total) * 100,
    }))
    .sort((a, b) => b.valor - a.valor);

  // "Cuántos concentran la mayoría": se acumula de mayor a menor hasta pasar
  // el 50%. Es literalmente "más de la mitad" — no un índice estadístico, que
  // es justo lo que no queremos mostrarle a un entrenador.
  let acumulado = 0;
  let jugadoresQueConcentranLaMitad = 0;
  if (total > 0) {
    for (const fila of filas) {
      acumulado += fila.valor;
      jugadoresQueConcentranLaMitad += 1;
      if (acumulado > total / 2) break;
    }
  }

  return { total, filas, jugadoresQueConcentranLaMitad, filasSinDato };
}

const CAMPOS_DE_TIRO = [
  'dosAnotados', 'dosIntentados',
  'tresAnotados', 'tresIntentados',
  'libresAnotados', 'libresIntentados',
];

/**
 * Porcentajes de tiro del equipo, partido a partido, ordenados por fecha.
 *
 * Los totales del equipo no están guardados en ningún lado: se suman las
 * filas de estadistica_jugador_partido de ese partido, que por diseño son
 * sólo jugadores propios (del rival nunca se guarda un jugador).
 */
export function evolucionDeTiroDelEquipo(partidos, estadisticas) {
  const porPartido = new Map();

  for (const e of estadisticas) {
    if (!porPartido.has(e.partidoId)) {
      porPartido.set(e.partidoId, Object.fromEntries(CAMPOS_DE_TIRO.map((c) => [c, 0])));
    }
    const acum = porPartido.get(e.partidoId);
    for (const campo of CAMPOS_DE_TIRO) {
      if (e[campo] != null) acum[campo] += e[campo];
    }
  }

  return [...partidos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((p) => {
      const a = porPartido.get(p.id) ?? Object.fromEntries(CAMPOS_DE_TIRO.map((c) => [c, 0]));
      return {
        partidoId: p.id,
        fecha: p.fecha,
        dos: porcentaje(a.dosAnotados, a.dosIntentados),
        tres: porcentaje(a.tresAnotados, a.tresIntentados),
        libres: porcentaje(a.libresAnotados, a.libresIntentados),
      };
    });
}
