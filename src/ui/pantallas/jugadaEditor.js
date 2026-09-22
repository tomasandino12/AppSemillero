/*
 * Editor de jugadas (compu o tablet): cancha interactiva con Pointer Events,
 * deshacer/rehacer y guardado. El estado vive acá como una pila de snapshots
 * de `datos` (el JSON es chico, ≤64KB): deshacer es simplemente mirar el
 * snapshot anterior, sin diffs ni comandos inversos.
 */
import { obtenerJugada, guardarJugada } from '../../data/repositorio.js';
import {
  pantallaAptaParaEditar, estadoAlInicioDelPaso, aplicarAccion, proximoNumeroLibre,
  agregarFicha, quitarFicha, moverFicha, quitarAccion, fijarControlDeAccion, ajustarFicha,
  agregarPaso, quitarPaso, fijarNotaDePaso, nosotrosDefiende,
} from '../../data/jugadas.js';
import {
  dibujarPizarra, puntoDesdeEvento, fichaEnPunto, resaltoDeFicha, puntoDeControl, asaDeControl,
} from '../componentes/pizarra.js';
import { montarVisor } from '../componentes/visorJugada.js';
import { barraDeHerramientasHtml, panelDePasosHtml, cabeceraEditorHtml } from './jugadaEditorHerramientas.js';
import { jugadaParaEditorActual } from './jugadas.js';
import { obtenerClubActual } from '../sesion.js';
import { LIMITE } from '../../data/limites.js';
import { html } from '../html.js';
import { toast } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { volver, pantallaActualId } from '../main.js';
import { $ } from '../dom.js';
import { avisoDeError, textoDeError } from '../errores.js';

const contenedor = () => $('jugada-editor-contenido');

let club = null;
let jugadaMeta = null; // { id, nombre, tipo }: lo único de la jugada que este editor no toca.

let historial = [];
let indiceHistorial = -1;
let indiceGuardado = -1;

let pasoActual = 0;
let herramienta = 'seleccionar';
let seleccion = null; // { tipo: 'ficha', id } | { tipo: 'accion', indice }
let origenAccion = null; // ficha ya tocada, a la espera del segundo toque de una herramienta de acción
let arrastre = null; // { tipo: 'ficha'|'control', id?, datosBase, ultimaVista? }
let visorAnimacion = null;

const datosActuales = () => historial[indiceHistorial];

function empujarHistorial(nuevos) {
  historial = historial.slice(0, indiceHistorial + 1);
  historial.push(nuevos);
  if (historial.length > 50) {
    historial.shift();
    indiceGuardado -= 1; // si el guardado quedó fuera de la pila, ya no hay vuelta posible: sucio() sigue en true.
  }
  indiceHistorial = historial.length - 1;
}

/** Aplica una función pura de src/data/jugadas.js; si tira (regla inválida), un toast y no cambia nada. */
function aplicarCambio(fn) {
  try {
    empujarHistorial(fn(datosActuales()));
    return true;
  } catch (e) {
    toast(e.message || 'No se pudo aplicar el cambio.');
    return false;
  }
}

function deshacer() {
  if (indiceHistorial <= 0) return;
  indiceHistorial -= 1;
  seleccion = null;
  origenAccion = null;
  render();
}

function rehacer() {
  if (indiceHistorial >= historial.length - 1) return;
  indiceHistorial += 1;
  seleccion = null;
  origenAccion = null;
  render();
}

function borrarSeleccion() {
  if (!seleccion) return;
  if (seleccion.tipo === 'ficha') aplicarCambio((d) => quitarFicha(d, seleccion.id));
  else aplicarCambio((d) => quitarAccion(d, pasoActual, seleccion.indice));
  seleccion = null;
  render();
}

/* ---------- Dibujo ---------- */

function pintarCancha(datos) {
  const svg = $('jed-svg');
  if (!svg) return;
  const estado = estadoAlInicioDelPaso(datos, pasoActual);
  dibujarPizarra(svg, datos, estado, {
    paso: pasoActual < datos.pasos.length ? pasoActual : undefined,
    nosotrosDefiende: nosotrosDefiende(jugadaMeta.tipo),
  });
  if (origenAccion) {
    svg.insertAdjacentHTML('beforeend', resaltoDeFicha(datos, estado, origenAccion));
  } else if (seleccion?.tipo === 'ficha') {
    svg.insertAdjacentHTML('beforeend', resaltoDeFicha(datos, estado, seleccion.id));
  } else if (seleccion?.tipo === 'accion') {
    const punto = puntoDeControl(datos, pasoActual, seleccion.indice);
    if (punto) svg.insertAdjacentHTML('beforeend', asaDeControl(datos, punto));
  }
}

function actualizarBeforeUnload() {
  window.onbeforeunload = indiceHistorial === indiceGuardado ? null : () => '';
}

