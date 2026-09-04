import { obtenerSesionActual, obtenerClubesDelEntrenador, obtenerPlantelesDelClub } from '../data/repositorio.js';
import { mostrarPantalla, toast } from './nav.js';
import { setClubActual, setPlanteles, limpiarSesion } from './sesion.js';
import { iniciarChrome, renderChrome, TABS } from './chrome.js';
import { iniciarLogin, mostrarLogin } from './pantallas/login.js';

const pantallas = new Map();
const pila = [];
let autenticado = false;

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
    autenticado,
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
  const destino = pila.pop() ?? TABS[1].id;
  mostrarPantalla(destino);
  sincronizarChrome();
  const def = pantallas.get(destino);
  if (def?.render) await def.render();
}

async function entrarConSesion() {
  let clubes;
  try {
    clubes = await obtenerClubesDelEntrenador();
  } catch {
    toast('No se pudo cargar tu club. Revisá tu conexión.');
    limpiarSesion();
    autenticado = false;
    mostrarLogin();
    sincronizarChrome();
    return;
  }
  if (!clubes.length) {
    toast('Tu usuario no está asociado a ningún club todavía.');
    limpiarSesion();
    autenticado = false;
    mostrarLogin();
    sincronizarChrome();
    return;
  }
  setClubActual(clubes[0]);

  let planteles = [];
  try {
    planteles = await obtenerPlantelesDelClub(clubes[0].id);
  } catch {
    toast('No se pudieron cargar las categorías. Revisá tu conexión.');
  }
  setPlanteles(planteles);

  autenticado = true;
  // Landing en PLANTEL: es donde arranca el flujo del entrenador que empieza
  // de cero, y es real — HOY son datos de ejemplo.
  await ir('p-plantel');
}

async function iniciar() {
  iniciarLogin(entrarConSesion);
  iniciarChrome({
    onTab: (id) => ir(id),
    onPlantel: () => refrescar(),
    onVolver: () => volver(),
  });

  const { registrarPantallas } = await import('./pantallas/registro.js');
  registrarPantallas();

  // Pinta la cabecera no autenticada de una así la pantalla no queda en
  // blanco durante el round trip de red de obtenerSesionActual().
  sincronizarChrome();

  let sesion;
  try {
    sesion = await obtenerSesionActual();
  } catch {
    sesion = null;
  }

  if (sesion) {
    await entrarConSesion();
  } else {
    mostrarLogin();
    sincronizarChrome();
  }
}

iniciar();
