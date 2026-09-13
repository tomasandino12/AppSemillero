import { serieDeZonasAgregada, compararPorcentajes } from './estadisticas.js';
import { POSICIONES, LIBRES } from './posiciones.js';

/**
 * Lo que dibujan las pantallas de coordinación, armado a partir de lo que
 * devuelve la base. Funciones puras: sin red, sin DOM.
 *
 * Dos reglas que viven acá y no en la pantalla, para que no dependan de que
 * alguien se acuerde:
 *  - Las categorías van SIEMPRE en el orden del catálogo, nunca por un valor.
 *    Ordenar por porcentaje sería un ranking de categorías, y con eso de
 *    entrenadores.
 *  - Cada categoría se compara sólo consigo misma: la variación es entre su
 *    última batería y la anterior. Comparar U13 con U17 compara edades, no
 *    trabajo.
 */

/** Las 5 posiciones de la batería caen sobre la línea de tres (posiciones.js). */
const IDS_TRIPLES = POSICIONES.map((z) => z.id);

/** Libres es otro tiro: serie aparte, nunca sumada a triples. Igual que en HOY. */
const IDS_LIBRES = [LIBRES.id];

/** Hoy el nombre de la temporada es el año, así que ordenar el texto alcanza. */
export function temporadaMasReciente(temporadas) {
  return [...(temporadas ?? [])].sort((a, b) => b.nombre.localeCompare(a.nombre))[0] ?? null;
}

export function plantelesEnOrdenDeCatalogo(planteles, catalogo, temporadaId) {
  const orden = new Map((catalogo ?? []).map((c) => [c.codigo, c.orden]));
  return (planteles ?? [])
    .filter((p) => p.temporadaId === temporadaId)
    .sort((a, b) => (orden.get(a.categoriaCodigo) ?? Infinity) - (orden.get(b.categoriaCodigo) ?? Infinity));
}

/** El nombre que cargó la persona (metadatos de Auth, 0019), el mail si no. */
export function etiquetaDeMiembro(miembro) {
  return miembro?.nombre || miembro?.email || 'Cuenta sin nombre';
}

function vigentes(asignaciones) {
  return (asignaciones ?? []).filter((a) => a.hasta == null);
}

function entrenadoresACargo(plantelId, asignacionesVigentes, miembrosPorId) {
  return asignacionesVigentes
    .filter((a) => a.plantelId === plantelId)
    .map((a) => miembrosPorId.get(a.userId))
    .filter((m) => m?.esEntrenador);
}

/** Una serie de la categoría y su última batería contra la anterior. */
function serieConVariacion(filasDelPlantel, zonaIds) {
  const serie = serieDeZonasAgregada(filasDelPlantel, zonaIds);
  const variacion = serie.length >= 2
    ? compararPorcentajes(serie[serie.length - 1].valor, serie[serie.length - 2].valor)
    : null;
  return { serie, variacion };
}

export function armarPanorama({ planteles, catalogo, temporadas, panorama, miembros, asignaciones }) {
  const temporada = temporadaMasReciente(temporadas);
  if (!temporada) return { temporada: null, tarjetas: [] };

  const miembrosPorId = new Map((miembros ?? []).map((m) => [m.userId, m]));
  const resumenPorPlantel = new Map((panorama?.planteles ?? []).map((r) => [r.plantelId, r]));
  const nombreDeCategoria = new Map((catalogo ?? []).map((c) => [c.codigo, c.nombre]));
  const asignacionesVigentes = vigentes(asignaciones);

  const tarjetas = plantelesEnOrdenDeCatalogo(planteles, catalogo, temporada.id).map((p) => {
    const resumen = resumenPorPlantel.get(p.id) ?? {};
    const filas = (panorama?.tiro ?? []).filter((t) => t.plantelId === p.id);
    return {
      plantelId: p.id,
      categoria: p.categoria,
      nombreCategoria: nombreDeCategoria.get(p.categoriaCodigo) ?? p.categoria,
      jugadores: resumen.jugadores ?? 0,
      partidos: resumen.partidos ?? 0,
      ultimaMedicion: resumen.ultimaMedicion ?? null,
      aCargo: entrenadoresACargo(p.id, asignacionesVigentes, miembrosPorId).map(etiquetaDeMiembro),
      triples: serieConVariacion(filas, IDS_TRIPLES),
      libres: serieConVariacion(filas, IDS_LIBRES),
    };
  });

  return { temporada, tarjetas };
}

export function armarProfes({ planteles, catalogo, temporadas, miembros, asignaciones, pendientes, usuarioActualId }) {
  const temporada = temporadaMasReciente(temporadas);
  const plantelesPorId = new Map((planteles ?? []).map((p) => [p.id, p]));
  const nombreDeTemporada = new Map((temporadas ?? []).map((t) => [t.id, t.nombre]));
  const orden = new Map((catalogo ?? []).map((c) => [c.codigo, c.orden]));
  const miembrosPorId = new Map((miembros ?? []).map((m) => [m.userId, m]));
  const asignacionesVigentes = vigentes(asignaciones);
  const plantelesDeLaTemporada = temporada ? plantelesEnOrdenDeCatalogo(planteles, catalogo, temporada.id) : [];

  // Una asignación de otra temporada todavía vigente se muestra con el año:
  // "U17M" sola haría creer que es la de este año.
  const etiquetaDePlantel = (p) => (p.temporadaId === temporada?.id
    ? p.categoria
    : `${p.categoria} ${nombreDeTemporada.get(p.temporadaId) ?? ''}`.trim());

  const profes = [...(miembros ?? [])]
    .sort((a, b) => etiquetaDeMiembro(a).localeCompare(etiquetaDeMiembro(b)))
    .map((m) => ({
      userId: m.userId,
      etiqueta: etiquetaDeMiembro(m),
      email: m.email,
      esEntrenador: m.esEntrenador,
      esCoordinador: m.esCoordinador,
      esUnoMismo: m.userId === usuarioActualId,
      categorias: asignacionesVigentes
        .filter((a) => a.userId === m.userId && plantelesPorId.has(a.plantelId))
        .map((a) => ({ a, p: plantelesPorId.get(a.plantelId) }))
        .sort((x, y) => (orden.get(x.p.categoriaCodigo) ?? Infinity) - (orden.get(y.p.categoriaCodigo) ?? Infinity)
          || (nombreDeTemporada.get(y.p.temporadaId) ?? '').localeCompare(nombreDeTemporada.get(x.p.temporadaId) ?? ''))
        .map(({ a, p }) => ({ asignacionId: a.id, plantelId: p.id, etiqueta: etiquetaDePlantel(p), origen: a.origen })),
    }));

  const sinProfe = plantelesDeLaTemporada
    .filter((p) => entrenadoresACargo(p.id, asignacionesVigentes, miembrosPorId).length === 0);

  return { temporada, plantelesDeLaTemporada, pendientes: pendientes ?? [], profes, sinProfe };
}
