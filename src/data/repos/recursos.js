// Recursos enviados a los jugadores.
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente } from '../cliente.js';

export async function obtenerRecursos(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('recurso')
    .select('id, titulo, descripcion, enlace, tipo, frecuencia_semanal, minutos, creado_en, envio_recurso(jugador_id, fecha)')
    .eq('club_id', clubId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    descripcion: f.descripcion,
    enlace: f.enlace,
    tipo: f.tipo,
    frecuenciaSemanal: f.frecuencia_semanal,
    minutos: f.minutos,
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
