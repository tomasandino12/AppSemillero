import { obtenerRecursos, guardarRecurso, obtenerJugadoresDelPlantel } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { toast, formatearFechaCorta } from '../nav.js';
import { html } from '../html.js';
import { esEnlaceWeb, MENSAJE_ENLACE_NO_WEB } from '../../data/enlaces.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { abrirVideo, esVideoEmbebible } from '../componentes/video.js';
import { ir } from '../main.js';
import { renderSeccionEjercicios } from './ejercicios.js';
import { $ } from '../dom.js';
import { LIMITE } from '../../data/limites.js';
import { textoDeError } from '../errores.js';

const contenedor = () => $('recursos-contenido');
const contenedorJugadores = () => $('recursos-jugadores');

function hoyLocal() {
  // Fecha local, no UTC: después de las 21:00 en Argentina, toISOString() ya
  // devuelve el día siguiente.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Un recurso muestra a cuántos se les mandó y cuándo. NO muestra quién lo
 * mira, ni una seguidilla de envíos, ni marcas de lectura: con adolescentes,
 * el control estricto convierte una herramienta de desarrollo en una de
 * vigilancia.
 */
function tarjetaRecurso(r) {
  const cuantos = r.envios.length;
  const ultima = cuantos ? r.envios.map((e) => e.fecha).sort().at(-1) : null;
  return html`
    <div class="rec">
      <div class="t">${r.titulo}</div>
      <div class="d">${r.descripcion}</div>
      ${esVideoEmbebible(r.enlace) && html`<button class="btn sec chico" data-ver-video="${r.id}">Ver video</button>`}
      ${esEnlaceWeb(r.enlace) && html`<a class="enlace-rec" href="${r.enlace}" target="_blank" rel="noopener noreferrer">Abrir el material</a>`}
      <div class="m">
        <span class="tag rojo">${cuantos} jugador${cuantos === 1 ? '' : 'es'}</span>
        ${ultima && html`<span class="tag">${formatearFechaCorta(ultima)}</span>`}
      </div>
      <button class="btn sec chico" data-reenviar="${r.id}">Enviar a más jugadores</button>
    </div>
  `;
}

function cuerpoDeHoja(jugadores, { conCampos }) {
  return html`
    ${conCampos && html`
      <div class="campo"><label for="in-rec-titulo">Título</label>
        <input id="in-rec-titulo" type="text" maxlength="${LIMITE.titulo}" autocomplete="off"></div>
      <div class="campo"><label for="in-rec-desc">Instrucciones</label>
        <textarea id="in-rec-desc" rows="3" maxlength="${LIMITE.descripcion}"></textarea></div>
      <div class="campo"><label for="in-rec-link">Link (opcional)</label>
        <input id="in-rec-link" type="url" maxlength="${LIMITE.enlace}" autocomplete="off" inputmode="url" placeholder="https://"></div>
    `}
    <div class="eyebrow">A quién <button class="btn sec chico" id="btn-todos" type="button">Todo el plantel</button></div>
    <div class="lista-chk">
      ${jugadores.map((j) => html`
        <label class="chk-fila">
          <input type="checkbox" class="chk-jug" value="${j.id}">
          <span>${j.nombreLimpio}</span>
        </label>
      `)}
    </div>
    <div id="rec-aviso"></div>
    <button class="btn" id="btn-rec-confirmar">Registrar el envío</button>
  `;
}

/**
 * Sin un solo jugador en el plantel no hay a quién elegir: abrir el
 * formulario igual llevaba a un callejón sin salida ("Elegí al menos un
 * jugador" sobre una lista vacía, sin explicación ni salida). Se lo dice
 * antes de abrir la hoja y se ofrece ir a PLANTEL, como en el resto de la
 * app (HOY, DATOS, MEDIR y la ficha ya tienen este mismo patrón).
 */
function avisarPlantelVacio() {
  const plantel = obtenerPlantelActivo();
  const categoria = plantel?.categoria ? ` (${plantel.categoria})` : '';
  abrirHoja({
    titulo: 'Todavía no hay jugadores',
    cuerpo: html`
      <div class="p">Para enviar un recurso hace falta elegir a quién mandárselo, y este plantel${categoria} todavía no tiene jugadores cargados.</div>
      <button class="btn" id="btn-rec-ir-plantel">Ir a PLANTEL</button>
    `,
  });
  $('btn-rec-ir-plantel').addEventListener('click', () => {
    cerrarHoja();
    ir('p-plantel');
  });
}

function abrirAltaDeRecurso(recursoId, jugadores) {
  if (!jugadores.length) {
    avisarPlantelVacio();
    return;
  }
  const esNuevo = recursoId == null;
  abrirHoja({
    titulo: esNuevo ? 'Ofrecer un recurso' : 'Enviar a más jugadores',
    cuerpo: cuerpoDeHoja(jugadores, { conCampos: esNuevo }),
  });
  $('btn-todos').addEventListener('click', () => {
    document.querySelectorAll('.chk-jug').forEach((c) => { c.checked = true; });
  });
  $('btn-rec-confirmar').addEventListener('click', () => confirmarEnvio(recursoId));
  if (esNuevo) {
    $('in-rec-titulo').focus();
    // Enter en un campo de una sola línea es la otra entrada al mismo submit
    // que el click del botón; confirmarEnvio() cubre las dos con su guarda.
    $('in-rec-titulo').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarEnvio(recursoId); });
    $('in-rec-link').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarEnvio(recursoId); });
  }
}

