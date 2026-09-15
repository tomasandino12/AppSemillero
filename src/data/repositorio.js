import { crearClienteSupabase } from './cliente.js';

let clienteCache = null;
function obtenerCliente() {
  if (!clienteCache) clienteCache = crearClienteSupabase();
  return clienteCache;
}

const TAMANIO_PAGINA = 1000;

/**
 * Todos los jugadores del club, para el dedup del import y el del alta manual.
 *
 * Pasa por una función security definer (0016) y no por la tabla: desde esa
 * migración `jugador` sólo deja ver a los que tienen pertenencia a un plantel
 * propio, y el dedup necesita ver TODO el club. Si no, un chico citado desde
 * otra categoría se cargaría de nuevo como jugador nuevo y se perdería su
 * historial, que es la razón de ser de la app.
 *
 * La función expone cuatro campos y nada más, y `planteles_visibles` ya viene
 * filtrado: se sabe que el chico existe en el club y si está en una categoría
 * propia, no en cuáles otras.
 *
 * Se sigue paginando: el max-rows de PostgREST también se aplica a las
 * funciones que devuelven conjuntos, y la función ordena por id para que
 * paginar no saltee ni repita filas.
 *
 * La forma de retorno no cambia respecto de la versión que leía la tabla.
 */
export async function obtenerJugadoresDelClub(clubId) {
  const supabase = obtenerCliente();
  const data = [];
  let desde = 0;
  for (;;) {
    const hasta = desde + TAMANIO_PAGINA - 1;
    const { data: pagina, error } = await supabase
      .rpc('jugadores_del_club_para_dedup', { p_club_id: clubId })
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
    plantelesActuales: fila.planteles_visibles ?? [],
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
 * A dónde vuelve el usuario después de un mail de recuperación o del redirect
 * de Google. Es ESTA página y no la raíz a propósito: en producción la raíz
 * es la landing, pero sirviendo local desde /public/ la raíz no es la app.
 * Las dos URLs tienen que estar en la lista de redirects permitidos de
 * Supabase (ver README de configuración).
 */
function urlDeRetorno() {
  return window.location.origin + window.location.pathname;
}

/**
 * Crear cuenta. Supabase devuelve sesión SOLO si el proyecto no exige
 * confirmar el mail; si lo exige, devuelve el usuario sin sesión y hay que
 * esperar a que haga clic en el link. Se devuelven las dos cosas para que la
 * UI pueda decir cuál de los dos casos pasó, en vez de dejarlo esperando.
 */
export async function crearCuenta(email, password, nombre) {
  const supabase = obtenerCliente();
  // El nombre viaja como metadato: en este momento no hay sesión (si el
  // proyecto exige confirmar el mail) y no se podría escribir en ninguna
  // tabla. Ver 0019.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: urlDeRetorno(), data: { nombre } },
  });
  if (error) throw error;
  return { sesion: data.session, usuario: data.user };
}

export async function enviarRecuperacionDeClave(email) {
  const supabase = obtenerCliente();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: urlDeRetorno() });
  if (error) throw error;
}

/** Cambia la clave del usuario que ya tiene sesión de recuperación abierta. */
export async function cambiarClave(password) {
  const supabase = obtenerCliente();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/**
 * Redirige a Google. Si el proveedor no está habilitado en el dashboard de
 * Supabase, esto tira en vez de navegar — la UI lo muestra como aviso.
 */
export async function entrarConGoogle() {
  const supabase = obtenerCliente();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: urlDeRetorno() },
  });
  if (error) throw error;
}

/**
 * Avisa de los cambios de sesión. Interesa un evento en particular:
 * PASSWORD_RECOVERY, que es el que dispara Supabase cuando el usuario vuelve
 * desde el link del mail, y es la única señal de que hay que pedirle una
 * clave nueva.
 */
