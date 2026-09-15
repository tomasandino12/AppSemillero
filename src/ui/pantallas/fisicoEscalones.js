import { ir } from '../main.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import {
  obtenerEscaleras, crearEscalera, editarEscalera,
  obtenerEscalonesActuales, moverEscalon, obtenerJugadoresDelPlantel,
} from '../../data/repositorio.js';
import {
  claveDeEjercicio, escaleraDeLinea, estadoDelEscalon, pasoDeEscalon,
  parsearPesos, quedanFuera, formatearKg, fechaLocal, detalleDeLinea,
} from '../../data/escalones.js';
import { escaparHtml, esErrorDeRed, formatearFechaCorta, nombreCorto, toast } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('fisico-escalones-contenido');
const SIN_CONEXION = 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';

/*
 * Escalones de un ejercicio: su escalera (una para todo el club) y dónde está
 * parado cada chico de la categoría. El profe ubica, sube y baja; la app nunca
 * propone un peso ni ubica a nadie sola. Cada toque es un movimiento guardado en
 * el momento. Ver la sección 8 del spec.
 */

// Lo que se abrió desde la sesión: { plantelId, plan, sesion, linea }.
let actual = null;
// Lo leído en el último render: { escalera, jugadores, escalonPorJugador: Map }.
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
    const [escaleras, jugadores] = await Promise.all([
      obtenerEscaleras(club.id),
      obtenerJugadoresDelPlantel(club.id, plantel.id),
    ]);
    if (obtenerPlantelActivo()?.id !== actual.plantelId) return;
    jugadores.sort((a, b) => a.nombreLimpio.localeCompare(b.nombreLimpio, 'es'));
    const escalera = escaleraDeLinea(actual.linea.nombreOriginal, escaleras);
    const escalones = escalera ? await obtenerEscalonesActuales(escalera.id, jugadores.map((j) => j.id)) : [];
    if (obtenerPlantelActivo()?.id !== actual.plantelId) return;
    vista = { escalera, jugadores, escalonPorJugador: new Map(escalones.map((e) => [e.jugadorId, e])) };
  } catch (e) {
    if (!esErrorDeRed(e)) console.error('No se pudieron cargar los escalones:', e);
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${esErrorDeRed(e) ? SIN_CONEXION : 'No se pudieron cargar los escalones.'}</div></div></div>`;
    return;
  }
  pintar(plantel);
}

function pintar(plantel) {
  const { escalera, jugadores } = vista;
  const detalle = detalleDeLinea(actual.linea);
  contenedor().innerHTML = `
    <div class="pad">
      <div class="linea-fisico" style="cursor:default">
        <div class="nom">${escaparHtml(actual.linea.nombreOriginal)}</div>
        ${detalle ? `<div class="det">En esta sesión: ${escaparHtml(detalle)}</div>` : ''}
      </div>

      ${escalera ? `
        <div class="eyebrow">Escalera</div>
        <div class="tarj">
          <div class="p">${escaparHtml(escalera.pesos.map(formatearKg).join(' · '))} kg</div>
          <div class="acciones-al"><button class="btn sec chico" id="fe-editar">Editar escalera</button></div>
        </div>

        <div class="eyebrow">${escaparHtml(plantel.categoria)} · ${jugadores.length} ${jugadores.length === 1 ? 'jugador' : 'jugadores'}</div>
        <div id="fe-lista">
          ${jugadores.length ? jugadores.map(filaDeJugador).join('') : '<div class="p">Esta categoría todavía no tiene jugadores.</div>'}
        </div>
      ` : `
        <div class="estado-vacio">
          <div class="p">Este ejercicio todavía no tiene escalera.</div>
          <div class="acciones"><button class="btn" id="fe-editar">Definir escalera</button></div>
        </div>
      `}
    </div>
  `;

  $('fe-editar').addEventListener('click', abrirEditor);
  $('fe-lista')?.addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-accion]');
    if (!boton || boton.disabled) return;
    const jugadorId = boton.closest('[data-jugador]').dataset.jugador;
    if (boton.dataset.accion === 'ubicar') abrirUbicar(jugadorId);
    else mover(jugadorId, Number(boton.dataset.kg));
  });
}

function filaDeJugador(j) {
  const { escalera } = vista;
  const escalon = vista.escalonPorJugador.get(j.id) ?? null;
  const estado = estadoDelEscalon(escalera.pesos, escalon?.kg ?? null);
  const nombre = `<div class="nom">${escaparHtml(nombreCorto(j.nombreLimpio))}</div>`;

  if (estado === 'sin') {
    return `
      <div class="escalon-fila sin-escalon" data-jugador="${escaparHtml(j.id)}">
        <div>${nombre}<div class="det">sin escalón</div></div>
        <button class="btn sec chico" data-accion="ubicar">Ubicar</button>
      </div>
    `;
  }

  const bajar = pasoDeEscalon(escalera.pesos, escalon.kg, 'bajar');
  const subir = pasoDeEscalon(escalera.pesos, escalon.kg, 'subir');
  // Un peso que ya no está en la escalera es un dato: nadie hizo nada mal y el
  // chico sigue en su peso. Texto normal de la fila, sin rojo ni .al.
  const desde = `desde el ${formatearFechaCorta(fechaLocal(new Date(escalon.desde)))}`;
  const texto = estado === 'fuera' ? `${desde} · este peso ya no está en la escalera actual` : desde;
  return `
    <div class="escalon-fila" data-jugador="${escaparHtml(j.id)}">
      <div>${nombre}<div class="det">${escaparHtml(texto)}</div></div>
      <button class="btn sec chico" data-accion="bajar" data-kg="${bajar ?? ''}" ${bajar == null ? 'disabled' : ''} aria-label="Bajar un escalón">−</button>
      <div class="kg">${escaparHtml(formatearKg(escalon.kg))} kg</div>
      <button class="btn sec chico" data-accion="subir" data-kg="${subir ?? ''}" ${subir == null ? 'disabled' : ''} aria-label="Subir un escalón">+</button>
    </div>
  `;
}

function repintarFila(jugadorId) {
  const fila = contenedor().querySelector(`[data-jugador="${CSS.escape(jugadorId)}"]`);
  const jugador = vista.jugadores.find((j) => j.id === jugadorId);
  if (fila && jugador) fila.outerHTML = filaDeJugador(jugador);
}

/** Guarda en el momento. Mientras escribe, la fila no responde; si falla, vuelve a lo que estaba. */
async function mover(jugadorId, kg) {
  const club = obtenerClubActual();
  const vistaAlPedir = vista;
  const escaleraId = vista.escalera.id;
  const fila = contenedor().querySelector(`[data-jugador="${CSS.escape(jugadorId)}"]`);
  fila?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    const escalon = await moverEscalon({ clubId: club.id, jugadorId, escaleraId, kg });
    if (vista !== vistaAlPedir || obtenerPlantelActivo()?.id !== actual.plantelId) return;
    vista.escalonPorJugador.set(jugadorId, escalon);
  } catch (e) {
    if (vista !== vistaAlPedir || obtenerPlantelActivo()?.id !== actual.plantelId) return;
    if (!esErrorDeRed(e)) console.error('No se pudo guardar el escalón:', e);
    toast(esErrorDeRed(e) ? SIN_CONEXION : 'No se pudo guardar el escalón. Intentá de nuevo.');
  }
  repintarFila(jugadorId);
}

function abrirUbicar(jugadorId) {
  const jugador = vista.jugadores.find((j) => j.id === jugadorId);
  abrirHoja({
    titulo: `Ubicar a ${nombreCorto(jugador.nombreLimpio)}`,
    cuerpo: `
      <div class="p">Elegí el escalón donde está hoy.</div>
      <div class="acciones-escalera">
        ${vista.escalera.pesos.map((p) => `<button class="btn sec chico" data-kg="${p}">${escaparHtml(formatearKg(p))} kg</button>`).join('')}
      </div>
      <div class="acciones-bateria"><button class="btn sec" id="fe-cancelar-ubicar">Cancelar</button></div>
    `,
  });
  document.querySelectorAll('#hoja [data-kg]').forEach((boton) => {
    boton.addEventListener('click', () => {
      cerrarHoja();
      mover(jugadorId, Number(boton.dataset.kg));
    });
  });
  $('fe-cancelar-ubicar').addEventListener('click', () => cerrarHoja());
}

function abrirEditor() {
  const existente = vista.escalera;
  const nombre = actual.linea.nombreOriginal;
  // Sin placeholder: un "ej. 8, 10, 12" también sería proponer pesos.
  abrirHoja({
    titulo: `Escalera de ${nombre}`,
    cuerpo: `
      <div class="p">Es la misma para todo el club.</div>
      <div class="campo">
        <label for="fe-pesos">Pesos (kg)</label>
        <input id="fe-pesos" type="text" inputmode="decimal" autocomplete="off" value="${existente ? escaparHtml(existente.pesos.map(formatearKg).join(' ')) : ''}">
        <div class="ayuda">De menor a mayor, separados por espacio o por coma y espacio.</div>
      </div>
      <div class="p" id="fe-queda"></div>
      <div class="p" id="fe-fuera"></div>
      <div id="fe-aviso"></div>
      <div class="acciones-bateria">
        <button class="btn" id="fe-guardar">Guardar escalera</button>
        <button class="btn sec" id="fe-cancelar">Cancelar</button>
      </div>
    `,
  });

  const actualizar = () => {
    const { error, pesos } = parsearPesos($('fe-pesos').value);
    $('fe-aviso').innerHTML = '';
    if (error) {
      $('fe-queda').textContent = $('fe-pesos').value.trim() ? error : '';
      $('fe-fuera').textContent = '';
      return null;
    }
    $('fe-queda').textContent = `Queda: ${pesos.map(formatearKg).join(' · ')} kg`;
    const fuera = quedanFuera(pesos, [...vista.escalonPorJugador.values()]);
    $('fe-fuera').textContent = !fuera.length ? ''
      : fuera.length === 1
        ? `1 jugador está en ${formatearKg(fuera[0].kg)} kg, un peso que no está en esta escalera. Sigue en ese peso; + y − lo llevan al escalón más cercano.`
        : `${fuera.length} jugadores están en pesos que no están en esta escalera. Siguen en esos pesos; + y − los llevan al escalón más cercano.`;
    return pesos;
  };

  const guardar = async () => {
    const boton = $('fe-guardar');
    if (boton.disabled) return;
    const pesos = actualizar();
    if (!pesos) {
      $('fe-aviso').innerHTML = `<div class="al"><div class="tx">${escaparHtml(parsearPesos($('fe-pesos').value).error)}</div></div>`;
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    try {
      vista.escalera = existente
        ? await editarEscalera(existente.id, pesos)
        : await crearEscalera({ clubId: obtenerClubActual().id, clave: claveDeEjercicio(nombre), nombre: nombre.trim(), pesos });
      cerrarHoja();
      renderEscalones();
    } catch (e) {
      if (!esErrorDeRed(e)) console.error('No se pudo guardar la escalera:', e);
      const mensaje = e?.code === '23505'
        ? 'Alguien definió esta escalera recién. Cerrá y volvé a abrir el ejercicio.'
        : esErrorDeRed(e) ? SIN_CONEXION : 'No se pudo guardar la escalera.';
      $('fe-aviso').innerHTML = `<div class="al"><div class="tx">${escaparHtml(mensaje)}</div></div>`;
      boton.disabled = false;
      boton.textContent = 'Guardar escalera';
    }
  };

  $('fe-pesos').addEventListener('input', actualizar);
  $('fe-pesos').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
  $('fe-guardar').addEventListener('click', guardar);
  $('fe-cancelar').addEventListener('click', () => cerrarHoja());
  actualizar();
  $('fe-pesos').focus();
}