function render() {
  const datos = datosActuales();
  contenedor().innerHTML = html`
    <div class="jed">
      ${cabeceraEditorHtml(jugadaMeta.nombre)}
      ${barraDeHerramientasHtml({
        herramienta,
        puedeDeshacer: indiceHistorial > 0,
        puedeRehacer: indiceHistorial < historial.length - 1,
        hayPasos: datos.pasos.length > 0,
        puedeAgregar: pasoActual === 0,
      })}
      <div class="jed-cuerpo">
        <div class="jed-cancha"><svg class="pz" id="jed-svg" role="img" aria-label="Pizarra táctica"></svg></div>
        ${panelDePasosHtml(datos, pasoActual)}
      </div>
    </div>
  `;
  pintarCancha(datos);
  cablearHerramientas();
  cablearPasos();
  cablearPuntero();
  actualizarBeforeUnload();
}

/* ---------- Herramientas ---------- */

function cablearHerramientas() {
  contenedor().querySelectorAll('[data-herramienta]').forEach((b) => {
    b.addEventListener('click', () => {
      herramienta = b.dataset.herramienta;
      origenAccion = null;
      seleccion = null;
      render();
    });
  });
  contenedor().querySelectorAll('[data-agregar]').forEach((b) => {
    b.addEventListener('click', () => agregarNuevaFicha(b.dataset.agregar));
  });
  $('btn-jed-deshacer').addEventListener('click', deshacer);
  $('btn-jed-rehacer').addEventListener('click', rehacer);
  $('btn-jed-ver-animacion')?.addEventListener('click', abrirAnimacion);
  $('btn-jed-volver').addEventListener('click', pedirSalir);
  $('btn-jed-guardar').addEventListener('click', guardar);
  $('btn-jed-renombrar').addEventListener('click', abrirRenombrar);
}

function agregarNuevaFicha(tipo) {
  if (pasoActual !== 0) {
    toast('Las fichas se suman en la formación inicial (paso 1).');
    return;
  }
  const datos = datosActuales();
  const n = datos.fichas.length;
  const ficha = {
    id: crypto.randomUUID(),
    tipo,
    x: Math.min(0.92, Math.max(0.08, 0.5 + ((n % 6) - 2.5) * 0.08)),
    y: 0.95,
    numero: tipo === 'cono' ? null : proximoNumeroLibre(datos, tipo),
  };
  aplicarCambio((d) => agregarFicha(d, ficha));
  render();
}

/* ---------- Pasos ---------- */

function cablearPasos() {
  $('btn-jed-paso-nuevo').addEventListener('click', () => {
    if (aplicarCambio((d) => agregarPaso(d))) pasoActual = datosActuales().pasos.length - 1;
    seleccion = null;
    origenAccion = null;
    render();
  });
  $('btn-jed-paso-anterior')?.addEventListener('click', () => cambiarPaso(pasoActual - 1));
  $('btn-jed-paso-siguiente')?.addEventListener('click', () => cambiarPaso(pasoActual + 1));
  $('btn-jed-paso-borrar')?.addEventListener('click', () => {
    if (aplicarCambio((d) => quitarPaso(d, pasoActual))) {
      pasoActual = Math.min(pasoActual, Math.max(0, datosActuales().pasos.length - 1));
    }
    seleccion = null;
    origenAccion = null;
    render();
  });
  $('jed-nota')?.addEventListener('change', (e) => aplicarCambio((d) => fijarNotaDePaso(d, pasoActual, e.target.value)));
}

function cambiarPaso(nuevo) {
  const total = datosActuales().pasos.length;
  pasoActual = Math.max(0, Math.min(total - 1, nuevo));
  seleccion = null;
  origenAccion = null;
  render();
}

/* ---------- Pointer Events: seleccionar/arrastrar y las herramientas de acción ---------- */

function cablearPuntero() {
  const svg = $('jed-svg');
  svg.addEventListener('pointerdown', alPunteroBajar);
  svg.addEventListener('pointermove', alPunteroMover);
  svg.addEventListener('pointerup', alPunteroSoltar);
  svg.addEventListener('pointercancel', alPunteroSoltar);
}

function completarAccion(accion) {
  // La acción recién creada queda seleccionada, con el asa lista para curvarla en el mismo gesto.
  seleccion = aplicarCambio((d) => aplicarAccion(d, pasoActual, accion))
    ? { tipo: 'accion', indice: datosActuales().pasos[pasoActual].acciones.length - 1 }
    : null;
  origenAccion = null;
  render();
}

