/**
 * Borrador local de la sesión de medición en curso.
 *
 * Una batería lleva media hora larga, el celular se bloquea y el wifi del
 * club se corta. Se escribe en cada tap y sólo se borra cuando la RPC
 * confirma: si el envío falla, el borrador sigue ahí para reintentar.
 *
 * Una clave por (club, plantel, tipo), así cambiar de categoría no pisa el
 * borrador de la otra.
 *
 * Todo va envuelto en try/catch: en modo privado localStorage tira al
 * escribir, y perder el borrador nunca puede romper la pantalla.
 */
const PREFIJO = 'medicion.borrador.v1';
const VERSION = 1;

export function claveBorrador(clubId, plantelId, tipo) {
  return `${PREFIJO}.${clubId}.${plantelId}.${tipo}`;
}

function almacenPorDefecto() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function guardarBorrador(clave, estado, almacen = almacenPorDefecto()) {
  if (!almacen) return false;
  try {
    almacen.setItem(clave, JSON.stringify({ ...estado, version: VERSION }));
    return true;
  } catch {
    return false;
  }
}

export function leerBorrador(clave, almacen = almacenPorDefecto()) {
  if (!almacen) return null;
  try {
    const crudo = almacen.getItem(clave);
    if (!crudo) return null;
    const estado = JSON.parse(crudo);
    // Un borrador de otra versión se descarta: es preferible perder una
    // sesión a medio cargar que dibujar una pantalla con una forma que el
    // código de hoy no entiende.
    return estado?.version === VERSION ? estado : null;
  } catch {
    return null;
  }
}

export function borrarBorrador(clave, almacen = almacenPorDefecto()) {
  if (!almacen) return;
  try {
    almacen.removeItem(clave);
  } catch {
    // Si no se puede borrar, el borrador va a reaparecer como "sesión sin
    // terminar". Es molesto, no es un error que valga la pena mostrar.
  }
}
