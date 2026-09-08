import { obtenerEjercicios, crearEjercicio, actualizarEjercicio } from '../../data/repositorio.js';
import { TEMAS, nombreDeTema } from '../../data/temas.js';
import { obtenerClubActual } from '../sesion.js';
import { escaparHtml, esErrorDeRed, toast } from '../nav.js';
import { cargarPerfiles, nombreDe, asegurarNombre } from '../perfil.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('recursos-ejercicios');

let temaFiltro = null;              // null = todos
let abrirEjercicio = () => {};

/**
 * La Task 8 registra acá la apertura del detalle. Es inyección y no import
 * para no armar un ciclo: `ejercicio.js` sí importa de este archivo.
 */
export function setAbrirEjercicio(fn) { abrirEjercicio = fn; }

function estadoVacioHtml() {
  return `
    <div class="estado-vacio">
      <h2>La biblioteca está vacía</h2>
      <div class="p">Acá van los ejercicios del club, con lo que cada profe aprendió al usarlos. Lo que hoy se pierde no es el ejercicio —eso está en internet— sino qué pasó cuando lo probaste con estos chicos.</div>
      <div class="p">Cargar uno son dos campos: título y tema.</div>
      <div class="acciones"><button class="btn" id="btn-primer-ejercicio">Cargar el primero</button></div>
    </div>
  `;
}

function tarjetaEjercicio(e) {
  return `
    <button class="ejercicio" data-ejercicio="${e.id}">
      <div class="cab">
        <span class="tema">${escaparHtml(nombreDeTema(e.tema))}</span>
        ${e.tieneNotas ? '<span class="probado" title="Tiene notas de uso">✓ probado</span>' : ''}
      </div>
      <div class="tit">${escaparHtml(e.titulo)}</div>
      <div class="autor">${escaparHtml(nombreDe(e.creadoPor))}</div>
    </button>
  `;
}

/** Sólo los temas que efectivamente tienen ejercicios: nunca se muestra un chip vacío. */
function temasConEjercicios(ejercicios) {
  const presentes = new Set(ejercicios.map((e) => e.tema));
  return TEMAS.filter((t) => presentes.has(t.id));
}

function pintarListaEjercicios(ejercicios) {
  const temas = temasConEjercicios(ejercicios);
  const filtrados = temaFiltro == null ? ejercicios : ejercicios.filter((e) => e.tema === temaFiltro);

  contenedor().innerHTML = `
    <div class="pad">
      <div class="chips-tema">
        <button type="button" class="chip-tema ${temaFiltro === null ? 'on' : ''}" data-tema-filtro="">Todos</button>
        ${temas.map((t) => `<button type="button" class="chip-tema ${temaFiltro === t.id ? 'on' : ''}" data-tema-filtro="${t.id}">${escaparHtml(t.nombre)}</button>`).join('')}
      </div>
      <div id="ejercicios-lista">${filtrados.map(tarjetaEjercicio).join('')}</div>
    </div>
    <div class="pie-fijo"><button class="btn sec" id="btn-agregar-ejercicio">Cargar un ejercicio</button></div>
  `;

  contenedor().querySelectorAll('[data-tema-filtro]').forEach((chip) => {
    chip.addEventListener('click', () => {
      temaFiltro = chip.dataset.temaFiltro || null;
      pintarListaEjercicios(ejercicios);
    });
  });
  $('btn-agregar-ejercicio').addEventListener('click', () => abrirAltaEjercicio(null));
  contenedor().querySelectorAll('[data-ejercicio]').forEach((boton) => {
    boton.addEventListener('click', () => abrirEjercicio(boton.dataset.ejercicio));
  });
}

export async function renderSeccionEjercicios() {
  const club = obtenerClubActual();
  if (!club) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay un club seleccionado.</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p" id="ejercicios-estado">Cargando ejercicios...</div></div>`;

  let ejercicios;
  try {
    // cargarPerfiles junto con la lectura: sin nombres, el autor de cada
    // ejercicio sería un UUID. Mismo patrón que la pestaña Jugadores.
    [, ejercicios] = await Promise.all([
      cargarPerfiles(club.id),
      obtenerEjercicios(club.id),
    ]);
  } catch (e) {
    // Que falle la lectura no puede dejar la pantalla sin su acción principal:
    // mismo criterio que ya sigue la pestaña Jugadores (recursos.js).
    $('ejercicios-estado').outerHTML = `
      <div class="al"><div class="tx">${
        esErrorDeRed(e)
          ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
          : 'No se pudieron cargar los ejercicios.'
      }</div></div>
      <button class="btn sec" id="btn-reintentar-ejercicios">Reintentar</button>
    `;
    $('btn-reintentar-ejercicios').addEventListener('click', () => renderSeccionEjercicios());
    return;
  }

  if (!ejercicios.length) {
    contenedor().innerHTML = `<div class="pad">${estadoVacioHtml()}</div>`;
    $('btn-primer-ejercicio').addEventListener('click', () => abrirAltaEjercicio(null));
    return;
  }

  temaFiltro = null;
  pintarListaEjercicios(ejercicios);
}

/**
 * Título y tema son los únicos dos campos obligatorios: el que carga un
 * ejercicio no es quien recibe el beneficio (eso lo sienten el club y quien
 * venga después), así que todo lo que no hace falta para guardar vive
 * plegado y cerrado. Los chips reemplazan al elemento select nativo porque
 * en celular ese control abre el picker del sistema: tres toques contra uno.
 */
