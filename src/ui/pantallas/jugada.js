/*
 * Detalle de una jugada: el visor y sus acciones (editar, duplicar, asignar,
 * borrar). Editar y borrar son sólo comodidad: la garantía de "sólo el autor"
 * la impone la policy RLS de 0035, no el esMia de acá.
 */
import {
  obtenerJugada, guardarJugada, borrarJugada, crearJugada, plantelesDeJugada, asignarJugada,
} from '../../data/repositorio.js';
import { etiquetaDeTipo, duplicarDatos } from '../../data/jugadas.js';
import { LIMITE } from '../../data/limites.js';
import { obtenerClubActual, obtenerPlanteles } from '../sesion.js';
import { nombreDe } from '../perfil.js';
import { html } from '../html.js';
import { toast } from '../nav.js';
import { montarVisor } from '../componentes/visorJugada.js';
import { descargarPaso, imprimirJugada } from '../componentes/exportarJugada.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { abrirEditorDeJugada } from './jugadas.js';
import { ir, volver } from '../main.js';
import { $ } from '../dom.js';
import { avisoDeError, textoDeError } from '../errores.js';

const contenedor = () => $('jugada-contenido');

let jugadaId = null;
// El visor corre un requestAnimationFrame propio: sin desmontarlo antes de
// pintar el siguiente, quedaría animando una pizarra que ya no se ve (task 6).
let visorActual = null;

export function abrirJugada(id) {
  jugadaId = id;
  ir('p-jugada', { push: true });
}

function pintarJugada(club, jugada) {
  visorActual?.desmontar();
  contenedor().innerHTML = html`
    <div class="ficha-top">
      <div class="nom">${jugada.nombre}</div>
      <div class="sub">${etiquetaDeTipo(jugada.tipo)} · ${jugada.esMia ? 'Vos' : nombreDe(jugada.creadoPor)}</div>
    </div>
    <div class="pad">
      <div id="jugada-visor"></div>
      <div class="acciones-hoy">
        ${jugada.esMia ? html`<button class="btn sec" id="btn-jug-editar" type="button">Editar</button>` : ''}
        ${jugada.esMia ? html`<button class="btn sec" id="btn-jug-renombrar" type="button">Renombrar</button>` : ''}
        <button class="btn sec" id="btn-jug-duplicar" type="button">Duplicar</button>
        <button class="btn sec" id="btn-jug-asignar" type="button">Asignar a planteles</button>
        <button class="btn sec" id="btn-jug-descargar" type="button">Descargar paso</button>
        <button class="btn sec" id="btn-jug-imprimir" type="button">Imprimir</button>
        ${jugada.esMia ? html`<button class="btn sec" id="btn-jug-borrar" type="button">Borrar</button>` : ''}
      </div>
    </div>
  `;

  visorActual = montarVisor($('jugada-visor'), jugada.datos);

  if (jugada.esMia) {
    $('btn-jug-editar').addEventListener('click', () => abrirEditorDeJugada(jugada.id));
    $('btn-jug-renombrar').addEventListener('click', () => abrirRenombrar(club, jugada));
  }
  $('btn-jug-duplicar').addEventListener('click', () => duplicarJugada(club, jugada));
  $('btn-jug-asignar').addEventListener('click', () => abrirAsignacion(club, jugada));
  $('btn-jug-descargar').addEventListener('click', () => descargarPasoVisible(jugada));
  $('btn-jug-imprimir').addEventListener('click', () => imprimirJugada(jugada.datos, jugada.nombre));
  if (jugada.esMia) {
    $('btn-jug-borrar').addEventListener('click', () => confirmarBorrado(club, jugada));
  }
}