async function confirmarEnvio(recursoId) {
  const boton = $('btn-rec-confirmar');
  // Misma guarda que altaJugador.js: click y Enter son dos entradas al mismo
  // flujo, y ésta es la única que cubre a las dos con la RPC en vuelo.
  if (boton.disabled) return;

  const jugadorIds = [...document.querySelectorAll('.chk-jug:checked')].map((c) => c.value);
  const titulo = recursoId ? null : $('in-rec-titulo').value.trim();
  const descripcion = recursoId ? null : $('in-rec-desc').value.trim();
  const enlace = recursoId ? null : ($('in-rec-link').value.trim() || null);

  if (!recursoId && (!titulo || !descripcion)) {
    $('rec-aviso').innerHTML = html`<div class="al"><div class="tx">Poné un título y las instrucciones.</div></div>`;
    return;
  }
  // html`` evita romper el atributo href, pero no frena un
  // "javascript:..." o cualquier otro esquema: eso se rechaza acá.
  if (enlace && !esEnlaceWeb(enlace)) {
    $('rec-aviso').innerHTML = html`<div class="al"><div class="tx">${MENSAJE_ENLACE_NO_WEB}</div></div>`;
    return;
  }
  if (!jugadorIds.length) {
    $('rec-aviso').innerHTML = html`<div class="al"><div class="tx">Elegí al menos un jugador.</div></div>`;
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Registrando...';
  try {
    await guardarRecurso({
      clubId: obtenerClubActual().id,
      recursoId: recursoId ?? null,
      titulo,
      descripcion,
      enlace,
      fecha: hoyLocal(),
      jugadorIds,
    });
  } catch (e) {
    $('rec-aviso').innerHTML = html`<div class="al"><div class="tx">${
      textoDeError(e, 'No se pudo registrar el envío.')
    }</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Registrar el envío';
    return;
  }
  cerrarHoja();
  toast('Envío registrado');
  // No renderRecursos(): eso reconstruye el armazón entero y con él los dos
  // contenedores hermanos, no sólo el activo. Acá siempre estamos en la
  // pestaña Jugadores (avisarPlantelVacio() y esta hoja sólo se abren desde
  // ahí), así que alcanza con refrescar la suya sin tocar el estado de
  // Ejercicios.
  await renderSeccionJugadores();
}

const encabezado = html`<div class="p">Material que dejás disponible para que el que quiera progrese por su cuenta. No es obligación ni control.</div>`;

async function renderSeccionJugadores() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedorJugadores().innerHTML = html`<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedorJugadores().innerHTML = html`
    <div class="pad">
      ${encabezado}
      <div class="eyebrow">Ofrecidos</div>
      <div class="p" id="recursos-estado">Cargando recursos...</div>
    </div>
  `;

  let recursos, jugadores;
  try {
    [recursos, jugadores] = await Promise.all([
      obtenerRecursos(club.id),
      obtenerJugadoresDelPlantel(club.id, plantel.id),
    ]);
  } catch (e) {
    // Que falle la lectura no puede dejar la pantalla sin su acción principal:
    // el entrenador tiene que poder reintentar sin salir y volver a entrar.
    $('recursos-estado').outerHTML = html`
      <div class="al"><div class="tx">${
        textoDeError(e, 'No se pudieron cargar los recursos.')
      }</div></div>
      <button class="btn sec" id="btn-reintentar-recursos">Reintentar</button>
    `;
    $('btn-reintentar-recursos').addEventListener('click', () => renderSeccionJugadores());
    return;
  }

  if (!recursos.length) {
    contenedorJugadores().innerHTML = html`
      <div class="pad">
        ${encabezado}
        <div class="estado-vacio">
          <h2>Todavía no compartiste ningún recurso</h2>
          <div class="p">El chico lo recibe por donde ya se hablan hoy (WhatsApp). Lo que hace la app es dejar registrado qué se mandó, a quién y cuándo — que es justo lo que se pierde cuando cambia el entrenador.</div>
          <div class="acciones"><button class="btn" id="btn-ofrecer">Ofrecer un recurso</button></div>
        </div>
      </div>
    `;
    $('btn-ofrecer').addEventListener('click', () => abrirAltaDeRecurso(null, jugadores));
    return;
  }

  contenedorJugadores().innerHTML = html`
    <div class="pad">
      ${encabezado}
      <div class="eyebrow">Ofrecidos</div>
      ${recursos.map(tarjetaRecurso)}
    </div>
    <div class="pie-fijo"><button class="btn sec" id="btn-ofrecer">Ofrecer un recurso</button></div>
  `;
  $('btn-ofrecer').addEventListener('click', () => abrirAltaDeRecurso(null, jugadores));
  contenedorJugadores().querySelectorAll('[data-ver-video]').forEach((b) => {
    b.addEventListener('click', () => {
      const recurso = recursos.find((r) => r.id === b.dataset.verVideo);
      if (recurso) abrirVideo(recurso.enlace, recurso.titulo);
    });
  });
  contenedorJugadores().querySelectorAll('[data-reenviar]').forEach((b) => {
    b.addEventListener('click', () => abrirAltaDeRecurso(b.dataset.reenviar, jugadores));
  });
}

let seccionActiva = 'jugadores';

/**
 * El armazón: una tira de dos pestañas y dos contenedores hermanos. No es
 * navegación de la app —no se agrega un sexto ítem a la barra de abajo—,
 * es una división interna de RECURSOS entre lo que se ofrece a los
 * jugadores y la biblioteca de ejercicios de la Etapa 5.
 */
export async function renderRecursos() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = html`<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = html`
    <div class="pestanas" role="tablist">
      <button class="pest ${seccionActiva === 'jugadores' ? 'on' : ''}" data-seccion="jugadores" role="tab" aria-selected="${seccionActiva === 'jugadores'}">Jugadores</button>
      <button class="pest ${seccionActiva === 'ejercicios' ? 'on' : ''}" data-seccion="ejercicios" role="tab" aria-selected="${seccionActiva === 'ejercicios'}">Ejercicios</button>
    </div>
    <div id="recursos-jugadores" ${seccionActiva === 'jugadores' ? '' : 'hidden'}></div>
    <div id="recursos-ejercicios" ${seccionActiva === 'ejercicios' ? '' : 'hidden'}></div>
  `;

  contenedor().querySelectorAll('[data-seccion]').forEach((b) => {
    b.addEventListener('click', () => {
      seccionActiva = b.dataset.seccion;
      renderRecursos();
    });
  });

  if (seccionActiva === 'jugadores') await renderSeccionJugadores();
  else await renderSeccionEjercicios();
}
