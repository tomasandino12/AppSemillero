import { parsearPlanFisico } from '../../parser/parserFisico.js';
import { clavearNombre } from '../../parser/parserCabb.js';
import { calcularHashArchivo } from '../../data/mapearImportacion.js';
import { obtenerEjerciciosFuerza, importarPlanFisico } from '../../data/repositorio.js';
import {
  prepararPayloadPlanFisico,
  nombresPorResolver,
  bibliotecaParaElegir,
  decisionDesdeOpcion,
} from '../../data/prepararPayloadPlanFisico.js';
import { obtenerClubActual, obtenerPlanteles, obtenerPlantelActivo } from '../sesion.js';
import { mostrarPantalla, toast, esErrorDeRed, escaparHtml, formatearFechaCorta } from '../nav.js';
import { esEnlaceWeb, MENSAJE_ENLACE_NO_WEB } from '../../data/enlaces.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { retornarDePlanFisico } from './retornoPlanFisico.js';
import { $ } from '../dom.js';
import { SIN_CONEXION, textoDeError } from '../errores.js';

/*
 * Import del plan físico (Etapa 6). Una sola pantalla, con los pasos
 * renderizados en el mismo contenedor, igual que confirmacionImport.js:
 *
 * 1. Resumen: dónde se guarda y qué trae el archivo. Se guarda desde acá.
 * 2. Agregar videos, opcional: sólo si el profe quiere ponerle video a algún
 *    ejercicio que no lo tiene.
 * 3. Resultado.
 *
 * La hoja "Ejercicios" del archivo es un anexo de videos, no un catálogo: el
 * profe le puso link a los movimientos que le parecieron difíciles. Un
 * ejercicio que no está ahí es un ejercicio normal, sin video, y la pantalla lo
 * trata así: nada que arreglar antes de guardar.
 *
 * Qué ejercicio tiene video lo decide la coincidencia exacta sobre el nombre
 * normalizado, contra la hoja del archivo y contra la biblioteca del club, y no
 * vive acá: la hace prepararPayloadPlanFisico.js. La lista de los que no tienen
 * video sale de ahí mismo (nombresPorResolver), no de `sinMatchear` del parser.
 */

const contenedor = () => $('plan-fisico-contenido');

let estado = null;

export async function iniciarPlanFisico(archivo) {
  mostrarPantalla('p-plan-fisico');
  const planteles = obtenerPlanteles();
  const propio = {
    archivo,
    resultadoParser: null,
    hashArchivo: null,
    planteles,
    biblioteca: [],
    sinVideo: [],       // un nombre por fila: los ejercicios que no tienen video
    decisiones: {},     // nombreClave -> video elegido (ver prepararPayloadPlanFisico)
    via: {},            // nombreClave -> 'elegir' | 'cargar': sólo para marcar el botón
    guardando: false,
  };
  estado = propio;
  // Si se abre otro archivo mientras éste carga, lo que termine después no
  // tiene que pintar encima del nuevo.
  const vigente = () => estado === propio;

  contenedor().innerHTML = `<div class="p">Leyendo archivo...</div>`;

  if (!planteles.length) {
    cartel('No tenés ninguna categoría asignada, así que no hay dónde guardar el plan.');
    return;
  }

  let datos;
  try {
    datos = await archivo.arrayBuffer();
  } catch {
    if (vigente()) cartel('No se pudo leer el archivo. Probá de nuevo.');
    return;
  }
  if (!vigente()) return;

  const resultadoParser = parsearPlanFisico(datos, archivo.name);
  if (resultadoParser.errores.length > 0) {
    contenedor().innerHTML = `
      <div class="eyebrow">No se pudo leer el plan</div>
      ${resultadoParser.errores.map((e) => `<div class="al"><div class="tx">${escaparHtml(e.mensaje)}</div></div>`).join('')}
      ${pieVolver()}
    `;
    ligarVolver();
    return;
  }
  propio.resultadoParser = resultadoParser;

  try {
    const club = obtenerClubActual();
    [propio.hashArchivo, propio.biblioteca] = await Promise.all([
      calcularHashArchivo(datos),
      obtenerEjerciciosFuerza(club.id),
    ]);
  } catch (e) {
    if (!vigente()) return;
    if (!esErrorDeRed(e)) console.error('No se pudo preparar el import del plan físico:', e);
    cartel(textoDeError(e, 'Ocurrió un error inesperado.'));
    return;
  }
  if (!vigente()) return;

  // Un archivo que no se puede importar (sin sesiones, sesiones sin fecha) se
  // frena acá, antes de mostrarle al profe un resumen que no va a poder guardar.
  const prueba = armarPayload();
  if (prueba.error) {
    cartel(`Este archivo no se puede importar: ${prueba.error}.`);
    return;
  }

  propio.sinVideo = nombresPorResolver(resultadoParser, propio.biblioteca);
  renderResumen();
}

