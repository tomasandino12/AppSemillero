/**
 * Registro local de las guías y pistas ya vistas.
 *
 * Va en el celular y no en la base: no es un dato sensible y no justifica una
 * tabla con RLS. El costo es que en un celular nuevo la intro vuelve a salir,
 * y es aceptable. La clave lleva el usuario para que, en un celular
 * compartido, cada cuenta vea su propia guía.
 *
 * Mismo criterio que borradorMedicion.js: todo con try/catch. Sin storage
 * (modo privado) la guía sale en cada sesión, que molesta pero no rompe.
 */
const PREFIJO = 'guia.v1';

export function claveGuia(usuarioId, id) {
  return `${PREFIJO}.${usuarioId ?? 'sin-cuenta'}.${id}`;
}

function almacenPorDefecto() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Verdadero si ya se vio esta versión o una posterior. */
export function yaVista(clave, version, almacen = almacenPorDefecto()) {
  if (!almacen) return false;
  try {
    const crudo = almacen.getItem(clave);
    if (!crudo) return false;
    const vista = JSON.parse(crudo)?.version;
    return Number.isInteger(vista) && vista >= version;
  } catch {
    return false;
  }
}

export function marcarVista(clave, version, almacen = almacenPorDefecto()) {
  if (!almacen) return false;
  try {
    almacen.setItem(clave, JSON.stringify({ version }));
    return true;
  } catch {
    return false;
  }
}
