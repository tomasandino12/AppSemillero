/**
 * Puro: sin red, sin cliente de base de datos, sin generar IDs. Reconcilia
 * las decisiones del entrenador (qué sugerencia es "el mismo" jugador o "otro",
 * qué jugadores nuevos se excluyen) contra la clasificación de
 * mapearImportacion, y arma el payload exacto que espera el RPC
 * importar_partido (ver 0005_rpc_importar_partido.sql).
 */
export function prepararPayloadImportacion(resultadoMapeo, jugadoresExistentes, decisiones, contexto) {
  if (!resultadoMapeo || resultadoMapeo.error) {
    return { error: 'no se puede preparar el payload de un mapeo con error', payload: null };
  }

  const nuevosExcluidos = new Set(decisiones.nuevosExcluidos ?? []);
  const decisionesSugerencias = decisiones.sugerencias ?? {};

  for (const s of resultadoMapeo.sugerencias) {
    const decision = decisionesSugerencias[s.nombreClave];
    if (decision !== 'mismo' && decision !== 'otro') {
      return { error: `falta decisión para la sugerencia "${s.nombreClave}" (es el mismo / es otro)`, payload: null };
    }
  }

  const plantelId = resultadoMapeo.partido.plantelId;
  const fecha = resultadoMapeo.partido.fecha;
  const pertenenciaPropuestaBase = { plantelId, temporadaId: contexto.temporadaId, desde: fecha };

  const jugadoresPorId = new Map(jugadoresExistentes.map((j) => [j.id, j]));
  const jugadorIdResueltoPorNombreClave = new Map();

  const jugadoresNuevos = resultadoMapeo.jugadoresNuevos.filter((j) => !nuevosExcluidos.has(j.nombreClave));
  const pertenenciasNuevas = resultadoMapeo.jugadoresCoincidentes
    .filter((c) => c.requierePertenenciaNueva)
    .map((c) => ({ jugadorId: c.jugadorId, ...c.pertenenciaPropuesta }));

  for (const s of resultadoMapeo.sugerencias) {
    const decision = decisionesSugerencias[s.nombreClave];
    if (decision === 'otro') {
      if (nuevosExcluidos.has(s.nombreClave)) continue;
      jugadoresNuevos.push({
        nombreClave: s.nombreClave,
        nombreLimpio: s.nombreLimpio,
        nombreCrudo: s.nombreLimpio,
        pertenenciaPropuesta: pertenenciaPropuestaBase,
      });
      continue;
    }
    const candidatoId = s.candidato.jugadorId;
    const existente = jugadoresPorId.get(candidatoId);
    const requierePertenenciaNueva = !existente || !existente.plantelesActuales.includes(plantelId);
    jugadorIdResueltoPorNombreClave.set(s.nombreClave, candidatoId);
    if (requierePertenenciaNueva) {
      pertenenciasNuevas.push({ jugadorId: candidatoId, ...pertenenciaPropuestaBase });
    }
  }

  const estadisticas = resultadoMapeo.estadisticas
    .filter((e) => !nuevosExcluidos.has(e.nombreClave))
    .map((e) => {
      if (e.jugadorId !== null) return e;
      const jugadorId = jugadorIdResueltoPorNombreClave.get(e.nombreClave);
      return jugadorId === undefined ? e : { ...e, jugadorId };
    });

  return {
    error: null,
    payload: {
      clubId: resultadoMapeo.partido.clubId,
      hashArchivo: contexto.hashArchivo,
      idPartidoCabb: contexto.idPartidoCabb,
      nombreArchivo: contexto.nombreArchivo,
      advertencias: contexto.advertencias,
      partido: resultadoMapeo.partido,
      jugadoresNuevos,
      pertenenciasNuevas,
      estadisticas,
    },
  };
}
