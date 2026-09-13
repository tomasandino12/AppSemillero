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


/* ---------- Card de HOY: comparaciones con su margen de error ---------- */

/**
 * Nivel de confianza de toda comparación de la card de HOY: 1,96 desviaciones
 * estándar, o sea 95%.
 *
 * Conservador a propósito. En una app cuyo problema es que el entrenador lea
 * ruido como si fuera señal, equivocarse hacia "no muestro flecha" cuesta
 * mucho menos que hacia "le digo que el equipo mejoró".
 */
export const Z_CONFIANZA = 1.96;

/**
 * Margen de una diferencia entre dos porcentajes, en puntos porcentuales.
 *
 * Usa el ajuste de Agresti-Caffo (sumar un acierto y un error a cada muestra)
 * en vez del error estándar crudo. Sin ese ajuste una zona con 10 de 10 daría
 * error estándar cero, y CUALQUIER diferencia contra ella se declararía
 * concluyente — justo la falsa precisión que hay que evitar.
 *
 * Con dos baterías de ~700 intentos al 35% da unos 5 puntos: por debajo de
 * eso, la diferencia entre dos sesiones no se distingue del ruido.
 */
export function margenDeDiferencia(a, b) {
  if (!a || !b) return null;
  const ajustar = (anotados, intentos) => ({ p: (anotados + 1) / (intentos + 2), n: intentos + 2 });
  const A = ajustar(a.anotados, a.intentos);
  const B = ajustar(b.anotados, b.intentos);
  const varianza = (A.p * (1 - A.p)) / A.n + (B.p * (1 - B.p)) / B.n;
  return Z_CONFIANZA * Math.sqrt(varianza) * 100;
}

/**
 * Compara dos porcentajes ya calculados por porcentaje().
 *
 * `pp` es la diferencia en puntos porcentuales, positiva cuando el primero es
 * mayor. `concluyente` dice si supera el margen: SÓLO entonces la card puede
 * pintar una flecha o un color. Cuando es false el número igual se muestra,
 * en tono neutro y marcado como no concluyente.
 *
 * Devuelve null si falta cualquiera de los dos: sin batería anterior no se
 * inventa un cero ni una flecha.
 */
export function compararPorcentajes(actual, anterior) {
  if (!actual || !anterior) return null;
  const pp = actual.pct - anterior.pct;
  const margen = margenDeDiferencia(actual, anterior);
  return { pp, margen, concluyente: Math.abs(pp) > margen };
}

/**
 * Suma por zona las mediciones de UNA sesión, y cuenta cuántos jugadores
 * midieron algo en ella.
 *
 * Los denominadores salen de las filas reales y nunca se asumen: un jugador
 * ausente no suma intentos, así que 14 jugadores por 10 tiros no son 140 si
 * dos faltaron.
 */
export function zonasDeSesion(medicionesTiro, sesionId) {
  const acum = {};
  const jugadores = new Set();
  for (const m of medicionesTiro ?? []) {
    if (m.sesionId !== sesionId || m.anotados == null) continue;
    jugadores.add(m.jugadorId);
    if (!acum[m.posicion]) acum[m.posicion] = { anotados: 0, intentos: 0 };
    acum[m.posicion].anotados += m.anotados;
    acum[m.posicion].intentos += m.intentos;
  }
  const porZona = {};
  for (const [id, a] of Object.entries(acum)) porZona[id] = porcentaje(a.anotados, a.intentos);
  return { porZona, jugadoresQueMidieron: jugadores.size };
}

/**
 * Las zonas más flojas de una lista YA ordenada de peor a mejor.
 *
 * Devuelve más de una cuando están empatadas dentro del margen: presentar la
 * última del ranking como "el problema" cuando está a un punto de otras tres
 * es inventar una conclusión que el dato no sostiene.
 *
 * `concluyente` es true sólo cuando hay una sola zona y se separa del resto.
 * Las zonas por debajo del umbral de muestra quedan afuera del foco.
 */
export function zonasDelFoco(zonasOrdenadas) {
  const conDato = (zonasOrdenadas ?? []).filter((z) => z.valor && !z.valor.muestraChica);
  if (!conDato.length) return null;

  const peor = conDato[0];
  const empatadas = [peor];
  for (const z of conDato.slice(1)) {
    const c = compararPorcentajes(z.valor, peor.valor);
    if (c && c.concluyente) break;
    empatadas.push(z);
  }
  return { zonas: empatadas.map((z) => z.id), concluyente: empatadas.length === 1 };
}

