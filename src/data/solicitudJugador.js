/*
 * Lógica pura del pedido de acceso de un jugador (0029). Sin red, sin DOM.
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
