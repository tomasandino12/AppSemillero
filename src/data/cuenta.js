/**
 * El nombre y los roles de la persona que usa la app. Funciones puras: sin
 * red, sin DOM. Reciben el usuario tal como lo devuelve Supabase Auth.
 *
 * El nombre vive en user_metadata.nombre desde 0019 (ver la migración: por
 * qué no es una tabla). NUNCA se toma el nombre que trae Google como si fuera
 * el de la persona: sólo se ofrece para que lo confirme o lo cambie.
 */

/** Tope razonable para que un nombre no rompa una fila ni la cabecera. */
export const LARGO_MAXIMO_NOMBRE = 80;

/** Espacios de más afuera, uno solo entre palabras, y el tope de largo. */
export function normalizarNombre(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, LARGO_MAXIMO_NOMBRE).trim();
}

/** El nombre que la persona cargó, o null. */
export function nombreDeUsuario(usuario) {
  return normalizarNombre(usuario?.user_metadata?.nombre) || null;
}

/**
 * Toda cuenta nueva tiene que tener nombre antes de entrar, venga del
 * formulario o de Google. Las que ya existían antes de 0019 quedaron marcadas
 * y no se las frena: lo cargan desde Mi perfil cuando quieran.
 */
export function necesitaNombre(usuario) {
  if (!usuario) return false;
  if (nombreDeUsuario(usuario)) return false;
  return usuario.user_metadata?.cuenta_anterior_al_nombre !== true;
}

/** Lo que trae Google, sólo para ofrecerlo escrito en el campo. */
export function nombreSugerido(usuario) {
  const meta = usuario?.user_metadata ?? {};
  return normalizarNombre(meta.full_name ?? meta.name ?? '');
}

/** 'Tomás Andino' → 'TA'. Una palabra, una letra. Sin nombre, ''. */
export function inicialesDeNombre(nombre) {
  const palabras = normalizarNombre(nombre).split(' ').filter(Boolean);
  if (!palabras.length) return '';
  const primera = [...palabras[0]][0];
  const ultima = palabras.length > 1 ? [...palabras[palabras.length - 1]][0] : '';
  return (primera + ultima).toLocaleUpperCase('es');
}

/** ['Entrenador', 'Coordinación', 'Jugador'], en ese orden, sólo los que tiene. */
export function rolesLegibles({ esEntrenador, esCoordinador, esJugador } = {}) {
  return [esEntrenador && 'Entrenador', esCoordinador && 'Coordinación', esJugador && 'Jugador'].filter(Boolean);
}

/**
 * Si la cuenta se creó por la puerta de jugadores. Sirve únicamente para
 * llevarla al formulario de pedir acceso apenas entra: la marca la escribe la
 * propia persona (user_metadata), así que no autoriza nada. Lo que un jugador
 * puede ver lo decide la base, con cuenta_jugador.
 */
export function quiereSerJugador(usuario) {
  return usuario?.user_metadata?.quiere_ser_jugador === true;
}
