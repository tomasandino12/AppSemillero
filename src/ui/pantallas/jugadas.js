/*
 * Biblioteca de jugadas del club (RECURSOS › Jugadas), y el punto único donde
 * arranca "Nueva jugada" y "Editar": las dos necesitan la misma pantalla
 * chica de compu/tablet, así que el aviso y la apertura del editor viven acá
 * y jugada.js (Task 7, detalle) los reusa en vez de repetirlos.
 */
import { listarJugadas, crearJugada } from '../../data/repositorio.js';
import {
  TIPOS_JUGADA, etiquetaDeTipo, pantallaAptaParaEditar, estadoAlInicioDelPaso,
} from '../../data/jugadas.js';
import { FORMACIONES } from '../../data/formaciones.js';
import { obtenerClubActual } from '../sesion.js';
import { cargarPerfiles, nombreDe } from '../perfil.js';
import { html } from '../html.js';
import { toast } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { dibujarPizarra } from '../componentes/pizarra.js';
import { ir } from '../main.js';
import { $ } from '../dom.js';
import { LIMITE } from '../../data/limites.js';
import { textoDeError } from '../errores.js';

const contenedor = () => $('recursos-jugadas');

let abrirJugada = () => {};
/** jugada.js (detalle) registra acá cómo abrirse: evita un ciclo de import. */
export function setAbrirJugada(fn) { abrirJugada = fn; }

let jugadaParaEditor = null;
/** El id que jugadaEditor.js va a leer para saber qué jugada cargar. */
export function tomarJugadaParaEditor() { return jugadaParaEditor; }

const MENSAJE_PANTALLA_CHICA = 'El editor de jugadas es para compu o tablet. Desde acá podés verlas, asignarlas y duplicarlas.';

export function avisarPantallaNoApta() {
  abrirHoja({ titulo: 'Pantalla chica', cuerpo: html`<div class="p">${MENSAJE_PANTALLA_CHICA}</div>` });
}

/** Crea la jugada (si hace falta) y abre el editor; en pantalla chica, el aviso en su lugar. */
export function abrirEditorDeJugada(id) {
  if (!pantallaAptaParaEditar(window.innerWidth, window.innerHeight)) {
    avisarPantallaNoApta();
    return;
  }
  jugadaParaEditor = id;
  ir('p-jugada-editor', { push: true });
}

let filtroTipo = 'todos';

function chipsDeTipo(jugadas) {
  const cuenta = {};
  for (const j of jugadas) cuenta[j.tipo] = (cuenta[j.tipo] ?? 0) + 1;
  const chips = [{ clave: 'todos', etiqueta: 'Todos' }, ...TIPOS_JUGADA].filter((c) => c.clave === 'todos' || cuenta[c.clave] > 0);
  if (chips.length <= 2) return html``;
  return html`
    <div class="chips-tema" role="group" aria-label="Filtrar por tipo">
      ${chips.map((c) => html`<button type="button" class="chip-tema ${c.clave === filtroTipo ? 'on' : ''}" data-filtro-tipo="${c.clave}">${c.etiqueta}</button>`)}
    </div>`;
}

function tarjetaJugada(j) {
  return html`
    <button type="button" class="rec-tarj jugada-tarj" data-jugada="${j.id}">
      <span class="rec-mini jugada-mini" aria-hidden="true"><svg class="pz"></svg></span>
      <span class="rec-cuerpo">
        <span class="rec-eyebrow">${etiquetaDeTipo(j.tipo)}</span>
        <span class="t">${j.nombre}</span>
        <span class="d">${j.esMia ? 'Vos' : nombreDe(j.creadoPor)}</span>
      </span>
    </button>
  `;
}

function pintarMiniaturas(jugadas) {
  contenedor().querySelectorAll('[data-jugada]').forEach((el) => {
    const jugada = jugadas.find((j) => j.id === el.dataset.jugada);
    const svg = el.querySelector('svg.pz');
    if (jugada && svg) dibujarPizarra(svg, jugada.datos, estadoAlInicioDelPaso(jugada.datos, 0), {});
  });
}

function cuerpoDeAlta() {
  return html`
    <div class="campo"><label for="in-jug-nombre">Nombre</label>
      <input id="in-jug-nombre" type="text" maxlength="${LIMITE.titulo}" autocomplete="off"></div>
    <div class="campo"><span class="etiqueta" id="et-jug-tipo">Tipo</span>
      <div class="chips-tema" id="jug-tipos" role="group" aria-labelledby="et-jug-tipo">
        ${TIPOS_JUGADA.map((t) => html`<button type="button" class="chip-tema" data-tipo="${t.clave}">${t.etiqueta}</button>`)}
      </div></div>
    <div class="campo"><span class="etiqueta" id="et-jug-formacion">Formación</span>
      <div class="chips-tema" id="jug-formaciones" role="group" aria-labelledby="et-jug-formacion">
        ${FORMACIONES.map((f) => html`<button type="button" class="chip-tema" data-formacion="${f.clave}">${f.etiqueta}</button>`)}
      </div></div>
    <div id="jug-alta-aviso"></div>
    <button class="btn" id="btn-jug-crear">Crear jugada</button>
  `;
}

