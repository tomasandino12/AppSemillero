import { obtenerJugadoresDelPlantel, guardarSesionMedicion } from '../../data/repositorio.js';
import { prepararPayloadSprint } from '../../data/prepararPayloadMedicion.js';
import {
  DISTANCIAS_SPRINT, DISTANCIA_SPRINT_PREDETERMINADA, INTENTOS_SPRINT,
  validarTiempoSprint, formatearTiempoSprint, mejorIntentoSprint,
} from '../../data/sprint.js';
import { obtenerClubActual, obtenerPlantelActivo, obtenerCuenta } from '../sesion.js';
import { toast, formatearFechaCorta } from '../nav.js';
import { claveBorrador, guardarBorrador, leerBorrador, borrarBorrador } from '../borradorMedicion.js';
import { ir } from '../main.js';
import { $ } from '../dom.js';
import { html } from '../html.js';
import { avisoDeError, mensajeAlGuardar } from '../errores.js';
import { abrirCronometroSalida } from '../componentes/cronometroSalida.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { botonProtocolo } from '../componentes/protocoloSprint.js';

const contenedor = () => $('sprint-contenido');

const CLAVE_DISTANCIA = 'sprint.distancia.predeterminada';

let jugadores = [];
// { [jugadorId]: { ausente: true } | { intentos: [tiempoMs | null, ...] } }
let valores = {};
let fecha = null;
let distanciaM = DISTANCIA_SPRINT_PREDETERMINADA;
// Se genera con el borrador y se reutiliza en cada reintento: la RPC lo usa
// para no duplicar la sesión (ver medirBateria.js).
let sesionId = null;

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clave() {
  return claveBorrador(obtenerCuenta()?.id, obtenerClubActual().id, obtenerPlantelActivo().id, 'sprint');
}

function persistir() {
  guardarBorrador(clave(), { fecha, valores, sesionId, distanciaM });
}

function leerDistanciaRecordada() {
  try {
    const n = Number(localStorage.getItem(CLAVE_DISTANCIA));
    return DISTANCIAS_SPRINT.includes(n) ? n : DISTANCIA_SPRINT_PREDETERMINADA;
  } catch {
    return DISTANCIA_SPRINT_PREDETERMINADA;
  }
}

function recordarDistancia(n) {
  try {
    localStorage.setItem(CLAVE_DISTANCIA, String(n));
  } catch {
    // Sin localStorage vuelve a 30 m la próxima vez: no es grave.
  }
}

const intentosDe = (id) => valores[id]?.intentos ?? [];

/** Guarda el tiempo de un intento (o lo borra con null) y limpia lo que quede vacío. */
function ponerTiempo(jugadorId, indice, tiempoMs) {
  const intentos = Array.from({ length: INTENTOS_SPRINT }, (_, i) => intentosDe(jugadorId)[i] ?? null);
  intentos[indice] = tiempoMs;
  if (intentos.every((t) => t == null)) delete valores[jugadorId];
  else valores[jugadorId] = { intentos };
  persistir();
  render();
}

function celdaIntento(j, indice, ausente, mejorIdx) {
  const tiempo = intentosDe(j.id)[indice] ?? null;
  const etiqueta = `Intento ${indice + 1}`;
  if (ausente) {
    return html`<div class="sprint-celda vacia"><span class="etq">${etiqueta}</span><span class="sin">—</span></div>`;
  }
  if (tiempo == null) {
    return html`<div class="sprint-celda"><span class="etq">${etiqueta}</span><button type="button" class="btn sprint-correr" data-correr="${j.id}" data-intento="${indice}">Correr</button></div>`;
  }
  return html`
    <div class="sprint-celda">
      <span class="etq">${etiqueta}${mejorIdx === indice && html` <span class="chip sube">Mejor</span>`}</span>
      <button type="button" class="sprint-tiempo" data-editar="${j.id}" data-intento="${indice}" aria-label="${etiqueta}: ${formatearTiempoSprint(tiempo)}. Tocá para corregir">${formatearTiempoSprint(tiempo).replace(' s', '')}<span class="u">s</span></button>
    </div>
  `;
}