export function alCambiarAuth(fn) {
  const supabase = obtenerCliente();
  return supabase.auth.onAuthStateChange((evento, sesion) => fn(evento, sesion));
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

/**
 * Un entrenador ve sus planteles asignados; un coordinador, todos los de su
 * club (0017). El modo entrenar filtra a lo asignado: ver main.js.
 */
export async function obtenerPlantelesDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('plantel')
    .select('id, categoria, categoria_codigo, codigo_cabb, temporada_id')
    .eq('club_id', clubId);
  if (error) throw error;
  return data.map((fila) => ({
    id: fila.id,
    categoria: fila.categoria,
    categoriaCodigo: fila.categoria_codigo,
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

/* ---------- Nombre de cada persona (0019) ---------- */

/**
 * Mapa userId → nombre, de todos los del club. Sin él no hay autoría que
 * mostrar. Desde 0019 el nombre vive en los metadatos de Auth, que el cliente
 * no puede leer de otros: pasa por nombres_del_club, que exige ser del club.
 * Quien no cargó nombre no aparece en el mapa.
 */
export async function obtenerPerfilesDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('nombres_del_club', { p_club_id: clubId });
  if (error) throw error;
  const porUsuario = {};
  for (const f of data) {
    if (f.nombre) porUsuario[f.user_id] = f.nombre;
  }
  return porUsuario;
}

/** El usuario de Auth completo (id, email, user_metadata), o null sin sesión. */
export async function obtenerMiUsuario() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

/**
 * Guarda el nombre propio en los metadatos de Auth. Sólo puede tocar el del
 * usuario de la sesión: no hay forma de pisar el de otro.
 */
export async function guardarMiNombre(nombre) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.updateUser({ data: { nombre } });
  if (error) throw error;
  return data.user;
}

/** El id del usuario autenticado, para saber qué es propio y qué ajeno. */
export async function obtenerUsuarioActual() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
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

/* ---------- Coordinación (0017) ---------- */

/**
 * Los roles propios en el club. La policy miembro_club_propio deja leer la
 * fila propia; un coordinador además ve las de todo el club, por eso el filtro
 * por user_id no es opcional.
 */
export async function obtenerMisRoles(clubId) {
  const supabase = obtenerCliente();
  const userId = await obtenerUsuarioActual();
  const { data, error } = await supabase
    .from('miembro_club')
    .select('es_entrenador, es_coordinador')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return { esEntrenador: data?.es_entrenador === true, esCoordinador: data?.es_coordinador === true };
}

/** Los planteles con asignación VIGENTE propia. Es lo que muestran los chips en modo entrenar. */
export async function obtenerMisPlantelesAsignados(clubId) {
  const supabase = obtenerCliente();
  const userId = await obtenerUsuarioActual();
  const { data, error } = await supabase
    .from('asignacion_plantel')
    .select('plantel_id')
    .eq('miembro_club_club_id', clubId)
    .eq('miembro_club_user_id', userId)
    .is('hasta', null);
  if (error) throw error;
  return new Set(data.map((f) => f.plantel_id));
}

export async function obtenerCatalogoDeCategorias() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.from('categoria').select('codigo, nombre, orden');
  if (error) throw error;
  return data;
}

export async function obtenerTemporadasDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.from('temporada').select('id, nombre').eq('club_id', clubId);
  if (error) throw error;
  return data;
}

/** Cuentas con mail confirmado y sin club. Sólo coordinación (la función rechaza al resto). */
export async function obtenerUsuariosPendientes() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('usuarios_pendientes');
  if (error) throw error;
  return data.map((f) => ({ userId: f.user_id, email: f.email, nombre: f.nombre, registradoEn: f.registrado_en }));
}

export async function obtenerMiembrosDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('miembros_del_club', { p_club_id: clubId });
  if (error) throw error;
  return data.map((f) => ({
    userId: f.user_id,
    email: f.email,
    nombre: f.nombre,
    esEntrenador: f.es_entrenador,
    esCoordinador: f.es_coordinador,
    habilitadoEn: f.habilitado_en,
  }));
}

/** Asignaciones vigentes del club. Las cerradas quedan en la base; el panel no las lista. */
export async function obtenerAsignacionesDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('asignacion_plantel')
    .select('id, miembro_club_user_id, plantel_id, desde, hasta, origen')
    .eq('miembro_club_club_id', clubId)
    .is('hasta', null);
  if (error) throw error;
  return data.map((f) => ({
    id: f.id,
    userId: f.miembro_club_user_id,
    plantelId: f.plantel_id,
    desde: f.desde,
    hasta: f.hasta,
    origen: f.origen,
  }));
}

/**
 * Conteos y sumas por plantel, nunca filas de jugador (panorama_del_club,
 * 0017). La forma ya viene en camelCase desde la base.
 */
export async function obtenerPanoramaDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('panorama_del_club', { p_club_id: clubId });
  if (error) throw error;
  return data;
}

/** Habilitar (si hace falta) y asignar varias categorías: una sola transacción. */
export async function asignarPlanteles({ userId, clubId, plantelIds }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('asignar_planteles', {
    p_user_id: userId,
    p_club_id: clubId,
    p_plantel_ids: plantelIds,
  });
  if (error) throw error;
  return data;
}

/**
 * Cierra una asignación. La fecha que se manda es irrelevante: el trigger de
 * 0017 la reemplaza por la del servidor y pone quién la cerró. Se pide la fila
 * de vuelta porque un update que la RLS no deja pasar no da error, afecta
 * cero filas — y eso no puede verse como éxito.
 */
export async function cerrarAsignacion(asignacionId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('asignacion_plantel')
    .update({ hasta: new Date().toISOString() })
    .eq('id', asignacionId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_SE_PUDO_CERRAR');
}

/* ---------- Etapa 6: plan físico ---------- */

/**
 * La biblioteca de fuerza del club, para el buscador de la pantalla de
 * resolución y para reconciliar la del archivo. Es de club, no de plantel
 * (ver ESQUEMA.md).
 */
export async function obtenerEjerciciosFuerza(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio_fuerza')
    .select('id, clave, nombre, bloque, link')
    .eq('club_id', clubId)
    .order('nombre');
  if (error) throw error;
  return data.map((f) => ({ id: f.id, clave: f.clave, nombre: f.nombre, bloque: f.bloque, link: f.link }));
}

/**
 * Única llamada transaccional del import de plan físico: o entran el plan, sus
 * sesiones y sus ejercicios, o no entra nada (0021).
 */
export async function importarPlanFisico(payload) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('importar_plan_fisico', { payload });
  if (error) throw error;
  return data;
}
