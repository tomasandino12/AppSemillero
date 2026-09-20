import {
  obtenerSesionActual, obtenerClubesDelEntrenador, obtenerPlantelesDelClub, cerrarSesion,
  obtenerMisRoles, obtenerMisPlantelesAsignados, obtenerMiUsuario, obtenerMiFicha,
} from '../data/repositorio.js';
import { necesitaNombre, nombreSugerido, nombreDeUsuario, quiereSerJugador } from '../data/cuenta.js';
import { abrirSolicitudJugador } from './pantallas/solicitudJugador.js';
import { mostrarPantalla, toast } from './nav.js';
import {
  setClubActual, setPlanteles, limpiarSesion, setRoles, obtenerModo, setModo, setCuenta, setFichaJugador,
} from './sesion.js';
import { descartarBorradoresAnteriores } from './borradorMedicion.js';
import {
  iniciarChrome, renderChrome, pantallaInicialDelModo, pantallaDeInicio, PANTALLA_PERFIL,
} from './chrome.js';
import {
  iniciarPublico, mostrarPublico, mostrarApp, mostrarLanding, mostrarSinClub, mostrarPedirNombre,
  mostrarNuevaClave, mostrarLinkDeRecuperacionVencido,
} from './publico.js';
import { pantallaDeRecuperacion } from '../data/enlaceDeRecuperacion.js';

const pantallas = new Map();
const pila = [];

// Quien se registró por la puerta de jugadores cae en el formulario de pedir
// acceso, pero una sola vez por sesión: si vuelve atrás a "todavía no tenés
// club" y reintenta, no se lo vuelve a abrir por la fuerza.
let yaSeLeAbrioElPedido = false;

/**
 * Si el usuario llega desde el link de "recuperar contraseña", la URL trae el
 * token (o el error) en el hash. Hay que leerlo ACÁ, antes de tocar Supabase:
 * el cliente detecta ese hash, abre sesión y lo borra, y a partir de ese
 * momento esta visita es indistinguible de una entrada normal — lo mandaríamos
 * derecho a la app en vez de pedirle la contraseña nueva.
 */
const HASH_DE_ARRANQUE = window.location.hash;

/**
 * Registra una pantalla. `render` puede ser async; se llama cada vez que se
 * navega a la pantalla, así los datos se releen y no hace falta invalidar
 * cachés a mano después de un import.
 */
export function registrarPantalla(id, { titulo, render } = {}) {
  pantallas.set(id, { titulo, render });
}

/** Id de la pantalla visible, derivado del DOM (ver nota de diseño en el spec). */
export function pantallaActualId() {
  return document.querySelector('.pant.on')?.id ?? null;
}

export function sincronizarChrome() {
  const id = pantallaActualId();
  renderChrome({
    pantallaId: id,
    titulo: pantallas.get(id)?.titulo ?? '',
    mostrarAtras: pila.length > 0,
  });
}

export async function ir(id, { push = false } = {}) {
  const def = pantallas.get(id);
  if (!def) return;
  const desde = pantallaActualId();
  if (push && desde && desde !== id) pila.push(desde);
  if (!push) pila.length = 0;
  mostrarPantalla(id);
  sincronizarChrome();
  if (def.render) await def.render();
}

/**
 * Vuelve a renderizar la pantalla actual sin tocar la pila de navegación.
 * Usada cuando se cambia de categoría desde el chip selector: eso es un
 * refresco del contenido, no una navegación, y no debe vaciar el back stack
 * (a diferencia de ir() sin push).
 */
export async function refrescar() {
  const id = pantallaActualId();
  const def = pantallas.get(id);
  if (!def) return;
  sincronizarChrome();
  if (def.render) await def.render();
}

export async function volver() {
  const destino = pila.pop() ?? pantallaInicialDelModo();
  mostrarPantalla(destino);
  sincronizarChrome();
  const def = pantallas.get(destino);
  if (def?.render) await def.render();
}

/** Deja la app cerrada y vuelve al shell público. */
function volverALaLanding() {
  yaSeLeAbrioElPedido = false;
  limpiarSesion();
  pila.length = 0;
  mostrarLanding();
}

async function sesionSilenciosa() {
  try {
    return await obtenerSesionActual();
  } catch {
    return null;
  }
}

/**
 * Salir no pide confirmación: no se pierde nada. Lo del servidor queda
 * guardado y el borrador de medición vive en localStorage, que signOut no
 * toca. El criterio del proyecto reserva la hoja de confirmación para lo
 * irreversible (ver confirmarBorrado en ejercicio.js).
 */
export async function salir() {
  try {
    await cerrarSesion();
  } catch {
    toast('No se pudo avisar al servidor, pero saliste en este dispositivo.');
  }
  volverALaLanding();
}

/**
 * La ficha de quien tiene cuenta de jugador, o null. Un error no la vuelve un
 * fallo de arranque: quien no es jugador (o todavía no tiene la migración 0030
 * en su base) sigue viendo "todavía no tenés club", con su botón de reintentar.
 */
async function fichaDelJugador() {
  try {
    return await obtenerMiFicha();
  } catch {
    return null;
  }
}

/** Shell del jugador: sin categorías ni cambio de modo, sólo sus tres pestañas. */
async function entrarComoJugador(ficha) {
  setClubActual({ id: ficha.clubId, nombre: ficha.clubNombre });
  setFichaJugador(ficha);
  setRoles({ esJugador: true });
  setPlanteles([]);
  mostrarApp();
  await ir(pantallaInicialDelModo());
}

