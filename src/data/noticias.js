import { LIMITE } from './limites.js';
import { hoyEnRosario, partesDeFecha } from './agenda.js';

/*
 * Lógica pura de las noticias del portal (0064, spec 2026-10-21): validar lo
 * que escribe la coordinación, las fotos (qué se acepta, a cuánto se achican,
 * dónde se guardan), los párrafos y las fechas, y los mappers. Sin red ni DOM.
 *
 * Las etiquetas, el máximo de fotos, el largo del alt y los tipos y el tamaño
 * de lo que se guarda viven también en la migración, que es la que los hace
 * cumplir: tests/contratoNoticia.test.js compara las dos.
 */

export const ETIQUETAS_NOTICIA = Object.freeze([
  Object.freeze({ clave: 'club', rotulo: 'Club' }),
  Object.freeze({ clave: 'partidos', rotulo: 'Partidos' }),
  Object.freeze({ clave: 'eventos', rotulo: 'Eventos' }),
  Object.freeze({ clave: 'inscripcion', rotulo: 'Inscripción' }),
]);

export const MAX_FOTOS = 6;
/** Lo que acepta el bucket por archivo (0064). */
export const MAX_BYTES_FOTO = 1048576;
/** Lo que se acepta elegir antes de achicar: una foto de celular grande entra, un video no. */
export const MAX_BYTES_ORIGINAL = 15 * 1048576;
export const LADO_MAX_FOTO = 1600;
/** Calidades que se prueban, en orden, hasta que la foto achicada pesa menos que MAX_BYTES_FOTO. */
export const CALIDADES_FOTO = Object.freeze([0.82, 0.7, 0.55]);
export const TIPOS_FOTO_ORIGINAL = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
/** Lo que se guarda (tipo → extensión). png no: se pasa a webp, o a jpeg si el navegador no sabe hacer webp. */
export const TIPOS_FOTO_GUARDADA = Object.freeze({ 'image/webp': 'webp', 'image/jpeg': 'jpg' });
export const NOTICIAS_POR_PAGINA = 12;
export const BUCKET_NOTICIAS = 'noticias';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const recortar = (v) => (typeof v === 'string' ? v.trim() : '');
const falla = (error, campo, foto = null) => ({ error, campo, foto, noticia: null });

export const esIdNoticia = (valor) => typeof valor === 'string' && UUID.test(valor);

export const rotuloDeEtiqueta = (clave) => ETIQUETAS_NOTICIA.find((e) => e.clave === clave)?.rotulo ?? null;

/**
 * Lo que escribió la coordinación → la noticia a guardar, o el primer error
 * con el campo (y la foto) donde está, para marcarlo en el formulario. Las
 * rutas de las fotos no se validan acá: las arma rutaFoto y las vuelve a
 * exigir la base.
 */
export function validarNoticia({ titulo, resumen, cuerpo, etiqueta, fotos = [], autorizacionImagen = false } = {}) {
  const t = recortar(titulo);
  if (!t) return falla('Escribí el título de la noticia.', 'titulo');
  if (t.length > LIMITE.tituloNoticia) return falla(`El título es muy largo: hasta ${LIMITE.tituloNoticia} letras.`, 'titulo');

  const r = recortar(resumen);
  if (!r) return falla('Escribí el resumen: es la línea que se ve en la tarjeta.', 'resumen');
  if (r.length > LIMITE.resumenNoticia) return falla(`El resumen es muy largo: hasta ${LIMITE.resumenNoticia} letras.`, 'resumen');

  const c = recortar(cuerpo);
  if (!c) return falla('Escribí el texto de la noticia.', 'cuerpo');
  if (c.length > LIMITE.cuerpoNoticia) return falla(`El texto es muy largo: hasta ${LIMITE.cuerpoNoticia} letras.`, 'cuerpo');

  if (!rotuloDeEtiqueta(etiqueta)) return falla('Elegí de qué es la noticia.', 'etiqueta');

  const lista = Array.isArray(fotos) ? fotos : [];
  if (lista.length > MAX_FOTOS) return falla(`Hasta ${MAX_FOTOS} fotos por noticia.`, 'fotos');
  const alts = lista.map((f) => recortar(f?.alt));
  const sinAlt = alts.findIndex((a) => !a);
  if (sinAlt !== -1) return falla(`Contá qué se ve en la foto ${sinAlt + 1}, sin nombres de chicos.`, 'fotos', sinAlt);
  const largo = alts.findIndex((a) => a.length > LIMITE.altFoto);
  if (largo !== -1) return falla(`La descripción de la foto ${largo + 1} es muy larga: hasta ${LIMITE.altFoto} letras.`, 'fotos', largo);
  // Sólo true: un "true" escrito o un 1 no es el gesto de la persona tildando la casilla.
  if (lista.length && autorizacionImagen !== true) {
    return falla('Para publicar fotos tenés que confirmar que tenés la autorización de imagen de las familias.', 'autorizacion');
  }

  return { error: null, campo: null, foto: null, noticia: { titulo: t, resumen: r, cuerpo: c, etiqueta, alts, autorizacionImagen: autorizacionImagen === true } };
}

