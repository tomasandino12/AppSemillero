import { crearClienteSupabase } from './cliente.js';

let clienteCache = null;
function obtenerCliente() {
  if (!clienteCache) clienteCache = crearClienteSupabase();
  return clienteCache;
}

const TAMANIO_PAGINA = 1000;

export async function obtenerJugadoresDelClub(clubId) {
  const supabase = obtenerCliente();
  const data = [];
  let desde = 0;
  for (;;) {
    const hasta = desde + TAMANIO_PAGINA - 1;
    const { data: pagina, error } = await supabase
      .from('jugador')
      .select('id, nombre_clave, nombre_limpio, pertenencia(plantel_id, hasta)')
      .eq('club_id', clubId)
      .range(desde, hasta);
    if (error) throw error;
    data.push(...pagina);
    if (pagina.length < TAMANIO_PAGINA) break;
    desde += TAMANIO_PAGINA;
  }
  return data.map((fila) => ({
    id: fila.id,
    nombreClave: fila.nombre_clave,
    nombreLimpio: fila.nombre_limpio,
    plantelesActuales: fila.pertenencia.filter((p) => p.hasta === null).map((p) => p.plantel_id),
  }));
}

export async function buscarImportacionPorHash(clubId, hashArchivo) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('importacion')
    .select('id, nombre_archivo, id_partido_cabb')
    .eq('club_id', clubId)
    .eq('hash_archivo', hashArchivo)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function crearImportacion({ clubId, hashArchivo, idPartidoCabb, nombreArchivo, advertencias }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('importacion')
    .insert({
      club_id: clubId,
      hash_archivo: hashArchivo,
      id_partido_cabb: idPartidoCabb,
      nombre_archivo: nombreArchivo,
      advertencias,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function crearPartido({ clubId, plantelId, importacionId, fecha, condicionPropia, rivalNombre, puntosPropios, puntosRival }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('partido')
    .insert({
      club_id: clubId,
      plantel_id: plantelId,
      importacion_id: importacionId,
      fecha,
      condicion_propia: condicionPropia,
      rival_nombre: rivalNombre,
      puntos_propios: puntosPropios,
      puntos_rival: puntosRival,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function crearJugador({ clubId, nombreClave, nombreLimpio, desambiguador = '' }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('jugador')
    .insert({ club_id: clubId, nombre_clave: nombreClave, nombre_limpio: nombreLimpio, desambiguador })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function crearPertenencia({ clubId, jugadorId, plantelId, temporadaId, desde }) {
  const supabase = obtenerCliente();
  const { error } = await supabase
    .from('pertenencia')
    .insert({ club_id: clubId, jugador_id: jugadorId, plantel_id: plantelId, temporada_id: temporadaId, desde });
  if (error) throw error;
}

/**
 * Precondición: todo elemento de `estadisticas` debe traer `jugadorId` resuelto
 * (no null) — el caller es responsable de resolver cada uno vía crearJugador/
 * pertenencia antes de llamar acá, porque estadistica_jugador_partido.jugador_id
 * es not null en el esquema.
 */
export async function crearEstadisticas(clubId, partidoId, estadisticas) {
  const sinResolver = estadisticas.filter((e) => e.jugadorId == null).map((e) => e.nombreClave);
  if (sinResolver.length > 0) {
    throw new Error(`no se puede persistir estadisticas de jugadores sin resolver: ${sinResolver.join(', ')}`);
  }
  const supabase = obtenerCliente();
  const filas = estadisticas.map((e) => ({
    club_id: clubId,
    partido_id: partidoId,
    jugador_id: e.jugadorId,
    numero: e.numero,
    nombre_crudo: e.nombreCrudo,
    min_segundos: e.minSegundos,
    pts: e.pts,
    dos_anotados: e.dosAnotados,
    dos_intentados: e.dosIntentados,
    dos_porcentaje: e.dosPorcentaje,
    tres_anotados: e.tresAnotados,
    tres_intentados: e.tresIntentados,
    tres_porcentaje: e.tresPorcentaje,
    libres_anotados: e.libresAnotados,
    libres_intentados: e.libresIntentados,
    libres_porcentaje: e.libresPorcentaje,
    reb_def: e.rebDef,
    reb_of: e.rebOf,
    reb_tot: e.rebTot,
    ast: e.ast,
    rec: e.rec,
    per: e.per,
    tap_cometidos: e.tapCometidos,
    tap_recibidos: e.tapRecibidos,
    fal_cometidas: e.falCometidas,
    fal_recibidas: e.falRecibidas,
    val: e.val,
    mas_menos: e.masMenos,
  }));
  const { error } = await supabase.from('estadistica_jugador_partido').insert(filas);
  if (error) throw error;
}
