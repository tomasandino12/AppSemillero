/*
 * Lógica pura del pedido de acceso de un jugador (0029) y de su aprobación. Sin
 * red, sin DOM.
 */

/**
 * El catálogo plano de clubes_para_solicitar() (una fila por categoría de cada
 * club) agrupado por club, con las categorías en el orden en que vienen: la
 * base ya las ordena por el catálogo. Un club sin categorías no existe acá.
 */
export function clubesDelCatalogo(filas) {
  const porClub = new Map();
  for (const f of filas ?? []) {
    if (!porClub.has(f.clubId)) porClub.set(f.clubId, { clubId: f.clubId, nombre: f.clubNombre, categorias: [] });
    porClub.get(f.clubId).categorias.push({ plantelId: f.plantelId, nombre: f.categoriaNombre });
  }
  return [...porClub.values()];
}

/**
 * Cuando crear la ficha choca con JUGADOR_YA_EXISTE: la ficha del club con esa
 * clave (`existentes` es lo que devuelve obtenerJugadoresDelClub) y si ya está
 * en el plantel de la solicitud. Sólo en ese caso se puede vincular con un
 * toque; si está en otra categoría, hay que sumarla primero a esta. Null si no
 * hay ninguna con esa clave. La clave la compara el sistema; QUÉ ficha es la
 * persona lo decide siempre el profe, que es quien confirma.
 */
export function fichaExistente(existentes, nombreClave, plantelId) {
  const jugador = (existentes ?? []).find((j) => j.nombreClave === nombreClave);
  if (!jugador) return null;
  return { jugador, enPlantel: (jugador.plantelesActuales ?? []).includes(plantelId) };
}
