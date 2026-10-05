import {
  obtenerEjercicio, obtenerNotas, crearNota, borrarNota,
  borrarEjercicio,
  obtenerVariaciones, crearVariacion, actualizarVariacion, borrarVariacion,
} from '../../data/repositorio.js';
import { nombreDeTema } from '../../data/temas.js';
import {
  EJES, NIVEL, nombreDeEje, nivelSugerido, ordenarVariaciones, validarVariacion,
} from '../../data/variaciones.js';
import { obtenerClubActual } from '../sesion.js';
import { toast, formatearFechaCorta } from '../nav.js';
import { html, crudo } from '../html.js';
import { esEnlaceWeb } from '../../data/enlaces.js';
import { reproductorHtml } from '../componentes/video.js';
import { montarVisor } from '../componentes/visorJugada.js';
import { validarEjercicio } from '../../data/pizarraEjercicio.js';
import { cargarPerfiles, nombreDe, esMio, asegurarNombre } from '../perfil.js';
import { abrirAltaEjercicio } from './ejercicios.js';
import { abrirEditorDePizarraDeEjercicio } from './jugadas.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { confirmarEnHoja } from '../componentes/confirmar.js';
import { ir, volver } from '../main.js';
import { $ } from '../dom.js';
import { LIMITE } from '../../data/limites.js';
import { avisoDeError, textoDeError, mensajeAlGuardar } from '../errores.js';

const contenedor = () => $('ejercicio-contenido');

let ejercicioId = null;
// El visor de la pizarra corre un requestAnimationFrame propio (y en bucle):
// se desmonta antes de pintar de nuevo para no dejarlo animando un <svg> que ya no está.
let visorActual = null;

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
  return html`
    <div class="eyebrow">Descripción</div>
    <div class="p texto-libre">${
      ejercicio.descripcion
        || 'Todavía no hay una descripción: se guardó sólo con título y tema. Quien lo cargó puede sumarla editando el ejercicio.'
    }</div>
  `;
}

/**
 * El dibujo del ejercicio: lo ve todo el cuerpo técnico (también en el celu);
 * dibujarlo o cambiarlo es de quien creó el ejercicio y se hace desde una
 * tablet o una compu. Sin dibujo, sólo quien puede hacerlo ve el bloque.
 */
function bloquePizarra(ejercicio, propio) {
  const hayDibujo = Boolean(ejercicio.pizarra?.fichas?.length);
  if (!hayDibujo && !propio) return '';
  const sePuedeMostrar = hayDibujo && validarEjercicio(ejercicio.pizarra).ok;
  return html`
    <div class="seccion-cab">
      <div class="eyebrow">Pizarra</div>
      ${propio && html`<button class="btn chico" id="btn-ej-pizarra">${hayDibujo ? 'Editar' : 'Dibujar'}</button>`}
    </div>
    ${sePuedeMostrar ? html`<div id="ej-pizarra-visor"></div>` : html`<div class="p">${
      hayDibujo
        ? 'No se pudo mostrar el dibujo de este ejercicio.'
        : 'Todavía no tiene dibujo. Con la pizarra se entiende de un vistazo dónde va cada fila, adónde pasa la pelota y cómo se rota. Se dibuja desde una tablet o una compu.'
    }</div>`}
  `;
}

/**
 * creadoEn es un timestamptz: Supabase lo devuelve en UTC. Recortar los
 * primeros 10 caracteres del string toma la fecha calendario UTC, no la de
 * Argentina, y una nota cargada entre las 21:00 y las 23:59 hora local
 * aparecería fechada al día siguiente (el mismo problema que del lado de la
 * escritura se evita armando la fecha con getters locales). Por eso acá se
 * arma el YYYY-MM-DD con los
 * getters locales del Date, nunca con un slice() del string UTC.
 */
