// Biblioteca de jugadas del club: la pizarra táctica animada.
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente } from '../cliente.js';
import { obtenerUsuarioActual } from './auth.js';
import { validarJugada, diferenciaDeAsignacion } from '../jugadas.js';

const CAMPOS = 'id, nombre, tipo, datos, creado_por, actualizado_en';

function jugadaDesdeFila(f, miUserId) {
  return {
    id: f.id,
    nombre: f.nombre,
    tipo: f.tipo,
    datos: f.datos,
    creadoPor: f.creado_por,
    esMia: f.creado_por === miUserId,
    actualizadoEn: f.actualizado_en,
  };
}

function validarOLanzar(datos) {
  const { ok, errores } = validarJugada(datos);
  if (!ok) throw new Error(errores[0]);
}

export async function listarJugadas(clubId) {
  const supabase = obtenerCliente();
  const miUserId = await obtenerUsuarioActual();
  const { data, error } = await supabase
    .from('jugada')
    .select(CAMPOS)
    .eq('club_id', clubId)
    .order('actualizado_en', { ascending: false });
  if (error) throw error;
  return data.map((f) => jugadaDesdeFila(f, miUserId));
}

export async function obtenerJugada(clubId, jugadaId) {
  const supabase = obtenerCliente();
  const miUserId = await obtenerUsuarioActual();
  const { data, error } = await supabase
    .from('jugada')
    .select(CAMPOS)
    .eq('club_id', clubId)
    .eq('id', jugadaId)
    .maybeSingle();
  if (error) throw error;
  return data ? jugadaDesdeFila(data, miUserId) : null;
}

export async function crearJugada({ clubId, nombre, tipo, datos }) {
  validarOLanzar(datos);
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('jugada')
    .insert({ club_id: clubId, nombre, tipo, datos })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/** Lanza 'NO_ES_TUYA' si la jugada es de otro: la policy de edición no devuelve la fila. */
export async function guardarJugada(clubId, jugadaId, { nombre, tipo, datos }) {
  validarOLanzar(datos);
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('jugada')
    .update({ nombre, tipo, datos })
    .eq('club_id', clubId)
    .eq('id', jugadaId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_ES_TUYA');
}

export async function borrarJugada(clubId, jugadaId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('jugada')
    .delete()
    .eq('club_id', clubId)
    .eq('id', jugadaId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_ES_TUYA');
}

export async function plantelesDeJugada(clubId, jugadaId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('jugada_plantel')
    .select('plantel_id')
    .eq('club_id', clubId)
    .eq('jugada_id', jugadaId);
  if (error) throw error;
  return data.map((f) => f.plantel_id);
}

/** Deja asignada la jugada exactamente a `plantelIds`: inserta y borra sólo lo que cambió. */
export async function asignarJugada(clubId, jugadaId, plantelIds) {
  const actuales = await plantelesDeJugada(clubId, jugadaId);
  const { altas, bajas } = diferenciaDeAsignacion(actuales, plantelIds);
  const supabase = obtenerCliente();
  if (altas.length) {
    const { error } = await supabase
      .from('jugada_plantel')
      .insert(altas.map((plantelId) => ({ club_id: clubId, jugada_id: jugadaId, plantel_id: plantelId })));
    if (error) throw error;
  }
  if (bajas.length) {
    const { error } = await supabase
      .from('jugada_plantel')
      .delete()
      .eq('club_id', clubId)
      .eq('jugada_id', jugadaId)
      .in('plantel_id', bajas);
    if (error) throw error;
  }
}

/** Las jugadas asignadas a los planteles del jugador, vía mis_jugadas() (0035). */
export async function misJugadas() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('mis_jugadas');
  if (error) throw error;
  return data.map((f) => ({ id: f.jugada_id, nombre: f.nombre, tipo: f.tipo, datos: f.datos }));
}