/** El archivo elegido, antes de achicarlo. null si se puede usar; si no, qué decirle a la persona. */
export function validarArchivoFoto(archivo) {
  if (!TIPOS_FOTO_ORIGINAL.includes(archivo?.type)) return 'Esa foto no se puede usar: tiene que ser JPG, PNG o WEBP.';
  if (archivo.size > MAX_BYTES_ORIGINAL) return 'La foto pesa más de 15 MB. Elegí otra o mandá una captura.';
  return null;
}

/** Las medidas a las que se achica: el lado largo a LADO_MAX_FOTO, proporcional. Una foto chica no se agranda. */
export function medidasAchicadas(ancho, alto) {
  const largo = Math.max(ancho, alto);
  if (largo <= LADO_MAX_FOTO) return { ancho, alto };
  const escala = LADO_MAX_FOTO / largo;
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

/** Dónde se guarda una foto en el bucket (la carpeta de su noticia, como exige 0064), o null. */
export function rutaFoto(clubId, noticiaId, nombre, tipo) {
  const ext = TIPOS_FOTO_GUARDADA[tipo];
  if (!ext || ![clubId, noticiaId, nombre].every(esIdNoticia)) return null;
  return `${clubId}/${noticiaId}/${nombre}.${ext}`;
}

/** El cuerpo en párrafos: se separan con una línea en blanco. Un salto simple queda dentro (lo muestra pre-line). */
export function parrafos(texto) {
  return String(texto ?? '').replace(/\r\n/g, '\n').split(/\n[ \t]*\n/).map((p) => p.trim()).filter(Boolean);
}

/** El día de la publicación en Rosario ('YYYY-MM-DD'), o null. */
export function fechaDeNoticia(iso) {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? hoyEnRosario(new Date(t)) : null;
}

/** '2026-10-21' → 'mié, 21 oct': la fecha de la tarjeta, como en el sitio del club. */
export function textoFechaCorta(fecha) {
  if (!fecha) return '';
  const { semana, dia, mes } = partesDeFecha(fecha);
  return `${semana}, ${dia} ${mes}`;
}

/**
 * La URL de una foto si es del bucket de noticias del proyecto (`base` =
 * SUPABASE_URL), sin comillas ni espacios. En la vista previa del panel, una
 * foto recién elegida todavía es un blob: del propio navegador.
 */
export function urlFotoValida(url, base, { previa = false } = {}) {
  if (typeof url !== 'string' || /[\s"'<>]/.test(url)) return null;
  if (previa && url.startsWith('blob:')) return url;
  if (typeof base !== 'string' || !base) return null;
  return url.startsWith(`${base}/storage/v1/object/public/${BUCKET_NOTICIAS}/`) ? url : null;
}

/** Fila de `noticia` (panel de coordinación) → noticia de dominio. */
export function noticiaDesdeFila(f) {
  return {
    id: f.id,
    titulo: f.titulo,
    resumen: f.resumen,
    cuerpo: f.cuerpo,
    etiqueta: f.etiqueta,
    fotos: (f.fotos ?? []).map(({ ruta, alt }) => ({ ruta, alt })),
    autorizacionImagen: f.autorizacion_imagen === true,
    publicada: f.publicada === true,
    publicadaEn: f.publicada_en ?? null,
    actualizadoEn: f.actualizado_en ?? null,
  };
}

/** Fila de noticias_publicas() → tarjeta. `urlDe(ruta)` arma la URL pública de una foto. */
export function noticiaResumenDesdeFila(f, urlDe) {
  return {
    id: f.id,
    titulo: f.titulo,
    resumen: f.resumen,
    etiqueta: f.etiqueta,
    foto: f.foto?.ruta ? { url: urlDe(f.foto.ruta), alt: f.foto.alt } : null,
    publicadaEn: f.publicada_en ?? null,
    fecha: fechaDeNoticia(f.publicada_en),
  };
}

/** Fila de noticia_publica() → noticia entera para la página. */
export function noticiaPublicaDesdeFila(f, urlDe) {
  return {
    id: f.id,
    titulo: f.titulo,
    resumen: f.resumen,
    cuerpo: f.cuerpo,
    etiqueta: f.etiqueta,
    fotos: (f.fotos ?? []).map(({ ruta, alt }) => ({ url: urlDe(ruta), alt })),
    publicadaEn: f.publicada_en ?? null,
    fecha: fechaDeNoticia(f.publicada_en),
  };
}
