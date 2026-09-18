import {
  obtenerMaterial, agregarMaterial, editarMaterial, quitarMaterial, obtenerPerfilesDelClub,
} from '../../data/repositorio.js';
import {
  TIPOS, tipoDe, validarMaterial, buscarIgual, agruparInventario,
  etiquetaDeFila, ultimoCambio, textoYaExiste,
} from '../../data/inventario.js';
import { formatearKg, fechaLocal } from '../../data/escalones.js';
import { obtenerClubActual } from '../sesion.js';
import { escaparHtml, esErrorDeRed, toast, formatearFechaCorta } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';

const $ = (id) => document.getElementById(id);
const SIN_CONEXION = 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';

/*
 * Inventario de material del club. Una sola pantalla en dos variantes: la del
 * coordinador (pestaña INVENTARIO, agrega, edita y quita por hojas) y la de
 * lectura (el profe llega desde el pie de FÍSICO). Lo que cada uno puede hacer
 * lo garantiza la base (0026); esta pantalla sólo no ofrece lo que la base
 * rechazaría. Ver docs/superpowers/specs/2026-09-18-inventario-material-design.md.
 */

// Lo leído en el último render: { filas, nombres: { userId: nombre } }.
let vista = { filas: [], nombres: {} };

function mensajeDeError(e) {
  if (esErrorDeRed(e)) return SIN_CONEXION;
  const texto = e?.message ?? '';
  if (e?.code === '42501' || /NO_SE_PUDO|row-level security|permission denied/i.test(texto)) {
    return 'No tenés permiso para hacer eso.';
  }
  return 'No se pudo guardar. Probá de nuevo.';
}

/** "Tomás, 18/09", o sólo la fecha si esa persona no cargó nombre. */
function autoria(fila) {
  const fecha = formatearFechaCorta(fechaLocal(new Date(fila.actualizadoEn)));
  const nombre = vista.nombres[fila.actualizadoPor];
  return nombre ? `${escaparHtml(nombre)}, ${fecha}` : fecha;
}

/* ---------- lista ---------- */

function filaHtml(fila, editable) {
  const etiqueta = etiquetaDeFila(fila) || tipoDe(fila.tipo).nombre;
  const contenido = `
    <span class="nom">${escaparHtml(etiqueta)}</span>
    <span class="det">${fila.cantidad} unid.</span>
  `;
  return editable
    ? `<button type="button" class="jug-fila inv-fila" data-material="${fila.id}">${contenido}</button>`
    : `<div class="jug-fila inv-fila">${contenido}</div>`;
}

function listaHtml(editable) {
  return agruparInventario(vista.filas).map((s) => `
    <div class="eyebrow">${escaparHtml(s.titulo)}</div>
    ${s.grupos.map((g) => `
      ${g.tipo === 'otro' ? '' : `<div class="inv-grupo">${escaparHtml(g.titulo)}</div>`}
      ${g.filas.map((f) => filaHtml(f, editable)).join('')}
    `).join('')}
  `).join('');
}

async function pintar(idContenedor, editable) {
  const club = obtenerClubActual();
  const contenedor = $(idContenedor);
  if (!club || !contenedor) return;
  contenedor.innerHTML = '<div class="pad"><div class="p">Cargando...</div></div>';

  try {
    const [filas, nombres] = await Promise.all([
      obtenerMaterial(club.id),
      obtenerPerfilesDelClub(club.id),
    ]);
    vista = { filas, nombres };
  } catch (e) {
    if (!esErrorDeRed(e)) console.error('No se pudo cargar el inventario:', e);
    contenedor.innerHTML = `<div class="pad"><div class="p">${
      esErrorDeRed(e) ? SIN_CONEXION : 'No se pudo cargar el inventario.'
    }</div></div>`;
    return;
  }

  const ultimo = ultimoCambio(vista.filas);
  const vacio = editable
    ? 'Todavía no hay nada en el inventario. Agregá lo que tiene el club para que los profes sepan con qué cuentan.'
    : 'Todavía no hay nada en el inventario. Lo carga coordinación.';
  const cuerpo = vista.filas.length
    ? `${listaHtml(editable)}<div class="p det">Último cambio: ${autoria(ultimo)}</div>`
    : `<div class="estado-vacio"><h2>Inventario</h2><div class="p">${vacio}</div></div>`;

  contenedor.innerHTML = `
    <div class="pad">${cuerpo}</div>
    ${editable ? '<div class="pie-fijo"><button class="btn" id="btn-agregar-material">Agregar material</button></div>' : ''}
  `;

  if (!editable) return;
  $('btn-agregar-material').addEventListener('click', () => abrirAlta());
  contenedor.querySelectorAll('[data-material]').forEach((b) => b.addEventListener('click', () => {
    abrirEdicion(vista.filas.find((f) => f.id === b.dataset.material));
  }));
}

