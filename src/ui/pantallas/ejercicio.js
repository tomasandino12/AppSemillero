import { obtenerEjercicio, obtenerNotas, crearNota } from '../../data/repositorio.js';
import { nombreDeTema } from '../../data/temas.js';
import { obtenerClubActual } from '../sesion.js';
import { escaparHtml, esErrorDeRed, toast, formatearFechaCorta } from '../nav.js';
import { cargarPerfiles, nombreDe, asegurarNombre } from '../perfil.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('ejercicio-contenido');

let ejercicioId = null;

export function abrirEjercicio(id) {
  ejercicioId = id;
  ir('p-ejercicio', { push: true });
}

/**
 * Descripción, como bloque HERMANO de Notas de uso (mismo `.eyebrow`, mismo
 * tamaño de texto). Título y tema son los dos únicos campos obligatorios del
 * alta, así que una descripción vacía es un estado normal, no un error: se
 * invita a completarla en vez de mostrar un hueco en blanco.
 */
function bloqueDescripcion(ejercicio) {
  return `
    <div class="eyebrow">Descripción</div>
    <div class="p texto-libre">${
      ejercicio.descripcion
        ? escaparHtml(ejercicio.descripcion)
        : 'Todavía no hay una descripción: se guardó sólo con título y tema. Quien lo cargó puede sumarla editando el ejercicio.'
    }</div>
  `;
}

function notaHtml(n) {
  return `
    <div class="nota">
      <div class="meta">
        <span>${escaparHtml(nombreDe(n.creadoPor))} · ${escaparHtml(formatearFechaCorta(n.creadoEn.slice(0, 10)))}</span>
      </div>
      <div class="tx texto-libre">${escaparHtml(n.texto)}</div>
    </div>
  `;
}

/**
 * Es la pieza que más importa del spec: lo que hoy se pierde no es el
 * ejercicio —eso está en internet— sino qué pasó cuando se probó con estos
 * chicos. Por eso este bloque usa el MISMO `.eyebrow` que Descripción, no va
 * al pie ni queda plegado, y el botón de agregar está siempre visible.
 */
function bloqueNotas(notas) {
  if (!notas.length) {
    return `<div class="p">Todavía nadie anotó qué pasó al usarlo. Si lo probaste, lo que aprendiste le sirve al que venga.</div>`;
  }
  return notas.map(notaHtml).join('');
}

function filaMenor(etiqueta, valor) {
  return `<div class="fila-menor"><span class="k">${escaparHtml(etiqueta)}</span><span class="v">${escaparHtml(valor)}</span></div>`;
}

/** Material, jugadores, categorías y enlace: sólo los que tengan valor, en un bloque menor. */
function bloqueDetalleMenor(ejercicio) {
  const filas = [
    ejercicio.material ? filaMenor('Material', ejercicio.material) : '',
    ejercicio.jugadores ? filaMenor('Jugadores', ejercicio.jugadores) : '',
    ejercicio.categorias ? filaMenor('Categorías', ejercicio.categorias) : '',
    ejercicio.enlace
      ? `<div class="fila-menor"><span class="k">Enlace</span><a href="${escaparHtml(ejercicio.enlace)}" target="_blank" rel="noopener noreferrer">Abrir el enlace</a></div>`
      : '',
  ].filter(Boolean);
  return filas.length ? `<div class="detalle-menor">${filas.join('')}</div>` : '';
}

function pintarEjercicio(club, ejercicio, notas) {
  contenedor().innerHTML = `
    <div class="ficha-top">
      <div class="nom">${escaparHtml(ejercicio.titulo)}</div>
      <div class="sub">${escaparHtml(nombreDeTema(ejercicio.tema))} · ${escaparHtml(nombreDe(ejercicio.creadoPor))}</div>
    </div>
    <div class="pad">
      ${bloqueDescripcion(ejercicio)}

      <div class="eyebrow">Notas de uso</div>
      ${bloqueNotas(notas)}
      <button class="btn sec" id="btn-ej-agregar-nota">Agregar una nota</button>

      ${bloqueDetalleMenor(ejercicio)}
    </div>
  `;

  $('btn-ej-agregar-nota').addEventListener('click', () => abrirAgregarNota(club, ejercicio));
}

export async function renderEjercicio() {
  const club = obtenerClubActual();
  if (!club || !ejercicioId) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay un ejercicio seleccionado.</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando ejercicio...</div></div>`;

  let ejercicio, notas;
  try {
    // cargarPerfiles junto con la lectura: sin nombres, el autor de cada
    // nota sería un UUID. Mismo patrón que renderSeccionEjercicios.
    [, ejercicio, notas] = await Promise.all([
      cargarPerfiles(club.id),
      obtenerEjercicio(club.id, ejercicioId),
      obtenerNotas(club.id, ejercicioId),
    ]);
  } catch (e) {
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar el ejercicio.'
    }</div></div></div>`;
    return;
  }

  if (!ejercicio) {
    contenedor().innerHTML = `<div class="pad"><div class="p">Este ejercicio ya no existe.</div></div>`;
    return;
  }

  pintarEjercicio(club, ejercicio, notas);
}

/* ---------- Agregar una nota de uso ---------- */

function abrirAgregarNota(club, ejercicio) {
  abrirHoja({
    titulo: 'Agregar una nota',
    cuerpo: `
      <div class="campo">
        <label for="in-nota-texto">Qué pasó al usarlo</label>
        <textarea id="in-nota-texto" rows="4" placeholder="Ej.: con los de mini no funcionó hasta que achiqué la cancha"></textarea>
      </div>
      <div id="nota-aviso"></div>
      <button class="btn" id="btn-guardar-nota">Guardar la nota</button>
    `,
  });
  $('in-nota-texto').focus();
  $('btn-guardar-nota').addEventListener('click', () => confirmarNota(club, ejercicio));
}

async function confirmarNota(club, ejercicio) {
  const boton = $('btn-guardar-nota');
  if (boton.disabled) return;

  // El texto se guarda tal cual lo escribió el profe: el trim() de acá es
  // sólo para chequear que no esté vacío, nunca para lo que se manda.
  const texto = $('in-nota-texto').value;
  if (!texto.trim()) {
    $('nota-aviso').innerHTML = `<div class="al"><div class="tx">Escribí qué pasó al usarlo.</div></div>`;
    return;
  }

  // asegurarNombre ANTES de deshabilitar el botón: si esta promesa quedara
  // colgada por cualquier motivo, la pantalla no puede quedar muerta con el
  // botón deshabilitado para siempre (mismo criterio que confirmarAltaEjercicio).
  const hayNombre = await asegurarNombre(club.id);
  if (!hayNombre) return;

  boton.disabled = true;
  boton.textContent = 'Guardando...';
  $('nota-aviso').innerHTML = '';
  try {
    await crearNota({ clubId: club.id, ejercicioId: ejercicio.id, texto });
  } catch (e) {
    $('nota-aviso').innerHTML = `<div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo guardar la nota.'
    }</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Guardar la nota';
    return;
  }

  cerrarHoja();
  toast('Nota agregada');
  await renderEjercicio();
}
