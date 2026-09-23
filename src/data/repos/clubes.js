// Clubes, planteles, categorías y roles de quien usa la app.
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente } from '../cliente.js';
import { obtenerUsuarioActual } from './auth.js';

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

/* ---------- Pedir acceso como jugador (0029) ---------- */

/** El catálogo del formulario: cada categoría vigente de cada club, en una lista plana. */
export async function obtenerClubesParaSolicitar() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('clubes_para_solicitar');
  if (error) throw error;
  return data.map((f) => ({
    clubId: f.club_id,
    clubNombre: f.club_nombre,
    plantelId: f.plantel_id,
    categoriaCodigo: f.categoria_codigo,
    categoriaNombre: f.categoria_nombre,
  }));
}

/**
 * Lanza un Error con message 'SOLICITUD_YA_PENDIENTE' si ya hay una esperando,
 * o 'FECHA_NACIMIENTO_REQUERIDA'/'FECHA_NACIMIENTO_FUTURA' si esa fecha no
 * pasa la validación del servidor (0041).
 */
export async function crearSolicitudJugador({ clubId, plantelId, fechaNacimiento }) {
  const supabase = obtenerCliente();
  const { error } = await supabase.rpc('crear_solicitud_jugador', {
    p_club_id: clubId, p_plantel_id: plantelId, p_fecha_nacimiento: fechaNacimiento,
  });
  if (error) throw error;
}

/** La última solicitud propia, o null: para mostrar "pendiente" al volver a entrar. */
export async function obtenerMiSolicitud() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('mi_solicitud_jugador');
  if (error) throw error;
  const f = data[0];
  if (!f) return null;
  return {
    id: f.id, estado: f.estado, clubNombre: f.club_nombre, categoriaNombre: f.categoria_nombre,
    creadoEn: f.creado_en, codigo: f.codigo,
  };
}
