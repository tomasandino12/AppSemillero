import { obtenerEjercicio, obtenerNotas, crearNota, borrarNota, borrarEjercicio } from '../../data/repositorio.js';
import { nombreDeTema } from '../../data/temas.js';
import { obtenerClubActual } from '../sesion.js';
import { escaparHtml, esErrorDeRed, toast, formatearFechaCorta } from '../nav.js';
import { cargarPerfiles, nombreDe, esMio, asegurarNombre } from '../perfil.js';
import { abrirAltaEjercicio } from './ejercicios.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { ir, volver } from '../main.js';

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
        ${esMio(n.creadoPor) ? `<button class="nota-borrar" data-nota="${n.id}" aria-label="Borrar esta nota">&#10005;</button>` : ''}
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
  const propio = esMio(ejercicio.creadoPor);
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

      ${propio ? `
        <div class="acciones-hoy">
          <button class="btn sec" id="btn-ej-editar">Editar</button>
          <button class="btn sec" id="btn-ej-borrar">Borrar</button>
        </div>
      ` : ''}
    </div>
  `;

  $('btn-ej-agregar-nota').addEventListener('click', () => abrirAgregarNota(club, ejercicio));

  // Las notas de otros no se pueden borrar: esMio() ya decide en notaHtml()
  // si el botón existe, así que acá sólo hay botones sobre notas propias.
  contenedor().querySelectorAll('[data-nota]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      if (boton.disabled) return;
      boton.disabled = true;
      try {
        await borrarNota(club.id, boton.dataset.nota);
      } catch (e) {
        // La garantía es la policy de 0015, no el esMio() de acá: si dos
        // pestañas del mismo profe borran distinto, esto puede llegar igual.
        toast(e?.message === 'NO_ES_TUYO'
          ? 'Esta nota ya no es tuya: no se puede borrar.'
          : (esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo borrar la nota.'));
        boton.disabled = false;
        return;
      }
      toast('Nota borrada');
      await renderEjercicio();
    });
  });

  // Comodidad, no garantía: la garantía de editar/borrar sólo lo propio es
  // la policy RLS de 0015. Estos botones ni existen si no es tuyo.
  if (propio) {
    $('btn-ej-editar').addEventListener('click', () => {
      abrirAltaEjercicio(ejercicio);
      // abrirAltaEjercicio (ejercicios.js) siempre refresca SU lista al
      // guardar, nunca este detalle: sin esto, después de editar quedarían
      // el título y el tema viejos en pantalla hasta salir y volver a entrar.
      observarCierreDeHoja(() => { renderEjercicio(); });
    });
    $('btn-ej-borrar').addEventListener('click', () => confirmarBorrado(club, ejercicio));
  }
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

/* ---------- Editar y borrar lo propio ---------- */

/**
 * No hay un callback de "se cerró la hoja" en hoja.js, y abrirAltaEjercicio
 * (ejercicios.js) sólo refresca SU lista al guardar, nunca este detalle. Se
 * observa el cierre de #hoja para repintar apenas se cierra, sea porque se
 * guardó o porque se canceló: renderEjercicio() es sólo una relectura, así
 * que dispararla de más no rompe nada.
 */
function observarCierreDeHoja(alCerrar) {
  const hoja = document.getElementById('hoja');
  const observer = new MutationObserver(() => {
    if (!hoja.classList.contains('on')) {
      observer.disconnect();
      alCerrar();
    }
  });
  observer.observe(hoja, { attributes: true, attributeFilter: ['class'] });
}

/**
 * Borrar pide confirmación porque es irreversible y porque se lleva puestas
 * las notas de OTROS profes por el `on delete cascade` de la FK de 0015: el
 * texto lo tiene que decir, no alcanza con "¿seguro?".
 */
function confirmarBorrado(club, ejercicio) {
  abrirHoja({
    titulo: 'Borrar este ejercicio',
    cuerpo: `
      <div class="al"><div class="tx">Es para siempre: no se puede deshacer, y se borran con él todas las notas de uso que hayan cargado otros profes.</div></div>
      <div id="borrado-ej-aviso"></div>
      <button class="btn" id="btn-ej-confirmar-borrado">Borrar de todos modos</button>
      <button class="btn sec" id="btn-ej-cancelar-borrado">Cancelar</button>
    `,
  });
  $('btn-ej-cancelar-borrado').addEventListener('click', cerrarHoja);
  $('btn-ej-confirmar-borrado').addEventListener('click', async () => {
    const boton = $('btn-ej-confirmar-borrado');
    if (boton.disabled) return;
    boton.disabled = true;
    boton.textContent = 'Borrando...';
    try {
      await borrarEjercicio(club.id, ejercicio.id);
    } catch (e) {
      // La garantía es la policy de 0015, no el esMio() que decide si este
      // botón existe: si se editó desde otra sesión mientras tanto, esto
      // puede llegar igual, y no puede mostrarse como un error crudo.
      $('borrado-ej-aviso').innerHTML = `<div class="al"><div class="tx">${
        e?.message === 'NO_ES_TUYO'
          ? 'Este ejercicio ya no es tuyo: no se puede borrar.'
          : (esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo borrar el ejercicio.')
      }</div></div>`;
      boton.disabled = false;
      boton.textContent = 'Borrar de todos modos';
      return;
    }
    cerrarHoja();
    toast('Ejercicio borrado');
    await volver();
  });
}
