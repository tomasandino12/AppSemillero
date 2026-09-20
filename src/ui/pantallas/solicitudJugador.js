import { obtenerClubesParaSolicitar, crearSolicitudJugador, obtenerMiSolicitud } from '../../data/repositorio.js';
import { clubesDelCatalogo } from '../../data/solicitudJugador.js';
import { html } from '../html.js';
import { formatearFechaCorta } from '../nav.js';
import { mensajeAlGuardar, textoDeError } from '../errores.js';
import { $ } from '../dom.js';

/**
 * "Soy jugador de un club": la cuenta que todavía no tiene club elige club y
 * categoría, y queda una solicitud pendiente que aprueba el entrenador de esa
 * categoría (aprobarJugador.js). Vive en el shell público, como "todavía no
 * tenés club": el chico todavía no está adentro de la app.
 */

const REGLAS = [
  [/SOLICITUD_YA_PENDIENTE/, 'Ya tenés una solicitud pendiente. Esperá a que la apruebe un entrenador.'],
  [/ES_DEL_CUERPO_TECNICO/, 'Tu cuenta es del cuerpo técnico: no hace falta pedir acceso como jugador.'],
  [/YA_TIENE_CUENTA/, 'Tu cuenta ya tiene acceso como jugador. Cerrá la sesión y volvé a entrar.'],
  [/MAIL_SIN_CONFIRMAR/, 'Primero confirmá tu mail: te llegó un link cuando creaste la cuenta.'],
  [/PLANTEL_INVALIDO/, 'Esa categoría ya no está disponible. Elegí otra.'],
];

let mostrarVista = () => {};
let alReintentar = () => {};
let alVolver = () => {};
let clubes = [];

export function iniciarSolicitudJugador({ mostrar, onReintentar, onVolver }) {
  mostrarVista = mostrar;
  alReintentar = onReintentar;
  alVolver = onVolver;
  $('btn-jugador-pedir').addEventListener('click', pedir);
  $('sj-club').addEventListener('change', cargarCategorias);
  $('btn-jugador-volver').addEventListener('click', () => alVolver());
  $('btn-jugador-reintentar').addEventListener('click', () => alReintentar());
}

/** Lo que se dice cuando ya hay una solicitud esperando. */
export const textoDeSolicitudPendiente = (s) =>
  `Tu solicitud a ${s.clubNombre} · ${s.categoriaNombre} está pendiente desde el ${formatearFechaCorta(s.creadoEn.slice(0, 10))}. Un entrenador de esa categoría la tiene que aprobar.`;

/** La solicitud pendiente de esta cuenta, o null. Un error no frena a nadie: se trata como "no hay". */
export async function solicitudPendiente() {
  try {
    const s = await obtenerMiSolicitud();
    return s?.estado === 'pendiente' ? s : null;
  } catch {
    return null;
  }
}

function mostrarError(texto) {
  const caja = $('jugador-error');
  caja.querySelector('.tx').textContent = texto;
  caja.style.display = '';
}

function verEstado(texto, { conReintentar }) {
  $('jugador-form').hidden = true;
  $('jugador-estado').hidden = false;
  $('jugador-estado-texto').textContent = texto;
  $('btn-jugador-reintentar').hidden = !conReintentar;
}

function verFormulario() {
  $('jugador-form').hidden = false;
  $('jugador-estado').hidden = true;
  $('jugador-error').style.display = 'none';
}

export async function abrirSolicitudJugador() {
  mostrarVista('v-jugador');
  verEstado('Cargando…', { conReintentar: false });

  let pendiente;
  let catalogo;
  try {
    pendiente = await solicitudPendiente();
    if (!pendiente) catalogo = await obtenerClubesParaSolicitar();
  } catch (e) {
    verEstado(textoDeError(e, 'No se pudo cargar la lista de clubes. Probá de nuevo en un rato.'), { conReintentar: false });
    return;
  }

  if (pendiente) {
    verEstado(textoDeSolicitudPendiente(pendiente), { conReintentar: true });
    return;
  }
  clubes = clubesDelCatalogo(catalogo);
  if (!clubes.length) {
    verEstado('Todavía no hay clubes con categorías cargadas para pedir acceso.', { conReintentar: false });
    return;
  }
  $('sj-club').innerHTML = html`${clubes.map((c) => html`<option value="${c.clubId}">${c.nombre}</option>`)}`;
  cargarCategorias();
  verFormulario();
}

function cargarCategorias() {
  const club = clubes.find((c) => c.clubId === $('sj-club').value) ?? clubes[0];
  $('sj-categoria').innerHTML = html`${(club?.categorias ?? []).map((c) => html`<option value="${c.plantelId}">${c.nombre}</option>`)}`;
}

async function pedir() {
  const boton = $('btn-jugador-pedir');
  if (boton.disabled) return;
  $('jugador-error').style.display = 'none';
  const clubId = $('sj-club').value;
  const plantelId = $('sj-categoria').value;
  if (!clubId || !plantelId) {
    mostrarError('Elegí tu club y tu categoría.');
    return;
  }
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Enviando…';
  try {
    await crearSolicitudJugador({ clubId, plantelId });
  } catch (e) {
    mostrarError(mensajeAlGuardar(e, { reglas: REGLAS, generico: 'No se pudo enviar el pedido. Probá de nuevo.' }));
    boton.disabled = false;
    boton.textContent = textoOriginal;
    return;
  }
  boton.disabled = false;
  boton.textContent = textoOriginal;
  await abrirSolicitudJugador();
}
