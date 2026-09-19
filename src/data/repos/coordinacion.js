// Panel de coordinación: quién tiene acceso a qué (0017).
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente } from '../cliente.js';

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
