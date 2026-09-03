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

export async function iniciarSesion(email, password) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function cerrarSesion() {
  const supabase = obtenerCliente();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function obtenerSesionActual() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * RLS filtra `club` a únicamente los clubes donde el usuario autenticado
 * tiene una fila en miembro_club (ver 0002_rls.sql) — no hace falta joinear
 * contra miembro_club acá, Postgres ya lo hizo.
 */
export async function obtenerClubesDelEntrenador() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.from('club').select('id, nombre');
  if (error) throw error;
  return data.map((fila) => ({ id: fila.id, nombre: fila.nombre }));
}

export async function obtenerPlantelesDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('plantel')
    .select('id, categoria, codigo_cabb, temporada_id')
    .eq('club_id', clubId);
  if (error) throw error;
  return data.map((fila) => ({
    id: fila.id,
    categoria: fila.categoria,
    codigoCabb: fila.codigo_cabb,
    temporadaId: fila.temporada_id,
  }));
}

/**
 * Única llamada transaccional: importar_partido (0005_rpc_importar_partido.sql)
 * hace todos los inserts de una importación en una sola transacción de
 * Postgres — o se guarda todo, o no se guarda nada. Ver ESQUEMA.md.
 */
export async function importarPartido(payload) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('importar_partido', { payload });
  if (error) throw error;
  return data;
}

/**
 * Jugadores con pertenencia VIGENTE (hasta is null) al plantel dado, con sus
 * columnas de medición (0007). Distinta de obtenerJugadoresDelClub, que es la
 * que consume el flujo de import y no se toca.
 */
export async function obtenerJugadoresDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('jugador')
    .select('id, nombre_clave, nombre_limpio, talla_cm, peso_kg, fecha_medicion, pertenencia!inner(plantel_id, hasta)')
    .eq('club_id', clubId)
    .eq('pertenencia.plantel_id', plantelId)
    .is('pertenencia.hasta', null);
  if (error) throw error;
  return data.map((fila) => ({
    id: fila.id,
    nombreClave: fila.nombre_clave,
    nombreLimpio: fila.nombre_limpio,
    tallaCm: fila.talla_cm,
    pesoKg: fila.peso_kg,
    fechaMedicion: fila.fecha_medicion,
  }));
}

export async function obtenerPartidosDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('partido')
    .select('id, fecha, rival_nombre, puntos_propios, puntos_rival, condicion_propia')
    .eq('club_id', clubId)
    .eq('plantel_id', plantelId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data.map((fila) => ({
    id: fila.id,
    fecha: fila.fecha,
    rivalNombre: fila.rival_nombre,
    puntosPropios: fila.puntos_propios,
    puntosRival: fila.puntos_rival,
    condicionPropia: fila.condicion_propia,
  }));
}

/** Pertenencias vigentes de un jugador, para mostrar en su ficha en qué categorías está. */
export async function obtenerPertenenciasDeJugador(clubId, jugadorId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('pertenencia')
    .select('plantel_id, desde, plantel(categoria)')
    .eq('club_id', clubId)
    .eq('jugador_id', jugadorId)
    .is('hasta', null);
  if (error) throw error;
  return data.map((fila) => ({
    plantelId: fila.plantel_id,
    categoria: fila.plantel?.categoria ?? null,
    desde: fila.desde,
  }));
}

/**
 * Alta manual: crea el jugador y su pertenencia en una sola transacción
 * (0008_rpc_alta_jugador.sql). Lanza un Error con message
 * 'JUGADOR_YA_EXISTE' si el nombreClave ya existe en el club.
 */
export async function altaJugadorManual({ clubId, nombreClave, nombreLimpio, plantelId, temporadaId, desde }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('alta_jugador_manual', {
    payload: { clubId, nombreClave, nombreLimpio, plantelId, temporadaId, desde },
  });
  if (error) throw error;
  return data;
}
