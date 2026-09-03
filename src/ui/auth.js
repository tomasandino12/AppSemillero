import { iniciarSesion } from '../data/repositorio.js';
import { mostrarPantalla, esErrorDeRed } from './nav.js';

const $ = (id) => document.getElementById(id);

export function mostrarLogin() {
  mostrarPantalla('p-login');
  ocultarError();
}

export function iniciarAuth(alIniciarSesion) {
  $('btn-login').addEventListener('click', () => manejarLogin(alIniciarSesion));
  $('in-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') manejarLogin(alIniciarSesion);
  });
}

function ocultarError() {
  $('login-error').style.display = 'none';
}

function mostrarError(mensaje) {
  $('login-error').querySelector('.tx').textContent = mensaje;
  $('login-error').style.display = 'flex';
}

async function manejarLogin(alIniciarSesion) {
  const email = $('in-email').value.trim();
  const password = $('in-pass').value;
  ocultarError();
  if (!email || !password) {
    mostrarError('Completá email y contraseña.');
    return;
  }
  const boton = $('btn-login');
  boton.disabled = true;
  boton.textContent = 'Ingresando...';
  try {
    await iniciarSesion(email, password);
    await alIniciarSesion();
  } catch (e) {
    mostrarError(esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'Email o contraseña incorrectos.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Ingresar';
  }
}
