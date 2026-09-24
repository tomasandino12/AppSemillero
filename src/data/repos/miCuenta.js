// Lo que lee un jugador con cuenta propia: su ficha, sus recursos, su plan y su
// progreso. Se importa a través de src/data/repositorio.js (fachada).
//
// No consulta ninguna tabla: el jugador no tiene `select` sobre ninguna (0030).
// Cada función llama a su RPC, que corre como dueño y devuelve sólo lo suyo. Por
// eso estas pantallas no reusan los repos del cuerpo técnico.
import { obtenerCliente } from '../cliente.js';

// Las RPC devuelven jsonb ya en camelCase; los mappers fijan la forma del
// dominio y convierten los numeric (kg, segundos), que pueden llegar como texto.
const numeroONulo = (v) => (v == null ? null : Number(v));

const lineaDesdeJson = (l) => ({
  id: l.id,
  orden: l.orden,
  bloque: l.bloque,
  nombreOriginal: l.nombreOriginal,
  series: l.series,
  reps: l.reps,
  cargaSugerida: l.cargaSugerida,
  pausa: l.pausa,
  notas: l.notas,
  video: l.video ? { nombre: l.video.nombre, link: l.video.link } : null,
});

const planDesdeJson = (p) => ({
  planId: p.planId,
  plantelId: p.plantelId,
  categoria: p.categoria,
  nombreArchivo: p.nombreArchivo,
  sesiones: (p.sesiones ?? []).map((s) => ({ id: s.id, fecha: s.fecha, lineas: (s.lineas ?? []).map(lineaDesdeJson) })),
});

/**
 * Null si quien llama no es un jugador con cuenta vigente: es la señal con la
 * que el arranque decide entre el shell del jugador y "todavía no tenés club".
 */
export async function obtenerMiFicha() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('mi_ficha');
  if (error) throw error;
  if (!data) return null;
  return {
    jugadorId: data.jugadorId,
    clubId: data.clubId,
    clubNombre: data.clubNombre,
    nombre: data.nombre,
    planteles: (data.planteles ?? []).map((p) => ({
      plantelId: p.plantelId,
      categoriaCodigo: p.categoriaCodigo,
      categoria: p.categoria,
    })),
  };
}

/**
 * Anota que el jugador abrió un recurso (la primera vez cuenta; la base ignora
 * las siguientes y también lo que no se le envió). El profe ve sólo cuántos
 * abrieron, nunca quién (0034). No es algo que el jugador espere: nunca lanza.
 */
export async function registrarAperturaDeRecurso(recursoId) {
  try {
    await obtenerCliente().rpc('registrar_apertura', { p_recurso_id: recursoId });
  } catch {
    // Sin conexión o cualquier falla: el recurso se abre igual.
  }
}

export async function obtenerMisRecursos() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('mis_recursos');
  if (error) throw error;
  return data.map((f) => ({
    id: f.recurso_id,
    titulo: f.titulo,
    descripcion: f.descripcion,
    enlace: f.enlace,
    fecha: f.fecha,
  }));
}

/**
 * Un plan por cada plantel del jugador, ya elegido en la base, más su último
 * peso en cada ejercicio (`pesos`, con la clave del ejercicio: planDelJugador.js
 * los une a cada línea).
 */
export async function obtenerMiPlan() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('mi_plan');
  if (error) throw error;
  return {
    planes: (data?.planes ?? []).map(planDesdeJson),
    pesos: (data?.pesos ?? []).map((p) => ({ clave: p.clave, nombre: p.nombre, kg: Number(p.kg) })),
  };
}

/**
 * Todo lo del jugador, con la forma que esperan las funciones de
 * estadisticas.js: `partidos` trae el partido y su fila de estadística juntos.
 */
export async function obtenerMiProgreso() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('mi_progreso');
  if (error) throw error;
  return {
    partidos: data?.partidos ?? [],
    tiro: data?.tiro ?? [],
    // Un ausente llega con tiempoVueloMs null: se preserva, no se vuelve 0.
    saltos: (data?.saltos ?? []).map((s) => ({
      ...s,
      intentos: (s.intentos ?? []).map((i) => ({ ...i, tiempoVueloMs: numeroONulo(i.tiempoVueloMs) })),
    })),
    // Igual: un ausente llega con tiempoMs null.
    sprints: (data?.sprints ?? []).map((s) => ({
      ...s,
      intentos: (s.intentos ?? []).map((i) => ({ ...i, tiempoMs: numeroONulo(i.tiempoMs) })),
    })),
    escalones: (data?.escalones ?? []).map((e) => ({ ...e, kg: Number(e.kg) })),
  };
}
