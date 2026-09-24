// Mediciones (tiro, salto, sprint, cuerpo) y metas del cuerpo técnico.
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente, TAMANIO_PAGINA } from '../cliente.js';

export async function obtenerSesionesDeMedicion(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('sesion_medicion')
    .select('id, fecha, tipo')
    .eq('club_id', clubId)
    .eq('plantel_id', plantelId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({ id: f.id, fecha: f.fecha, tipo: f.tipo }));
}

/**
 * Todas las mediciones de tiro del plantel. El filtro por plantel va por el
 * join contra sesion_medicion con !inner, igual que obtenerJugadoresDelPlantel
 * filtra por pertenencia.
 */
export async function obtenerMedicionesTiroDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const data = [];
  let desde = 0;
  for (;;) {
    const hasta = desde + TAMANIO_PAGINA - 1;
    const { data: pagina, error } = await supabase
      .from('medicion_tiro')
      .select('id, sesion_id, jugador_id, posicion, anotados, intentos, sesion_medicion!inner(plantel_id)')
      .eq('club_id', clubId)
      .eq('sesion_medicion.plantel_id', plantelId)
      .order('id')
      .range(desde, hasta);
    if (error) throw error;
    data.push(...pagina);
    if (pagina.length < TAMANIO_PAGINA) break;
    desde += TAMANIO_PAGINA;
  }
  return data.map((f) => ({
    sesionId: f.sesion_id,
    jugadorId: f.jugador_id,
    posicion: f.posicion,
    anotados: f.anotados,
    intentos: f.intentos,
  }));
}

/**
 * Todos los intentos de salto del plantel, con la fecha y el test de su
 * sesión. tiempoVueloMs y fpsCaptura null = ausente (no saltó), nunca 0.
 */
export async function obtenerMedicionesSaltoDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const data = [];
  let desde = 0;
  for (;;) {
    const hasta = desde + TAMANIO_PAGINA - 1;
    const { data: pagina, error } = await supabase
      .from('medicion_salto')
      .select('id, sesion_id, jugador_id, intento, tiempo_vuelo_ms, fps_captura, sesion_medicion!inner(plantel_id, fecha, test_salto)')
      .eq('club_id', clubId)
      .eq('sesion_medicion.plantel_id', plantelId)
      .order('id')
      .range(desde, hasta);
    if (error) throw error;
    data.push(...pagina);
    if (pagina.length < TAMANIO_PAGINA) break;
    desde += TAMANIO_PAGINA;
  }
  return data.map(saltoDesdeFila);
}

function saltoDesdeFila(f) {
  return {
    sesionId: f.sesion_id,
    jugadorId: f.jugador_id,
    intento: f.intento,
    // numeric llega como string por PostgREST; el null (ausente) se preserva.
    tiempoVueloMs: f.tiempo_vuelo_ms == null ? null : Number(f.tiempo_vuelo_ms),
    fpsCaptura: f.fps_captura == null ? null : Number(f.fps_captura),
    fecha: f.sesion_medicion?.fecha ?? null,
    testSalto: f.sesion_medicion?.test_salto ?? null,
  };
}

/**
 * Todos los intentos de sprint del plantel, con la fecha y la distancia de su
 * sesión. tiempoMs null = ausente (no corrió), nunca 0.
 */
export async function obtenerMedicionesSprintDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const data = [];
  let desde = 0;
  for (;;) {
    const hasta = desde + TAMANIO_PAGINA - 1;
    const { data: pagina, error } = await supabase
      .from('medicion_sprint')
      .select('id, sesion_id, jugador_id, intento, tiempo_ms, origen, sesion_medicion!inner(plantel_id, fecha, distancia_sprint_m)')
      .eq('club_id', clubId)
      .eq('sesion_medicion.plantel_id', plantelId)
      .order('id')
      .range(desde, hasta);
    if (error) throw error;
    data.push(...pagina);
    if (pagina.length < TAMANIO_PAGINA) break;
    desde += TAMANIO_PAGINA;
  }
  return data.map(sprintDesdeFila);
}

function sprintDesdeFila(f) {
  return {
    id: f.id,
    sesionId: f.sesion_id,
    jugadorId: f.jugador_id,
    intento: f.intento,
    tiempoMs: f.tiempo_ms ?? null,
    origen: f.origen,
    fecha: f.sesion_medicion?.fecha ?? null,
    distanciaM: f.sesion_medicion?.distancia_sprint_m ?? null,
  };
}

export async function guardarSesionMedicion(payload) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('guardar_sesion_medicion', { payload });
  if (error) throw error;
  return data;
}