/* ---------- paso 1: resumen, y se guarda desde acá ---------- */

function renderResumen() {
  const { resultadoParser, archivo, sinVideo } = estado;
  const { resumen } = armarPayload();
  const fechas = resultadoParser.sesiones.map((s) => s.fecha).sort();
  const rango = fechas.length > 1
    ? `del ${formatearFechaCorta(fechas[0])} al ${formatearFechaCorta(fechas[fechas.length - 1])}`
    : formatearFechaCorta(fechas[0]);
  const conVideo = resumen.ejercicios - resumen.pendientes;

  contenedor().innerHTML = `
    <div class="eyebrow">Se guarda en</div>
    <div class="al"><div class="tx" id="pf-destino"></div></div>

    <div class="eyebrow">Qué trae el archivo</div>
    <div class="tarj">
      <div class="fila-menor"><span class="k">Archivo</span><span class="v">${escaparHtml(archivo.name)}</span></div>
      <div class="fila-menor"><span class="k">Sesiones</span><span class="v">${resumen.sesiones}, ${escaparHtml(rango)}</span></div>
      <div class="fila-menor"><span class="k">Ejercicios</span><span class="v">${resumen.ejercicios}</span></div>
      <div class="fila-menor"><span class="k">Con video</span><span class="v">${conVideo}</span></div>
      <div class="fila-menor"><span class="k">Sin video</span><span class="v">${resumen.pendientes}</span></div>
      <div class="fila-menor"><span class="k">Videos nuevos</span><span class="v">${resumen.ejerciciosNuevos} a la biblioteca</span></div>
      ${sinVideo.length
        ? '<div class="acciones-al"><button class="btn sec chico" id="pf-agregar-videos">Agregar videos</button></div>'
        : ''}
    </div>

    ${advertenciasHtml(resultadoParser.advertencias)}

    <div class="pie-fijo">
      <button class="btn" id="pf-guardar">${escaparHtml(textoBotonGuardar())}</button>
      <button class="btn sec" id="pf-volver">Volver</button>
    </div>
  `;

  actualizarDestino();
  $('pf-agregar-videos')?.addEventListener('click', renderVideos);
  $('pf-guardar').addEventListener('click', guardar);
  ligarVolver();
}

// La categoría es la del chip del chrome: un solo selector en toda la app, y
// no un segundo acá que pueda contradecirlo. Se dice con todas las letras
// porque importar escribe, y escribir en la categoría equivocada no se deshace
// desde la app.
function actualizarDestino() {
  const destino = $('pf-destino');
  if (!destino) return;
  destino.innerHTML = `El plan se guarda en <b>${escaparHtml(plantelElegido()?.categoria ?? '')}</b>. Revisá que sea la categoría correcta: no se deshace desde la app. Para cambiarla, elegí otra arriba.`;
}

/**
 * Lo que corre el router al entrar y al tocar un chip de categoría estando en
 * esta pantalla. No relee el archivo ni pierde los videos elegidos: actualiza
 * sólo lo que depende de la categoría, que es el destino y el botón de guardar.
 */
export function refrescarPlanFisico() {
  if (!estado) return;
  actualizarDestino();
  const boton = $('pf-guardar');
  if (boton && !estado.guardando) boton.textContent = textoBotonGuardar();
}

/* ---------- paso 2, opcional: agregar videos ---------- */

function renderVideos() {
  const { sinVideo } = estado;
  contenedor().innerHTML = `
    <div class="eyebrow">Agregar videos · opcional</div>
    <div class="p">Estos ejercicios no tienen video en la hoja "Ejercicios" del archivo, y no hace falta: se guardan igual. Si alguno lo necesita, elegí un video de la biblioteca o cargá el link.</div>
    <div class="p" id="pf-contador" style="margin-top:.5rem"></div>

    <div id="pf-lista">
      ${sinVideo.map((_, i) => `<div class="jug-sugerencia" data-i="${i}"></div>`).join('')}
    </div>

    <div class="pie-fijo">
      <button class="btn" id="pf-guardar"></button>
      <button class="btn sec" id="pf-atras">Volver al resumen</button>
    </div>
  `;

  sinVideo.forEach((_, i) => renderFila(i));
  actualizarContador();
  $('pf-guardar').addEventListener('click', guardar);
  $('pf-atras').addEventListener('click', renderResumen);
}