function filaJugador(j) {
  const ausente = valores[j.id]?.ausente === true;
  const intentos = intentosDe(j.id);
  const mejor = mejorIntentoSprint(intentos.map((tiempoMs, i) => ({ tiempoMs, i })));
  const mejorIdx = intentos.filter((t) => t != null).length > 1 ? mejor?.i : null;
  return html`
    <div class="tarj sprint-tarj ${ausente ? 'ausente' : ''}">
      <div class="sprint-cab">
        <div class="nom">${j.nombreLimpio}</div>
        ${ausente && html`<span class="chip sin">Ausente</span>`}
      </div>
      <div class="sprint-celdas">
        ${Array.from({ length: INTENTOS_SPRINT }, (_, i) => celdaIntento(j, i, ausente, mejorIdx))}
      </div>
      <div class="sprint-pie">
        <button type="button" class="btn sec chico" data-teclear="${j.id}" ${ausente ? 'disabled' : ''}>Teclear tiempo</button>
        <button type="button" class="btn sec chico" data-ausente="${j.id}" aria-pressed="${ausente ? 'true' : 'false'}">${ausente ? 'Ausente ✓' : 'Ausente'}</button>
      </div>
    </div>
  `;
}

function render() {
  contenedor().innerHTML = html`
    <div class="pad">
      <div class="eyebrow">Sprint · ${formatearFechaCorta(fecha)}</div>
      <div class="segmentado" role="group" aria-label="Distancia">
        ${DISTANCIAS_SPRINT.slice().reverse().map((d) => html`<button type="button" class="segmento" data-distancia="${d}" aria-pressed="${d === distanciaM ? 'true' : 'false'}">${d} m</button>`)}
      </div>
      <div class="campo">
        <label for="sprint-fecha">Fecha</label>
        <input type="date" id="sprint-fecha" value="${fecha}" max="${hoyLocal()}">
      </div>
      <div class="salto-acciones" id="sprint-protocolo"></div>
      <div class="lista-2col">${jugadores.map(filaJugador)}</div>
      <div id="sprint-aviso"></div>
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-guardar-sprint">Guardar la sesión</button></div>
  `;

  $('sprint-protocolo').prepend(botonProtocolo());
  $('sprint-fecha').addEventListener('change', (e) => {
    if (!e.target.value) return;
    fecha = e.target.value;
    persistir();
    render();
  });
  contenedor().querySelectorAll('[data-distancia]').forEach((b) => {
    b.addEventListener('click', () => {
      distanciaM = Number(b.dataset.distancia);
      recordarDistancia(distanciaM);
      persistir();
      render();
    });
  });
  contenedor().querySelectorAll('[data-correr]').forEach((b) => {
    b.addEventListener('click', () => correr(b.dataset.correr, Number(b.dataset.intento)));
  });
  contenedor().querySelectorAll('[data-editar]').forEach((b) => {
    b.addEventListener('click', () => teclear(b.dataset.editar, Number(b.dataset.intento)));
  });
  contenedor().querySelectorAll('[data-teclear]').forEach((b) => {
    b.addEventListener('click', () => {
      const vacio = Array.from({ length: INTENTOS_SPRINT }, (_, i) => i).find((i) => intentosDe(b.dataset.teclear)[i] == null);
      teclear(b.dataset.teclear, vacio ?? 0);
    });
  });
  contenedor().querySelectorAll('[data-ausente]').forEach((b) => {
    b.addEventListener('click', () => alternarAusente(b.dataset.ausente));
  });
  $('btn-guardar-sprint').addEventListener('click', guardarSesion);
}

function alternarAusente(id) {
  if (valores[id]?.ausente) delete valores[id];
  else valores[id] = { ausente: true };
  persistir();
  render();
}

async function correr(jugadorId, indice) {
  const jugador = jugadores.find((j) => j.id === jugadorId);
  const resultado = await abrirCronometroSalida({
    jugador: jugador.nombreLimpio, intento: indice + 1, distanciaM,
  });
  if (resultado) ponerTiempo(jugadorId, indice, resultado.tiempoMs);
}

