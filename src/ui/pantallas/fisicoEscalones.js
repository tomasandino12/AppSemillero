import { ir } from '../main.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import {
  obtenerPasos, crearPaso, editarPaso,
  obtenerEscalonesActuales, moverEscalon, obtenerJugadoresDelPlantel,
} from '../../data/repositorio.js';
import {
  claveDeEjercicio, pasoDeLinea, nuevoPeso, parsearPeso, pesoSugeridoDeCarga,
  formatearKg, fechaLocal, detalleDeLinea,
} from '../../data/escalones.js';
import { escaparHtml, esErrorDeRed, formatearFechaCorta, nombreCorto, toast } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('fisico-escalones-contenido');
const SIN_CONEXION = 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';

/*
 * Escalones de un ejercicio: cuánto sube o baja por vez (el escalón, uno para
 * todo el club) y con cuánto peso trabaja hoy cada chico de la categoría. El
 * profe escribe el peso, sube y baja; la app nunca propone un peso ni mueve a
 * nadie sola. Cada toque es un movimiento guardado en el momento. Ver la
 * sección 8 del spec.
 *
 * En el código el dato del ejercicio se llama `paso` —es cuánto se mueve, no
 * dónde está parado nadie— pero en pantalla dice "escalón", que es la palabra
 * del profe.
 */

// Lo que se abrió desde la sesión: { plantelId, plan, sesion, linea }.
let actual = null;
// Lo leído en el último render: { paso, jugadores, escalonPorJugador: Map }.
let vista = null;

export function abrirEscalones(datos) {
  actual = datos;
  ir('p-fisico-escalones', { push: true });
}

export async function renderEscalones() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!actual || !club || !plantel) {
    ir('p-fisico');
    return;
  }
  // Un chip de otra categoría: estos chicos son de otro plantel.
  if (plantel.id !== actual.plantelId) {
    ir('p-fisico');
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando los escalones…</div></div>`;
  try {
    const [pasos, jugadores] = await Promise.all([
      obtenerPasos(club.id),
      obtenerJugadoresDelPlantel(club.id, plantel.id),
    ]);
    if (obtenerPlantelActivo()?.id !== actual.plantelId) return;
    jugadores.sort((a, b) => a.nombreLimpio.localeCompare(b.nombreLimpio, 'es'));
    const paso = pasoDeLinea(actual.linea.nombreOriginal, pasos);
    const escalones = paso ? await obtenerEscalonesActuales(paso.id, jugadores.map((j) => j.id)) : [];
    if (obtenerPlantelActivo()?.id !== actual.plantelId) return;
    vista = { paso, jugadores, escalonPorJugador: new Map(escalones.map((e) => [e.jugadorId, e])) };
  } catch (e) {
    if (!esErrorDeRed(e)) console.error('No se pudieron cargar los escalones:', e);
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${esErrorDeRed(e) ? SIN_CONEXION : 'No se pudieron cargar los escalones.'}</div></div></div>`;
    return;
  }
  pintar(plantel);
}

function pintar(plantel) {
  const { jugadores } = vista;
  const paso = vista.paso?.paso ?? null;
  const detalle = detalleDeLinea(actual.linea);
  contenedor().innerHTML = `
    <div class="pad">
      <div class="linea-fisico" style="cursor:default">
        <div class="nom">${escaparHtml(actual.linea.nombreOriginal)}</div>
        ${detalle ? `<div class="det">En esta sesión: ${escaparHtml(detalle)}</div>` : ''}
      </div>

      <div class="eyebrow">Escalón</div>
      <div class="tarj">
        <div class="p">${paso != null
          ? `${escaparHtml(formatearKg(paso))} kg cada vez que subís o bajás. Es el mismo para todo el club.`
          : 'Todavía no tiene escalón. Podés anotar el peso de cada chico igual.'}</div>
        <div class="acciones-al">
          <button class="btn sec chico" id="fe-editar">${paso != null ? 'Editar escalón' : 'Definir escalón'}</button>
        </div>
      </div>

      <div class="eyebrow">${escaparHtml(plantel.categoria)} · ${jugadores.length} ${jugadores.length === 1 ? 'jugador' : 'jugadores'}</div>
      <div id="fe-lista">
        ${jugadores.length ? jugadores.map(filaDeJugador).join('') : '<div class="p">Esta categoría todavía no tiene jugadores.</div>'}
      </div>
    </div>
  `;

  $('fe-editar').addEventListener('click', abrirEditor);
  $('fe-lista').addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-accion]');
    if (!boton || boton.disabled) return;
    const jugadorId = boton.closest('[data-jugador]').dataset.jugador;
    if (boton.dataset.accion === 'escribir') abrirPeso(jugadorId);
    else mover(jugadorId, Number(boton.dataset.kg));
  });
}