function fechaLocalDeTimestamp(timestamptz) {
  const d = new Date(timestamptz);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function notaHtml(n) {
  return html`
    <div class="nota">
      <div class="meta">
        <span>${nombreDe(n.creadoPor)} · ${formatearFechaCorta(fechaLocalDeTimestamp(n.creadoEn))}</span>
        ${esMio(n.creadoPor) && html`<button class="nota-borrar" data-nota="${n.id}" aria-label="Borrar esta nota">&#10005;</button>`}
      </div>
      <div class="tx texto-libre">${n.texto}</div>
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
    return html`<div class="p">Todavía nadie anotó qué pasó al usarlo. Si lo probaste, lo que aprendiste le sirve al que venga.</div>`;
  }
  return notas.map(notaHtml);
}

function filaMenor(etiqueta, valor) {
  return html`<div class="fila-menor"><span class="k">${etiqueta}</span><span class="v">${valor}</span></div>`;
}

/** Material, jugadores, categorías y enlace: sólo los que tengan valor, en un bloque menor. */
function bloqueDetalleMenor(ejercicio) {
  const filas = [
    ejercicio.material && filaMenor('Material', ejercicio.material),
    ejercicio.jugadores && filaMenor('Jugadores', ejercicio.jugadores),
    ejercicio.categorias && filaMenor('Categorías', ejercicio.categorias),
    esEnlaceWeb(ejercicio.enlace)
      && html`<div class="fila-menor"><span class="k">Enlace</span><a href="${ejercicio.enlace}" target="_blank" rel="noopener noreferrer">Abrir el enlace</a></div>`,
  ].filter(Boolean);
  return filas.length > 0 && html`<div class="detalle-menor">${filas}</div>`;
}

