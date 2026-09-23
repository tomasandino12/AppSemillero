// Recursos enviados a los jugadores.
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente } from '../cliente.js';

export async function obtenerRecursos(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('recurso')
    .select('id, titulo, descripcion, enlace, tipo, frecuencia_semanal, minutos, creado_por, creado_en, envio_recurso(jugador_id, fecha)')
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
    creadoPor: f.creado_por,
    creadoEn: f.creado_en,
    envios: (f.envio_recurso ?? []).map((e) => ({ jugadorId: e.jugador_id, fecha: e.fecha })),
  }));
}

/**
 * Sólo lo propio (0042, policy recurso_borrar_lo_propio). Se lleva puesto los
 * envíos y las aperturas registradas (cascade desde 0009/0034): la pantalla
 * lo dice antes de confirmar.
 */
export async function borrarRecurso(clubId, recursoId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('recurso')
    .delete()
    .eq('club_id', clubId)
    .eq('id', recursoId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_ES_TUYO');
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

/**
 * Conteos de aperturas del plantel, sin nombres: la base los arma con
 * resumen_recursos() y no devuelve ningún id de jugador. Los conteos de
 * aperturas vienen en null cuando hay muy pocas cuentas para que no delaten a
 * nadie (ver 0034). Null si quien llama no es entrenador del plantel.
 */
export async function obtenerResumenRecursos(plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('resumen_recursos', { p_plantel_id: plantelId });
  if (error) throw error;
  if (!data) return null;
  return {
    conCuenta: data.conCuenta,
    abrieronAlguno: data.abrieronAlguno,
    recursos: data.recursos.map((r) => ({
      recursoId: r.recursoId,
      enviados: r.enviados,
      conCuenta: r.conCuenta,
      abrieron: r.abrieron,
      primerasEsteMes: r.primerasEsteMes,
      primerasMesAnterior: r.primerasMesAnterior,
    })),
  };
}
