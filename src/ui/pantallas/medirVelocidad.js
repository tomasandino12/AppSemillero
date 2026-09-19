import { obtenerJugadoresDelPlantel, guardarSesionMedicion } from '../../data/repositorio.js';
import { prepararPayloadVelocidad, redondearSegundos } from '../../data/prepararPayloadMedicion.js';
import { obtenerClubActual, obtenerPlantelActivo, obtenerCuenta } from '../sesion.js';
import { escaparHtml, toast, esErrorDeRed, formatearFechaCorta } from '../nav.js';
import { claveBorrador, guardarBorrador, leerBorrador, borrarBorrador } from '../borradorMedicion.js';
import { ir } from '../main.js';
import { $ } from '../dom.js';
import { avisoDeError } from '../errores.js';

const contenedor = () => $('velocidad-contenido');

/**
 * El protocolo todavía no está cerrado por el cuerpo técnico. Se muestra en
 * pantalla y se edita acá cuando lo definan.
 */
export const PROTOCOLO_VELOCIDAD =
  'Largo de cancha completo, un intento, cronómetro a mano. El protocolo todavía no está cerrado por el cuerpo técnico.';

let jugadores = [];
let valores = {};
let fecha = null;
// Jugador que está cargando ahora, y lo que lleva tecleado. Mientras hay uno
// activo el teclado está arriba y el pie fijo queda escondido debajo.
let activo = null;
let buffer = '';

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clave() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  return claveBorrador(obtenerCuenta()?.id, club.id, plantel.id, 'velocidad');
}

function persistir() {
  guardarBorrador(clave(), { fecha, valores });
}

/**
 * Teclado propio en pantalla, portado del prototipo. Teclas grandes, una sola
 * mano, y nada más que dígitos y una coma: no se puede tipear una precisión
 * que un cronómetro a mano no tiene. El teclado nativo del celular ofrece
 * teclas más chicas y un montón de caracteres que acá no sirven.
 */
function teclado() {
  const tecla = (t, clase = '') => `<button class="${clase}" data-tecla="${t}">${t}</button>`;
  return `
    <div class="kb ${activo ? 'on' : ''}" id="kb">
      ${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => tecla(n)).join('')}
      ${tecla(',', 'ac')}
      ${tecla('0')}
      <button class="ac" data-tecla="borrar" aria-label="Borrar">&#9003;</button>
      <button class="ok" data-tecla="siguiente">Siguiente &rsaquo;</button>
    </div>
  `;
}

function textoDeCaja(jugador) {
  if (activo === jugador.id) return buffer || '|';
  return valores[jugador.id] ? valores[jugador.id] : '—';
}

