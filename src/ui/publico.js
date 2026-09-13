import {
  iniciarSesion, crearCuenta, enviarRecuperacionDeClave, cambiarClave,
  entrarConGoogle, cerrarSesion, alCambiarAuth, guardarMiNombre,
} from '../data/repositorio.js';
import { normalizarNombre } from '../data/cuenta.js';
import { esErrorDeRed } from './nav.js';

/**
 * Shell público: landing, ingresar, crear cuenta, recuperar la clave, poner
 * una clave nueva, y la cuenta que todavía no tiene club.
 *
 * Todo lo de autenticación de verdad lo hace Supabase Auth. Acá no se hashea
 * nada, no se emite ningún token y no se guarda ninguna sesión a mano: lo
 * único que vive en este archivo es validación de formulario para dar buen
 * feedback antes del viaje al servidor, y el cableado de las vistas.
 */

const $ = (id) => document.getElementById(id);

/** Sólo para avisar temprano. El largo real lo exige Supabase. */
const CLAVE_MINIMA = 8;

let alEntrar = async () => {};

/* ---------- vistas ---------- */

export function mostrarPublico(vista) {
  $('app').hidden = true;
  $('publico').hidden = false;
  document.querySelectorAll('#publico .vista').forEach((v) => v.classList.toggle('on', v.id === vista));
  window.scrollTo(0, 0);
}

export function mostrarApp() {
  $('publico').hidden = true;
  $('app').hidden = false;
}

export function mostrarLanding() {
  limpiarErrores();
  mostrarPublico('v-landing');
}

/** La cuenta existe pero no tiene fila en miembro_club. No es un error. */
export function mostrarSinClub(email) {
  $('sin-club-mail').textContent = email ?? '—';
  mostrarPublico('v-sin-club');
}

/**
 * La cuenta existe pero no tiene nombre: la primera entrada con Google, o
 * una cuenta de mail creada sin él. Es un paso único y no se saltea: el
 * nombre es lo que ven los demás profes y la coordinación.
 *
 * Lo que trae Google aparece escrito en el campo, pero no se guarda hasta que
 * la persona toca Continuar.
 */
export function mostrarPedirNombre({ sugerido } = {}) {
  limpiarErrores();
  $('nm-nombre').value = sugerido ?? '';
  mostrarPublico('v-nombre');
  $('nm-nombre').focus();
}

/* ---------- avisos ---------- */

const ERRORES = ['ingresar-error', 'crear-error', 'recuperar-error', 'nueva-clave-error', 'nombre-error'];

function limpiarErrores() {
  ERRORES.forEach((id) => { $(id).style.display = 'none'; $(id).classList.remove('ok'); });
}

function avisar(id, mensaje, { ok = false } = {}) {
  const el = $(id);
  el.querySelector('.tx').textContent = mensaje;
  el.classList.toggle('ok', ok);
  el.style.display = 'flex';
}

/* ---------- validación de formulario ---------- */

// Deliberadamente laxa: sirve para atajar el dedazo obvio, no para decidir si
// un mail es válido. Eso lo decide el servidor de correo, no una regex.
const PARECE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function problemaDeClave(clave, repetida) {
  if (clave.length < CLAVE_MINIMA) return `La contraseña tiene que tener al menos ${CLAVE_MINIMA} caracteres.`;
  if (clave !== repetida) return 'Las dos contraseñas no coinciden.';
  return null;
}

/* ---------- mensajes de error ---------- */

/**
 * Un error de ingreso NUNCA distingue entre "ese mail no existe" y "la
 * contraseña está mal": esa diferencia deja averiguar quién tiene cuenta.
 * Por eso el mensaje es el mismo para cualquier fallo de credenciales, y sólo
 * se separa el caso de red, que no dice nada de ninguna cuenta.
 */
function mensajeDeIngreso(e) {
  if (esErrorDeRed(e)) return 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';
  if (/email not confirmed/i.test(e?.message ?? '')) {
    return 'Todavía no confirmaste tu mail. Buscá el mail de confirmación y abrí el link.';
  }
  return 'El mail o la contraseña no coinciden.';
}