function pintarEjercicio(club, ejercicio, notas, variaciones) {
  const propio = esMio(ejercicio.creadoPor);
  visorActual?.desmontar();
  visorActual = null;
  contenedor().innerHTML = html`
    <div class="ficha-top">
      <div class="nom">${ejercicio.titulo}</div>
      <div class="sub">${nombreDeTema(ejercicio.tema)} · ${nombreDe(ejercicio.creadoPor)}</div>
    </div>
    <div class="pad">
      ${crudo(reproductorHtml(ejercicio.enlace, ejercicio.titulo))}
      ${bloqueDescripcion(ejercicio)}

      ${bloquePizarra(ejercicio, propio)}

      <div class="seccion-cab">
        <div class="eyebrow">Variaciones</div>
        <button class="btn chico" id="btn-ej-sumar-variacion">Sumar</button>
      </div>
      ${bloqueVariaciones(variaciones)}

      <div class="eyebrow">Notas de uso</div>
      ${bloqueNotas(notas)}
      <button class="btn sec" id="btn-ej-agregar-nota">Agregar una nota</button>

      ${bloqueDetalleMenor(ejercicio)}

      <div class="acciones-hoy">
        ${propio && html`
          <button class="btn sec" id="btn-ej-editar">Editar</button>
          <button class="btn sec" id="btn-ej-borrar">Borrar</button>
        `}
      </div>
    </div>
  `;

  if ($('ej-pizarra-visor')) visorActual = montarVisor($('ej-pizarra-visor'), ejercicio.pizarra);
  $('btn-ej-pizarra')?.addEventListener('click', () => abrirEditorDePizarraDeEjercicio(ejercicio.id));
  $('btn-ej-agregar-nota').addEventListener('click', () => abrirAgregarNota(club, ejercicio));
  $('btn-ej-sumar-variacion').addEventListener('click', () => abrirFormVariacion(club, ejercicio, variaciones));
  cablearVariaciones(club, ejercicio, variaciones);

  // Las notas de otros no se pueden borrar: esMio() ya decide en notaHtml()
  // si el botón existe, así que acá sólo hay botones sobre notas propias.
  contenedor().querySelectorAll('[data-nota]').forEach((boton) => {
    boton.addEventListener('click', () => confirmarEnHoja({
      titulo: 'Borrar la nota',
      texto: 'Se borra tu nota del ejercicio. No se puede deshacer.',
      verbo: 'Borrar',
      alConfirmar: async () => {
        try {
          await borrarNota(club.id, boton.dataset.nota);
        } catch (e) {
          // La garantía es la policy de 0015, no el esMio() de acá: si dos
          // pestañas del mismo profe borran distinto, esto puede llegar igual.
          toast(e?.message === 'NO_ES_TUYO'
            ? 'Esta nota ya no es tuya: no se puede borrar.'
            : (textoDeError(e, 'No se pudo borrar la nota.')));
          return;
        }
        toast('Nota borrada');
        await renderEjercicio();
      },
    }));
  });

  // Comodidad, no garantía: la garantía de editar/borrar sólo lo propio es
  // la policy RLS de 0015. Estos botones ni existen si no es tuyo.
  if (propio) {
    $('btn-ej-editar').addEventListener('click', () => {
      // abrirAltaEjercicio (ejercicios.js) siempre refresca SU lista al
      // guardar, nunca este detalle: sin el alCerrar de hoja.js, después de
      // editar quedarían el título y el tema viejos en pantalla hasta salir
      // y volver a entrar. renderEjercicio() es sólo una relectura, así que
      // dispararla también al cancelar no rompe nada.
      abrirAltaEjercicio(ejercicio, () => { renderEjercicio(); });
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

  contenedor().innerHTML = `<div class="pad"><div class="p" role="status">Cargando ejercicio…</div></div>`;

  let ejercicio, notas, variaciones;
  try {
    // cargarPerfiles junto con la lectura: sin nombres, el autor de cada
    // nota sería un UUID. Mismo patrón que renderSeccionEjercicios.
    [, ejercicio, notas, variaciones] = await Promise.all([
      cargarPerfiles(club.id),
      obtenerEjercicio(club.id, ejercicioId),
      obtenerNotas(club.id, ejercicioId),
      obtenerVariaciones(club.id, ejercicioId),
    ]);
  } catch (e) {
    contenedor().innerHTML = avisoDeError(e, 'No se pudo cargar el ejercicio.');
    return;
  }

  if (!ejercicio) {
    contenedor().innerHTML = `<div class="pad"><div class="p">Este ejercicio ya no existe.</div></div>`;
    return;
  }

  pintarEjercicio(club, ejercicio, notas, ordenarVariaciones(variaciones));
}

/* ---------- Variaciones ---------- */

/*
 * Cómo subirle la complejidad al ejercicio, de la más fácil a la más difícil.
 * Cualquier profe suma una sobre un ejercicio ajeno (lo que sabe uno le sirve
 * al resto); editar y borrar es sólo de quien la cargó, y lo garantiza la
 * policy de 0052, no el esMio() que decide si se ven los botones.
 */
function variacionHtml(v) {
  return html`
    <div class="variacion">
      <div class="niv"><span class="k">Nivel</span><span class="n">${v.nivel}</span></div>
      <div class="cuerpo">
        <div class="tit">${v.titulo}</div>
        ${v.descripcion && html`<div class="tx texto-libre">${v.descripcion}</div>`}
        <div class="meta">
          ${v.eje && html`<span class="chip">${nombreDeEje(v.eje)}</span>`}
          <span class="autor">${nombreDe(v.creadoPor)}</span>
          ${esMio(v.creadoPor) && html`
            <button class="nota-borrar" data-editar-variacion="${v.id}" aria-label="Editar esta variación">&#9998;</button>
            <button class="nota-borrar" data-borrar-variacion="${v.id}" aria-label="Borrar esta variación">&#10005;</button>
          `}
        </div>
      </div>
    </div>
  `;
}

function bloqueVariaciones(variaciones) {
  if (!variaciones.length) {
    return html`<div class="p">Todavía no hay variaciones. ¿Cómo le subís la dificultad? Con un defensor, menos espacio, un límite de tiempo… Sumá la primera.</div>`;
  }
  return html`<div class="variaciones">${variaciones.map(variacionHtml)}</div>`;
}

function cablearVariaciones(club, ejercicio, variaciones) {
  contenedor().querySelectorAll('[data-editar-variacion]').forEach((boton) => {
    const variacion = variaciones.find((v) => v.id === boton.dataset.editarVariacion);
    boton.addEventListener('click', () => abrirFormVariacion(club, ejercicio, variaciones, variacion));
  });
  contenedor().querySelectorAll('[data-borrar-variacion]').forEach((boton) => {
    const variacion = variaciones.find((v) => v.id === boton.dataset.borrarVariacion);
    boton.addEventListener('click', () => confirmarEnHoja({
      titulo: 'Borrar la variación',
      texto: `Se borra la variación "${variacion?.titulo ?? ''}". No se puede deshacer.`,
      verbo: 'Borrar',
      alConfirmar: async () => {
        try {
          await borrarVariacion(club.id, boton.dataset.borrarVariacion);
        } catch (e) {
          toast(mensajeAlGuardar(e, {
            reglas: [[/NO_ES_TUYO/, 'Esta variación ya no es tuya: no se puede borrar.']],
            generico: 'No se pudo borrar la variación.',
          }));
          return;
        }
        toast('Variación borrada');
        await renderEjercicio();
      },
    }));
  });
}

/** Chips que se comportan como radio. Con `opcional`, tocar el prendido lo apaga. */
function cablearChips(grupo, opcional) {
  const chips = grupo.querySelectorAll('.chip-tema');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const prender = !(opcional && chip.classList.contains('on'));
      chips.forEach((c) => {
        const on = c === chip && prender;
        c.classList.toggle('on', on);
        c.setAttribute('aria-pressed', String(on));
      });
    });
  });
}

