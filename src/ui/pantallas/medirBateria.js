import { obtenerJugadoresDelPlantel, guardarSesionMedicion } from '../../data/repositorio.js';
import { POSICIONES_BATERIA, INTENTOS_POR_POSICION } from '../../data/posiciones.js';
import { prepararPayloadBateria } from '../../data/prepararPayloadMedicion.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, toast, esErrorDeRed, formatearFechaCorta } from '../nav.js';
import { claveBorrador, guardarBorrador, leerBorrador, borrarBorrador } from '../borradorMedicion.js';
import { iniciales } from './plantel.js';
import { ir } from '../main.js';
import { $ } from '../dom.js';
import { avisoDeError } from '../errores.js';

const contenedor = () => $('bateria-contenido');

let jugadores = [];
let indice = 0;
let valores = {};
let fecha = null;

/** Fecha local, no UTC: después de las 21:00 en Argentina toISOString() ya da mañana. */
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clave() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  return claveBorrador(club.id, plantel.id, 'tiro');
}

/** Se llama en CADA tap: la sesión en curso no puede depender de que el celular no se bloquee. */
function persistir() {
  guardarBorrador(clave(), { fecha, valores });
}

function estadoDeJugador(jugadorId) {
  const v = valores[jugadorId];
  if (v?.ausente) return 'ausente';
  const cargadas = POSICIONES_BATERIA.filter((p) => v?.[p.id] != null).length;
  if (cargadas === POSICIONES_BATERIA.length) return 'completo';
  if (cargadas > 0) return 'parcial';
  return 'vacio';
}

function tiraDeValores(posicionId, actual) {
  const botones = [];
  for (let n = 0; n <= INTENTOS_POR_POSICION; n++) {
    botones.push(`<button class="num ${actual === n ? 'on' : ''}" data-pos="${posicionId}" data-valor="${n}">${n}</button>`);
  }
  return `<div class="tira">${botones.join('')}</div>`;
}

function render() {
  const jugador = jugadores[indice];
  const v = valores[jugador.id] ?? {};
  const ausente = !!v.ausente;

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Saltar a otro jugador</div>
      <div class="progreso-tira" id="progreso-tira">
        ${jugadores.map((j, i) => `
          <button class="paso ${estadoDeJugador(j.id)} ${i === indice ? 'on' : ''}" data-saltar="${i}" title="${escaparHtml(j.nombreLimpio)}" aria-label="${escaparHtml(j.nombreLimpio)}">${escaparHtml(iniciales(j.nombreLimpio))}</button>
        `).join('')}
      </div>

      <div class="jug-actual">
        <div class="nom">${escaparHtml(jugador.nombreLimpio)}</div>
        <div class="sub">${indice + 1} de ${jugadores.length} · ${escaparHtml(formatearFechaCorta(fecha))}</div>
      </div>

      ${ausente ? `
        <div class="al"><div class="ico">—</div><div class="tx">
          <b>Marcado como ausente.</b>
          <div class="mt">Se guarda como "no midió", no como 0 de 10. Se lo puede medir otro día en una sesión nueva.</div>
        </div></div>
      ` : `
        <div class="posiciones">
          ${POSICIONES_BATERIA.map((p) => `
            <div class="posicion">
              <div class="et">${escaparHtml(p.nombre)}<span class="de">de ${INTENTOS_POR_POSICION}</span></div>
              ${tiraDeValores(p.id, v[p.id] ?? null)}
            </div>
          `).join('')}
        </div>
      `}

      <div class="acciones-bateria">
        <button class="btn sec" id="btn-ausente">${ausente ? 'Estuvo presente' : 'Marcar ausente'}</button>
        <button class="btn" id="btn-siguiente">${indice === jugadores.length - 1 ? 'Terminar' : 'Siguiente'}</button>
      </div>
      <div id="bateria-aviso"></div>
    </div>
    <div class="pie-fijo"><button class="btn sec" id="btn-cerrar-sesion">Cerrar y guardar la sesión</button></div>
  `;

  contenedor().querySelectorAll('[data-valor]').forEach((b) => {
    b.addEventListener('click', () => {
      const pos = b.dataset.pos;
      const n = Number(b.dataset.valor);
      const actual = valores[jugador.id] ?? {};
      // Volver a tocar el mismo número lo borra: es la forma de deshacer un
      // valor cargado por error sin tener que elegir otro que sería mentira.
      const nuevo = actual[pos] === n ? null : n;
      valores[jugador.id] = { ...actual, [pos]: nuevo };
      if (nuevo == null) delete valores[jugador.id][pos];
      delete valores[jugador.id].ausente;
      persistir();
      render();
    });
  });

  contenedor().querySelectorAll('[data-saltar]').forEach((b) => {
    b.addEventListener('click', () => { indice = Number(b.dataset.saltar); render(); });
  });

  $('btn-ausente').addEventListener('click', () => {
    if (valores[jugador.id]?.ausente) {
      // Desmarcar nunca avanza: el entrenador tiene que ver el resultado de
      // su propia corrección, no perderlo de vista al saltar de jugador.
      delete valores[jugador.id].ausente;
      persistir();
      render();
      return;
    }
    valores[jugador.id] = { ausente: true };
    persistir();
    // Avanza al siguiente sólo si hay uno: si es el último de la lista no hay
    // adónde ir, y cerrar la sesión sola no es una decisión que el botón deba tomar.
    if (indice < jugadores.length - 1) indice += 1;
    render();
  });

  $('btn-siguiente').addEventListener('click', () => {
    if (indice < jugadores.length - 1) { indice += 1; render(); }
    else cerrarSesion();
  });

  $('btn-cerrar-sesion').addEventListener('click', cerrarSesion);
}

async function cerrarSesion() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  // Se captura ANTES del await: si el entrenador cambia de categoría con la
  // RPC en vuelo, clave() recalculada al final borraría el borrador de la
  // categoría equivocada, no el de esta sesión.
  const claveDeEstaSesion = clave();
  const boton = $('btn-cerrar-sesion');
  if (boton.disabled) return;

  const payload = prepararPayloadBateria({ clubId: club.id, plantelId: plantel.id, fecha, valores });
  if (!payload.mediciones.length) {
    $('bateria-aviso').innerHTML = `<div class="al"><div class="tx">Todavía no cargaste ninguna medición.</div></div>`;
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Guardando...';

  try {
    await guardarSesionMedicion(payload);
  } catch (e) {
    // El borrador NO se toca: es lo único que tiene el entrenador si esto
    // falló con el gimnasio sin señal.
    $('bateria-aviso').innerHTML = `<div class="al"><div class="tx">${
      esErrorDeRed(e)
        ? 'Sin conexión. La sesión quedó guardada en el celular: probá de nuevo cuando tengas señal.'
        : 'No se pudo guardar la sesión. Quedó guardada en el celular para reintentar.'
    }</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Cerrar y guardar la sesión';
    return;
  }

  borrarBorrador(claveDeEstaSesion);
  toast('Sesión guardada');
  await ir('p-medir');
}

export async function renderBateria() {
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
        <div class="p">Cargá el plantel antes de medir: desde PLANTEL podés importar una planilla de la CABB o agregar jugadores a mano.</div>
      </div></div>`;
    return;
  }

  const borrador = leerBorrador(clave());
  fecha = borrador?.fecha ?? hoyLocal();
  valores = borrador?.valores ?? {};
  indice = 0;
  render();
}
