import { escaparHtml, esErrorDeRed } from './nav.js';

/*
 * Cómo se le cuenta un error a quien usa la app. Un solo lugar para los textos
 * de siempre, así que un cambio de redacción se hace una vez y no en cuarenta
 * pantallas. Sin DOM: se puede probar en Node.
 */

export const SIN_CONEXION = 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';

/** El link del mail de recuperación no sirvió. Vencen en una hora. */
export const LINK_DE_RECUPERACION_VENCIDO = 'El link para cambiar la contraseña venció o ya se usó. Escribí tu mail y pedí uno nuevo.';

const SIN_PERMISO = 'No tenés permiso para hacer eso.';
const SIN_PERMISO_EN_TEXTO = /row-level security|permission denied|42501/i;

/** Error de red → el texto de "sin conexión"; cualquier otro → `generico`. */
export function textoDeError(e, generico) {
  return esErrorDeRed(e) ? SIN_CONEXION : generico;
}

/** El bloque de aviso que reemplaza el contenido de una pantalla que no pudo cargar. */
export function avisoDeError(e, generico) {
  return `<div class="pad"><div class="al"><div class="tx">${escaparHtml(textoDeError(e, generico))}</div></div></div>`;
}

/**
 * El mensaje de un guardado que falló. Orden: red, reglas propias de la
 * pantalla (mensajes que lanzan las funciones de la base), falta de permiso
 * y, si nada calza, el genérico.
 *
 * `reglas`: [[regex sobre e.message, texto]]. `permiso`: qué texto o código
 * cuenta como "no tenés permiso" (por defecto, lo que devuelve RLS).
 */
export function mensajeAlGuardar(e, {
  reglas = [],
  permiso = SIN_PERMISO_EN_TEXTO,
  generico = 'No se pudo guardar. Probá de nuevo.',
} = {}) {
  if (esErrorDeRed(e)) return SIN_CONEXION;
  const texto = e?.message ?? '';
  for (const [patron, mensaje] of reglas) {
    if (patron.test(texto)) return mensaje;
  }
  if (e?.code === '42501' || permiso.test(texto)) return SIN_PERMISO;
  return generico;
}
