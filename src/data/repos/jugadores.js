// Jugadores, sus pertenencias a planteles y su ficha.
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente, TAMANIO_PAGINA } from '../cliente.js';

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
