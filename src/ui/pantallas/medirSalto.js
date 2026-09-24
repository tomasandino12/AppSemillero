import { obtenerJugadoresDelPlantel, guardarSesionMedicion } from '../../data/repositorio.js';
import { prepararPayloadSalto } from '../../data/prepararPayloadMedicion.js';
import { fpsDeCaptura } from '../../data/metadatosVideo.js';
import { alturaDeSalto, TESTS_SALTO, INTENTOS_SALTO } from '../../data/salto.js';
import { obtenerClubActual, obtenerPlantelActivo, obtenerCuenta } from '../sesion.js';
import { toast, formatearFechaCorta } from '../nav.js';
import { claveBorrador, guardarBorrador, leerBorrador, borrarBorrador } from '../borradorMedicion.js';
import { ir } from '../main.js';
import { $ } from '../dom.js';
import { html } from '../html.js';
import { avisoDeError, mensajeAlGuardar } from '../errores.js';
import { abrirMarcador } from '../componentes/marcadorCuadros.js';
import { botonProtocolo } from '../componentes/protocoloSalto.js';

const contenedor = () => $('salto-contenido');

const NOMBRE_TEST = { cmj: 'CMJ (manos en la cadera)', abalakov: 'Abalakov (brazos libres)' };
const CLAVE_FPS = 'salto.fps.predeterminado';
const FPS_OPCIONES = [240, 120];
// El átomo con los fps está al principio o al final del archivo, igual que el moov.
const BYTES_EXTREMO = 4 * 1024 * 1024;

let jugadores = [];
let valores = {};
let fecha = null;
let testSalto = 'cmj';
// Se genera con el borrador y se reutiliza en cada reintento: la RPC lo usa
// para no duplicar la sesión (ver medirBateria.js).
let sesionId = null;
let fpsManual = 240;
// A qué (jugador, intento) va el video que se está eligiendo.
let destino = null;

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clave() {
  return claveBorrador(obtenerCuenta()?.id, obtenerClubActual().id, obtenerPlantelActivo().id, 'salto');
}

function persistir() {
  guardarBorrador(clave(), { fecha, valores, sesionId, testSalto });
}

function leerFpsRecordados() {
  try {
    const n = Number(localStorage.getItem(CLAVE_FPS));
    return FPS_OPCIONES.includes(n) ? n : 240;
  } catch {
    return 240;
  }
}

function recordarFps(n) {
  try {
    localStorage.setItem(CLAVE_FPS, String(n));
  } catch {
    // Sin localStorage el selector vuelve a 240 la próxima vez: no es grave.
  }
}

/** fps que el celular anotó en el archivo, o null si el video no los trae. */
async function fpsDelArchivo(archivo) {
  try {
    const cabeza = new Uint8Array(await archivo.slice(0, BYTES_EXTREMO).arrayBuffer());
    const deCabeza = fpsDeCaptura(cabeza);
    if (deCabeza) return deCabeza;
    if (archivo.size <= BYTES_EXTREMO) return null;
    const cola = new Uint8Array(await archivo.slice(archivo.size - BYTES_EXTREMO).arrayBuffer());
    return fpsDeCaptura(cola);
  } catch {
    return null;
  }
}

const intentosDe = (id) => valores[id]?.intentos ?? [];

function textoIntento(intento) {
  return `${alturaDeSalto(intento.tiempoVueloMs / 1000).toFixed(1).replace('.', ',')} cm`;
}

function filaJugador(j) {
  const ausente = valores[j.id]?.ausente === true;
  const intentos = intentosDe(j.id);
  const botones = Array.from({ length: INTENTOS_SALTO }, (_, i) => {
    const intento = intentos[i];
    return html`<button class="btn sec chico salto-int ${intento ? 'si' : ''}" data-jugador="${j.id}" data-intento="${i}" ${ausente ? 'disabled' : ''}>${intento ? textoIntento(intento) : `Salto ${i + 1}`}</button>`;
  });
  return html`
    <div class="salto-fila ${ausente ? 'ausente' : ''}">
      <div class="nom">${j.nombreLimpio}</div>
      <div class="salto-ints">${botones}</div>
      <button class="btn sec chico" data-ausente="${j.id}" aria-pressed="${ausente}">${ausente ? 'Ausente ✓' : 'Ausente'}</button>
    </div>
  `;
}

