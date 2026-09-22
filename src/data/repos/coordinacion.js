// Panel de coordinación: quién tiene acceso a qué (0017).
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente } from '../cliente.js';

/**
 * Cuentas con mail confirmado y sin club, menos las rechazadas. Incluye a los
 * jugadores con cuenta del propio club (`esJugador`): habilitarlos como profes
 * les cierra la cuenta de jugador (0032). Sólo coordinación.
 */
export async function obtenerUsuariosPendientes() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('usuarios_pendientes');
  if (error) throw error;
  return data.map((f) => ({ userId: f.user_id, email: f.email, nombre: f.nombre, registradoEn: f.registrado_en, esJugador: f.es_jugador }));
}

/**
 * La única puerta para "un jugador va a ser profe" (0032): busca una cuenta
 * de jugador vigente de este club por su mail exacto. null si no hay
 * ninguna — no es un error, es "no lo encontramos".
 */
export async function buscarJugadorParaHabilitar({ clubId, email }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('buscar_jugador_para_habilitar', { p_club_id: clubId, p_email: email });
  if (error) throw error;
  const f = data[0];
  if (!f) return null;
  return { userId: f.user_id, email: f.email, nombre: f.nombre, registradoEn: f.registrado_en, esJugador: f.es_jugador };
}

/**
 * Rechaza un pedido de acceso. Reversible: la cuenta rechazada puede volver a
 * pedir (volverAPedirAcceso) y reaparece en la lista. No borra nada.
 */
export async function descartarCuenta({ userId, clubId }) {
  const supabase = obtenerCliente();
  const { error } = await supabase.rpc('descartar_cuenta', { p_user_id: userId, p_club_id: clubId });
  if (error) throw error;
}

/** ¿Coordinación rechazó a la cuenta que llama? Sólo el hecho: ni quién ni por qué. */
export async function miPedidoDescartado() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('mi_pedido_descartado');
  if (error) throw error;
  return data === true;
}

/** "Fue un error": la cuenta rechazada vuelve a la lista de pendientes. */
export async function volverAPedirAcceso() {
  const supabase = obtenerCliente();
  const { error } = await supabase.rpc('volver_a_pedir_acceso');
  if (error) throw error;
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
    bajaEn: f.baja_en,
  }));
}

/**
 * Cierra todas las asignaciones vigentes de un profe y lo marca de baja
 * (baja_en, 0039): deja de ver el plantel, lo que cargó queda. Nunca a uno
 * mismo ni a alguien de coordinación: la base lo rechaza con NO_ES_UNO_MISMO
 * o ES_COORDINACION.
 */
export async function darDeBajaProfe({ userId, clubId }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('dar_de_baja_profe', { p_user_id: userId, p_club_id: clubId });
  if (error) throw error;
  return { asignacionesCerradas: data.asignacionesCerradas };
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