async function abrirFormVariacion(club, ejercicio, variaciones, previa = null) {
  // asegurarNombre ANTES de abrir la hoja: mismo motivo que abrirAgregarNota.
  const hayNombre = await asegurarNombre(club.id);
  if (!hayNombre) return;

  const nivel = previa?.nivel ?? nivelSugerido(variaciones);
  const niveles = Array.from({ length: NIVEL.max - NIVEL.min + 1 }, (_, i) => NIVEL.min + i);
  abrirHoja({
    titulo: previa ? 'Editar la variación' : 'Sumar una variación',
    cuerpo: html`
      <div class="campo">
        <label for="in-var-titulo">Qué cambia</label>
        <input id="in-var-titulo" type="text" maxlength="${LIMITE.titulo}" value="${previa?.titulo ?? ''}" placeholder="Ej.: con un defensor que sólo acompaña">
      </div>
      <div class="campo">
        <label id="lbl-var-nivel">Nivel</label>
        <div class="chips-tema" id="var-chips-nivel" role="group" aria-labelledby="lbl-var-nivel">
          ${niveles.map((n) => html`<button type="button" class="chip-tema mono ${n === nivel ? 'on' : ''}" aria-pressed="${n === nivel}" data-nivel="${n}">${n}</button>`)}
        </div>
        <div class="ayuda">1 es la más fácil. Te sugerimos el que sigue a las que ya hay.</div>
      </div>
      <div class="campo">
        <label id="lbl-var-eje">Qué se ajusta (opcional)</label>
        <div class="chips-tema" id="var-chips-eje" role="group" aria-labelledby="lbl-var-eje">
          ${EJES.map((e) => html`<button type="button" class="chip-tema ${previa?.eje === e.id ? 'on' : ''}" aria-pressed="${previa?.eje === e.id}" data-eje="${e.id}">${e.nombre}</button>`)}
        </div>
      </div>
      <div class="campo">
        <label for="in-var-descripcion">Cómo se hace (opcional)</label>
        <textarea id="in-var-descripcion" rows="4" maxlength="${LIMITE.descripcion}" placeholder="Ej.: el defensor no roba, sólo acompaña. Cuando la sacan bien tres veces seguidas, defiende de verdad.">${previa?.descripcion ?? ''}</textarea>
      </div>
      <div id="var-aviso"></div>
      <button class="btn" id="btn-guardar-variacion">Guardar la variación</button>
    `,
  });
  cablearChips($('var-chips-nivel'), false);
  cablearChips($('var-chips-eje'), true);
  $('in-var-titulo').focus();
  $('btn-guardar-variacion').addEventListener('click', () => confirmarVariacion(club, ejercicio, previa));
}