function alPunteroBajar(evento) {
  const svg = $('jed-svg');
  const datos = datosActuales();
  const punto = puntoDesdeEvento(svg, datos, evento);
  const estado = estadoAlInicioDelPaso(datos, pasoActual);
  const fichaId = evento.target.closest('[data-ficha-id]')?.dataset.fichaId
    ?? fichaEnPunto(datos, estado, punto.xSvg, punto.ySvg);

  // El asa manda sobre cualquier herramienta: la acción recién creada se
  // curva en el momento, sin pasar por "Seleccionar".
  if (evento.target.closest('.pz-asa') && seleccion?.tipo === 'accion') {
    svg.setPointerCapture(evento.pointerId);
    arrastre = { tipo: 'control', datosBase: datos };
    return;
  }

  if (herramienta === 'seleccionar') {
    if (fichaId) {
      seleccion = { tipo: 'ficha', id: fichaId };
      svg.setPointerCapture(evento.pointerId);
      arrastre = { tipo: 'ficha', id: fichaId, datosBase: datos };
      render();
      return;
    }
    const indiceAttr = evento.target.closest('[data-accion-indice]')?.dataset.accionIndice;
    seleccion = indiceAttr != null ? { tipo: 'accion', indice: Number(indiceAttr) } : null;
    render();
    return;
  }

  // Las seis herramientas de acción: primer toque el origen, segundo el destino
  // (o quien recibe, en pase y handoff). El tiro no necesita segundo toque.
  if (!origenAccion) {
    seleccion = null; // encadenar: el asa de la acción anterior se va apenas se arranca la siguiente.
    if (!fichaId) { toast('Tocá primero la ficha que hace la acción.'); render(); return; }
    origenAccion = fichaId;
    if (herramienta === 'tiro') completarAccion({ tipo: 'tiro', ficha: fichaId });
    else render();
    return;
  }
  if (herramienta === 'pase' || herramienta === 'handoff') {
    if (!fichaId || fichaId === origenAccion) { toast('Tocá a quién le pasa o entrega.'); return; }
    completarAccion({ tipo: herramienta, ficha: origenAccion, a: fichaId });
    return;
  }
  completarAccion({ tipo: herramienta, ficha: origenAccion, hasta: { x: punto.x, y: punto.y } });
}

function alPunteroMover(evento) {
  if (!arrastre) return;
  const svg = $('jed-svg');
  const punto = puntoDesdeEvento(svg, arrastre.datosBase, evento);
  let vista;
  try {
    vista = arrastre.tipo === 'ficha'
      ? (pasoActual === 0
        ? moverFicha(arrastre.datosBase, arrastre.id, punto.x, punto.y)
        : ajustarFicha(arrastre.datosBase, pasoActual, arrastre.id, punto.x, punto.y))
      : fijarControlDeAccion(arrastre.datosBase, pasoActual, seleccion.indice, { x: punto.x, y: punto.y });
  } catch {
    return; // un punto momentáneamente fuera de rango no aborta el arrastre: se recorta y sigue.
  }
  arrastre.ultimaVista = vista;
  pintarCancha(vista);
}

function alPunteroSoltar(evento) {
  if (!arrastre) return;
  const svg = $('jed-svg');
  try { svg.releasePointerCapture(evento.pointerId); } catch { /* ya liberado */ }
  const vistaFinal = arrastre.ultimaVista;
  arrastre = null;
  // Un solo estado en el historial por arrastre completo, no uno por cuadro de movimiento.
  if (vistaFinal) empujarHistorial(vistaFinal);
  render();
}

/* ---------- Renombrar ---------- */

function abrirRenombrar() {
  abrirHoja({
    titulo: 'Renombrar jugada',
    cuerpo: html`
      <div class="campo"><label for="in-jed-renombrar">Nombre</label>
        <input id="in-jed-renombrar" type="text" maxlength="${LIMITE.titulo}" autocomplete="off" value="${jugadaMeta.nombre}"></div>
      <div id="jed-renombrar-aviso"></div>
      <button class="btn" id="btn-jed-renombrar-guardar">Guardar</button>
    `,
  });
  $('in-jed-renombrar').focus();
  $('in-jed-renombrar').select();
  $('btn-jed-renombrar-guardar').addEventListener('click', confirmarRenombrar);
  $('in-jed-renombrar').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarRenombrar(); });
}