export function renderInventarioCoordinacion() {
  return pintar('coord-inventario-contenido', true);
}

export function renderInventarioLectura() {
  return pintar('inventario-contenido', false);
}

/* ---------- hojas ---------- */

function campo(id, rotulo, valor, decimal = false) {
  return `
    <div class="campo">
      <label for="${id}">${escaparHtml(rotulo)}</label>
      <input id="${id}" type="text" ${decimal ? 'inputmode="decimal"' : ''} autocomplete="off" value="${escaparHtml(valor)}">
    </div>
  `;
}

/** Los campos de un tipo. En "otro", "Nombre" ocupa el lugar de "Detalle": los dos van a `detalle`. */
function camposHtml(t, { peso, detalle, cantidad }) {
  const esOtro = t.peso === 'opcional';
  const rotuloDetalle = esOtro ? 'Nombre' : t.clave === 'pelota' ? 'Número (opcional)' : 'Detalle (opcional)';
  const rotuloPeso = `Peso de cada unidad (kg)${esOtro ? ' (opcional)' : ''}`;
  return `
    ${esOtro ? campo('inv-detalle', rotuloDetalle, detalle) : ''}
    ${t.peso !== 'no' ? campo('inv-peso', rotuloPeso, peso, true) : ''}
    ${esOtro ? '' : campo('inv-detalle', rotuloDetalle, detalle)}
    <div class="campo">
      <label for="inv-cant">Cantidad (unidades sueltas)</label>
      <div class="inv-cantidad">
        <button type="button" class="btn sec chico" id="inv-menos" aria-label="Una menos">−</button>
        <input id="inv-cant" type="text" inputmode="numeric" autocomplete="off" value="${escaparHtml(String(cantidad))}">
        <button type="button" class="btn sec chico" id="inv-mas" aria-label="Una más">+</button>
      </div>
    </div>
  `;
}

/** − no baja de 1: llegar a cero es "Quitar del inventario". */
function ligarCantidad() {
  const input = $('inv-cant');
  $('inv-menos').addEventListener('click', () => {
    const n = parseInt(input.value, 10);
    input.value = String(Number.isInteger(n) && n > 1 ? n - 1 : 1);
  });
  $('inv-mas').addEventListener('click', () => {
    const n = parseInt(input.value, 10);
    input.value = String(Number.isInteger(n) && n > 0 ? n + 1 : 1);
  });
}

function valoresActuales() {
  return {
    peso: $('inv-peso')?.value ?? '',
    detalle: $('inv-detalle')?.value ?? '',
    cantidad: $('inv-cant')?.value ?? '1',
  };
}

function ofrecerEditar(fila) {
  abrirHoja({
    titulo: 'Ya está cargado',
    cuerpo: `
      <div class="p">${escaparHtml(textoYaExiste(fila))} ¿Editar esa fila?</div>
      <div class="acciones">
        <button class="btn" id="inv-ir-a-editar">Editar esa fila</button>
        <button class="btn sec" id="inv-cancelar">Cancelar</button>
      </div>
    `,
  });
  $('inv-cancelar').addEventListener('click', () => cerrarHoja());
  $('inv-ir-a-editar').addEventListener('click', () => abrirEdicion(fila));
}

