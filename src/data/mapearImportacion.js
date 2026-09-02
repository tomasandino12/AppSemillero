const DISTANCIA_MAXIMA_SUGERENCIA = 2;

function extraerApellido(nombreLimpio) {
  const idx = nombreLimpio.indexOf(',');
  return idx === -1 ? nombreLimpio.trim() : nombreLimpio.slice(0, idx).trim();
}

export function distanciaLevenshtein(a, b) {
  const filas = a.length + 1;
  const columnas = b.length + 1;
  const dp = Array.from({ length: filas }, () => new Array(columnas).fill(0));
  for (let i = 0; i < filas; i++) dp[i][0] = i;
  for (let j = 0; j < columnas; j++) dp[0][j] = j;
  for (let i = 1; i < filas; i++) {
    for (let j = 1; j < columnas; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + costo,
      );
    }
  }
  return dp[filas - 1][columnas - 1];
}

// Web Crypto (crypto.subtle) en vez de node:crypto: disponible nativamente
// en Node >= 19 y en cualquier navegador, sin import — mapearImportacion.js
// debe seguir funcionando si algún día corre del lado del cliente.
export async function calcularHashArchivo(datos) {
  const bytes = datos instanceof ArrayBuffer
    ? datos
    : datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function esDuplicado(hash, hashesExistentes) {
  return hashesExistentes.includes(hash);
}

function mapearMetricas(jugadorArchivo) {
  return {
    numero: jugadorArchivo.numero,
    nombreCrudo: jugadorArchivo.nombreCrudo,
    nombreLimpio: jugadorArchivo.nombreLimpio,
    nombreClave: jugadorArchivo.nombreClave,
    minSegundos: jugadorArchivo.min ? jugadorArchivo.min.segundos : null,
    pts: jugadorArchivo.pts,
    dosAnotados: jugadorArchivo.dos.anotados,
    dosIntentados: jugadorArchivo.dos.intentados,
    dosPorcentaje: jugadorArchivo.dos.porcentaje,
    tresAnotados: jugadorArchivo.tres.anotados,
    tresIntentados: jugadorArchivo.tres.intentados,
    tresPorcentaje: jugadorArchivo.tres.porcentaje,
    libresAnotados: jugadorArchivo.libres.anotados,
    libresIntentados: jugadorArchivo.libres.intentados,
    libresPorcentaje: jugadorArchivo.libres.porcentaje,
    rebDef: jugadorArchivo.reb.def,
    rebOf: jugadorArchivo.reb.of,
    rebTot: jugadorArchivo.reb.tot,
    ast: jugadorArchivo.ast,
    rec: jugadorArchivo.rec,
    per: jugadorArchivo.per,
    tapCometidos: jugadorArchivo.tap.cometidos,
    tapRecibidos: jugadorArchivo.tap.recibidos,
    falCometidas: jugadorArchivo.fal.cometidas,
    falRecibidas: jugadorArchivo.fal.recibidas,
    val: jugadorArchivo.val,
    masMenos: jugadorArchivo.masMenos,
  };
}

function buscarCoincidenciaExacta(jugadorArchivo, jugadoresExistentes) {
  return jugadoresExistentes.find((j) => j.nombreClave === jugadorArchivo.nombreClave) ?? null;
}

function buscarSugerencia(jugadorArchivo, jugadoresExistentes) {
  const apellidoArchivo = extraerApellido(jugadorArchivo.nombreLimpio);
  let mejor = null;
  for (const existente of jugadoresExistentes) {
    if (existente.nombreClave === jugadorArchivo.nombreClave) continue;
    const distancia = distanciaLevenshtein(jugadorArchivo.nombreClave, existente.nombreClave);
    const mismoApellido = extraerApellido(existente.nombreLimpio) === apellidoArchivo;
    if (distancia > DISTANCIA_MAXIMA_SUGERENCIA && !mismoApellido) continue;
    if (!mejor || distancia < mejor.distancia) {
      mejor = { candidato: existente, distancia, mismoApellido };
    }
  }
  return mejor;
}

/**
 * Puro: sin red, sin Supabase, sin generar IDs. Clasifica la salida del
 * parser (ver PARSER.md) en datos listos para persistir. condicionPropia
 * ("local"|"visitante") es un dato que decide el entrenador — nunca se
 * infiere comparando nombres de club.
 */
export function mapearImportacion(resultadoParser, contexto, jugadoresExistentes) {
  const vacio = {
    error: null,
    partido: null,
    estadisticas: [],
    jugadoresNuevos: [],
    jugadoresCoincidentes: [],
    sugerencias: [],
  };

  if (contexto.condicionPropia !== 'local' && contexto.condicionPropia !== 'visitante') {
    return { ...vacio, error: `condicionPropia debe ser "local" o "visitante", se recibió ${JSON.stringify(contexto.condicionPropia)}` };
  }
  if (!resultadoParser || resultadoParser.errores.length > 0) {
    return { ...vacio, error: 'el resultado del parser tiene errores; no se puede mapear una importación a partir de un parseo incompleto' };
  }
  if (resultadoParser.equipos.length !== 2) {
    return { ...vacio, error: `se esperaban 2 equipos en el resultado del parser, se encontraron ${resultadoParser.equipos.length}` };
  }

  const equipoPropio = resultadoParser.equipos.find((e) => e.condicion === contexto.condicionPropia);
  const equipoRival = resultadoParser.equipos.find((e) => e.condicion !== contexto.condicionPropia);

  const partido = {
    clubId: contexto.clubId,
    plantelId: contexto.plantelId,
    fecha: contexto.fecha,
    condicionPropia: contexto.condicionPropia,
    rivalNombre: equipoRival.nombre,
    puntosPropios: equipoPropio.totales ? equipoPropio.totales.pts : null,
    puntosRival: equipoRival.totales ? equipoRival.totales.pts : null,
  };

  const pertenenciaPropuesta = { plantelId: contexto.plantelId, temporadaId: contexto.temporadaId, desde: contexto.fecha };

  const estadisticas = [];
  const jugadoresNuevos = [];
  const jugadoresCoincidentes = [];
  const sugerencias = [];

  for (const jugadorArchivo of equipoPropio.jugadores) {
    const metricas = mapearMetricas(jugadorArchivo);
    const exacto = buscarCoincidenciaExacta(jugadorArchivo, jugadoresExistentes);
    if (exacto) {
      const requierePertenenciaNueva = !exacto.plantelesActuales.includes(contexto.plantelId);
      jugadoresCoincidentes.push({
        jugadorId: exacto.id,
        nombreClave: jugadorArchivo.nombreClave,
        requierePertenenciaNueva,
        ...(requierePertenenciaNueva ? { pertenenciaPropuesta } : {}),
      });
      estadisticas.push({ ...metricas, jugadorId: exacto.id });
      continue;
    }

    const sugerencia = buscarSugerencia(jugadorArchivo, jugadoresExistentes);
    if (sugerencia) {
      sugerencias.push({
        nombreClave: jugadorArchivo.nombreClave,
        nombreLimpio: jugadorArchivo.nombreLimpio,
        candidato: {
          jugadorId: sugerencia.candidato.id,
          nombreClave: sugerencia.candidato.nombreClave,
          nombreLimpio: sugerencia.candidato.nombreLimpio,
        },
        razon: sugerencia.distancia <= DISTANCIA_MAXIMA_SUGERENCIA ? 'nombre_similar' : 'mismo_apellido',
      });
      estadisticas.push({ ...metricas, jugadorId: null });
      continue;
    }

    jugadoresNuevos.push({
      nombreClave: jugadorArchivo.nombreClave,
      nombreLimpio: jugadorArchivo.nombreLimpio,
      nombreCrudo: jugadorArchivo.nombreCrudo,
      pertenenciaPropuesta,
    });
    estadisticas.push({ ...metricas, jugadorId: null });
  }

  return { error: null, partido, estadisticas, jugadoresNuevos, jugadoresCoincidentes, sugerencias };
}
