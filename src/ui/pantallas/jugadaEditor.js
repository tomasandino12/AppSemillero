/*
 * Editor de jugadas (compu o tablet): cancha interactiva con Pointer Events,
 * deshacer/rehacer y guardado. El estado vive acá como una pila de snapshots
 * de `datos` (el JSON es chico, ≤64KB): deshacer es simplemente mirar el
 * snapshot anterior, sin diffs ni comandos inversos.
 *
 * El mismo editor dibuja la pizarra de un ejercicio (`jugadaMeta.esEjercicio`):
 * los datos llevan `modo: 'ejercicio'`, las funciones genéricas de jugadas.js
 * validan con sus reglas, y sólo cambian las herramientas (fila, entrenador,
 * varias pelotas, rebote, rotación) y adónde se guarda.
 */
import {
  obtenerJugada, guardarJugada, obtenerEjercicio, guardarPizarraEjercicio,
} from '../../data/repositorio.js';
import {
  pantallaAptaParaEditar, estadoAlInicioDelPaso, aplicarAccion, proximoNumeroLibre,
  agregarFicha, quitarFicha, moverFicha, quitarAccion, fijarControlDeAccion, ajustarFicha, fijarDestinoDeAccion, tieneDestinoLibre,
  agregarPaso, quitarPaso, fijarNotaDePaso, nosotrosDefiende, resumenDePaso, darPelotaInicial,
} from '../../data/jugadas.js';
import {
  ejercicioVacio, validarEjercicio, agregarFichaEjercicio, quitarFichaEjercicio, alternarPelota,
  fijarCantidadDeFila, fijarRotacion, quitarRotacion,
} from '../../data/pizarraEjercicio.js';
import {
  dibujarPizarra, puntoDesdeEvento, fichaEnPunto, resaltoDeFicha, puntoDeControl, asaDeControl, asaDeDestino,
} from '../componentes/pizarra.js';
import { montarVisor } from '../componentes/visorJugada.js';
import { barraDeHerramientasHtml, panelDePasosHtml, cabeceraEditorHtml } from './jugadaEditorHerramientas.js';
import { jugadaParaEditorActual, ejercicioParaEditorActual } from './jugadas.js';
import { obtenerClubActual, obtenerCuenta } from '../sesion.js';
import { cargarPerfiles, esMio } from '../perfil.js';
import { LIMITE } from '../../data/limites.js';
import { html } from '../html.js';
import { toast } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { pistaUnaVez, conectarPista } from '../componentes/pista.js';
import { volver, pantallaActualId } from '../main.js';
import { $ } from '../dom.js';
import { avisoDeError, textoDeError } from '../errores.js';

const contenedor = () => $('jugada-editor-contenido');

let club = null;
let jugadaMeta = null; // { id, nombre, tipo, esEjercicio }: lo único que este editor no toca (en un ejercicio, el id es el del ejercicio).

let historial = [];
let indiceHistorial = -1;
let indiceGuardado = -1;

let pasoActual = 0;
let herramienta = 'seleccionar';
let seleccion = null; // { tipo: 'ficha', id } | { tipo: 'accion', indice } | { tipo: 'rotacion', indice }
let origenAccion = null; // ficha ya tocada, a la espera del segundo toque de una herramienta de acción
let arrastre = null; // { tipo: 'ficha'|'control'|'destino'|'rotacion', id?, datosBase, ultimaVista? }
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
  if (seleccion.tipo === 'ficha') aplicarCambio((d) => (jugadaMeta.esEjercicio ? quitarFichaEjercicio(d, seleccion.id) : quitarFicha(d, seleccion.id)));
  else if (seleccion.tipo === 'rotacion') aplicarCambio((d) => quitarRotacion(d, seleccion.indice));
  else aplicarCambio((d) => quitarAccion(d, pasoActual, seleccion.indice));
  seleccion = null;
  render();
}

/* ---------- Dibujo ---------- */

/** Con la herramienta Rotación se ve cómo terminó el último paso, que es de donde salen las flechas. */
const verFinal = () => herramienta === 'rotacion';