// Cada fila se repinta sola, no la lista entera: así el profe no pierde el
// lugar en una lista de 40 nombres cada vez que le pone video a uno.
function renderFila(i) {
  const n = estado.sinVideo[i];
  const fila = contenedor().querySelector(`.jug-sugerencia[data-i="${i}"]`);
  const decision = estado.decisiones[n.nombreClave];
  const via = decision ? estado.via[n.nombreClave] : null;

  // Sin video es el estado normal: se dice en el texto, no es un botón. "Quitar"
  // aparece sólo cuando hay un video que sacar.
  fila.innerHTML = `
    <div class="nom">${escaparHtml(n.nombresOriginales.join(' / '))}</div>
    <div class="det">${n.apariciones} ${n.apariciones === 1 ? 'vez' : 'veces'} en el plan · ${escaparHtml(textoDeVideo(decision))}</div>
    <div class="decision">
      <button data-accion="elegir" class="${via === 'elegir' ? 'on' : ''}">Elegir video</button>
      <button data-accion="cargar" class="${via === 'cargar' ? 'on' : ''}">Cargar link</button>
      ${decision ? '<button data-accion="quitar">Quitar</button>' : ''}
    </div>
  `;
  fila.querySelector('[data-accion="elegir"]').addEventListener('click', () => abrirElegir(i));
  fila.querySelector('[data-accion="cargar"]').addEventListener('click', () => abrirCargar(i));
  fila.querySelector('[data-accion="quitar"]')?.addEventListener('click', () => {
    delete estado.decisiones[n.nombreClave];
    delete estado.via[n.nombreClave];
    renderFila(i);
    actualizarContador();
  });
}

function textoDeVideo(decision) {
  if (!decision) return 'sin video';
  if (decision.tipo === 'existente') {
    const elegido = estado.biblioteca.find((f) => f.id === decision.ejercicioId);
    return `video de ${elegido?.nombre ?? 'un ejercicio de la biblioteca'}`;
  }
  return `video de ${decision.nombre}`;
}

// Informa, no reclama: cuántos ejercicios de esta lista siguen sin video.
function actualizarContador() {
  const ejercicios = estado.sinVideo
    .filter((n) => !estado.decisiones[n.nombreClave])
    .reduce((s, n) => s + n.apariciones, 0);
  $('pf-contador').textContent = ejercicios
    ? `${ejercicios} ${ejercicios === 1 ? 'ejercicio' : 'ejercicios'} sin video.`
    : 'Todos los ejercicios de esta lista tienen video.';
  if (!estado.guardando) $('pf-guardar').textContent = textoBotonGuardar();
}

function textoBotonGuardar() {
  // El botón nombra la categoría: es lo último que se lee antes de escribir.
  return `Guardar en ${plantelElegido()?.categoria ?? ''}`;
}

/* ---------- hojas: elegir un video y cargar un link ---------- */

function abrirElegir(i) {
  const n = estado.sinVideo[i];
  // Sólo lo que tiene link: una entrada sin link no es un video para elegir.
  // El filtro es de esta lista y nada más; la detección de nombres repetidos al
  // cargar un link nuevo mira la biblioteca entera (abrirCargar).
  const opciones = bibliotecaParaElegir(estado.resultadoParser, estado.biblioteca, { porClave: decisionesSin(n.nombreClave) })
    .filter((o) => typeof o.link === 'string' && o.link.trim() !== '');

  abrirHoja({
    titulo: 'Elegir un video',
    cuerpo: `
      <div class="p">Para <b>${escaparHtml(n.nombresOriginales[0])}</b></div>
      <div class="campo">
        <label for="pf-buscar">Buscar por nombre</label>
        <input id="pf-buscar" type="search" autocomplete="off" enterkeyhint="search">
      </div>
      <div id="pf-opciones"></div>
      <div class="acciones-bateria"><button class="btn sec" id="pf-cancelar-buscar">Cancelar</button></div>
    `,
  });

  const pintar = () => {
    const consulta = clavearNombre($('pf-buscar').value);
    const visibles = consulta ? opciones.filter((o) => o.clave.includes(consulta)) : opciones;
    $('pf-opciones').innerHTML = visibles.length
      ? visibles.map((o) => `
          <button class="jug-fila casilla" data-clave="${escaparHtml(o.clave)}">
            <div style="flex:1">
              <div class="nom">${escaparHtml(o.nombre)}</div>
              <div class="det">${escaparHtml([o.bloque, o.id ? 'ya está en la biblioteca' : 'entra con este plan'].filter(Boolean).join(' · '))}</div>
            </div>
          </button>
        `).join('')
      : `<div class="p">${opciones.length ? 'Ninguno con ese nombre. Si no está, podés cargar el link desde la fila.' : 'Todavía no hay videos en la biblioteca. Podés cargar el link desde la fila.'}</div>`;
    $('pf-opciones').querySelectorAll('[data-clave]').forEach((boton) => {
      boton.addEventListener('click', () => {
        const opcion = opciones.find((o) => o.clave === boton.dataset.clave);
        estado.decisiones[n.nombreClave] = decisionDesdeOpcion(opcion);
        estado.via[n.nombreClave] = 'elegir';
        cerrarHoja();
        renderFila(i);
        actualizarContador();
      });
    });
  };

  $('pf-buscar').addEventListener('input', pintar);
  $('pf-cancelar-buscar').addEventListener('click', () => cerrarHoja());
  pintar();
}

