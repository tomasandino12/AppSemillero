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
 * Jugadores con pertenencia VIGENTE (hasta is null) al plantel dado. Distinta
 * de obtenerJugadoresDelClub, que es la que consume el flujo de import y no se
 * toca.
 *
 * Altura y peso NO vienen acá: desde 0012 viven en medicion_corporal, con una
 * fila por fecha. Quien las necesite usa obtenerMedicionesCorporales*.
 */
export async function obtenerJugadoresDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('jugador')
    .select('id, nombre_clave, nombre_limpio, fecha_nacimiento, pertenencia!inner(plantel_id, hasta)')
    .eq('club_id', clubId)
    .eq('pertenencia.plantel_id', plantelId)
    .is('pertenencia.hasta', null);
  if (error) throw error;
  return data.map((fila) => ({
    id: fila.id,
    nombreClave: fila.nombre_clave,
    nombreLimpio: fila.nombre_limpio,
    fechaNacimiento: fila.fecha_nacimiento,
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

/* ---------- Etapa 4: mediciones ---------- */

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
      .select('sesion_id, jugador_id, posicion, anotados, intentos, sesion_medicion!inner(plantel_id)')
      .eq('club_id', clubId)
      .eq('sesion_medicion.plantel_id', plantelId)
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

export async function obtenerMedicionesVelocidadDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('medicion_velocidad')
    .select('sesion_id, jugador_id, segundos, sesion_medicion!inner(plantel_id, fecha)')
    .eq('club_id', clubId)
    .eq('sesion_medicion.plantel_id', plantelId);
  if (error) throw error;
  return data.map((f) => ({
    sesionId: f.sesion_id,
    jugadorId: f.jugador_id,
    // numeric de Postgres llega como string por PostgREST: se convierte acá,
    // en la capa de datos, para que las vistas reciban números.
    segundos: f.segundos == null ? null : Number(f.segundos),
    fecha: f.sesion_medicion?.fecha ?? null,
  }));
}

/**
 * Estadísticas de todos los partidos del plantel, con la fecha del partido
 * ya resuelta. Es la entrada de repartoPorJugador y evolucionDeTiroDelEquipo.
 */
export async function obtenerEstadisticasDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const data = [];
  let desde = 0;
  for (;;) {
    const hasta = desde + TAMANIO_PAGINA - 1;
    const { data: pagina, error } = await supabase
      .from('estadistica_jugador_partido')
      .select('partido_id, jugador_id, min_segundos, pts, dos_anotados, dos_intentados, tres_anotados, tres_intentados, libres_anotados, libres_intentados, partido!inner(plantel_id)')
      .eq('club_id', clubId)
      .eq('partido.plantel_id', plantelId)
      .range(desde, hasta);
    if (error) throw error;
    data.push(...pagina);
    if (pagina.length < TAMANIO_PAGINA) break;
    desde += TAMANIO_PAGINA;
  }
  return data.map((f) => ({
    partidoId: f.partido_id,
    jugadorId: f.jugador_id,
    minSegundos: f.min_segundos,
    pts: f.pts,
    dosAnotados: f.dos_anotados,
    dosIntentados: f.dos_intentados,
    tresAnotados: f.tres_anotados,
    tresIntentados: f.tres_intentados,
    libresAnotados: f.libres_anotados,
    libresIntentados: f.libres_intentados,
  }));
}

export async function guardarSesionMedicion(payload) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('guardar_sesion_medicion', { payload });
  if (error) throw error;
  return data;
}

/* ---------- Etapa 4: recursos ---------- */

export async function obtenerRecursos(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('recurso')
    .select('id, titulo, descripcion, enlace, creado_en, envio_recurso(jugador_id, fecha)')
    .eq('club_id', clubId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    descripcion: f.descripcion,
    enlace: f.enlace,
    creadoEn: f.creado_en,
    envios: (f.envio_recurso ?? []).map((e) => ({ jugadorId: e.jugador_id, fecha: e.fecha })),
  }));
}

/** Recursos que se le enviaron a un jugador, para su ficha. */
export async function obtenerEnviosDeJugador(clubId, jugadorId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('envio_recurso')
    .select('fecha, recurso(id, titulo, enlace)')
    .eq('club_id', clubId)
    .eq('jugador_id', jugadorId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({
    fecha: f.fecha,
    recursoId: f.recurso?.id ?? null,
    titulo: f.recurso?.titulo ?? null,
    enlace: f.recurso?.enlace ?? null,
  }));
}

export async function guardarRecurso(payload) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('guardar_recurso', { payload });
  if (error) throw error;
  return data;
}

/* ---------- Altura, peso y fecha de nacimiento (0012) ---------- */

/**
 * Histórico corporal de un jugador, una fila por fecha de medición.
 * Reemplaza a las columnas talla_cm/peso_kg/fecha_medicion que 0007 había
 * puesto en `jugador`, y que sólo podían guardar la última.
 */
export async function obtenerMedicionesCorporalesDeJugador(clubId, jugadorId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('medicion_corporal')
    .select('id, fecha_medicion, altura_cm, peso_kg')
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
      .select('id, jugador_id, fecha_medicion, altura_cm, peso_kg')
      .eq('club_id', clubId)
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
  }));
}

/**
 * Una sola fila: llamada directa, sin RPC. La regla del proyecto exige una
 * transacción sólo cuando se escribe más de una fila.
 *
 * Lanza un Error con message 'MEDICION_DUPLICADA' si ya hay una medición de
 * ese jugador en esa fecha (unique (jugador_id, fecha_medicion) en 0012).
 */
