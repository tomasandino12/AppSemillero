// Inventario de material del club (0026).
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente } from '../cliente.js';

const COLUMNAS_MATERIAL = 'id, tipo, peso_kg, detalle, cantidad, actualizado_por, actualizado_en';

const materialDesdeFila = (f) => ({
  id: f.id,
  tipo: f.tipo,
  pesoKg: f.peso_kg == null ? null : Number(f.peso_kg),
  detalle: f.detalle,
  cantidad: f.cantidad,
  actualizadoPor: f.actualizado_por,
  actualizadoEn: f.actualizado_en,
});

/** Todo el inventario del club. Lo lee cualquier miembro (RLS de 0026). */
export async function obtenerMaterial(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('material')
    .select(COLUMNAS_MATERIAL)
    .eq('club_id', clubId);
  if (error) throw error;
  return data.map(materialDesdeFila);
}

/**
 * Insert simple, no upsert: si la variante ya existe, el índice único
 * devuelve 23505 y la pantalla ofrece editar la existente. Sumar cantidades a
 * ciegas es lo que infla un inventario.
 */
export async function agregarMaterial({ clubId, tipo, pesoKg, detalle, cantidad }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('material')
    .insert({ club_id: clubId, tipo, peso_kg: pesoKg, detalle, cantidad })
    .select(COLUMNAS_MATERIAL)
    .single();
  if (error) throw error;
  return materialDesdeFila(data);
}

/**
 * Sólo las columnas con grant de update: el tipo y el club no cambian. Se pide
 * la fila de vuelta porque un update que la RLS no deja pasar no da error:
 * afecta cero filas.
 */
export async function editarMaterial(id, { pesoKg, detalle, cantidad }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('material')
    .update({ peso_kg: pesoKg, detalle, cantidad })
    .eq('id', id)
    .select(COLUMNAS_MATERIAL);
  if (error) throw error;
  if (!data.length) throw new Error('NO_SE_PUDO_EDITAR');
  return materialDesdeFila(data[0]);
}

/** Lo que ya no se tiene se borra (spec 4.3). Cero filas = la RLS no dejó. */
export async function quitarMaterial(id) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('material')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_SE_PUDO_QUITAR');
}
