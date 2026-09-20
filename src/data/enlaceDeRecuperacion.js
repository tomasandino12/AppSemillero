/**
 * Qué trae la URL cuando alguien vuelve desde el mail de "recuperar
 * contraseña".
 *
 * Supabase manda a la MISMA página dos hashes bien distintos: si el token
 * sirve, `#access_token=...&type=recovery`; si venció o ya se usó, un redirect
 * de error, `#error=access_denied&error_code=otp_expired&error_description=...`,
 * que normalmente NO trae `type`. Mirando sólo `type=recovery`, ese segundo
 * caso es indistinguible de una visita normal sin sesión: la persona termina
 * en la landing y, desde su lado, el link del mail "no hizo nada". Los links
 * de Supabase vencen en una hora, así que no es un borde.
 *
 * Lógica pura: recibe el hash como texto, no toca window.
 */

/**
 * → { esRecuperacion, trajoError }. `esRecuperacion` también es true cuando el
 * hash trae un error sin `type`: ese redirect sólo aparece volviendo de un
 * mail, y quedarse callado es el peor final posible.
 */
export function leerEnlaceDeRecuperacion(hash) {
  const parametros = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  const tipo = parametros.get('type');
  const trajoError = Boolean(
    parametros.get('error') || parametros.get('error_code') || parametros.get('error_description'),
  );
  return { esRecuperacion: tipo === 'recovery' || (trajoError && !tipo), trajoError };
}

/**
 * Qué vista pública corresponde al arrancar con ese hash: 'nueva-clave',
 * 'link-vencido', o null para seguir con el arranque normal.
 *
 * `haySesion` es si Supabase llegó a abrir la sesión de recuperación. Un hash
 * con error manda a 'link-vencido' aunque haya sesión: esa sesión es de una
 * visita anterior, y cambiarle la clave no es lo que vino a hacer.
 */
export function pantallaDeRecuperacion(hash, haySesion) {
  const { esRecuperacion, trajoError } = leerEnlaceDeRecuperacion(hash);
  if (!esRecuperacion) return null;
  if (trajoError) return 'link-vencido';
  return haySesion ? 'nueva-clave' : 'link-vencido';
}