/** El proveedor de Google se habilita en el dashboard, no desde el código. */
function mensajeDeGoogle(e) {
  if (esErrorDeRed(e)) return 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';
  if (/provider is not enabled|unsupported provider|validation_failed/i.test(e?.message ?? '')) {
    return 'El ingreso con Google todavía no está habilitado en este proyecto. Entrá con mail y contraseña.';
  }
  return 'No se pudo abrir el ingreso con Google. Entrá con mail y contraseña.';
}

/* ---------- acciones ---------- */

async function conBoton(boton, textoMientras, fn) {
  if (boton.disabled) return;
  const original = boton.textContent;
  boton.disabled = true;
  boton.textContent = textoMientras;
  try {
    await fn();
  } finally {
    boton.disabled = false;
    boton.textContent = original;
  }
}

async function ingresar() {
  const email = $('in-email').value.trim();
  const clave = $('in-pass').value;
  limpiarErrores();
  if (!email || !clave) return avisar('ingresar-error', 'Completá mail y contraseña.');
  await conBoton($('btn-ingresar'), 'Ingresando...', async () => {
    try {
      await iniciarSesion(email, clave);
      await alEntrar();
    } catch (e) {
      avisar('ingresar-error', mensajeDeIngreso(e));
    }
  });
}

async function crear() {
  const nombre = normalizarNombre($('cr-nombre').value);
  const email = $('cr-email').value.trim();
  const clave = $('cr-pass').value;
  const repetida = $('cr-pass2').value;
  limpiarErrores();
  if (!nombre) return avisar('crear-error', 'Escribí tu nombre y apellido.');
  if (!PARECE_EMAIL.test(email)) return avisar('crear-error', 'Escribí un mail válido.');
  const problema = problemaDeClave(clave, repetida);
  if (problema) return avisar('crear-error', problema);

  await conBoton($('btn-crear'), 'Creando...', async () => {
    try {
      const { sesion } = await crearCuenta(email, clave, nombre);
      if (sesion) {
        // El proyecto no exige confirmar el mail: ya está adentro.
        await alEntrar();
        return;
      }
      // El proyecto sí exige confirmar. Sin esto el usuario se queda mirando
      // un formulario que "no hizo nada", que es el peor final posible.
      avisar('crear-error', `Te mandamos un mail a ${email}. Abrilo para confirmar la cuenta y después ingresá.`, { ok: true });
    } catch (e) {
      avisar('crear-error', mensajeDeCreacion(e));
    }
  });
}

/**
 * Tampoco confirma ni desmiente que un mail ya tenga cuenta: el mensaje sirve
 * igual en los dos casos, que es la forma estándar de no filtrar el padrón.
 */
function mensajeDeCreacion(e) {
  if (esErrorDeRed(e)) return 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';
  const msg = e?.message ?? '';
  if (/already registered|already exists|user_already_exists/i.test(msg)) {
    return 'Si ese mail no tenía cuenta, ya te llegó el mail para confirmarla. Si ya tenía, ingresá con tu contraseña.';
  }
  if (/password/i.test(msg)) return 'Esa contraseña no cumple los requisitos mínimos. Probá con una más larga.';
  return 'No se pudo crear la cuenta. Intentá de nuevo en un rato.';
}

