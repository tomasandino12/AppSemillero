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

/**
 * Las dos series de la ficha del jugador: triples y libres, cada una con
 * práctica y partido sobre el mismo eje temporal.
 *
 * Práctica de triples = las 5 posiciones del arco SUMADAS en esa sesión
 * (x/50). Las 5 posiciones de la batería caen sobre el arco (ver
 * posiciones.js), y el boxscore de la CABB no trae desde dónde se tiró
 * (PARSER.md), así que ésta es la única pareja honesta a esa granularidad.
 *
 * NUNCA se resta una serie de la otra: la brecha la lee el entrenador
 * mirando, y una resta sugeriría una precisión que no existe.
 *
 * Los puntos sin intentos se descartan — un punto sin valor no es un punto.
 */
export function serieDeTiroDelJugador({ sesiones, medicionesTiro, partidos, estadisticas, jugadorId }) {
  const sesionesPorId = new Map(sesiones.map((s) => [s.id, s]));
  const porSesion = new Map();

  for (const m of medicionesTiro) {
    if (m.jugadorId !== jugadorId) continue;
    if (m.anotados == null) continue;   // ausente: no aporta a la serie
    const sesion = sesionesPorId.get(m.sesionId);
    if (!sesion || sesion.tipo !== 'tiro') continue;

    if (!porSesion.has(m.sesionId)) {
      porSesion.set(m.sesionId, {
        fecha: sesion.fecha,
        triplesAnotados: 0, triplesIntentados: 0,
        libresAnotados: 0, libresIntentados: 0,
      });
    }
    const acum = porSesion.get(m.sesionId);
    if (m.posicion === 'libres') {
      acum.libresAnotados += m.anotados;
      acum.libresIntentados += m.intentos;
    } else {
      acum.triplesAnotados += m.anotados;
      acum.triplesIntentados += m.intentos;
    }
  }

  const practica = [...porSesion.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const partidosPorId = new Map(partidos.map((p) => [p.id, p]));
  const delJugador = estadisticas
    .filter((e) => e.jugadorId === jugadorId && partidosPorId.has(e.partidoId))
    .map((e) => ({ ...e, fecha: partidosPorId.get(e.partidoId).fecha }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const serie = (fuente, anotados, intentos) => fuente
    .map((x) => ({ fecha: x.fecha, valor: porcentaje(x[anotados], x[intentos]) }))
    .filter((p) => p.valor != null);

  return {
    triples: {
      practica: serie(practica, 'triplesAnotados', 'triplesIntentados'),
      partido: serie(delJugador, 'tresAnotados', 'tresIntentados'),
    },
    libres: {
      practica: serie(practica, 'libresAnotados', 'libresIntentados'),
      partido: serie(delJugador, 'libresAnotados', 'libresIntentados'),
    },
  };
}

/**
 * La batería de tiro más reciente de un jugador, posición por posición.
 * `porPosicion[id]` es null cuando esa posición quedó en NULL (ausente),
 * que es distinto de 0 de 10.
 */
export function ultimaBateriaDeJugador(sesiones, medicionesTiro, jugadorId) {
  const conMedicion = new Set(
    medicionesTiro.filter((m) => m.jugadorId === jugadorId).map((m) => m.sesionId)
  );
  const candidatas = sesiones
    .filter((s) => s.tipo === 'tiro' && conMedicion.has(s.id))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!candidatas.length) return null;

  const sesion = candidatas[0];
  const porPosicion = {};
  for (const m of medicionesTiro) {
    if (m.jugadorId !== jugadorId || m.sesionId !== sesion.id) continue;
    porPosicion[m.posicion] = porcentaje(m.anotados, m.intentos);
  }
  return { sesionId: sesion.id, fecha: sesion.fecha, porPosicion };
}

/**
 * La batería de tiro más reciente de un jugador que tenga AL MENOS una
 * medición real (no todas en null). Es distinta de ultimaBateriaDeJugador:
 * esa devuelve la sesión más reciente donde el jugador aparece, aunque haya
 * estado ausente en las 6 posiciones; ésta busca la última vez que
 * efectivamente tiró, para poder mostrarla cuando la más reciente es una
 * ausencia completa.
 *
 * "Faltó a la del 5/4" e "hizo la del 5/3" son dos hechos distintos: la
 * ficha necesita poder mostrar los dos, así que esta función no reemplaza a
 * ultimaBateriaDeJugador, la complementa.
 */
export function ultimaBateriaConDatosDeJugador(sesiones, medicionesTiro, jugadorId) {
  const sesionesConDato = new Set(
    medicionesTiro
      .filter((m) => m.jugadorId === jugadorId && m.anotados != null)
      .map((m) => m.sesionId)
  );
  const candidatas = sesiones
    .filter((s) => s.tipo === 'tiro' && sesionesConDato.has(s.id))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!candidatas.length) return null;

  const sesion = candidatas[0];
  const porPosicion = {};
  for (const m of medicionesTiro) {
    if (m.jugadorId !== jugadorId || m.sesionId !== sesion.id) continue;
    porPosicion[m.posicion] = porcentaje(m.anotados, m.intentos);
  }
  return { sesionId: sesion.id, fecha: sesion.fecha, porPosicion };
}

/** Partido a partido de un jugador, del más reciente al más viejo. */
export function historialDePartidosDelJugador(partidos, estadisticas, jugadorId) {
  const partidosPorId = new Map(partidos.map((p) => [p.id, p]));
  return estadisticas
    .filter((e) => e.jugadorId === jugadorId && partidosPorId.has(e.partidoId))
    .map((e) => {
      const p = partidosPorId.get(e.partidoId);
      return {
        partidoId: e.partidoId,
        fecha: p.fecha,
        rivalNombre: p.rivalNombre,
        minSegundos: e.minSegundos,
        pts: e.pts,
        dos: porcentaje(e.dosAnotados, e.dosIntentados),
        tres: porcentaje(e.tresAnotados, e.tresIntentados),
        libres: porcentaje(e.libresAnotados, e.libresIntentados),
      };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * Promedio del plantel por posición sobre la última sesión de tiro, para HOY.
 * Los ausentes (anotados null) no entran en el promedio.
 */
export function promedioDeCanchaDelPlantel(sesiones, medicionesTiro) {
  const sesionesTiro = sesiones
    .filter((s) => s.tipo === 'tiro')
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!sesionesTiro.length) return null;

  const sesion = sesionesTiro[0];
  const acum = {};
  for (const m of medicionesTiro) {
    if (m.sesionId !== sesion.id || m.anotados == null) continue;
    if (!acum[m.posicion]) acum[m.posicion] = { anotados: 0, intentos: 0 };
    acum[m.posicion].anotados += m.anotados;
    acum[m.posicion].intentos += m.intentos;
  }

  const porPosicion = {};
  for (const [posicion, a] of Object.entries(acum)) {
    porPosicion[posicion] = porcentaje(a.anotados, a.intentos);
  }
  return { sesionId: sesion.id, fecha: sesion.fecha, porPosicion };
}
