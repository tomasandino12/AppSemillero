/**
 * Borrador local de la sesión de medición en curso.
 *
 * Una batería lleva media hora larga, el celular se bloquea y el wifi del
 * club se corta. Se escribe en cada tap y sólo se borra cuando la RPC
 * confirma: si el envío falla, el borrador sigue ahí para reintentar.
 *
 * Una clave por (usuario, club, plantel, tipo): cambiar de categoría no pisa el
 * borrador de la otra, y en un celular compartido otra cuenta no ve, ni puede
 * enviar como propia, la sesión sin terminar de quien la dejó. Un borrador
 * sobrevive al cierre de sesión a propósito (no se pierde media hora de
 * medición por tocar "Salir"), pero sólo lo levanta su dueño.
 *
 * Todo va envuelto en try/catch: en modo privado localStorage tira al
 * escribir, y perder el borrador nunca puede romper la pantalla.
 */
const PREFIJO = 'medicion.borrador.v2';
const PREFIJO_ANTERIOR = 'medicion.borrador.v1.';
const VERSION = 1;

export function claveBorrador(usuarioId, clubId, plantelId, tipo) {
  return `${PREFIJO}.${usuarioId ?? 'sin-cuenta'}.${clubId}.${plantelId}.${tipo}`;
}

/**
 * Borra los borradores del formato anterior, cuya clave no llevaba usuario:
 * quedarían para siempre en el celular sin que nadie pudiera reclamarlos.
 * Se llama una vez al abrir la app. Devuelve cuántos borró.
 */
export function descartarBorradoresAnteriores(almacen = almacenPorDefecto()) {
  if (!almacen) return 0;
  try {
    const claves = [];
    for (let i = 0; i < almacen.length; i += 1) {
      const clave = almacen.key(i);
      if (clave && clave.startsWith(PREFIJO_ANTERIOR)) claves.push(clave);
    }
    for (const clave of claves) almacen.removeItem(clave);
    return claves.length;
  } catch {
    return 0;
  }
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