async function recuperar() {
  const email = $('rec-email').value.trim();
  limpiarErrores();
  if (!PARECE_EMAIL.test(email)) return avisar('recuperar-error', 'Escribí un mail válido.');
  await conBoton($('btn-recuperar'), 'Mandando...', async () => {
    try {
      await enviarRecuperacionDeClave(email);
    } catch (e) {
      if (esErrorDeRed(e)) {
        avisar('recuperar-error', 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.');
        return;
      }
      // Cualquier otro fallo se trata como éxito a propósito: contestar
      // distinto según si el mail existe es, otra vez, filtrar el padrón.
    }
    avisar('recuperar-error', `Si ese mail tiene una cuenta, ya le llegó el link para cambiar la contraseña.`, { ok: true });
  });
}

async function guardarClaveNueva() {
  const clave = $('nv-pass').value;
  const repetida = $('nv-pass2').value;
  limpiarErrores();
  const problema = problemaDeClave(clave, repetida);
  if (problema) return avisar('nueva-clave-error', problema);
  await conBoton($('btn-nueva-clave'), 'Guardando...', async () => {
    try {
      await cambiarClave(clave);
      await alEntrar();
    } catch (e) {
      avisar('nueva-clave-error', esErrorDeRed(e)
        ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
        : 'No se pudo guardar la contraseña. Puede que el link haya vencido: pedí uno nuevo.');
    }
  });
}

async function guardarNombre() {
  const nombre = normalizarNombre($('nm-nombre').value);
  limpiarErrores();
  if (!nombre) return avisar('nombre-error', 'Escribí tu nombre y apellido.');
  await conBoton($('btn-nombre-guardar'), 'Guardando...', async () => {
    try {
      await guardarMiNombre(nombre);
      await alEntrar();
    } catch (e) {
      avisar('nombre-error', esErrorDeRed(e)
        ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
        : 'No se pudo guardar tu nombre. Intentá de nuevo.');
    }
  });
}

async function google(idError) {
  limpiarErrores();
  try {
    // Si sale bien esto navega a Google y la página se descarta.
    await entrarConGoogle();
  } catch (e) {
    avisar(idError, mensajeDeGoogle(e));
  }
}

async function salirDeLaCuenta() {
  try {
    await cerrarSesion();
  } catch {
    // Da igual: el objetivo es dejar de estar adentro en este dispositivo.
  }
  mostrarLanding();
}

/* ---------- cableado ---------- */

function alApretarEnter(idCampo, fn) {
  $(idCampo).addEventListener('keydown', (e) => { if (e.key === 'Enter') fn(); });
}

export function iniciarPublico({ onEntrar, onReintentarClub }) {
  alEntrar = onEntrar;

  $('btn-ir-crear').addEventListener('click', () => { limpiarErrores(); mostrarPublico('v-crear'); });
  $('btn-ir-crear-2').addEventListener('click', () => { limpiarErrores(); mostrarPublico('v-crear'); });
  $('btn-ir-ingresar').addEventListener('click', () => { limpiarErrores(); mostrarPublico('v-ingresar'); });
  $('btn-ir-ingresar-2').addEventListener('click', () => { limpiarErrores(); mostrarPublico('v-ingresar'); });
  $('btn-ir-ingresar-3').addEventListener('click', () => { limpiarErrores(); mostrarPublico('v-ingresar'); });
  $('btn-ir-recuperar').addEventListener('click', () => { limpiarErrores(); mostrarPublico('v-recuperar'); });
  $('btn-volver-landing').addEventListener('click', mostrarLanding);
  $('btn-volver-landing-2').addEventListener('click', mostrarLanding);

  $('btn-ingresar').addEventListener('click', ingresar);
  $('btn-crear').addEventListener('click', crear);
  $('btn-recuperar').addEventListener('click', recuperar);
  $('btn-nueva-clave').addEventListener('click', guardarClaveNueva);
  $('btn-google-ingresar').addEventListener('click', () => google('ingresar-error'));
  $('btn-google-crear').addEventListener('click', () => google('crear-error'));

  alApretarEnter('in-pass', ingresar);
  alApretarEnter('cr-pass2', crear);
  alApretarEnter('rec-email', recuperar);
  alApretarEnter('nv-pass2', guardarClaveNueva);

  $('btn-nombre-guardar').addEventListener('click', guardarNombre);
  alApretarEnter('nm-nombre', guardarNombre);
  $('btn-nombre-salir').addEventListener('click', salirDeLaCuenta);

  $('btn-sin-club-reintentar').addEventListener('click', () => onReintentarClub());
  $('btn-sin-club-salir').addEventListener('click', salirDeLaCuenta);

  // Supabase avisa con PASSWORD_RECOVERY cuando el usuario vuelve desde el
  // link del mail. main.js ya mira el hash antes de arrancar, así que esto es
  // el respaldo para el caso en que el evento llegue después.
  alCambiarAuth((evento) => {
    if (evento === 'PASSWORD_RECOVERY') mostrarPublico('v-nueva-clave');
  });
}