function abrirAlta() {
  let tipo = null;
  abrirHoja({
    titulo: 'Agregar material',
    cuerpo: `
      <div class="chips-tema" role="group" aria-label="Tipo">
        ${TIPOS.map((t) => `<button type="button" class="chip-tema" data-tipo="${t.clave}">${escaparHtml(t.nombre)}</button>`).join('')}
      </div>
      <div id="inv-campos"></div>
      <div class="acciones">
        <button class="btn" id="inv-guardar" disabled>Guardar</button>
        <button class="btn sec" id="inv-cancelar">Cancelar</button>
      </div>
    `,
  });

  document.querySelectorAll('#hoja [data-tipo]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const previos = tipo ? valoresActuales() : { peso: '', detalle: '', cantidad: '1' };
      tipo = tipoDe(chip.dataset.tipo);
      document.querySelectorAll('#hoja [data-tipo]').forEach((c) => c.classList.toggle('on', c === chip));
      $('inv-campos').innerHTML = camposHtml(tipo, previos);
      ligarCantidad();
      $('inv-guardar').disabled = false;
    });
  });
  $('inv-cancelar').addEventListener('click', () => cerrarHoja());

  $('inv-guardar').addEventListener('click', async () => {
    const boton = $('inv-guardar');
    if (boton.disabled || !tipo) return;
    const r = validarMaterial({ tipo: tipo.clave, ...valoresActuales() });
    if (r.error) { toast(r.error); return; }
    const igual = buscarIgual(vista.filas, r.fila);
    if (igual) { ofrecerEditar(igual); return; }

    const club = obtenerClubActual();
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    try {
      await agregarMaterial({ clubId: club.id, ...r.fila });
      cerrarHoja();
      toast('Listo.');
      await renderInventarioCoordinacion();
    } catch (e) {
      // Otro coordinador la cargó mientras tanto: se relee y se ofrece esa.
      if (e?.code === '23505') {
        try {
          vista.filas = await obtenerMaterial(club.id);
          const otra = buscarIgual(vista.filas, r.fila);
          if (otra) { ofrecerEditar(otra); return; }
        } catch { /* cae al toast de abajo */ }
      }
      toast(mensajeDeError(e));
      boton.disabled = false;
      boton.textContent = 'Guardar';
    }
  });
}

function abrirEdicion(fila) {
  const tipo = tipoDe(fila.tipo);
  abrirHoja({
    titulo: tipo.nombre,
    cuerpo: `
      ${camposHtml(tipo, {
        peso: fila.pesoKg != null ? formatearKg(fila.pesoKg) : '',
        detalle: fila.detalle,
        cantidad: fila.cantidad,
      })}
      <div class="p det">Modificado: ${autoria(fila)}</div>
      <div class="acciones">
        <button class="btn" id="inv-guardar">Guardar</button>
        <button class="btn sec" id="inv-cancelar">Cancelar</button>
      </div>
      <div class="acciones">
        <button class="btn sec" id="inv-quitar">Quitar del inventario</button>
      </div>
    `,
  });
  ligarCantidad();
  $('inv-cancelar').addEventListener('click', () => cerrarHoja());
  $('inv-quitar').addEventListener('click', () => confirmarQuitar(fila));

  $('inv-guardar').addEventListener('click', async () => {
    const boton = $('inv-guardar');
    if (boton.disabled) return;
    const r = validarMaterial({ tipo: fila.tipo, ...valoresActuales() });
    if (r.error) { toast(r.error); return; }
    if (buscarIgual(vista.filas.filter((f) => f.id !== fila.id), r.fila)) {
      toast('Ya hay otra fila igual. Editá esa, o quitá esta.');
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    try {
      await editarMaterial(fila.id, r.fila);
      cerrarHoja();
      toast('Listo.');
      await renderInventarioCoordinacion();
    } catch (e) {
      toast(e?.code === '23505' ? 'Ya hay otra fila igual. Editá esa, o quitá esta.' : mensajeDeError(e));
      boton.disabled = false;
      boton.textContent = 'Guardar';
    }
  });
}

function confirmarQuitar(fila) {
  const nombre = [tipoDe(fila.tipo).grupo, etiquetaDeFila(fila)].filter(Boolean).join(' · ');
  abrirHoja({
    titulo: 'Quitar del inventario',
    cuerpo: `
      <div class="p">¿Quitar ${escaparHtml(nombre)} (${fila.cantidad} unid.) del inventario?</div>
      <div class="acciones">
        <button class="btn" id="inv-confirmar-quitar">Quitar</button>
        <button class="btn sec" id="inv-cancelar">Cancelar</button>
      </div>
    `,
  });
  $('inv-cancelar').addEventListener('click', () => cerrarHoja());
  $('inv-confirmar-quitar').addEventListener('click', async () => {
    const boton = $('inv-confirmar-quitar');
    if (boton.disabled) return;
    boton.disabled = true;
    try {
      await quitarMaterial(fila.id);
      cerrarHoja();
      toast('Listo: quitado del inventario.');
      await renderInventarioCoordinacion();
    } catch (e) {
      toast(mensajeDeError(e));
      boton.disabled = false;
    }
  });
}