function estadoDeLaVista(datos) {
  return estadoAlInicioDelPaso(datos, verFinal() ? datos.pasos.length : pasoActual);
}

function pintarCancha(datos) {
  const svg = $('jed-svg');
  if (!svg) return;
  const estado = estadoDeLaVista(datos);
  dibujarPizarra(svg, datos, estado, {
    paso: !verFinal() && pasoActual < datos.pasos.length ? pasoActual : undefined,
    nosotrosDefiende: nosotrosDefiende(jugadaMeta.tipo),
    fantasmas: !verFinal(),
    rotacion: verFinal(),
  });
  if (origenAccion) {
    svg.insertAdjacentHTML('beforeend', resaltoDeFicha(datos, estado, origenAccion));
  } else if (seleccion?.tipo === 'ficha') {
    svg.insertAdjacentHTML('beforeend', resaltoDeFicha(datos, estado, seleccion.id));
  } else if (seleccion?.tipo === 'rotacion') {
    const destino = datos.rotacion?.[seleccion.indice]?.a;
    if (destino) svg.insertAdjacentHTML('beforeend', asaDeDestino(datos, destino));
  } else if (seleccion?.tipo === 'accion') {
    const accion = datos.pasos[pasoActual]?.acciones?.[seleccion.indice];
    // Un ajuste no tiene curva (no dibuja trazo): el asa de control no aplica.
    if (accion?.tipo !== 'ajuste') {
      const punto = puntoDeControl(datos, pasoActual, seleccion.indice);
      if (punto) svg.insertAdjacentHTML('beforeend', asaDeControl(datos, punto));
    }
    if (tieneDestinoLibre(accion)) svg.insertAdjacentHTML('beforeend', asaDeDestino(datos, accion.hasta));
  }
}

function actualizarBeforeUnload() {
  window.onbeforeunload = indiceHistorial === indiceGuardado ? null : () => '';
}

