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
import {
  TIPOS_RECURSO, SIN_TIPO, RANGO_FRECUENCIA, RANGO_MINUTOS,
  etiquetaDeTipo, validarMetadatos, contarPorTipo, filtrarPorTipo, claseDeEnlace,
} from '../../data/recursos.js';
import { urlDeMiniatura } from '../../data/youtube.js';

const contenedor = () => $('recursos-contenido');
const contenedorJugadores = () => $('recursos-jugadores');

function hoyLocal() {
  // Fecha local, no UTC: después de las 21:00 en Argentina, toISOString() ya
  // devuelve el día siguiente.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ETIQUETA_SIN_MINIATURA = { drive: 'Drive', pdf: 'PDF', otro: 'Link', youtube: 'Video' };

function miniatura(r) {
  const src = urlDeMiniatura(r.enlace);
  if (esVideoEmbebible(r.enlace) && src) {
    return html`
      <button class="rec-mini" type="button" data-ver-video="${r.id}" aria-label="Ver video: ${r.titulo}">
        <img src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <span class="rec-play" aria-hidden="true"></span>
      </button>`;
  }
  const clase = claseDeEnlace(r.enlace);
  return html`
    <div class="rec-mini sin-img" aria-hidden="true">
      <span class="rec-mini-et">${clase ? ETIQUETA_SIN_MINIATURA[clase] : 'Instrucciones'}</span>
    </div>`;
}

// Un dato que el profe no cargó no se muestra: ni cajita vacía ni "0".
function datosDeDedicacion(r) {
  if (r.frecuenciaSemanal == null && r.minutos == null) return '';
  return html`
    <div class="rec-datos">
      ${r.frecuenciaSemanal != null && html`<div class="rec-dato"><span class="et">Frecuencia</span><span class="v">${r.frecuenciaSemanal} por semana</span></div>`}
      ${r.minutos != null && html`<div class="rec-dato"><span class="et">Dedicación</span><span class="v">${r.minutos} min</span></div>`}
    </div>`;
}

/**
 * Un recurso muestra a cuántos se les mandó y cuándo. NO muestra quién lo
 * mira, ni una seguidilla de envíos, ni marcas por jugador: con adolescentes,
 * el control estricto convierte una herramienta de desarrollo en una de
 * vigilancia.
 */
function tarjetaRecurso(r) {
  const cuantos = r.envios.length;
  const ultima = cuantos ? r.envios.map((e) => e.fecha).sort().at(-1) : null;
  const eyebrow = [etiquetaDeTipo(r.tipo), formatearFechaCorta(r.creadoEn.slice(0, 10))].filter(Boolean).join(' · ');
  return html`
    <article class="rec-tarj">
      ${miniatura(r)}
      <div class="rec-cuerpo">
        <div class="rec-eyebrow">${eyebrow}</div>
        <div class="t">${r.titulo}</div>
        <div class="d">${r.descripcion}</div>
        ${datosDeDedicacion(r)}
        <div class="m">
          <span class="tag rojo">${cuantos} jugador${cuantos === 1 ? '' : 'es'}</span>
          ${ultima && html`<span class="tag">Último envío ${formatearFechaCorta(ultima)}</span>`}
        </div>
        <div class="rec-acciones">
          ${esVideoEmbebible(r.enlace) && html`<button class="btn chico" type="button" data-ver-video="${r.id}">Ver video</button>`}
          ${esEnlaceWeb(r.enlace) && html`<a class="btn contorno chico" href="${r.enlace}" target="_blank" rel="noopener noreferrer">Material</a>`}
        </div>
        <button class="btn sec" type="button" data-reenviar="${r.id}">Enviar a más jugadores</button>
      </div>
    </article>
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
      <div class="campo"><span class="etiqueta" id="et-rec-tipo">Tipo (opcional)</span>
        <div class="chips-tema" id="rec-tipos" role="group" aria-labelledby="et-rec-tipo">
          ${TIPOS_RECURSO.map((t) => html`<button class="chip-tema" type="button" data-tipo="${t.clave}" aria-pressed="false">${t.etiqueta}</button>`)}
        </div></div>
      <div class="campos-par">
        <div class="campo"><label for="in-rec-frec">Veces por semana (opcional)</label>
          <input id="in-rec-frec" type="text" inputmode="numeric" maxlength="1" autocomplete="off" placeholder="${RANGO_FRECUENCIA.min} a ${RANGO_FRECUENCIA.max}"></div>
        <div class="campo"><label for="in-rec-min">Minutos (opcional)</label>
          <input id="in-rec-min" type="text" inputmode="numeric" maxlength="3" autocomplete="off" placeholder="${RANGO_MINUTOS.min} a ${RANGO_MINUTOS.max}"></div>
      </div>
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
    // Un solo tipo a la vez; tocar el elegido lo saca (el tipo es opcional).
    $('rec-tipos').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-tipo]');
      if (!chip) return;
      const estaba = chip.classList.contains('on');
      $('rec-tipos').querySelectorAll('[data-tipo]').forEach((c) => {
        c.classList.remove('on');
        c.setAttribute('aria-pressed', 'false');
      });
      if (!estaba) {
        chip.classList.add('on');
        chip.setAttribute('aria-pressed', 'true');
      }
    });
    $('in-rec-titulo').focus();
    // Enter en un campo de una sola línea es la otra entrada al mismo submit
    // que el click del botón; confirmarEnvio() cubre las dos con su guarda.
    for (const id of ['in-rec-titulo', 'in-rec-link', 'in-rec-frec', 'in-rec-min']) {
      $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarEnvio(recursoId); });
    }
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
  const metadatos = recursoId ? { valor: {} } : validarMetadatos({
    tipo: $('rec-tipos').querySelector('.on')?.dataset.tipo,
    frecuenciaSemanal: $('in-rec-frec').value,
    minutos: $('in-rec-min').value,
  });

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
  if (metadatos.error) {
    $('rec-aviso').innerHTML = html`<div class="al"><div class="tx">${metadatos.error}</div></div>`;
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
      ...metadatos.valor,
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

const filosofia = html`
  <section class="tarj rec-filosofia">
    <div class="eyebrow">Para qué sirve</div>
    <div class="p">Material que dejás disponible para que el que quiera progrese por su cuenta. No es obligación ni control.</div>
    <div class="p">Se comparten links, la app no guarda archivos:</div>
    <div class="rec-aceptados"><span class="chip">Video de YouTube (no listado)</span><span class="chip">Google Drive</span><span class="chip">PDF</span></div>
  </section>`;

// Se recuerda mientras dure la sesión: al enviar un recurso la lista se vuelve
// a pintar y no tiene que saltar de vuelta a "Todos".
let filtroTipo = 'todos';

function chipsDeTipo(recursos) {
  const cuenta = contarPorTipo(recursos);
  const chips = [{ clave: 'todos', etiqueta: 'Todos' }, ...TIPOS_RECURSO, { clave: SIN_TIPO, etiqueta: 'Sin tipo' }]
    .filter((c) => c.clave === 'todos' || cuenta[c.clave] > 0);
  // Con un solo tipo en juego, filtrar no sirve de nada.
  if (chips.length <= 2) return '';
  return html`
    <div class="chips-tema" role="group" aria-label="Filtrar por tipo">
      ${chips.map((c) => html`<button class="chip-tema ${c.clave === filtroTipo ? 'on' : ''}" type="button" data-filtro="${c.clave}" aria-pressed="${c.clave === filtroTipo}">${c.etiqueta} <span class="mono">${cuenta[c.clave]}</span></button>`)}
    </div>`;
}

async function renderSeccionJugadores() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedorJugadores().innerHTML = html`<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedorJugadores().innerHTML = html`
    <div class="pad">
      ${filosofia}
      <div class="seccion-cab"><div class="eyebrow">Ofrecidos</div></div>
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
        ${filosofia}
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

  // Un filtro que ya no tiene recursos (por ejemplo tras cambiar de plantel)
  // no puede dejar la pantalla vacía sin salida.
  if (filtroTipo !== 'todos' && !filtrarPorTipo(recursos, filtroTipo).length) filtroTipo = 'todos';
  const visibles = filtrarPorTipo(recursos, filtroTipo);

  contenedorJugadores().innerHTML = html`
    <div class="pad">
      ${filosofia}
      <div class="seccion-cab">
        <div class="eyebrow">Ofrecidos</div>
        <button class="btn chico" id="btn-ofrecer" type="button">Ofrecer un recurso</button>
      </div>
      ${chipsDeTipo(recursos)}
      <div class="rec-grilla">${visibles.map(tarjetaRecurso)}</div>
    </div>
  `;
  $('btn-ofrecer').addEventListener('click', () => abrirAltaDeRecurso(null, jugadores));
  contenedorJugadores().querySelectorAll('[data-filtro]').forEach((b) => {
    b.addEventListener('click', () => {
      filtroTipo = b.dataset.filtro;
      renderSeccionJugadores();
    });
  });
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