function abrirCargar(i) {
  const n = estado.sinVideo[i];
  const previa = estado.via[n.nombreClave] === 'cargar' ? estado.decisiones[n.nombreClave] : null;
  const opciones = bibliotecaParaElegir(estado.resultadoParser, estado.biblioteca, { porClave: decisionesSin(n.nombreClave) });
  const bloques = [...new Set(opciones.map((o) => o.bloque).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  abrirHoja({
    titulo: 'Cargar link de video',
    cuerpo: `
      <div class="campo">
        <label for="pf-nombre">Nombre</label>
        <input id="pf-nombre" type="text" autocomplete="off" value="${escaparHtml(previa?.nombre ?? n.nombresOriginales[0])}">
      </div>
      <div class="campo">
        <label for="pf-bloque">Bloque</label>
        <input id="pf-bloque" type="text" autocomplete="off" list="pf-bloques" value="${escaparHtml(previa?.bloque ?? '')}">
        <datalist id="pf-bloques">${bloques.map((b) => `<option value="${escaparHtml(b)}"></option>`).join('')}</datalist>
      </div>
      <div class="campo">
        <label for="pf-link">Link al video</label>
        <input id="pf-link" type="url" autocomplete="off" inputmode="url" value="${escaparHtml(previa?.link ?? '')}">
      </div>
      <div id="pf-aviso"></div>
      <div class="acciones-bateria">
        <button class="btn" id="pf-confirmar-crear">Usar este</button>
        <button class="btn sec" id="pf-cancelar-crear">Cancelar</button>
      </div>
    `,
  });

  const confirmar = () => {
    const nombre = $('pf-nombre').value;
    const aviso = (texto) => { $('pf-aviso').innerHTML = `<div class="al"><div class="tx">${escaparHtml(texto)}</div></div>`; };
    const link = $('pf-link').value.trim();
    if (!nombre.trim()) {
      aviso('Poné un nombre.');
      return;
    }
    // Obligatorio: una entrada sin link no le da video a nadie.
    if (!link) {
      aviso('Poné el link del video.');
      return;
    }
    if (!esEnlaceWeb(link)) {
      aviso(MENSAJE_ENLACE_NO_WEB);
      return;
    }
    // Un nombre que ya existe no se da de alta de nuevo: se elige. Es el mismo
    // criterio que la RPC, dicho antes de guardar y no después, y mira la
    // biblioteca entera, con o sin link: el filtro de "Elegir video" no aplica.
    const existente = opciones.find((o) => o.clave === clavearNombre(nombre));
    if (existente) {
      aviso(existente.link
        ? `"${existente.nombre}" ya está en la biblioteca. Elegilo desde Elegir video.`
        : `"${existente.nombre}" ya está en la biblioteca, sin link, y desde acá no se le puede agregar uno. Usá otro nombre o dejalo sin video.`);
      return;
    }
    estado.decisiones[n.nombreClave] = {
      tipo: 'nueva',
      nombre,
      bloque: $('pf-bloque').value.trim() || null,
      link,
    };
    estado.via[n.nombreClave] = 'cargar';
    cerrarHoja();
    renderFila(i);
    actualizarContador();
  };

  $('pf-confirmar-crear').addEventListener('click', confirmar);
  for (const campo of ['pf-nombre', 'pf-link']) {
    $(campo).addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmar(); });
  }
  $('pf-cancelar-crear').addEventListener('click', () => cerrarHoja());
  // El nombre ya viene del archivo; lo que falta es el link.
  $('pf-link').focus();
}