async function confirmarVariacion(club, ejercicio, previa) {
  const boton = $('btn-guardar-variacion');
  if (boton.disabled) return;

  // Como en las notas, el texto va tal cual lo escribió el profe.
  const campos = {
    titulo: $('in-var-titulo').value,
    nivel: Number($('var-chips-nivel').querySelector('.chip-tema.on')?.dataset.nivel),
    eje: $('var-chips-eje').querySelector('.chip-tema.on')?.dataset.eje ?? null,
    descripcion: $('in-var-descripcion').value,
  };
  const { ok, errores } = validarVariacion(campos);
  if (!ok) {
    $('var-aviso').innerHTML = html`<div class="al"><div class="tx">${errores[0]}</div></div>`;
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Guardando...';
  $('var-aviso').innerHTML = '';
  try {
    if (previa) await actualizarVariacion(club.id, previa.id, campos);
    else await crearVariacion({ clubId: club.id, ejercicioId: ejercicio.id, ...campos });
  } catch (e) {
    $('var-aviso').innerHTML = html`<div class="al"><div class="tx">${mensajeAlGuardar(e, {
      reglas: [[/NO_ES_TUYO/, 'Esta variación ya no es tuya: no se puede editar.']],
      generico: 'No se pudo guardar la variación.',
    })}</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Guardar la variación';
    return;
  }

  cerrarHoja();
  toast(previa ? 'Variación actualizada' : 'Variación sumada');
  await renderEjercicio();
}

/* ---------- Agregar una nota de uso ---------- */

async function abrirAgregarNota(club, ejercicio) {
  // asegurarNombre ANTES de abrir la hoja: mismo motivo que abrirAltaEjercicio
  // en ejercicios.js — #hoja es única en toda la app (hoja.js), y si se
  // abriera primero, la hoja del nombre pisaría este formulario con
  // innerHTML apenas el profe empezara a escribir la nota.
  const hayNombre = await asegurarNombre(club.id);
  if (!hayNombre) return;

  abrirHoja({
    titulo: 'Agregar una nota',
    cuerpo: html`
      <div class="campo">
        <label for="in-nota-texto">Qué pasó al usarlo</label>
        <textarea id="in-nota-texto" rows="4" maxlength="${LIMITE.nota}" placeholder="Ej.: con los de mini no funcionó hasta que achiqué la cancha"></textarea>
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

  boton.disabled = true;
  boton.textContent = 'Guardando...';
  $('nota-aviso').innerHTML = '';
  try {
    await crearNota({ clubId: club.id, ejercicioId: ejercicio.id, texto });
  } catch (e) {
    $('nota-aviso').innerHTML = html`<div class="al"><div class="tx">${
      textoDeError(e, 'No se pudo guardar la nota.')
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
 * Borrar pide confirmación porque es irreversible y porque se lleva puestas
 * las notas de OTROS profes por el `on delete cascade` de la FK de 0015: el
 * texto lo tiene que decir, no alcanza con "¿seguro?".
 */
function confirmarBorrado(club, ejercicio) {
  abrirHoja({
    titulo: 'Borrar este ejercicio',
    cuerpo: html`
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
      $('borrado-ej-aviso').innerHTML = html`<div class="al"><div class="tx">${
        e?.message === 'NO_ES_TUYO'
          ? 'Este ejercicio ya no es tuyo: no se puede borrar.'
          : (textoDeError(e, 'No se pudo borrar el ejercicio.'))
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
