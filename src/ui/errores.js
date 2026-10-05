import { escaparHtml, esErrorDeRed } from './nav.js';

/*
 * Cómo se le cuenta un error a quien usa la app. Un solo lugar para los textos
 * de siempre, así que un cambio de redacción se hace una vez y no en cuarenta
 * pantallas. Sin DOM: se puede probar en Node.
 */

export const SIN_CONEXION = 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';
export const SESION_CERRADA = 'Tu sesión se cerró. Volvé a entrar: lo que cargaste sigue en el celular.';
const SIN_PERMISO = 'No tenés permiso para hacer eso.';
const SIN_PERMISO_EN_TEXTO = /row-level security|permission denied|42501/i;

/*
 * Un 42501 después de que Supabase cerró la sesión sola (token vencido,
 * revocado desde otro dispositivo) no es "no tenés permiso": es que hay que
 * volver a entrar. alCambiarAuth marca esto apenas ve un SIGNED_OUT que el
 * usuario no pidió (src/ui/publico.js).
 */
let sesionCerrada = false;
export function marcarSesionCerrada() {
  sesionCerrada = true;
}
export function desmarcarSesionCerrada() {
  sesionCerrada = false;
}

function esErrorDePermiso(e, permiso) {
  return e?.code === '42501' || permiso.test(e?.message ?? '');
}

/*
 * Quién se entera de un error que sí se le mostró a la persona (a diferencia
 * de src/ui/reporteDeErrores.js, que atrapa lo que nadie atrapó). Sirve para
 * mandar a guardarErrorDeCliente sin que este módulo sepa nada de red ni de
 * club: main.js registra el reportero de verdad (ver alReportarError).
 */
let reportero = null;
export function alReportarError(fn) {
  reportero = fn;
}
function reportar(e) {
  reportero?.({ codigo: e?.code ?? null, mensaje: e?.message ?? '' });
}
function conCodigo(texto, e) {
  return e?.code ? `${texto} (código ${e.code})` : texto;
}

/** Error de red → "sin conexión"; permiso con la sesión marcada como cerrada → SESION_CERRADA; cualquier otro → `generico`. */
export function textoDeError(e, generico) {
  if (esErrorDeRed(e)) return SIN_CONEXION;
  if (sesionCerrada && esErrorDePermiso(e, SIN_PERMISO_EN_TEXTO)) return SESION_CERRADA;
  return generico;
}

/** El bloque de aviso que reemplaza el contenido de una pantalla que no pudo cargar. */
export function avisoDeError(e, generico) {
  return `<div class="pad"><div class="al"><div class="tx">${escaparHtml(textoDeError(e, generico))}</div></div></div>`;
}

/**
 * El aviso de un error dentro de una pantalla que sigue en pie (un guardado que
 * falló, un campo inválido). `role="alert"` hace que el lector de pantalla lo
 * anuncie al aparecer; el "!" lo distingue de un aviso informativo sin depender
 * del color (el filete del club es el mismo en los dos).
 */
export function avisoInline(texto) {
  return `<div class="al error" role="alert"><div class="ico" aria-hidden="true">!</div><div class="tx">${escaparHtml(texto)}</div></div>`;
}

/**
 * Muestra un error en `contenedor`, lo trae a la vista y, si se pasa `campo`,
 * lo marca como inválido y le da el foco. Recibe los nodos en vez de buscarlos
 * para que no dependa de `document` (se prueba en Node con nodos de mentira).
 * La marca se saca sola cuando la persona toca el campo para corregirlo.
 */
export function mostrarAviso(contenedor, texto, { campo = null } = {}) {
  contenedor.innerHTML = avisoInline(texto);
  contenedor.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  if (!campo) return;
  campo.setAttribute('aria-invalid', 'true');
  campo.focus?.();
  campo.addEventListener?.('input', () => campo.removeAttribute('aria-invalid'), { once: true });
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
  if (esErrorDePermiso(e, permiso)) {
    reportar(e);
    return conCodigo(sesionCerrada ? SESION_CERRADA : SIN_PERMISO, e);
  }
  reportar(e);
  return conCodigo(generico, e);
}