function render() {
  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Velocidad · ${escaparHtml(formatearFechaCorta(fecha))}</div>
      <div class="p">${escaparHtml(PROTOCOLO_VELOCIDAD)}</div>
      <div class="lista-vel">
        ${jugadores.map((j) => `
          <button class="vel-fila ${activo === j.id ? 'on' : ''}" data-jugador="${j.id}">
            <span class="nom">${escaparHtml(j.nombreLimpio)}</span>
            <span class="caja ${valores[j.id] ? 'si' : ''}">${escaparHtml(textoDeCaja(j))}</span>
            <span class="u">seg</span>
          </button>
        `).join('')}
      </div>
      <div id="velocidad-aviso"></div>
      ${activo ? '<div class="espacio-kb"></div>' : ''}
    </div>
    <div class="pie-fijo" ${activo ? 'hidden' : ''}><button class="btn" id="btn-guardar-velocidad">Guardar la sesión</button></div>
    ${teclado()}
  `;

  contenedor().querySelectorAll('[data-jugador]').forEach((fila) => {
    fila.addEventListener('click', () => activar(fila.dataset.jugador));
  });
  contenedor().querySelectorAll('[data-tecla]').forEach((b) => {
    b.addEventListener('click', () => pulsar(b.dataset.tecla));
  });
  const guardar = $('btn-guardar-velocidad');
  if (guardar) guardar.addEventListener('click', guardarSesion);
}

function activar(jugadorId) {
  // Re-tocar la fila activa la cierra: se vuelve a la lista completa sin tener
  // que recorrer a los catorce con "Siguiente".
  if (activo === jugadorId) {
    confirmarActivo();
    activo = null;
    buffer = '';
    render();
    return;
  }
  if (activo) confirmarActivo();
  activo = jugadorId;
  buffer = valores[jugadorId] ?? '';
  render();
}

/** Pasa lo tecleado a `valores`. Un buffer vacío borra el valor; no lo deja en cero. */
function confirmarActivo() {
  if (!activo) return;
  const n = redondearSegundos(buffer);
  if (n == null) delete valores[activo];
  else valores[activo] = String(n);
  persistir();
}

function pulsar(tecla) {
  if (!activo) return;

  if (tecla === 'borrar') {
    buffer = buffer.slice(0, -1);
    render();
    return;
  }

  if (tecla === 'siguiente') {
    confirmarActivo();
    const i = jugadores.findIndex((j) => j.id === activo);
    const siguiente = jugadores[i + 1];
    activo = siguiente ? siguiente.id : null;
    buffer = siguiente ? (valores[siguiente.id] ?? '') : '';
    render();
    return;
  }

  if (tecla === ',') {
    if (buffer.includes(',') || buffer === '') return;   // ni dos comas ni empezar con coma
    buffer += ',';
    render();
    return;
  }

  // Un solo decimal, y nada de tiempos de tres cifras: un largo de cancha no
  // llega a 100 segundos, así que el tope es dos dígitos enteros.
  const [entera, decimal] = buffer.split(',');
  if (decimal != null && decimal.length >= 1) return;
  if (decimal == null && entera.length >= 2) return;
  buffer += tecla;
  render();
}

async function guardarSesion() {
  confirmarActivo();
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  const boton = $('btn-guardar-velocidad');
  if (boton.disabled) return;

  const payload = prepararPayloadVelocidad({ clubId: club.id, plantelId: plantel.id, fecha, valores });
  if (!payload.mediciones.length) {
    $('velocidad-aviso').innerHTML = `<div class="al"><div class="tx">Todavía no cargaste ningún tiempo.</div></div>`;
    return;
  }

  // La clave se captura antes del await: si el entrenador toca otra categoría
  // con la llamada en vuelo, no se borra el borrador de la categoría equivocada.
  const claveDeEstaSesion = clave();
  boton.disabled = true;
  boton.textContent = 'Guardando...';

  try {
    await guardarSesionMedicion(payload);
  } catch (e) {
    $('velocidad-aviso').innerHTML = `<div class="al"><div class="tx">${
      esErrorDeRed(e)
        ? 'Sin conexión. La sesión quedó guardada en el celular: probá de nuevo cuando tengas señal.'
        : 'No se pudo guardar la sesión. Quedó guardada en el celular para reintentar.'
    }</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Guardar la sesión';
    return;
  }

  borrarBorrador(claveDeEstaSesion);
  toast('Sesión guardada');
  await ir('p-medir');
}

export async function renderVelocidad() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando plantel...</div></div>`;

  try {
    jugadores = await obtenerJugadoresDelPlantel(club.id, plantel.id);
  } catch (e) {
    contenedor().innerHTML = avisoDeError(e, 'No se pudo cargar el plantel.');
    return;
  }

  jugadores.sort((a, b) => a.nombreLimpio.localeCompare(b.nombreLimpio));

  if (!jugadores.length) {
    contenedor().innerHTML = `
      <div class="pad"><div class="estado-vacio">
        <h2>${escaparHtml(plantel.categoria)} no tiene jugadores</h2>
        <div class="p">Cargá el plantel antes de medir.</div>
      </div></div>`;
    return;
  }

  const borrador = leerBorrador(clave());
  fecha = borrador?.fecha ?? hoyLocal();
  valores = borrador?.valores ?? {};
  activo = null;
  buffer = '';
  render();
}
