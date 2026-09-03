import { obtenerSesionActual, obtenerClubesDelEntrenador } from '../data/repositorio.js';
import { mostrarLogin, iniciarAuth } from './auth.js';
import { mostrarInicio, iniciarPantallaInicio } from './pantallaInicio.js';
import { setClubActual } from './sesion.js';
import { toast } from './nav.js';

async function entrarConSesion() {
  let clubes;
  try {
    clubes = await obtenerClubesDelEntrenador();
  } catch {
    toast('No se pudo cargar tu club. Revisá tu conexión.');
    mostrarLogin();
    return;
  }
  if (!clubes.length) {
    toast('Tu usuario no está asociado a ningún club todavía.');
    mostrarLogin();
    return;
  }
  setClubActual(clubes[0]);
  mostrarInicio();
}

async function iniciar() {
  iniciarAuth(entrarConSesion);
  iniciarPantallaInicio();

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
  }
}

iniciar();
