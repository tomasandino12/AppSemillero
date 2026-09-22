// Sesión, cuentas y el nombre de cada persona.
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente } from '../cliente.js';

export async function iniciarSesion(email, password) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

let saliendoVoluntariamente = false;

export async function cerrarSesion() {
  const supabase = obtenerCliente();
  saliendoVoluntariamente = true;
  const { error } = await supabase.auth.signOut();
  if (error) {
    saliendoVoluntariamente = false;
    throw error;
  }
}

/**
 * Si el SIGNED_OUT que sigue vino de cerrarSesion() y no de que el token se
 * cayó solo (vencido, revocado desde otro dispositivo). Se consume al leerla:
 * quien pregunta es el único que necesita saberlo, justo cuando llega el
 * evento (ver alCambiarAuth en src/ui/publico.js).
 */
export function fueSalidaVoluntaria() {
  const fue = saliendoVoluntariamente;
  saliendoVoluntariamente = false;
  return fue;
}

export async function obtenerSesionActual() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * A dónde vuelve el usuario después de un mail de recuperación o del redirect
 * de Google. Es ESTA página y no la raíz a propósito: en producción la raíz
 * es la landing, pero sirviendo local desde /public/ la raíz no es la app.
 * Las dos URLs tienen que estar en la lista de redirects permitidos de
 * Supabase (ver README de configuración).
 */
function urlDeRetorno() {
  return window.location.origin + window.location.pathname;
}

/**
 * Crear cuenta. Supabase devuelve sesión SOLO si el proyecto no exige
 * confirmar el mail; si lo exige, devuelve el usuario sin sesión y hay que
 * esperar a que haga clic en el link. Se devuelven las dos cosas para que la
 * UI pueda decir cuál de los dos casos pasó, en vez de dejarlo esperando.
 */
export async function crearCuenta(email, password, nombre, { esJugador = false } = {}) {
  const supabase = obtenerCliente();
  // El nombre viaja como metadato: en este momento no hay sesión (si el
  // proyecto exige confirmar el mail) y no se podría escribir en ninguna
  // tabla. Ver 0019.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // quiere_ser_jugador sólo lleva a quien se registró por la puerta de jugadores
    // directo al formulario de pedir acceso (ver cuenta.quiereSerJugador). No autoriza nada.
    options: { emailRedirectTo: urlDeRetorno(), data: esJugador ? { nombre, quiere_ser_jugador: true } : { nombre } },
  });
  if (error) throw error;
  return { sesion: data.session, usuario: data.user };
}

export async function enviarRecuperacionDeClave(email) {
  const supabase = obtenerCliente();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: urlDeRetorno() });
  if (error) throw error;
}

/** Cambia la clave del usuario que ya tiene sesión de recuperación abierta. */
export async function cambiarClave(password) {
  const supabase = obtenerCliente();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/**
 * Redirige a Google. Si el proveedor no está habilitado en el dashboard de
 * Supabase, esto tira en vez de navegar — la UI lo muestra como aviso.
 */
export async function entrarConGoogle() {
  const supabase = obtenerCliente();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: urlDeRetorno() },
  });
  if (error) throw error;
}

/**
 * Avisa de los cambios de sesión. Interesa un evento en particular:
 * PASSWORD_RECOVERY, que es el que dispara Supabase cuando el usuario vuelve
 * desde el link del mail, y es la única señal de que hay que pedirle una
 * clave nueva.
 */
export function alCambiarAuth(fn) {
  const supabase = obtenerCliente();
  return supabase.auth.onAuthStateChange((evento, sesion) => fn(evento, sesion));
}

/**
 * Mapa userId → nombre, de todos los del club. Sin él no hay autoría que
 * mostrar. Desde 0019 el nombre vive en los metadatos de Auth, que el cliente
 * no puede leer de otros: pasa por nombres_del_club, que exige ser del club.
 * Quien no cargó nombre no aparece en el mapa.
 */
export async function obtenerPerfilesDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('nombres_del_club', { p_club_id: clubId });
  if (error) throw error;
  const porUsuario = {};
  for (const f of data) {
    if (f.nombre) porUsuario[f.user_id] = f.nombre;
  }
  return porUsuario;
}

/** El usuario de Auth completo (id, email, user_metadata), o null sin sesión. */
export async function obtenerMiUsuario() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

/**
 * Guarda el nombre propio en los metadatos de Auth. Sólo puede tocar el del
 * usuario de la sesión: no hay forma de pisar el de otro.
 */
export async function guardarMiNombre(nombre) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.updateUser({ data: { nombre } });
  if (error) throw error;
  return data.user;
}

/** El id del usuario autenticado, para saber qué es propio y qué ajeno. */
export async function obtenerUsuarioActual() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}
