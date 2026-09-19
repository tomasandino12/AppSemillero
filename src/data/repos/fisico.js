// Plan físico importado, escalones de fuerza y cargas.
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente, TAMANIO_PAGINA } from '../cliente.js';
import { bloquesPorClave } from '../cargas.js';
import { claveDeEjercicio, fechaLocal } from '../escalones.js';

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

/**
 * Los planes de una categoría con las fechas de sus sesiones, para elegir cuál
 * se muestra (elegirPlanVisible). Dos consultas y no un embed: evita depender
 * de cómo PostgREST resuelve las FK compuestas de 0020.
 */
export async function obtenerPlanesFisicos(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data: planes, error } = await supabase
    .from('plan_fisico')
    .select('id, nombre_archivo, creado_en')
    .eq('club_id', clubId)
    .eq('plantel_id', plantelId);
  if (error) throw error;
  if (!planes.length) return [];
  const { data: sesiones, error: errorSesiones } = await supabase
    .from('sesion_fisico')
    .select('plan_id, fecha')
    .in('plan_id', planes.map((p) => p.id));
  if (errorSesiones) throw errorSesiones;
  return planes.map((p) => ({
    id: p.id,
    nombreArchivo: p.nombre_archivo,
    creadoEn: p.creado_en,
    fechas: sesiones.filter((s) => s.plan_id === p.id).map((s) => s.fecha),
  }));
}

/**
 * Un plan entero: sesiones por fecha, líneas en el orden del archivo, y el link
 * de video de las líneas que lo tienen. Una línea sin video trae video: null,
 * que es el caso normal.
 */
export async function obtenerPlanFisico(planId) {
  const supabase = obtenerCliente();
  const { data: sesiones, error } = await supabase
    .from('sesion_fisico')
    .select('id, fecha')
    .eq('plan_id', planId)
    .order('fecha');
  if (error) throw error;
  if (!sesiones.length) return [];

  const { data: lineas, error: errorLineas } = await supabase
    .from('ejercicio_asignado')
    .select('id, sesion_id, ejercicio_fuerza_id, orden, bloque, nombre_original, series, reps, carga_sugerida, pausa, notas')
    .in('sesion_id', sesiones.map((s) => s.id))
    .order('orden', { ascending: true, nullsFirst: false });
  if (errorLineas) throw errorLineas;

  const idsConVideo = [...new Set(lineas.map((l) => l.ejercicio_fuerza_id).filter(Boolean))];
  let videos = [];
  if (idsConVideo.length) {
    const { data, error: errorVideos } = await supabase
      .from('ejercicio_fuerza')
      .select('id, nombre, link')
      .in('id', idsConVideo);
    if (errorVideos) throw errorVideos;
    videos = data;
  }
  const videoPorId = new Map(videos.filter((v) => v.link).map((v) => [v.id, { nombre: v.nombre, link: v.link }]));

  return sesiones.map((s) => ({
    id: s.id,
    fecha: s.fecha,
    lineas: lineas
      .filter((l) => l.sesion_id === s.id)
      .map((l) => ({
        id: l.id,
        orden: l.orden,
        bloque: l.bloque,
        nombreOriginal: l.nombre_original,
        series: l.series,
        reps: l.reps,
        cargaSugerida: l.carga_sugerida,
        pausa: l.pausa,
        notas: l.notas,
        video: videoPorId.get(l.ejercicio_fuerza_id) ?? null,
      })),
  }));
}

// paso nulo es "todavía sin escalón", y Number(null) es 0: se conserva el nulo.
const pasoDesdeFila = (f) => ({ id: f.id, clave: f.clave, nombre: f.nombre, paso: f.paso == null ? null : Number(f.paso) });

/** Todos los escalones del club: son de todo el club, no de una categoría (0023, 0024). */
export async function obtenerPasos(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('paso_fuerza')
    .select('id, clave, nombre, paso')
    .eq('club_id', clubId);
  if (error) throw error;
  return data.map(pasoDesdeFila);
}

export async function crearPaso({ clubId, clave, nombre, paso }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('paso_fuerza')
    .insert({ club_id: clubId, clave, nombre, paso })
    .select('id, clave, nombre, paso')
    .single();
  if (error) throw error;
  return pasoDesdeFila(data);
}

/**
 * Sólo el paso, y no upsert: el update está otorgado sólo sobre esa columna, y un
 * upsert de PostgREST reescribe todas las que manda. Se pide la fila de vuelta
 * porque un update que la RLS no deja pasar no da error: afecta cero filas.
 */
export async function editarPaso(pasoId, paso) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('paso_fuerza')
    .update({ paso })
    .eq('id', pasoId)
    .select('id, clave, nombre, paso');
  if (error) throw error;
  if (!data.length) throw new Error('NO_SE_PUDO_EDITAR');
  return pasoDesdeFila(data[0]);
}

const escalonDesdeFila = (f) => ({ jugadorId: f.jugador_id, kg: Number(f.kg), desde: f.creado_en });