function filaDeJugador(j) {
  const paso = vista.paso?.paso ?? null;
  const escalon = vista.escalonPorJugador.get(j.id) ?? null;
  const nombre = `<div class="nom">${escaparHtml(nombreCorto(j.nombreLimpio))}</div>`;

  if (!escalon) {
    return `
      <div class="escalon-fila dos" data-jugador="${escaparHtml(j.id)}">
        <div>${nombre}<div class="det">sin peso</div></div>
        <button class="btn sec chico" data-accion="escribir">Poner peso</button>
      </div>
    `;
  }

  // El peso es un botón: se toca para corregirlo sin tener que ir sumando o
  // restando escalones hasta llegar.
  const kg = `<button class="kg" data-accion="escribir" aria-label="Cambiar el peso">${escaparHtml(formatearKg(escalon.kg))} kg</button>`;
  const desde = `desde el ${formatearFechaCorta(fechaLocal(new Date(escalon.desde)))}`;
  // Sin escalón no hay + ni −: el profe todavía no dijo de a cuánto se mueve.
  if (paso == null) {
    return `
      <div class="escalon-fila dos" data-jugador="${escaparHtml(j.id)}">
        <div>${nombre}<div class="det">${escaparHtml(desde)}</div></div>
        ${kg}
      </div>
    `;
  }

  // − se apaga sólo cuando restar dejaría un peso que no existe (cero o menos).
  const bajar = nuevoPeso(escalon.kg, paso, 'bajar');
  const subir = nuevoPeso(escalon.kg, paso, 'subir');
  return `
    <div class="escalon-fila" data-jugador="${escaparHtml(j.id)}">
      <div>${nombre}<div class="det">${escaparHtml(desde)}</div></div>
      <button class="btn sec chico" data-accion="bajar" data-kg="${bajar ?? ''}" ${bajar == null ? 'disabled' : ''} aria-label="Bajar un escalón">−</button>
      ${kg}
      <button class="btn sec chico" data-accion="subir" data-kg="${subir}" aria-label="Subir un escalón">+</button>
    </div>
  `;
}

function repintarFila(jugadorId) {
  const fila = contenedor().querySelector(`[data-jugador="${CSS.escape(jugadorId)}"]`);
  const jugador = vista.jugadores.find((j) => j.id === jugadorId);
  if (fila && jugador) fila.outerHTML = filaDeJugador(jugador);
}

/**
 * Guarda en el momento. Mientras escribe, la fila no responde; si falla, vuelve
 * a lo que estaba. Si el ejercicio todavía no tiene fila propia, la crea sin
 * escalón: el peso de un chico no espera a que el profe decida de a cuánto sube.
 */
async function mover(jugadorId, kg) {
  const club = obtenerClubActual();
  const vistaAlPedir = vista;
  const fila = contenedor().querySelector(`[data-jugador="${CSS.escape(jugadorId)}"]`);
  fila?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    const pasoId = (vista.paso ?? await crearFilaDelEjercicio()).id;
    if (vista !== vistaAlPedir || obtenerPlantelActivo()?.id !== actual.plantelId) return;
    const escalon = await moverEscalon({ clubId: club.id, jugadorId, pasoId, kg });
    if (vista !== vistaAlPedir || obtenerPlantelActivo()?.id !== actual.plantelId) return;
    vista.escalonPorJugador.set(jugadorId, escalon);
  } catch (e) {
    if (vista !== vistaAlPedir || obtenerPlantelActivo()?.id !== actual.plantelId) return;
    if (!esErrorDeRed(e)) console.error('No se pudo guardar el peso:', e);
    toast(esErrorDeRed(e) ? SIN_CONEXION : 'No se pudo guardar el peso. Intentá de nuevo.');
  }
  repintarFila(jugadorId);
}

/** La fila del ejercicio, con escalón sin definir: sólo para colgarle los pesos. */
async function crearFilaDelEjercicio() {
  const club = obtenerClubActual();
  const nombre = actual.linea.nombreOriginal;
  const clave = claveDeEjercicio(nombre);
  let paso;
  try {
    paso = await crearPaso({ clubId: club.id, clave, nombre: nombre.trim(), paso: null });
  } catch (e) {
    // Alguien la creó en el medio (otra pestaña, otro profe): es la misma fila
    // del mismo ejercicio, así que se usa esa y el peso se guarda igual.
    if (e?.code !== '23505') throw e;
    paso = (await obtenerPasos(club.id)).find((p) => p.clave === clave);
    if (!paso) throw e;
  }
  if (vista) vista.paso = paso;
  return paso;
}