/**
 * Con sesión válida, decide entre la app y la pantalla de "todavía no tenés
 * club". Una cuenta sin fila en miembro_club no es un error ni una app rota:
 * es el estado normal de alguien que recién se registró. RLS ya garantiza que
 * no ve absolutamente nada — lo único que falta es decírselo con todas las
 * letras, porque vincular una cuenta a un club es un acto manual y no hay
 * forma de pedirlo desde acá (ver ESQUEMA.md, miembro_club).
 */
async function entrarConSesion() {
  // El nombre va ANTES que el club: una cuenta nueva sin nombre no pasa, ni
  // siquiera a la pantalla de "falta el acceso", porque el coordinador
  // necesita saber a quién está habilitando. En la práctica esto sólo frena
  // la primera entrada con Google: por mail, el nombre se pide al registrarse.
  let usuario;
  try {
    usuario = await obtenerMiUsuario();
  } catch {
    toast('No se pudo cargar tu cuenta. Revisá tu conexión.');
    volverALaLanding();
    return;
  }
  if (!usuario) {
    volverALaLanding();
    return;
  }
  if (necesitaNombre(usuario)) {
    mostrarPedirNombre({ sugerido: nombreSugerido(usuario) });
    return;
  }
  setCuenta({ id: usuario.id, email: usuario.email, nombre: nombreDeUsuario(usuario) });

  let clubes;
  try {
    clubes = await obtenerClubesDelEntrenador();
  } catch {
    toast('No se pudo cargar tu club. Revisá tu conexión.');
    volverALaLanding();
    return;
  }
  if (!clubes.length) {
    // Sin club de staff puede ser un jugador con cuenta. Se pregunta recién acá
    // para que el arranque del cuerpo técnico no sume ni una llamada.
    const ficha = await fichaDelJugador();
    if (ficha) {
      await entrarComoJugador(ficha);
      return;
    }
    const sesion = await sesionSilenciosa();
    mostrarSinClub(sesion?.user?.email);
    if (quiereSerJugador(usuario) && !yaSeLeAbrioElPedido) {
      yaSeLeAbrioElPedido = true;
      await abrirSolicitudJugador();
    }
    return;
  }
  setClubActual(clubes[0]);

  try {
    setRoles(await obtenerMisRoles(clubes[0].id));
  } catch {
    toast('No se pudo cargar tu acceso. Revisá tu conexión.');
    volverALaLanding();
    return;
  }

  // Los chips del modo entrenar son SÓLO las categorías asignadas vigentes.
  // Con RLS alcanzaba para un entrenador puro, pero quien además coordina ve
  // todos los planteles del club (policy plantel_coordinador_ver, 0017): sin
  // este filtro tendría chips de categorías cuyas pantallas le quedan vacías.
  let planteles = [];
  if (obtenerModo() === 'entrenar') {
    try {
      const [todos, asignados] = await Promise.all([
        obtenerPlantelesDelClub(clubes[0].id),
        obtenerMisPlantelesAsignados(clubes[0].id),
      ]);
      planteles = todos.filter((p) => asignados.has(p.id));
    } catch {
      toast('No se pudieron cargar las categorías. Revisá tu conexión.');
    }
  }
  setPlanteles(planteles);

  mostrarApp();
  // Entrenando arranca en PLANTEL, donde empieza el flujo de quien arranca de
  // cero; coordinando, en el Panorama.
  await ir(pantallaInicialDelModo());
}

async function iniciar() {
  descartarBorradoresAnteriores();
  iniciarPublico({ onEntrar: entrarConSesion, onReintentarClub: entrarConSesion });
  iniciarChrome({
    onTab: (id) => ir(id),
    onPlantel: () => refrescar(),
    onVolver: () => volver(),
    onInicio: () => ir(pantallaDeInicio()),
    // push: Mi perfil se abre encima de donde estaba, y volver regresa ahí.
    onPerfil: () => ir(PANTALLA_PERFIL, { push: true }),
    // Sólo existe para quien tiene los dos roles (ver chrome.js). Con los dos,
    // siempre se entra entrenando, así que los chips ya están cargados.
    onModo: () => {
      setModo(obtenerModo() === 'coordinar' ? 'entrenar' : 'coordinar');
      ir(pantallaInicialDelModo());
    },
  });

  const { registrarPantallas } = await import('./pantallas/registro.js');
  registrarPantallas();

  // Splash oscuro mientras se resuelve la sesión. Los dos shells arrancan
  // ocultos a propósito: quien ya entró no tiene que ver pasar la landing, y
  // quien no entró no tiene que ver el chrome de la app.
  mostrarPublico('v-cargando');

  // Esto fuerza la creación del cliente, que es lo que consume el token del
  // hash y deja la sesión de recuperación abierta para updateUser(). Si el
  // token venció (una hora, por defecto) Supabase contesta 400 y no hay
  // sesión: eso no se parece en nada a una visita normal y no se lo trata así.
  const sesion = await sesionSilenciosa();
  const destino = pantallaDeRecuperacion(HASH_DE_ARRANQUE, Boolean(sesion));
  if (destino === 'nueva-clave') {
    mostrarNuevaClave();
    return;
  }
  if (destino === 'link-vencido') {
    mostrarLinkDeRecuperacionVencido();
    return;
  }

  if (sesion) await entrarConSesion();
  else mostrarLanding();
}

iniciar();