// Las decisiones de los demás nombres: lo que eligió esta misma fila no cuenta
// como "ya existe" cuando se la está cambiando.
function decisionesSin(nombreClave) {
  const resto = { ...estado.decisiones };
  delete resto[nombreClave];
  return resto;
}

/* ---------- guardar y paso 3 ---------- */

async function guardar() {
  const boton = $('pf-guardar');
  if (estado.guardando || !boton || boton.disabled) return;

  // La categoría se fija acá: si se toca un chip mientras se guarda, los
  // mensajes tienen que nombrar la categoría donde se escribió de verdad.
  const plantel = plantelElegido();
  const { error, payload } = armarPayload();
  if (error) {
    toast(`No se puede guardar: ${error}.`);
    return;
  }

  estado.guardando = true;
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Guardando...';

  let r;
  try {
    r = await importarPlanFisico(payload);
  } catch (e) {
    toast(mensajeDeError(e, plantel));
    // El estado queda intacto: se reintenta sin volver a elegir el archivo.
    estado.guardando = false;
    boton.disabled = false;
    boton.textContent = textoOriginal;
    return;
  }

  renderResultado(r, plantel);
}

function mensajeDeError(e, plantel) {
  const mensaje = e?.message ?? '';
  if (mensaje.startsWith('PLAN_DUPLICADO')) {
    return `Este plan ya está cargado en ${plantel?.categoria ?? 'esa categoría'}.`;
  }
  if (mensaje.startsWith('EJERCICIO_DUPLICADO')) {
    const nombre = mensaje.split(':').slice(1).join(':').trim();
    return `"${nombre}" ya está en la biblioteca: se cargó mientras tanto. Volvé a abrir el archivo.`;
  }
  if (esErrorDeRed(e)) return SIN_CONEXION;
  console.error('No se pudo guardar el plan físico:', e);
  return 'No se pudo guardar. Intentá de nuevo.';
}

function renderResultado(r, plantel) {
  const categoria = plantel?.categoria ?? '';
  // La RPC devuelve cuántas líneas quedaron sin ejercicio de la biblioteca
  // (contrato de 0021); acá sólo se nombra lo que tiene video.
  const conVideo = r.ejercicios - r.pendientes;
  contenedor().innerHTML = `
    <div class="al ok"><div class="tx">Se guardaron ${r.sesiones} ${r.sesiones === 1 ? 'sesión' : 'sesiones'} y ${r.ejercicios} ${r.ejercicios === 1 ? 'ejercicio' : 'ejercicios'} en ${escaparHtml(categoria)}${conVideo > 0 ? `, ${conVideo} con video` : ''}.</div></div>
    ${advertenciasHtml(estado.resultadoParser.advertencias)}
    <div class="pie-fijo"><button class="btn" id="pf-volver">Volver a Físico</button></div>
  `;
  ligarVolver();
}

/* ---------- compartido ---------- */

function armarPayload() {
  return prepararPayloadPlanFisico(
    estado.resultadoParser,
    estado.biblioteca,
    { porClave: estado.decisiones },
    {
      clubId: obtenerClubActual()?.id,
      plantelId: plantelElegido()?.id,
      nombreArchivo: estado.archivo.name,
      hashArchivo: estado.hashArchivo,
    },
  );
}

function plantelElegido() {
  return obtenerPlantelActivo();
}

// Tal cual las devuelve el parser, sin reescribir.
function advertenciasHtml(advertencias) {
  if (!advertencias?.length) return '';
  return `
    <details style="margin-top:14px">
      <summary class="p">${advertencias.length} ${advertencias.length === 1 ? 'advertencia' : 'advertencias'} del archivo</summary>
      ${advertencias.map((a) => `<div class="al"><div class="tx">${escaparHtml(a.mensaje)}</div></div>`).join('')}
    </details>
  `;
}

function cartel(texto) {
  contenedor().innerHTML = `<div class="al"><div class="tx">${escaparHtml(texto)}</div></div>${pieVolver()}`;
  ligarVolver();
}

function pieVolver() {
  return `<div class="pie-fijo"><button class="btn sec" id="pf-volver">Volver</button></div>`;
}

function ligarVolver() {
  $('pf-volver')?.addEventListener('click', retornarDePlanFisico);
}