function render() {
  const datos = datosActuales();
  const fichaElegida = seleccion?.tipo === 'ficha' ? datos.fichas.find((f) => f.id === seleccion.id) : null;
  contenedor().innerHTML = html`
    <div class="jed">
      ${cabeceraEditorHtml({
        nombre: jugadaMeta.nombre,
        tipo: jugadaMeta.tipo,
        puedeDeshacer: indiceHistorial > 0,
        puedeRehacer: indiceHistorial < historial.length - 1,
        esEjercicio: jugadaMeta.esEjercicio,
      })}
      ${pistaUnaVez('jugada-editor', obtenerCuenta()?.id)}
      <div class="jed-cuerpo">
        ${barraDeHerramientasHtml({
          herramienta,
          hayPasos: datos.pasos.length > 0,
          puedeAgregar: pasoActual === 0,
          modo: jugadaMeta.esEjercicio ? 'ejercicio' : 'jugada',
          cantidadDeFila: fichaElegida?.tipo === 'fila' ? fichaElegida.cantidad : null,
        })}
        <div class="jed-cancha"><svg class="pz" id="jed-svg" role="img" aria-label="Pizarra táctica"></svg></div>
        ${panelDePasosHtml(datos, pasoActual)}
      </div>
    </div>
  `;
  pintarCancha(datos);
  conectarPista('jugada-editor', obtenerCuenta()?.id);
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
  $('btn-jed-volver').addEventListener('click', () => volver());
  $('btn-jed-guardar').addEventListener('click', guardar);
  $('btn-jed-renombrar')?.addEventListener('click', abrirRenombrar);
  contenedor().querySelectorAll('[data-fila-cantidad]').forEach((b) => {
    b.addEventListener('click', () => {
      const ficha = datosActuales().fichas.find((f) => f.id === seleccion?.id);
      if (ficha) aplicarCambio((d) => fijarCantidadDeFila(d, ficha.id, ficha.cantidad + Number(b.dataset.filaCantidad)));
      render();
    });
  });
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
    // En un ejercicio el número es opcional, y una fila o el entrenador no lo llevan.
    numero: ['ataque', 'defensa'].includes(tipo) ? proximoNumeroLibre(datos, tipo) : null,
  };
  if (tipo === 'fila') ficha.cantidad = 4;
  aplicarCambio((d) => (jugadaMeta.esEjercicio ? agregarFichaEjercicio(d, ficha) : agregarFicha(d, ficha)));
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
  $('jed-paso-lista')?.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-paso]');
    if (boton) cambiarPaso(Number(boton.dataset.paso));
  });
  $('btn-jed-paso-borrar')?.addEventListener('click', () => {
    if (aplicarCambio((d) => quitarPaso(d, pasoActual))) {
      pasoActual = Math.min(pasoActual, Math.max(0, datosActuales().pasos.length - 1));
    }
    seleccion = null;
    origenAccion = null;
    render();
  });
  $('btn-jed-ver-animacion')?.addEventListener('click', abrirAnimacion);
  // Sólo el título de este paso cambia en la lista: un render() completo acá
  // le haría perder el foco al textarea apenas el profe termina de escribir.
  $('jed-nota')?.addEventListener('change', (e) => {
    if (!aplicarCambio((d) => fijarNotaDePaso(d, pasoActual, e.target.value))) return;
    const { titulo } = resumenDePaso(datosActuales().pasos[pasoActual], pasoActual);
    const item = contenedor().querySelector(`[data-paso-titulo="${pasoActual}"]`);
    if (item) item.textContent = titulo;
  });
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
  const estado = estadoDeLaVista(datos);
  const fantasmaEl = evento.target.closest('.pz-fantasma');
  const fichaId = evento.target.closest('[data-ficha-id]')?.dataset.fichaId
    ?? fichaEnPunto(datos, estado, punto.xSvg, punto.ySvg);

  // Las asas mandan sobre cualquier herramienta: la acción recién creada se
  // curva o se estira en el momento, sin pasar por "Seleccionar".
  const asa = evento.target.closest('.pz-asa');
  if (asa && seleccion?.tipo === 'accion') {
    svg.setPointerCapture(evento.pointerId);
    arrastre = { tipo: asa.classList.contains('pz-asa-destino') ? 'destino' : 'control', datosBase: datos };
    return;
  }
  if (asa && seleccion?.tipo === 'rotacion') {
    svg.setPointerCapture(evento.pointerId);
    arrastre = { tipo: 'rotacion', datosBase: datos };
    return;
  }

  if (herramienta === 'seleccionar') {
    if (fantasmaEl) {
      // El fantasma se selecciona como la acción (el ajuste), no como la
      // ficha entera: Supr borra sólo el ajuste, no la ficha (borrarSeleccion).
      // El fantasma también lleva data-ficha-id (dibujarFicha), así que
      // fichaId ya es el de la ficha que ajusta: arrastrarlo llama a
      // ajustarFicha igual que arrastrar la ficha misma.
      seleccion = { tipo: 'accion', indice: Number(fantasmaEl.dataset.accionIndice) };
      svg.setPointerCapture(evento.pointerId);
      arrastre = { tipo: 'ficha', id: fichaId, datosBase: datos };
      render();
      return;
    }
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

  if (herramienta === 'pelota') {
    if (pasoActual !== 0) { toast('Quién arranca con la pelota se elige en la formación inicial (paso 1).'); return; }
    if (!fichaId) { toast(jugadaMeta.esEjercicio ? 'Tocá la ficha que arranca con una pelota.' : 'Tocá al atacante que arranca con la pelota.'); return; }
    if (jugadaMeta.esEjercicio) {
      // Cada ficha puede arrancar con la suya: tocar de nuevo a quien ya la tiene se la saca.
      aplicarCambio((d) => alternarPelota(d, fichaId));
      render();
      return;
    }
    // Tocar al que ya la tiene se la saca: así también se puede arrancar sin pelota.
    const nuevoDuenio = datos.pelota === fichaId ? null : fichaId;
    aplicarCambio((d) => darPelotaInicial(d, nuevoDuenio));
    render();
    return;
  }

  if (herramienta === 'rotacion') {
    alTocarConRotacion(datos, fichaId, punto, evento);
    return;
  }

  // Las seis herramientas de acción: primer toque el origen, segundo el destino
  // (o quien recibe, en pase y handoff). El tiro no necesita segundo toque.
  if (!origenAccion) {
    seleccion = null; // encadenar: el asa de la acción anterior se va apenas se arranca la siguiente.
    if (!fichaId) { toast('Tocá primero la ficha que hace la acción.'); render(); return; }
    origenAccion = fichaId;
    // El tiro y el rebote no necesitan segundo toque: uno sale al aro, el otro lo agarra.
    if (herramienta === 'tiro' || herramienta === 'rebote') completarAccion({ tipo: herramienta, ficha: fichaId });
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

/**
 * La rotación: primer toque la ficha que rota, segundo toque adónde va (si cae
 * sobre una fila, se suma a ella). Tocar una flecha la elige, para arrastrarle
 * la punta o borrarla con Supr.
 */
function alTocarConRotacion(datos, fichaId, punto, evento) {
  const indiceAttr = evento.target.closest('[data-rotacion-indice]')?.dataset.rotacionIndice;
  if (!origenAccion && indiceAttr != null) {
    seleccion = { tipo: 'rotacion', indice: Number(indiceAttr) };
    render();
    return;
  }
  if (!origenAccion) {
    seleccion = null;
    if (!fichaId) { toast('Tocá primero la ficha que rota.'); render(); return; }
    origenAccion = fichaId;
    render();
    return;
  }
  const fila = fichaId && fichaId !== origenAccion ? datos.fichas.find((f) => f.id === fichaId && f.tipo === 'fila') : null;
  const destino = fila ? { x: fila.x, y: fila.y } : { x: punto.x, y: punto.y };
  const origen = origenAccion;
  origenAccion = null;
  seleccion = aplicarCambio((d) => fijarRotacion(d, origen, destino))
    ? { tipo: 'rotacion', indice: datosActuales().rotacion.findIndex((r) => r.ficha === origen) }
    : null;
  render();
}

function alPunteroMover(evento) {
  if (!arrastre) return;
  const svg = $('jed-svg');
  const punto = puntoDesdeEvento(svg, arrastre.datosBase, evento);
  const hasta = { x: punto.x, y: punto.y };
  let vista;
  try {
    if (arrastre.tipo === 'ficha') {
      vista = pasoActual === 0
        ? moverFicha(arrastre.datosBase, arrastre.id, punto.x, punto.y)
        : ajustarFicha(arrastre.datosBase, pasoActual, arrastre.id, punto.x, punto.y);
    } else if (arrastre.tipo === 'rotacion') {
      vista = fijarRotacion(arrastre.datosBase, arrastre.datosBase.rotacion[seleccion.indice].ficha, hasta);
    } else if (arrastre.tipo === 'destino') {
      vista = fijarDestinoDeAccion(arrastre.datosBase, pasoActual, seleccion.indice, hasta);
    } else {
      vista = fijarControlDeAccion(arrastre.datosBase, pasoActual, seleccion.indice, hasta);
    }
  } catch (e) {
    // puntoDesdeEvento ya recorta x/y a la cancha, así que esto es una regla
    // real rechazada, no un punto momentáneamente afuera: se avisa, pero una
    // sola vez por arrastre (si no, el toast se reescribiría en cada cuadro).
    if (!arrastre.avisoMostrado) {
      arrastre.avisoMostrado = true;
      toast(e.message || 'No se pudo mover.');
    }
    return;
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
    if (jugadaMeta.esEjercicio) await guardarPizarraEjercicio(club.id, jugadaMeta.id, datosActuales());
    else await guardarJugada(club.id, jugadaMeta.id, { nombre: jugadaMeta.nombre, tipo: jugadaMeta.tipo, datos: datosActuales() });
  } catch (e) {
    toast(e?.message === 'NO_ES_TUYA' ? 'Esta jugada ya no es tuya: no se puede guardar.'
      : e?.message === 'NO_ES_TUYO' ? 'Este ejercicio ya no es tuyo: no se puede guardar.'
        : textoDeError(e, 'No se pudo guardar.'));
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

/**
 * Con cambios sin guardar, salir (el botón, otra pestaña o Atrás del sistema)
 * pide confirmación: lo decide main.js con esto antes de irse. Atrás del
 * sistema es un popstate dentro del mismo documento, así que beforeunload no
 * lo ve.
 */
export function confirmarSalidaEditor() {
  if (indiceHistorial === indiceGuardado) return null;
  return {
    titulo: 'Salir sin guardar',
    texto: 'Tenés cambios sin guardar. Si salís ahora se pierden.',
    verbo: 'Salir sin guardar',
    alSalir: () => { window.onbeforeunload = null; },
  };
}

/* ---------- Entrada de la pantalla ---------- */

/**
 * El ejercicio con la forma que el resto del editor espera ({ id, nombre,
 * tipo, datos }). Sin pizarra todavía, arranca vacía. Dibujarla es de quien
 * creó el ejercicio, igual que editarlo (policy de 0015).
 */
async function cargarEjercicio(clubId, ejercicioId) {
  const ejercicio = await obtenerEjercicio(clubId, ejercicioId);
  if (!ejercicio) return null;
  await cargarPerfiles(clubId);
  if (!esMio(ejercicio.creadoPor)) return { error: 'La pizarra la dibuja quien creó el ejercicio.' };
  if (ejercicio.pizarra && !validarEjercicio(ejercicio.pizarra).ok) return { error: 'La pizarra guardada no se puede abrir.' };
  return {
    id: ejercicio.id, nombre: ejercicio.titulo, tipo: null, datos: ejercicio.pizarra ?? ejercicioVacio(),
  };
}

export async function renderJugadaEditor() {
  club = obtenerClubActual();
  const ejercicioId = ejercicioParaEditorActual();
  const id = ejercicioId ?? jugadaParaEditorActual();
  if (!club || !id) {
    contenedor().innerHTML = html`<div class="pad"><div class="p">No hay una jugada para editar.</div></div>`;
    return;
  }

  if (!pantallaAptaParaEditar(window.innerWidth, window.innerHeight)) {
    contenedor().innerHTML = html`
      <div class="pad">
        <div class="p">El editor de pizarra es para compu o tablet. Desde la biblioteca podés verla${ejercicioId ? '' : ', asignarla y duplicarla'}.</div>
        <button class="btn sec" id="btn-jed-volver-chico">Volver</button>
      </div>
    `;
    $('btn-jed-volver-chico').addEventListener('click', () => volver());
    return;
  }

  contenedor().innerHTML = html`<div class="pad"><div class="p" role="status">${ejercicioId ? 'Cargando ejercicio…' : 'Cargando jugada…'}</div></div>`;
  let jugada;
  try {
    jugada = ejercicioId ? await cargarEjercicio(club.id, ejercicioId) : await obtenerJugada(club.id, id);
  } catch (e) {
    contenedor().innerHTML = avisoDeError(e, ejercicioId ? 'No se pudo cargar el ejercicio.' : 'No se pudo cargar la jugada.');
    return;
  }
  if (!jugada) {
    contenedor().innerHTML = html`<div class="pad"><div class="p">${ejercicioId ? 'Este ejercicio ya no existe.' : 'Esta jugada ya no existe.'}</div></div>`;
    return;
  }
  if (jugada.error) {
    contenedor().innerHTML = html`<div class="pad"><div class="p">${jugada.error}</div><button class="btn sec" id="btn-jed-volver-error">Volver</button></div>`;
    $('btn-jed-volver-error').addEventListener('click', () => volver());
    return;
  }

  jugadaMeta = {
    id: jugada.id, nombre: jugada.nombre, tipo: jugada.tipo, esEjercicio: Boolean(ejercicioId),
  };
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