/** Los jugadores de una zona en una sesión, del más flojo al mejor. */
export function jugadoresDeZona(medicionesTiro, sesionId, zonaId) {
  return (medicionesTiro ?? [])
    .filter((m) => m.sesionId === sesionId && m.posicion === zonaId && m.anotados != null)
    .map((m) => ({ jugadorId: m.jugadorId, valor: porcentaje(m.anotados, m.intentos) }))
    .filter((j) => j.valor != null)
    .sort((a, b) => a.valor.pct - b.valor.pct);
}

/**
 * Cuántos jugadores quedan por debajo del objetivo del club. null cuando no
 * hay objetivo fijado — que es el estado por defecto, y entonces la card no
 * habla del tema.
 */
export function contarPorDebajo(jugadores, objetivo) {
  if (objetivo == null) return null;
  return (jugadores ?? []).filter((j) => j.valor && j.valor.pct < objetivo).length;
}

/**
 * Varias zonas sumadas en un solo porcentaje.
 *
 * La card lo usa para el total del arco: con ~700 intentos (5 zonas × 14
 * jugadores × 10 tiros) es la única comparación entre baterías con
 * resolución suficiente para encender una señal mes a mes. Zona por zona son
 * 140 intentos y el margen ronda los 11 puntos, así que ahí casi nunca se
 * puede afirmar nada.
 *
 * Los tiros libres quedan AFUERA a propósito: es otro tiro, con otro
 * porcentaje, y promediarlo con los del arco da un número que no es ninguno
 * de los dos.
 */
export function totalDeZonas(porZona, zonaIds) {
  let anotados = 0;
  let intentos = 0;
  for (const id of zonaIds ?? []) {
    const v = porZona?.[id];
    if (!v) continue;
    anotados += v.anotados;
    intentos += v.intentos;
  }
  return porcentaje(anotados, intentos);
}

/**
 * La serie temporal de un conjunto de zonas, un punto por batería.
 *
 * Existe porque comparar sólo contra la batería anterior tira información:
 * el margen de error invalida la comparación entre DOS puntos, pero no
 * invalida mirar seis y ver que suben. Esa lectura la hace el entrenador —
 * la app une los puntos observados y no dibuja ninguna tendencia ni afirma
 * que algo esté mejorando.
 *
 * Con `zonaIds` = las 5 del arco da la serie del arco completo (~700
 * intentos por punto, la única con muestra para que se lea). Con una sola
 * zona da la de esa zona (~140 por punto).
 *
 * Ordenada de la más vieja a la más nueva. Las sesiones sin ninguna medición
 * real de esas zonas no generan punto: un hueco no es un cero.
 */
export function serieDeZonas(sesiones, medicionesTiro, zonaIds) {
  return (sesiones ?? [])
    .filter((s) => s.tipo === 'tiro')
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((s) => ({
      sesionId: s.id,
      fecha: s.fecha,
      valor: totalDeZonas(zonasDeSesion(medicionesTiro, s.id).porZona, zonaIds),
    }))
    .filter((p) => p.valor != null);
}

/**
 * La misma serie que serieDeZonas, pero a partir de SUMAS por sesión y
 * posición en vez de filas por jugador.
 *
 * Existe para el panorama de coordinación: el coordinador no tiene acceso a
 * mediciones individuales, y la base le devuelve anotados e intentos ya
 * sumados entre jugadores (panorama_del_club, 0017). El porcentaje, el umbral
 * y la muestra chica salen de porcentaje(), igual que en todo el proyecto.
 *
 * Con `zonaIds` = las 5 posiciones da triples; con ['libres'], libres. Nunca
 * se piden juntas: son dos tiros distintos.
 *
 * filas: [{ sesionId, fecha, posicion, anotados, intentos, jugadoresQueMidieron }]
 */
export function serieDeZonasAgregada(filas, zonaIds) {
  const porSesion = new Map();
  for (const f of filas ?? []) {
    if (!zonaIds.includes(f.posicion)) continue;
    if (!porSesion.has(f.sesionId)) {
      porSesion.set(f.sesionId, {
        sesionId: f.sesionId,
        fecha: f.fecha,
        jugadoresQueMidieron: f.jugadoresQueMidieron,
        anotados: 0,
        intentos: 0,
      });
    }
    const acum = porSesion.get(f.sesionId);
    acum.anotados += f.anotados;
    acum.intentos += f.intentos;
  }
  return [...porSesion.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((s) => ({
      sesionId: s.sesionId,
      fecha: s.fecha,
      jugadoresQueMidieron: s.jugadoresQueMidieron,
      valor: porcentaje(s.anotados, s.intentos),
    }))
    .filter((p) => p.valor != null);
}
