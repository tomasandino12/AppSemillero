/**
 * Decidir, sin salir a la red, si puede haber una sesión abierta.
 *
 * Preguntarle a Supabase cuesta una ida y vuelta, y mientras tanto la app no
 * puede mostrar nada: no sabe si le toca la landing o el chrome de adentro.
 * Para un visitante nuevo esa espera es al pedo —la respuesta siempre es "no
 * hay sesión"— y si la llamada tarda o falla, lo que queda a la vista es una
 * página en blanco.
 *
 * Acá vive sólo la decisión. Quién lee la URL y el almacenamiento es la UI.
 */

/**
 * La clave con la que supabase-js guarda la sesión: `sb-<proyecto>-auth-token`,
 * donde <proyecto> es el primer tramo del host de Supabase. Se busca por forma
 * y no por el nombre exacto del proyecto para no repetir acá lo que ya está en
 * config.js. tests/sesionGuardada.test.js compara esta forma contra el bundle
 * vendorizado: si una actualización de supabase-js la cambia, un usuario con
 * sesión abierta caería en la landing y nada fallaría hasta producción.
 */
export const CLAVE_DE_SESION = /^sb-.+-auth-token$/;

/**
 * @param {object} entrada
 * @param {string} entrada.search - `location.search`, tal cual.
 * @param {string} entrada.hash - `location.hash`, tal cual.
 * @param {string[]} entrada.claves - Las claves del almacenamiento local.
 */
export function puedeHaberSesion({ search = '', hash = '', claves = [] } = {}) {
  // Cualquier cosa en la URL la tiene que resolver el cliente de Supabase: el
  // `?code=` con el que vuelve Google, el `#` de recuperar contraseña, o un
  // error del proveedor. Ante la duda, se espera.
  if (search || hash) return true;
  return claves.some((clave) => CLAVE_DE_SESION.test(clave));
}