export async function renderJugada() {
  const club = obtenerClubActual();
  if (!club || !jugadaId) {
    contenedor().innerHTML = html`<div class="pad"><div class="p">No hay una jugada seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = html`<div class="pad"><div class="p">Cargando jugada...</div></div>`;

  let jugada;
  try {
    jugada = await obtenerJugada(club.id, jugadaId);
  } catch (e) {
    contenedor().innerHTML = avisoDeError(e, 'No se pudo cargar la jugada.');
    return;
  }

  if (!jugada) {
    contenedor().innerHTML = html`<div class="pad"><div class="p">Esta jugada ya no existe.</div></div>`;
    return;
  }

  pintarJugada(club, jugada);
}

/* ---------- Exportar: PNG del paso visible e impresión con todos ---------- */

async function descargarPasoVisible(jugada) {
  const svg = document.querySelector('#jugada-visor svg.pz');
  if (!svg || !visorActual) return;
  try {
    await descargarPaso(svg, { nombre: jugada.nombre, paso: visorActual.pasoActual(), totalPasos: jugada.datos.pasos.length });
  } catch (e) {
    toast(textoDeError(e, 'No se pudo generar la imagen.'));
  }
}

/* ---------- Duplicar: queda tuya, con el mismo tipo y contenido ---------- */

async function duplicarJugada(club, jugada) {
  const nombre = `Copia de ${jugada.nombre}`.slice(0, LIMITE.titulo);
  try {
    const id = await crearJugada({ clubId: club.id, nombre, tipo: jugada.tipo, datos: duplicarDatos(jugada.datos) });
    toast('Jugada duplicada');
    abrirJugada(id);
  } catch (e) {
    toast(textoDeError(e, 'No se pudo duplicar la jugada.'));
  }
}

/* ---------- Renombrar lo propio ---------- */

function abrirRenombrar(club, jugada) {
  abrirHoja({
    titulo: 'Renombrar jugada',
    cuerpo: html`
      <div class="campo"><label for="in-jug-renombrar">Nombre</label>
        <input id="in-jug-renombrar" type="text" maxlength="${LIMITE.titulo}" autocomplete="off" value="${jugada.nombre}"></div>
      <div id="jug-renombrar-aviso"></div>
      <button class="btn" id="btn-jug-renombrar-guardar">Guardar</button>
    `,
  });
  $('in-jug-renombrar').focus();
  $('in-jug-renombrar').select();
  $('btn-jug-renombrar-guardar').addEventListener('click', () => confirmarRenombrar(club, jugada));
  $('in-jug-renombrar').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarRenombrar(club, jugada); });
}

async function confirmarRenombrar(club, jugada) {
  const boton = $('btn-jug-renombrar-guardar');
  if (boton.disabled) return;
  const nombre = $('in-jug-renombrar').value.trim();
  if (!nombre) {
    $('jug-renombrar-aviso').innerHTML = html`<div class="al"><div class="tx">Poné un nombre.</div></div>`;
    return;
  }
  boton.disabled = true;
  boton.textContent = 'Guardando...';
  try {
    await guardarJugada(club.id, jugada.id, { nombre, tipo: jugada.tipo, datos: jugada.datos });
  } catch (e) {
    $('jug-renombrar-aviso').innerHTML = html`<div class="al"><div class="tx">${textoDeError(e, 'No se pudo renombrar.')}</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Guardar';
    return;
  }
  jugada.nombre = nombre;
  cerrarHoja();
  toast('Nombre actualizado');
  const nom = contenedor().querySelector('.nom');
  if (nom) nom.textContent = jugada.nombre;
}

/* ---------- Asignar a planteles propios ---------- */

async function abrirAsignacion(club, jugada) {
  const planteles = obtenerPlanteles();
  if (!planteles.length) {
    abrirHoja({ titulo: 'Asignar a planteles', cuerpo: html`<div class="p">No tenés planteles propios para asignarle esta jugada.</div>` });
    return;
  }

  abrirHoja({
    titulo: 'Asignar a planteles',
    cuerpo: html`
      <div class="p">El plantel entero la va a poder ver.</div>
      <div class="lista-chk" id="jug-asig-lista">
        ${planteles.map((p) => html`
          <label class="chk-fila">
            <input type="checkbox" class="chk-plantel" value="${p.id}">
            <span>${p.categoria}</span>
          </label>
        `)}
      </div>
      <div id="jug-asig-aviso"></div>
      <button class="btn" id="btn-jug-asig-guardar">Guardar</button>
    `,
  });

  let actuales;
  try {
    actuales = new Set(await plantelesDeJugada(club.id, jugada.id));
  } catch (e) {
    $('jug-asig-aviso').innerHTML = html`<div class="al"><div class="tx">${textoDeError(e, 'No se pudo leer la asignación actual.')}</div></div>`;
    actuales = new Set();
  }
  document.querySelectorAll('.chk-plantel').forEach((c) => { c.checked = actuales.has(c.value); });

  $('btn-jug-asig-guardar').addEventListener('click', async () => {
    const boton = $('btn-jug-asig-guardar');
    if (boton.disabled) return;
    const plantelIds = [...document.querySelectorAll('.chk-plantel:checked')].map((c) => c.value);
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    try {
      await asignarJugada(club.id, jugada.id, plantelIds);
    } catch (e) {
      $('jug-asig-aviso').innerHTML = html`<div class="al"><div class="tx">${textoDeError(e, 'No se pudo guardar la asignación.')}</div></div>`;
      boton.disabled = false;
      boton.textContent = 'Guardar';
      return;
    }
    cerrarHoja();
    toast('Asignación guardada');
  });
}

/* ---------- Borrar lo propio ---------- */

function confirmarBorrado(club, jugada) {
  abrirHoja({
    titulo: 'Borrar esta jugada',
    cuerpo: html`
      <div class="al"><div class="tx">Es para siempre: no se puede deshacer, y deja de verla cualquier plantel al que se la hayas asignado.</div></div>
      <div id="jug-borrado-aviso"></div>
      <button class="btn" id="btn-jug-confirmar-borrado">Borrar de todos modos</button>
      <button class="btn sec" id="btn-jug-cancelar-borrado">Cancelar</button>
    `,
  });
  $('btn-jug-cancelar-borrado').addEventListener('click', cerrarHoja);
  $('btn-jug-confirmar-borrado').addEventListener('click', async () => {
    const boton = $('btn-jug-confirmar-borrado');
    if (boton.disabled) return;
    boton.disabled = true;
    boton.textContent = 'Borrando...';
    try {
      await borrarJugada(club.id, jugada.id);
    } catch (e) {
      $('jug-borrado-aviso').innerHTML = html`<div class="al"><div class="tx">${
        e?.message === 'NO_ES_TUYA' ? 'Esta jugada ya no es tuya: no se puede borrar.' : textoDeError(e, 'No se pudo borrar la jugada.')
      }</div></div>`;
      boton.disabled = false;
      boton.textContent = 'Borrar de todos modos';
      return;
    }
    cerrarHoja();
    toast('Jugada borrada');
    await volver();
  });
}