export async function crearMedicionCorporal({ clubId, jugadorId, fechaMedicion, alturaCm, pesoKg }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('medicion_corporal')
    .insert({
      club_id: clubId,
      jugador_id: jugadorId,
      fecha_medicion: fechaMedicion,
      altura_cm: alturaCm,
      peso_kg: pesoKg,
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

/** `fechaNacimiento` puede ser null: significa "no se sabe", no se borra el jugador. */
export async function actualizarFechaNacimiento(clubId, jugadorId, fechaNacimiento) {
  const supabase = obtenerCliente();
  const { error } = await supabase
    .from('jugador')
    .update({ fecha_nacimiento: fechaNacimiento })
    .eq('club_id', clubId)
    .eq('id', jugadorId);
  if (error) throw error;
}

/* ---------- Metas del cuerpo técnico por zona (0013/0014) ---------- */

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

/* ---------- Etapa 5: perfil del entrenador ---------- */

/** Mapa userId → nombre, de todos los del club. Sin él no hay autoría que mostrar. */
export async function obtenerPerfilesDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('perfil_entrenador')
    .select('user_id, nombre')
    .eq('club_id', clubId);
  if (error) throw error;
  const porUsuario = {};
  for (const f of data) porUsuario[f.user_id] = f.nombre;
  return porUsuario;
}

/** El id del usuario autenticado, para saber qué es propio y qué ajeno. */
export async function obtenerUsuarioActual() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

/**
 * Guarda el nombre propio. La policy de 0015 sólo deja escribir la fila propia,
 * así que esto no puede pisar el nombre de otro ni por error de programación.
 */
export async function guardarPerfilPropio(clubId, userId, nombre) {
  const supabase = obtenerCliente();
  const { error } = await supabase
    .from('perfil_entrenador')
    .upsert({ club_id: clubId, user_id: userId, nombre }, { onConflict: 'club_id,user_id' });
  if (error) throw error;
}

/* ---------- Etapa 5: ejercicios y notas ---------- */

/**
 * Los ejercicios del club. `tieneNotas` es una señal BINARIA de presencia, no
 * un contador ni un ranking: se traen los ids de las notas sólo para saber si
 * hay alguna, y el número no se muestra en ninguna parte.
 */
export async function obtenerEjercicios(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .select('id, titulo, tema, descripcion, enlace, material, jugadores, categorias, creado_por, creado_en, nota_ejercicio(id)')
    .eq('club_id', clubId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    tema: f.tema,
    descripcion: f.descripcion,
    enlace: f.enlace,
    material: f.material,
    jugadores: f.jugadores,
    categorias: f.categorias,
    creadoPor: f.creado_por,
    creadoEn: f.creado_en,
    tieneNotas: (f.nota_ejercicio ?? []).length > 0,
  }));
}

export async function obtenerEjercicio(clubId, ejercicioId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .select('id, titulo, tema, descripcion, enlace, material, jugadores, categorias, creado_por, creado_en')
    .eq('club_id', clubId)
    .eq('id', ejercicioId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    titulo: data.titulo,
    tema: data.tema,
    descripcion: data.descripcion,
    enlace: data.enlace,
    material: data.material,
    jugadores: data.jugadores,
    categorias: data.categorias,
    creadoPor: data.creado_por,
    creadoEn: data.creado_en,
  };
}

/**
 * Una sola fila: llamada directa, sin RPC. La regla del proyecto exige una
 * transacción sólo cuando se escribe más de una fila.
 *
 * El texto va tal cual lo escribió el profe: no se recorta, no se normaliza y
 * no se transforma. Cualquier versión estructurada que se genere el día que
 * haya IA será un campo adicional, nunca un reemplazo.
 */
export async function crearEjercicio({ clubId, titulo, tema, descripcion, enlace, material, jugadores, categorias }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .insert({
      club_id: clubId,
      titulo,
      tema,
      descripcion: descripcion || null,
      enlace: enlace || null,
      material: material || null,
      jugadores: jugadores || null,
      categorias: categorias || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Editar. Si el ejercicio es de otro, la policy de 0015 no devuelve ninguna
 * fila y esto lanza 'NO_ES_TUYO' en vez de fallar en silencio.
 */
export async function actualizarEjercicio(clubId, ejercicioId, campos) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .update({
      titulo: campos.titulo,
      tema: campos.tema,
      descripcion: campos.descripcion || null,
      enlace: campos.enlace || null,
      material: campos.material || null,
      jugadores: campos.jugadores || null,
      categorias: campos.categorias || null,
      actualizado_en: new Date().toISOString(),
    })
    .eq('club_id', clubId)
    .eq('id', ejercicioId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_ES_TUYO');
}

export async function borrarEjercicio(clubId, ejercicioId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .delete()
    .eq('club_id', clubId)
    .eq('id', ejercicioId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_ES_TUYO');
}

/** Las notas de un ejercicio, de la más nueva a la más vieja. */
export async function obtenerNotas(clubId, ejercicioId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('nota_ejercicio')
    .select('id, texto, creado_por, creado_en')
    .eq('club_id', clubId)
    .eq('ejercicio_id', ejercicioId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({
    id: f.id,
    texto: f.texto,
    creadoPor: f.creado_por,
    creadoEn: f.creado_en,
  }));
}

/** Una sola fila. El texto va tal cual. */
export async function crearNota({ clubId, ejercicioId, texto }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('nota_ejercicio')
    .insert({ club_id: clubId, ejercicio_id: ejercicioId, texto })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function borrarNota(clubId, notaId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('nota_ejercicio')
    .delete()
    .eq('club_id', clubId)
    .eq('id', notaId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_ES_TUYO');
}