/** Hoja para teclear (o corregir o borrar) el tiempo de un intento. */
function teclear(jugadorId, indice) {
  const jugador = jugadores.find((j) => j.id === jugadorId);
  const actual = intentosDe(jugadorId)[indice] ?? null;
  abrirHoja({
    titulo: `${jugador.nombreLimpio} · intento ${indice + 1}`,
    cuerpo: html`
      <div class="campo">
        <label for="sprint-tiempo">Tiempo en segundos</label>
        <input id="sprint-tiempo" inputmode="decimal" autocomplete="off" maxlength="6" placeholder="4,5" value="${actual == null ? '' : (actual / 1000).toFixed(2).replace('.', ',')}">
        <div class="ayuda">Entre 2,5 y 12 segundos. Con coma o con punto.</div>
      </div>
      <div id="sprint-tiempo-error" role="alert"></div>
      <div class="acciones-bateria">
        <button type="button" class="btn sec" id="sprint-tiempo-borrar" ${actual == null ? 'disabled' : ''}>Borrar</button>
        <button type="button" class="btn" id="sprint-tiempo-ok">Guardar</button>
      </div>
    `.toString(),
  });
  const campo = $('sprint-tiempo');
  const aceptar = () => {
    const r = validarTiempoSprint(campo.value);
    if (!r.ok) {
      $('sprint-tiempo-error').innerHTML = html`<div class="al"><div class="tx">${r.error}</div></div>`;
      return;
    }
    cerrarHoja();
    ponerTiempo(jugadorId, indice, r.ms);
  };
  $('sprint-tiempo-ok').addEventListener('click', aceptar);
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') aceptar(); });
  $('sprint-tiempo-borrar').addEventListener('click', () => {
    cerrarHoja();
    ponerTiempo(jugadorId, indice, null);
  });
}

async function guardarSesion() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  const boton = $('btn-guardar-sprint');
  if (boton.disabled) return;

  const payload = prepararPayloadSprint({
    sesionId, clubId: club.id, plantelId: plantel.id, fecha, distanciaSprintM: distanciaM, valores,
  });
  if (!payload.mediciones.length) {
    $('sprint-aviso').innerHTML = html`<div class="al"><div class="tx">Todavía no cargaste ningún tiempo.</div></div>`;
    return;
  }

  // La clave se captura antes del await: si el profe cambia de categoría con
  // la llamada en vuelo, no se borra el borrador equivocado.
  const claveDeEstaSesion = clave();
  boton.disabled = true;
  boton.textContent = 'Guardando...';
  try {
    await guardarSesionMedicion(payload);
  } catch (err) {
    $('sprint-aviso').innerHTML = html`<div class="al"><div class="tx">${mensajeAlGuardar(err, { generico: 'No se pudo guardar la sesión. Quedó en el celular para reintentar.' })}</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Guardar la sesión';
    return;
  }
  borrarBorrador(claveDeEstaSesion);
  toast('Sesión guardada');
  await ir('p-medir');
}

export async function renderSprint() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = html`<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }
  contenedor().innerHTML = html`<div class="pad"><div class="p">Cargando plantel...</div></div>`;
  try {
    jugadores = await obtenerJugadoresDelPlantel(club.id, plantel.id);
  } catch (e) {
    contenedor().innerHTML = avisoDeError(e, 'No se pudo cargar el plantel.');
    return;
  }
  jugadores.sort((a, b) => a.nombreLimpio.localeCompare(b.nombreLimpio));
  if (!jugadores.length) {
    contenedor().innerHTML = html`<div class="pad"><div class="estado-vacio"><h2>${plantel.categoria} no tiene jugadores</h2><div class="p">Cargá el plantel antes de medir.</div></div></div>`;
    return;
  }
  const borrador = leerBorrador(clave());
  fecha = borrador?.fecha ?? hoyLocal();
  valores = borrador?.valores ?? {};
  distanciaM = DISTANCIAS_SPRINT.includes(borrador?.distanciaM) ? borrador.distanciaM : leerDistanciaRecordada();
  sesionId = borrador?.sesionId ?? crypto.randomUUID();
  render();
}
