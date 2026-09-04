import { obtenerJugadoresDelPlantel, guardarSesionMedicion } from '../../data/repositorio.js';
import { prepararPayloadVelocidad, redondearSegundos } from '../../data/prepararPayloadMedicion.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, toast, esErrorDeRed } from '../nav.js';
import { claveBorrador, guardarBorrador, leerBorrador, borrarBorrador } from '../borradorMedicion.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);
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

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clave() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  return claveBorrador(club.id, plantel.id, 'velocidad');
}

function persistir() {
  guardarBorrador(clave(), { fecha, valores });
}

function render() {
  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Velocidad · ${escaparHtml(fecha)}</div>
      <div class="p">${escaparHtml(PROTOCOLO_VELOCIDAD)}</div>
      <div class="lista-2col">
        ${jugadores.map((j) => `
          <div class="vel-fila">
            <div class="nom">${escaparHtml(j.nombreLimpio)}</div>
            <div class="campo-vel">
              <input id="vel-${j.id}" data-jugador="${j.id}" type="text" inputmode="decimal"
                     autocomplete="off" placeholder="—" value="${escaparHtml(valores[j.id] ?? '')}"
                     aria-label="Segundos de ${escaparHtml(j.nombreLimpio)}">
              <span class="u">s</span>
            </div>
          </div>
        `).join('')}
      </div>
      <div id="velocidad-aviso"></div>
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-guardar-velocidad">Guardar la sesión</button></div>
  `;

  contenedor().querySelectorAll('[data-jugador]').forEach((input) => {
    input.addEventListener('input', () => {
      valores[input.dataset.jugador] = input.value;
      persistir();
    });
    // Al salir del campo se normaliza a un decimal, para que el entrenador
    // vea exactamente lo que se va a guardar y no una precisión que no existe.
    input.addEventListener('blur', () => {
      const n = redondearSegundos(input.value);
      input.value = n == null ? '' : String(n);
      valores[input.dataset.jugador] = input.value;
      persistir();
    });
  });

  $('btn-guardar-velocidad').addEventListener('click', guardar);
}

async function guardar() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  const boton = $('btn-guardar-velocidad');
  if (boton.disabled) return;

  const payload = prepararPayloadVelocidad({ clubId: club.id, plantelId: plantel.id, fecha, valores });
  if (!payload.mediciones.length) {
    $('velocidad-aviso').innerHTML = `<div class="al"><div class="tx">Todavía no cargaste ningún tiempo.</div></div>`;
    return;
  }

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

  borrarBorrador(clave());
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
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar el plantel.'
    }</div></div></div>`;
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
  render();
}