function cuerpoDeAlta(previo) {
  return `
    <div class="campo">
      <label for="in-ej-titulo">Título</label>
      <input id="in-ej-titulo" type="text" autocomplete="off" value="${escaparHtml(previo?.titulo ?? '')}">
    </div>
    <div class="campo">
      <label id="lbl-tema">Tema</label>
      <div class="chips-tema" id="ej-chips-tema" role="group" aria-labelledby="lbl-tema">
        ${TEMAS.map((t) => `<button type="button" class="chip-tema ${previo?.tema === t.id ? 'on' : ''}" data-tema="${t.id}">${escaparHtml(t.nombre)}</button>`).join('')}
      </div>
    </div>
    <button class="btn sec" id="btn-mas-detalles" type="button">Agregar más detalles</button>
    <div id="ej-detalles" hidden>
      <div class="campo"><label for="in-ej-desc">Descripción</label><textarea id="in-ej-desc" rows="4">${escaparHtml(previo?.descripcion ?? '')}</textarea></div>
      <div class="campo"><label for="in-ej-enlace">Enlace</label><input id="in-ej-enlace" type="url" inputmode="url" placeholder="https://" value="${escaparHtml(previo?.enlace ?? '')}"></div>
      <div class="campo"><label for="in-ej-material">Material</label><input id="in-ej-material" type="text" placeholder="conos, dos pelotas" value="${escaparHtml(previo?.material ?? '')}"></div>
      <div class="campo"><label for="in-ej-jugadores">Jugadores</label><input id="in-ej-jugadores" type="text" placeholder="6 a 12" value="${escaparHtml(previo?.jugadores ?? '')}"></div>
      <div class="campo"><label for="in-ej-categorias">Categorías</label><input id="in-ej-categorias" type="text" placeholder="mini, sub-13" value="${escaparHtml(previo?.categorias ?? '')}"></div>
    </div>
    <div id="ej-aviso"></div>
    <button class="btn" id="btn-guardar-ejercicio">${previo ? 'Guardar los cambios' : 'Guardar'}</button>
  `;
}

/**
 * Sirve para crear y para editar (Task 9): si `ejercicioExistente` viene con
 * datos, precarga los campos y guarda con actualizarEjercicio; si no, crea
 * con crearEjercicio. Una sola función para no duplicar el formulario.
 */
export function abrirAltaEjercicio(ejercicioExistente) {
  const club = obtenerClubActual();
  if (!club) return;

  abrirHoja({
    titulo: ejercicioExistente ? 'Editar ejercicio' : 'Cargar un ejercicio',
    cuerpo: cuerpoDeAlta(ejercicioExistente),
  });
  $('in-ej-titulo').focus();

  $('btn-mas-detalles').addEventListener('click', () => {
    $('ej-detalles').hidden = false;
    $('btn-mas-detalles').hidden = true;
  });

  // Los chips se comportan como radio: al tocar uno se apaga el resto.
  $('ej-chips-tema').querySelectorAll('.chip-tema').forEach((chip) => {
    chip.addEventListener('click', () => {
      $('ej-chips-tema').querySelectorAll('.chip-tema').forEach((c) => c.classList.remove('on'));
      chip.classList.add('on');
    });
  });

  $('btn-guardar-ejercicio').addEventListener('click', () => confirmarAltaEjercicio(ejercicioExistente));
  // Enter en el título es la otra entrada al mismo submit que el click del
  // botón; confirmarAltaEjercicio() cubre a las dos con su guarda.
  $('in-ej-titulo').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmarAltaEjercicio(ejercicioExistente);
  });
}

async function confirmarAltaEjercicio(previo) {
  const boton = $('btn-guardar-ejercicio');
  // Misma guarda que altaJugador.js: click y Enter son dos entradas al mismo
  // flujo, y ésta es la única que cubre a las dos contra un doble submit.
  if (boton.disabled) return;

  const club = obtenerClubActual();
  const aviso = $('ej-aviso');
  // El título se guarda tal cual se tipeó; el trim() de acá es sólo para
  // validar que no esté vacío, nunca para lo que se manda a guardar.
  const tituloCrudo = $('in-ej-titulo').value;
  const tema = $('ej-chips-tema').querySelector('.chip-tema.on')?.dataset.tema ?? null;

  if (!tituloCrudo.trim() || !tema) {
    aviso.innerHTML = `<div class="al"><div class="tx">Elegí un título y un tema.</div></div>`;
    return;
  }

  // asegurarNombre ANTES de deshabilitar el botón: si esta promesa quedara
  // colgada por cualquier motivo, la pantalla no puede quedar muerta con el
  // botón deshabilitado para siempre.
  const hayNombre = await asegurarNombre(club.id);
  if (!hayNombre) return;

  boton.disabled = true;
  boton.textContent = 'Guardando...';
  aviso.innerHTML = '';

  // El texto va tal cual: nada de trim() ni de normalizar saltos de línea
  // sobre la descripción ni sobre el resto de los campos de texto libre.
  const campos = {
    titulo: tituloCrudo,
    tema,
    descripcion: $('in-ej-desc').value,
    enlace: $('in-ej-enlace').value,
    material: $('in-ej-material').value,
    jugadores: $('in-ej-jugadores').value,
    categorias: $('in-ej-categorias').value,
  };

  try {
    if (previo) {
      await actualizarEjercicio(club.id, previo.id, campos);
    } else {
      await crearEjercicio({ clubId: club.id, ...campos });
    }
  } catch (e) {
    aviso.innerHTML = `<div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo guardar el ejercicio.'
    }</div></div>`;
    boton.disabled = false;
    boton.textContent = previo ? 'Guardar los cambios' : 'Guardar';
    return;
  }

  cerrarHoja();
  toast(previo ? 'Ejercicio actualizado' : 'Ejercicio agregado');
  await renderSeccionEjercicios();
}
