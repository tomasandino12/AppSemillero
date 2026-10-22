// Noticias del portal del básquet (0064).
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente } from '../cliente.js';
import {
  noticiaDesdeFila, noticiaResumenDesdeFila, noticiaPublicaDesdeFila, BUCKET_NOTICIAS, NOTICIAS_POR_PAGINA,
} from '../noticias.js';

const COLUMNAS = 'id, titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen, publicada, publicada_en, actualizado_en';

/** La URL pública de una foto del bucket. No va a la red: la arma supabase-js. */
export function urlFotoNoticia(ruta) {
  return obtenerCliente().storage.from(BUCKET_NOTICIAS).getPublicUrl(ruta).data.publicUrl;
}

/**
 * Las tarjetas que ve el portal sin sesión: publicadas del club, de la más
 * nueva a la más vieja, de a páginas (`antesDe` = publicadaEn de la última
 * mostrada). Es la puerta de anon (0064): la tabla no se lee directo.
 */
export async function noticiasPublicas(clubId, { limite = NOTICIAS_POR_PAGINA, antesDe = null } = {}) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('noticias_publicas', { p_club: clubId, p_limite: limite, p_antes: antesDe });
  if (error) throw error;
  return data.map((f) => noticiaResumenDesdeFila(f, urlFotoNoticia));
}

/** Una noticia publicada entera, o null si no existe o no está publicada. */
export async function noticiaPublica(clubId, id) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('noticia_publica', { p_club: clubId, p_id: id });
  if (error) throw error;
  return data[0] ? noticiaPublicaDesdeFila(data[0], urlFotoNoticia) : null;
}

/** Todas las del club, con los borradores. Sólo la coordinación del club (RLS de 0064). */
export async function listarNoticias(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('noticia')
    .select(COLUMNAS)
    .eq('club_id', clubId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data.map(noticiaDesdeFila);
}

/** Alta. El id lo trae quien llama: las fotos ya se subieron a la carpeta de ese id. */
export async function crearNoticia({ id, clubId, titulo, resumen, cuerpo, etiqueta, fotos, autorizacionImagen, publicada }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('noticia')
    .insert({ id, club_id: clubId, titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen: autorizacionImagen, publicada })
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return noticiaDesdeFila(data);
}

export async function actualizarNoticia(id, { titulo, resumen, cuerpo, etiqueta, fotos, autorizacionImagen, publicada }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('noticia')
    .update({ titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen: autorizacionImagen, publicada })
    .eq('id', id)
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return noticiaDesdeFila(data);
}

/** Sube una foto ya achicada. upsert: false, así nunca pisa otra (el nombre es un uuid nuevo). Caché de una hora, no de un año: el bucket es público y una foto que no tenía que estar tiene que dejar de verse pronto. */
export async function subirFotoNoticia(ruta, blob) {
  const supabase = obtenerCliente();
  const { error } = await supabase.storage.from(BUCKET_NOTICIAS).upload(ruta, blob, { contentType: blob.type, upsert: false, cacheControl: '3600' });
  if (error) throw error;
}

export async function borrarFotosNoticia(rutas) {
  if (!rutas.length) return;
  const supabase = obtenerCliente();
  const { error } = await supabase.storage.from(BUCKET_NOTICIAS).remove(rutas);
  if (error) throw error;
}

/**
 * Borra la noticia y después sus fotos. En ese orden: si falla la fila, la
 * noticia sigue entera; si falla borrar las fotos, quedan en el bucket sin
 * que ninguna página las muestre (la fila ya no existe).
 */
export async function borrarNoticia(noticia) {
  const supabase = obtenerCliente();
  const { error } = await supabase.from('noticia').delete().eq('id', noticia.id);
  if (error) throw error;
  await borrarFotosNoticia(noticia.fotos.map((f) => f.ruta)).catch(() => {});
}