/** El último movimiento de cada chico en un ejercicio (vista escalon_actual). */
export async function obtenerEscalonesActuales(pasoId, jugadorIds) {
  if (!jugadorIds.length) return [];
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('escalon_actual')
    .select('jugador_id, kg, creado_en')
    .eq('escalera_id', pasoId)
    .in('jugador_id', jugadorIds);
  if (error) throw error;
  return data.map(escalonDesdeFila);
}

/**
 * Toda la historia de pesos de los chicos de una categoría, con el nombre y el
 * bloque de cada ejercicio, para las curvas de cargas de DATOS.
 *
 * paso_fuerza no tiene bloque. El bloque sale de las líneas de las sesiones
 * (ejercicio_asignado) de los planes de ESTA categoría, unidas por la clave
 * del nombre de la línea: la misma con que el import crea el paso y con que
 * FÍSICO une cada línea con su escalón. No de la biblioteca (ejercicio_fuerza):
 * la hoja "Ejercicios" del archivo no trae todos los nombres y su bloque puede
 * haber quedado viejo. Qué aparición manda lo decide bloquesPorClave().
 *
 * La fecha de cada movimiento es la del dispositivo (fechaLocal): un peso
 * anotado a las 22 en Argentina es de ese día, no del siguiente en UTC.
 */
export async function obtenerCargasDelPlantel(clubId, plantelId, jugadorIds) {
  if (!jugadorIds.length) return { movimientos: [], ejercicios: [] };
  const supabase = obtenerCliente();
  // Paginada: la historia sólo crece (un movimiento por cada + o −) y pasa
  // las 1000 filas de max-rows. `orden` es único, así que no saltea ni repite.
  const movs = [];
  let desde = 0;
  for (;;) {
    const { data: pagina, error } = await supabase
      .from('movimiento_escalon')
      .select('jugador_id, escalera_id, kg, creado_en, orden')
      .in('jugador_id', jugadorIds)
      .order('orden')
      .range(desde, desde + TAMANIO_PAGINA - 1);
    if (error) throw error;
    movs.push(...pagina);
    if (pagina.length < TAMANIO_PAGINA) break;
    desde += TAMANIO_PAGINA;
  }
  if (!movs.length) return { movimientos: [], ejercicios: [] };

  const pasoIds = [...new Set(movs.map((m) => m.escalera_id))];
  const { data: pasos, error: errorPasos } = await supabase
    .from('paso_fuerza')
    .select('id, clave, nombre')
    .in('id', pasoIds);
  if (errorPasos) throw errorPasos;

  const bloques = bloquesPorClave(await lineasDeLosPlanes(supabase, clubId, plantelId));

  return {
    movimientos: movs.map((m) => ({
      jugadorId: m.jugador_id,
      pasoId: m.escalera_id,
      kg: Number(m.kg),
      fecha: fechaLocal(new Date(m.creado_en)),
      orden: Number(m.orden),
    })),
    ejercicios: pasos.map((p) => ({ pasoId: p.id, nombre: p.nombre, bloque: bloques.get(p.clave) ?? null })),
  };
}

/**
 * Clave, bloque, fecha y orden de cada línea de los planes de una categoría.
 * Las sesiones van de a tandas: sus ids viajan en la URL del .in(), y cada
 * tanda se pagina porque un plan de un año pasa las 1000 líneas.
 */
async function lineasDeLosPlanes(supabase, clubId, plantelId) {
  const { data: planes, error } = await supabase
    .from('plan_fisico')
    .select('id')
    .eq('club_id', clubId)
    .eq('plantel_id', plantelId);
  if (error) throw error;
  if (!planes.length) return [];
  const { data: sesiones, error: errorSesiones } = await supabase
    .from('sesion_fisico')
    .select('id, fecha')
    .in('plan_id', planes.map((p) => p.id));
  if (errorSesiones) throw errorSesiones;
  const fechaDeSesion = new Map(sesiones.map((s) => [s.id, s.fecha]));

  const lineas = [];
  const TANDA = 50;
  for (let t = 0; t < sesiones.length; t += TANDA) {
    const ids = sesiones.slice(t, t + TANDA).map((s) => s.id);
    let desde = 0;
    for (;;) {
      const { data: pagina, error: errorLineas } = await supabase
        .from('ejercicio_asignado')
        .select('id, sesion_id, nombre_original, bloque, orden')
        .in('sesion_id', ids)
        .order('id')
        .range(desde, desde + TAMANIO_PAGINA - 1);
      if (errorLineas) throw errorLineas;
      lineas.push(...pagina);
      if (pagina.length < TAMANIO_PAGINA) break;
      desde += TAMANIO_PAGINA;
    }
  }
  return lineas.map((l) => ({
    clave: claveDeEjercicio(l.nombre_original),
    bloque: l.bloque,
    fecha: fechaDeSesion.get(l.sesion_id),
    orden: l.orden,
  }));
}

/** Un movimiento: los kg de destino, no "+1" (spec, sección 8). */
export async function moverEscalon({ clubId, jugadorId, pasoId, kg }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('movimiento_escalon')
    .insert({ club_id: clubId, jugador_id: jugadorId, escalera_id: pasoId, kg })
    .select('jugador_id, kg, creado_en')
    .single();
  if (error) throw error;
  return escalonDesdeFila(data);
}
