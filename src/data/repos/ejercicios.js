// Biblioteca de ejercicios, sus notas y sus variaciones.
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente } from '../cliente.js';

/**
 * Los ejercicios del club. `tieneNotas` es una señal BINARIA de presencia, no
 * un contador ni un ranking: se traen los ids de las notas sólo para saber si
 * hay alguna, y el número no se muestra en ninguna parte. Las variaciones sí
 * se cuentan: "3 variaciones" dice cuánto se puede progresar, no quién gana.
 */
export async function obtenerEjercicios(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .select('id, titulo, tema, descripcion, enlace, material, jugadores, categorias, creado_por, creado_en, nota_ejercicio(id), variacion_ejercicio(id)')
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
    cantidadVariaciones: (f.variacion_ejercicio ?? []).length,
  }));
}

export async function obtenerEjercicio(clubId, ejercicioId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .select('id, titulo, tema, descripcion, enlace, material, jugadores, categorias, pizarra, creado_por, creado_en')
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
    pizarra: data.pizarra ?? null,
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

/**
 * El dibujo del ejercicio (pizarra en modo ejercicio; null lo borra). Va aparte
 * de actualizarEjercicio a propósito: guardar el dibujo no toca el texto y
 * editar el texto no pisa el dibujo. Como allá, si el ejercicio es de otro la
 * policy no devuelve ninguna fila y esto lanza 'NO_ES_TUYO'. El JSON viene
 * validado por src/data/pizarraEjercicio.js; la base sólo cuida tamaño y notas.
 */
export async function guardarPizarraEjercicio(clubId, ejercicioId, pizarra) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .update({ pizarra, actualizado_en: new Date().toISOString() })
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

function variacionDesdeFila(f) {
  return {
    id: f.id,
    ejercicioId: f.ejercicio_id,
    nivel: f.nivel,
    eje: f.eje,
    titulo: f.titulo,
    descripcion: f.descripcion,
    creadoPor: f.creado_por,
    creadoEn: f.creado_en,
  };
}

const COLUMNAS_VARIACION = 'id, ejercicio_id, nivel, eje, titulo, descripcion, creado_por, creado_en';

/** Las variaciones de un ejercicio, sin ordenar: el orden lo decide ordenarVariaciones. */
export async function obtenerVariaciones(clubId, ejercicioId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('variacion_ejercicio')
    .select(COLUMNAS_VARIACION)
    .eq('club_id', clubId)
    .eq('ejercicio_id', ejercicioId);
  if (error) throw error;
  return data.map(variacionDesdeFila);
}

/** Una sola fila. Se le puede sumar a un ejercicio ajeno: la autoría la sella la base. */
export async function crearVariacion({ clubId, ejercicioId, nivel, eje, titulo, descripcion }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('variacion_ejercicio')
    .insert({
      club_id: clubId,
      ejercicio_id: ejercicioId,
      nivel,
      eje: eje || null,
      titulo,
      descripcion: descripcion || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/** Si la variación es de otro, la policy de 0052 no devuelve filas y esto lanza 'NO_ES_TUYO'. */
export async function actualizarVariacion(clubId, variacionId, { nivel, eje, titulo, descripcion }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('variacion_ejercicio')
    .update({ nivel, eje: eje || null, titulo, descripcion: descripcion || null })
    .eq('club_id', clubId)
    .eq('id', variacionId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_ES_TUYO');
}

export async function borrarVariacion(clubId, variacionId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('variacion_ejercicio')
    .delete()
    .eq('club_id', clubId)
    .eq('id', variacionId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_ES_TUYO');
}