function alternar(contenedorId, atributo) {
  $(contenedorId).addEventListener('click', (e) => {
    const chip = e.target.closest(`[${atributo}]`);
    if (!chip) return;
    $(contenedorId).querySelectorAll('.chip-tema').forEach((c) => c.classList.remove('on'));
    chip.classList.add('on');
  });
}

function abrirAltaJugada() {
  if (!pantallaAptaParaEditar(window.innerWidth, window.innerHeight)) {
    avisarPantallaNoApta();
    return;
  }
  abrirHoja({ titulo: 'Nueva jugada', cuerpo: cuerpoDeAlta() });
  $('in-jug-nombre').focus();
  alternar('jug-tipos', 'data-tipo');
  alternar('jug-formaciones', 'data-formacion');
  $('btn-jug-crear').addEventListener('click', confirmarAltaJugada);
  $('in-jug-nombre').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarAltaJugada(); });
}

async function confirmarAltaJugada() {
  const boton = $('btn-jug-crear');
  if (boton.disabled) return;

  const club = obtenerClubActual();
  const nombre = $('in-jug-nombre').value.trim();
  const tipo = $('jug-tipos').querySelector('.on')?.dataset.tipo;
  const formacion = FORMACIONES.find((f) => f.clave === $('jug-formaciones').querySelector('.on')?.dataset.formacion);

  if (!nombre || !tipo || !formacion) {
    $('jug-alta-aviso').innerHTML = html`<div class="al"><div class="tx">Poné un nombre y elegí tipo y formación.</div></div>`;
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Creando...';
  let id;
  try {
    id = await crearJugada({ clubId: club.id, nombre, tipo, datos: formacion.datos });
  } catch (e) {
    $('jug-alta-aviso').innerHTML = html`<div class="al"><div class="tx">${textoDeError(e, 'No se pudo crear la jugada.')}</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Crear jugada';
    return;
  }
  cerrarHoja();
  toast('Jugada creada');
  abrirEditorDeJugada(id);
}

export async function renderSeccionJugadas() {
  const club = obtenerClubActual();
  if (!club) {
    contenedor().innerHTML = html`<div class="pad"><div class="p">No hay un club seleccionado.</div></div>`;
    return;
  }

  contenedor().innerHTML = html`<div class="pad"><div class="p" id="jugadas-estado">Cargando jugadas...</div></div>`;

  let jugadas;
  try {
    [, jugadas] = await Promise.all([cargarPerfiles(club.id), listarJugadas(club.id)]);
  } catch (e) {
    $('jugadas-estado').outerHTML = html`
      <div class="al"><div class="tx">${textoDeError(e, 'No se pudieron cargar las jugadas.')}</div></div>
      <button class="btn sec" id="btn-reintentar-jugadas">Reintentar</button>
    `;
    $('btn-reintentar-jugadas').addEventListener('click', () => renderSeccionJugadas());
    return;
  }

  if (!jugadas.length) {
    contenedor().innerHTML = html`
      <div class="pad">
        <div class="estado-vacio">
          <h2>Todavía no hay jugadas</h2>
          <div class="p">La biblioteca del club: cada profe carga las suyas y todos las ven. Editarlas o borrarlas queda para quien las creó; el resto las duplica.</div>
          <div class="acciones"><button class="btn" id="btn-jug-primera">Nueva jugada</button></div>
        </div>
      </div>
    `;
    $('btn-jug-primera').addEventListener('click', abrirAltaJugada);
    return;
  }

  if (filtroTipo !== 'todos' && !jugadas.some((j) => j.tipo === filtroTipo)) filtroTipo = 'todos';
  const visibles = filtroTipo === 'todos' ? jugadas : jugadas.filter((j) => j.tipo === filtroTipo);

  contenedor().innerHTML = html`
    <div class="pad">
      <div class="seccion-cab">
        <div class="eyebrow">Jugadas</div>
        <button class="btn chico" id="btn-jug-nueva" type="button">Nueva jugada</button>
      </div>
      ${chipsDeTipo(jugadas)}
      <div class="rec-grilla">${visibles.map(tarjetaJugada)}</div>
    </div>
  `;

  pintarMiniaturas(visibles);
  $('btn-jug-nueva').addEventListener('click', abrirAltaJugada);
  contenedor().querySelectorAll('[data-filtro-tipo]').forEach((b) => {
    b.addEventListener('click', () => { filtroTipo = b.dataset.filtroTipo; renderSeccionJugadas(); });
  });
  contenedor().querySelectorAll('[data-jugada]').forEach((b) => {
    b.addEventListener('click', () => abrirJugada(b.dataset.jugada));
  });
}