function abrirPeso(jugadorId) {
  const jugador = vista.jugadores.find((j) => j.id === jugadorId);
  const escalon = vista.escalonPorJugador.get(jugadorId) ?? null;
  // El primer peso arranca con el de la carga de esta línea, que el archivo ya
  // escribió en kg ("Manc. 10kg (x2)"); de "PC" o "5xL" no sale nada y el campo
  // queda vacío. Es un punto de partida para editar, no un peso guardado: lo
  // confirma el profe tocando "Guardar peso". Sin placeholder igual que antes.
  const sugerido = escalon ? null : pesoSugeridoDeCarga(actual.linea.cargaSugerida);
  const inicial = escalon ? formatearKg(escalon.kg) : sugerido != null ? formatearKg(sugerido) : '';
  abrirHoja({
    titulo: `Peso de ${nombreCorto(jugador.nombreLimpio)}`,
    cuerpo: `
      <div class="p">El peso con el que trabaja hoy en este ejercicio.</div>
      <div class="campo">
        <label for="fe-kg">Peso (kg)</label>
        <input id="fe-kg" type="text" inputmode="decimal" autocomplete="off" value="${escaparHtml(inicial)}">
      </div>
      <div id="fe-aviso-kg"></div>
      <div class="acciones-bateria">
        <button class="btn" id="fe-guardar-kg">Guardar peso</button>
        <button class="btn sec" id="fe-cancelar-kg">Cancelar</button>
      </div>
    `,
  });

  const guardar = () => {
    const { error, kg } = parsearPeso($('fe-kg').value);
    if (error) {
      $('fe-aviso-kg').innerHTML = `<div class="al"><div class="tx">${escaparHtml(error)}</div></div>`;
      return;
    }
    cerrarHoja();
    mover(jugadorId, kg);
  };

  $('fe-kg').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
  $('fe-guardar-kg').addEventListener('click', guardar);
  $('fe-cancelar-kg').addEventListener('click', () => cerrarHoja());
  $('fe-kg').focus();
  // Con un número ya puesto, tipear lo reemplaza en vez de pegarse atrás.
  if (inicial) $('fe-kg').select();
}

function abrirEditor() {
  const existente = vista.paso;
  const nombre = actual.linea.nombreOriginal;
  // Sin placeholder: un "ej. 2,5" también sería proponer un escalón.
  abrirHoja({
    titulo: `Escalón de ${nombre}`,
    cuerpo: `
      <div class="p">Cuánto suma + y cuánto resta −. Es el mismo para todo el club.</div>
      <div class="campo">
        <label for="fe-paso">Escalón (kg)</label>
        <input id="fe-paso" type="text" inputmode="decimal" autocomplete="off" value="${existente?.paso != null ? escaparHtml(formatearKg(existente.paso)) : ''}">
      </div>
      <div id="fe-aviso"></div>
      <div class="acciones-bateria">
        <button class="btn" id="fe-guardar">Guardar escalón</button>
        <button class="btn sec" id="fe-cancelar">Cancelar</button>
      </div>
    `,
  });

  const guardar = async () => {
    const boton = $('fe-guardar');
    if (boton.disabled) return;
    const { error, kg } = parsearPeso($('fe-paso').value);
    if (error) {
      $('fe-aviso').innerHTML = `<div class="al"><div class="tx">${escaparHtml(error)}</div></div>`;
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    try {
      vista.paso = existente
        ? await editarPaso(existente.id, kg)
        : await crearPaso({ clubId: obtenerClubActual().id, clave: claveDeEjercicio(nombre), nombre: nombre.trim(), paso: kg });
      cerrarHoja();
      renderEscalones();
    } catch (e) {
      if (!esErrorDeRed(e)) console.error('No se pudo guardar el escalón:', e);
      const mensaje = e?.code === '23505'
        ? 'Alguien definió este escalón recién. Cerrá y volvé a abrir el ejercicio.'
        : esErrorDeRed(e) ? SIN_CONEXION : 'No se pudo guardar el escalón.';
      $('fe-aviso').innerHTML = `<div class="al"><div class="tx">${escaparHtml(mensaje)}</div></div>`;
      boton.disabled = false;
      boton.textContent = 'Guardar escalón';
    }
  };

  $('fe-paso').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
  $('fe-guardar').addEventListener('click', guardar);
  $('fe-cancelar').addEventListener('click', () => cerrarHoja());
  $('fe-paso').focus();
}