function render() {
  contenedor().innerHTML = html`
    <div class="pad">
      <div class="eyebrow">Salto · ${formatearFechaCorta(fecha)}</div>
      <div class="campo">
        <label for="salto-test">Test</label>
        <select id="salto-test">${TESTS_SALTO.map((t) => html`<option value="${t}" ${t === testSalto ? 'selected' : ''}>${NOMBRE_TEST[t] ?? t}</option>`)}</select>
      </div>
      <div class="campo">
        <label for="salto-fecha">Fecha</label>
        <input type="date" id="salto-fecha" value="${fecha}" max="${hoyLocal()}">
      </div>
      <div class="campo">
        <label for="salto-fps">fps, si el video no los trae</label>
        <select id="salto-fps">${FPS_OPCIONES.map((n) => html`<option value="${n}" ${n === fpsManual ? 'selected' : ''}>${n}</option>`)}</select>
      </div>
      <div class="salto-acciones" id="salto-protocolo">
        <button class="btn sec chico" disabled>Cargar resultado oficial — Próximamente</button>
      </div>
      <div class="lista-2col">${jugadores.map(filaJugador)}</div>
      <div id="salto-aviso"></div>
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-guardar-salto">Guardar la sesión</button></div>
    <input type="file" id="salto-archivo" accept="video/*" hidden>
  `;

  $('salto-protocolo').prepend(botonProtocolo());
  $('salto-test').addEventListener('change', (e) => { testSalto = e.target.value; persistir(); });
  $('salto-fecha').addEventListener('change', (e) => {
    if (!e.target.value) return;
    fecha = e.target.value;
    persistir();
    render();
  });
  $('salto-fps').addEventListener('change', (e) => { fpsManual = Number(e.target.value); recordarFps(fpsManual); });
  contenedor().querySelectorAll('[data-intento]').forEach((b) => {
    b.addEventListener('click', () => elegirVideo(b.dataset.jugador, Number(b.dataset.intento)));
  });
  contenedor().querySelectorAll('[data-ausente]').forEach((b) => {
    b.addEventListener('click', () => alternarAusente(b.dataset.ausente));
  });
  $('salto-archivo').addEventListener('change', alElegirArchivo);
  $('btn-guardar-salto').addEventListener('click', guardarSesion);
}

function alternarAusente(id) {
  if (valores[id]?.ausente) delete valores[id];
  else valores[id] = { ausente: true };
  persistir();
  render();
}

function elegirVideo(jugadorId, indice) {
  destino = { jugadorId, indice };
  const entrada = $('salto-archivo');
  entrada.value = '';
  entrada.click();
}

async function alElegirArchivo(e) {
  const archivo = e.target.files?.[0];
  if (!archivo || !destino) return;
  const { jugadorId, indice } = destino;
  const fpsLeidos = await fpsDelArchivo(archivo);
  const resultado = await abrirMarcador({
    archivo, fpsCaptura: fpsLeidos ?? fpsManual, fpsSupuestos: fpsLeidos == null,
  });
  if (!resultado) return;
  const intentos = [...intentosDe(jugadorId)];
  intentos[indice] = resultado;
  valores[jugadorId] = { intentos };
  persistir();
  render();
}

async function guardarSesion() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  const boton = $('btn-guardar-salto');
  if (boton.disabled) return;

  const payload = prepararPayloadSalto({
    sesionId, clubId: club.id, plantelId: plantel.id, fecha, testSalto, valores,
  });
  if (!payload.mediciones.length) {
    $('salto-aviso').innerHTML = html`<div class="al"><div class="tx">Todavía no cargaste ningún salto.</div></div>`;
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
    $('salto-aviso').innerHTML = html`<div class="al"><div class="tx">${mensajeAlGuardar(err, { generico: 'No se pudo guardar la sesión. Quedó en el celular para reintentar.' })}</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Guardar la sesión';
    return;
  }
  borrarBorrador(claveDeEstaSesion);
  toast('Sesión guardada');
  await ir('p-medir');
}

export async function renderSalto() {
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
  testSalto = TESTS_SALTO.includes(borrador?.testSalto) ? borrador.testSalto : 'cmj';
  sesionId = borrador?.sesionId ?? crypto.randomUUID();
  fpsManual = leerFpsRecordados();
  destino = null;
  render();
}