/**
 * Histórico corporal de un jugador, una fila por fecha de medición.
 * Reemplaza a las columnas talla_cm/peso_kg/fecha_medicion que 0007 había
 * puesto en `jugador`, y que sólo podían guardar la última.
 */
export async function obtenerMedicionesCorporalesDeJugador(clubId, jugadorId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('medicion_corporal')
    .select('id, fecha_medicion, altura_cm, peso_kg, pierna_cm, pierna_flexionada_cm')
    .eq('club_id', clubId)
    .eq('jugador_id', jugadorId)
    .order('fecha_medicion', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({
    id: f.id,
    jugadorId,
    fechaMedicion: f.fecha_medicion,
    alturaCm: f.altura_cm,
    // numeric de Postgres llega como string por PostgREST; el null se preserva.
    pesoKg: f.peso_kg == null ? null : Number(f.peso_kg),
    piernaCm: f.pierna_cm == null ? null : Number(f.pierna_cm),
    piernaFlexionadaCm: f.pierna_flexionada_cm == null ? null : Number(f.pierna_flexionada_cm),
  }));
}

/**
 * Todas las mediciones del club, paginadas. La lista de PLANTEL las usa para
 * marcar quién está sin medir; filtrar por plantel exigiría un join de dos
 * niveles (medicion → jugador → pertenencia) y el volumen real es de unas
 * pocas filas por jugador por año.
 */
export async function obtenerMedicionesCorporalesDelClub(clubId) {
  const supabase = obtenerCliente();
  const data = [];
  let desde = 0;
  for (;;) {
    const hasta = desde + TAMANIO_PAGINA - 1;
    const { data: pagina, error } = await supabase
      .from('medicion_corporal')
      .select('id, jugador_id, fecha_medicion, altura_cm, peso_kg, pierna_cm, pierna_flexionada_cm')
      .eq('club_id', clubId)
      .order('id')
      .range(desde, hasta);
    if (error) throw error;
    data.push(...pagina);
    if (pagina.length < TAMANIO_PAGINA) break;
    desde += TAMANIO_PAGINA;
  }
  return data.map((f) => ({
    id: f.id,
    jugadorId: f.jugador_id,
    fechaMedicion: f.fecha_medicion,
    alturaCm: f.altura_cm,
    pesoKg: f.peso_kg == null ? null : Number(f.peso_kg),
    piernaCm: f.pierna_cm == null ? null : Number(f.pierna_cm),
    piernaFlexionadaCm: f.pierna_flexionada_cm == null ? null : Number(f.pierna_flexionada_cm),
  }));
}

/**
 * Una sola fila: llamada directa, sin RPC. La regla del proyecto exige una
 * transacción sólo cuando se escribe más de una fila.
 *
 * Lanza un Error con message 'MEDICION_DUPLICADA' si ya hay una medición de
 * ese jugador en esa fecha (unique (jugador_id, fecha_medicion) en 0012).
 */
export async function crearMedicionCorporal({ clubId, jugadorId, fechaMedicion, alturaCm, pesoKg, piernaCm = null, piernaFlexionadaCm = null }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('medicion_corporal')
    .insert({
      club_id: clubId,
      jugador_id: jugadorId,
      fecha_medicion: fechaMedicion,
      altura_cm: alturaCm,
      peso_kg: pesoKg,
      pierna_cm: piernaCm,
      pierna_flexionada_cm: piernaFlexionadaCm,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('MEDICION_DUPLICADA');
    throw error;
  }
  return data.id;
}

export async function borrarMedicionCorporal(clubId, medicionId) {
  const supabase = obtenerCliente();
  const { error } = await supabase
    .from('medicion_corporal')
    .delete()
    .eq('club_id', clubId)
    .eq('id', medicionId);
  if (error) throw error;
}

/**
 * Metas del plantel, como mapa zona → porcentaje. La ausencia de una zona en
 * el mapa significa "sin meta", que no es lo mismo que 0%.
 */
export async function obtenerMetasDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('meta_zona')
    .select('zona, objetivo_pct')
    .eq('club_id', clubId)
    .eq('plantel_id', plantelId);
  if (error) throw error;
  const metas = {};
  for (const fila of data) metas[fila.zona] = fila.objetivo_pct;
  return metas;
}

/**
 * Guarda hasta 6 metas en una sola transacción (0014_rpc_guardar_metas.sql).
 * Una zona con `objetivoPct: null` borra su meta.
 */
export async function guardarMetasPlantel(payload) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('guardar_metas_plantel', { payload });
  if (error) throw error;
  return data;
}