async function confirmarRenombrar() {
  const boton = $('btn-jed-renombrar-guardar');
  if (boton.disabled) return;
  const nombre = $('in-jed-renombrar').value.trim();
  if (!nombre) {
    $('jed-renombrar-aviso').innerHTML = html`<div class="al"><div class="tx">Poné un nombre.</div></div>`;
    return;
  }
  boton.disabled = true;
  boton.textContent = 'Guardando...';
  try {
    await guardarJugada(club.id, jugadaMeta.id, { nombre, tipo: jugadaMeta.tipo, datos: datosActuales() });
  } catch (e) {
    $('jed-renombrar-aviso').innerHTML = html`<div class="al"><div class="tx">${textoDeError(e, 'No se pudo renombrar.')}</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Guardar';
    return;
  }
  jugadaMeta.nombre = nombre;
  cerrarHoja();
  toast('Nombre actualizado');
  const nom = $('jed-cab-nombre');
  if (nom) nom.textContent = jugadaMeta.nombre;
}

/* ---------- Ver animación, guardar y salir ---------- */

function abrirAnimacion() {
  abrirHoja({
    titulo: 'Animación',
    cuerpo: html`<div id="jed-visor-modal"></div>`,
    alCerrar: () => { visorAnimacion?.desmontar(); visorAnimacion = null; },
  });
  visorAnimacion = montarVisor($('jed-visor-modal'), datosActuales(), nosotrosDefiende(jugadaMeta.tipo));
}

async function guardar() {
  const boton = $('btn-jed-guardar');
  if (boton.disabled) return;
  boton.disabled = true;
  boton.textContent = 'Guardando...';
  try {
    await guardarJugada(club.id, jugadaMeta.id, { nombre: jugadaMeta.nombre, tipo: jugadaMeta.tipo, datos: datosActuales() });
  } catch (e) {
    toast(e?.message === 'NO_ES_TUYA' ? 'Esta jugada ya no es tuya: no se puede guardar.' : textoDeError(e, 'No se pudo guardar.'));
    boton.disabled = false;
    boton.textContent = 'Guardar';
    return;
  }
  indiceGuardado = indiceHistorial;
  actualizarBeforeUnload();
  toast('Guardado');
  boton.disabled = false;
  boton.textContent = 'Guardar';
}

function salir() {
  window.onbeforeunload = null;
  volver();
}

function pedirSalir() {
  if (indiceHistorial === indiceGuardado) { salir(); return; }
  abrirHoja({
    titulo: 'Salir sin guardar',
    cuerpo: html`
      <div class="al"><div class="tx">Tenés cambios sin guardar. Si salís ahora se pierden.</div></div>
      <button class="btn" id="btn-jed-salir-igual">Salir sin guardar</button>
      <button class="btn sec" id="btn-jed-seguir">Seguir editando</button>
    `,
  });
  $('btn-jed-salir-igual').addEventListener('click', () => { cerrarHoja(); salir(); });
  $('btn-jed-seguir').addEventListener('click', cerrarHoja);
}

/* ---------- Entrada de la pantalla ---------- */

export async function renderJugadaEditor() {
  club = obtenerClubActual();
  const id = jugadaParaEditorActual();
  if (!club || !id) {
    contenedor().innerHTML = html`<div class="pad"><div class="p">No hay una jugada para editar.</div></div>`;
    return;
  }

  if (!pantallaAptaParaEditar(window.innerWidth, window.innerHeight)) {
    contenedor().innerHTML = html`
      <div class="pad">
        <div class="p">El editor de jugadas es para compu o tablet. Desde la biblioteca podés verla, asignarla y duplicarla.</div>
        <button class="btn sec" id="btn-jed-volver-chico">Volver</button>
      </div>
    `;
    $('btn-jed-volver-chico').addEventListener('click', () => volver());
    return;
  }

  contenedor().innerHTML = html`<div class="pad"><div class="p">Cargando jugada...</div></div>`;
  let jugada;
  try {
    jugada = await obtenerJugada(club.id, id);
  } catch (e) {
    contenedor().innerHTML = avisoDeError(e, 'No se pudo cargar la jugada.');
    return;
  }
  if (!jugada) {
    contenedor().innerHTML = html`<div class="pad"><div class="p">Esta jugada ya no existe.</div></div>`;
    return;
  }

  jugadaMeta = { id: jugada.id, nombre: jugada.nombre, tipo: jugada.tipo };
  historial = [jugada.datos];
  indiceHistorial = 0;
  indiceGuardado = 0;
  pasoActual = 0;
  herramienta = 'seleccionar';
  seleccion = null;
  origenAccion = null;
  arrastre = null;

  render();
}

/** Atajos de teclado, sólo mientras esta pantalla está activa. Se registra una vez, en registro.js. */
export function iniciarJugadaEditor() {
  document.addEventListener('keydown', (e) => {
    if (pantallaActualId() !== 'p-jugada-editor') return;
    const enCampoDeTexto = ['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName);
    if ((e.key === 'Delete' || e.key === 'Backspace') && !enCampoDeTexto) {
      e.preventDefault();
      borrarSeleccion();
      return;
    }
    const tecla = e.key.toLowerCase();
    if (e.ctrlKey && !e.shiftKey && tecla === 'z') { e.preventDefault(); deshacer(); return; }
    if (e.ctrlKey && ((e.shiftKey && tecla === 'z') || tecla === 'y')) { e.preventDefault(); rehacer(); }
  });
}
