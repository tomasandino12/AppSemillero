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
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { retornarDeImport } from './retornoImport.js';

/*
 * Import del plan físico (Etapa 6). Una sola pantalla con tres pasos que se
 * renderizan en el mismo contenedor, igual que confirmacionImport.js:
 *
 * 1. Categoría y preview: qué trae el archivo y dónde se va a guardar.
 * 2. Resolución: los nombres que no se resolvieron solos. Dejarlos pendientes
 *    es válido y es el default.
 * 3. Resultado.
 *
 * La resolución automática —exacta sobre el nombre normalizado, contra la hoja
 * del archivo y contra la biblioteca del club— no vive acá: la hace
 * prepararPayloadPlanFisico.js, y la lista de lo que queda sale de ahí mismo
 * (nombresPorResolver), no de `sinMatchear` del parser.
 */

const $ = (id) => document.getElementById(id);
const contenedor = () => $('plan-fisico-contenido');

const SIN_CONEXION = 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';

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
    porResolver: [],
    decisiones: {},     // nombreClave -> decisión (ver prepararPayloadPlanFisico)
    via: {},            // nombreClave -> 'buscar' | 'crear': sólo para marcar el botón
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
    cartel(esErrorDeRed(e) ? SIN_CONEXION : 'Ocurrió un error inesperado.');
    return;
  }
  if (!vigente()) return;

  // Un archivo que no se puede importar (sin sesiones, sesiones sin fecha) se
  // frena acá, antes de que el profe resuelva nombres para nada.
  const prueba = armarPayload();
  if (prueba.error) {
    cartel(`Este archivo no se puede importar: ${prueba.error}.`);
    return;
  }

  propio.porResolver = nombresPorResolver(resultadoParser, propio.biblioteca);
  renderPreview();
}

/* ---------- paso 1: categoría y preview ---------- */

function renderPreview() {
  const { resultadoParser, archivo, porResolver } = estado;
  const { resumen } = armarPayload();
  const fechas = resultadoParser.sesiones.map((s) => s.fecha).sort();
  const rango = fechas.length > 1
    ? `del ${formatearFechaCorta(fechas[0])} al ${formatearFechaCorta(fechas[fechas.length - 1])}`
    : formatearFechaCorta(fechas[0]);
  const apariciones = porResolver.reduce((n, p) => n + p.apariciones, 0);

  contenedor().innerHTML = `
    <div class="eyebrow">Se guarda en</div>
    <div class="al"><div class="tx" id="pf-destino"></div></div>

    <div class="eyebrow">Qué trae el archivo</div>
    <div class="tarj">
      <div class="fila-menor"><span class="k">Archivo</span><span class="v">${escaparHtml(archivo.name)}</span></div>
      <div class="fila-menor"><span class="k">Sesiones</span><span class="v">${resumen.sesiones}, ${escaparHtml(rango)}</span></div>
      <div class="fila-menor"><span class="k">Ejercicios</span><span class="v">${resumen.ejercicios}</span></div>
      <div class="fila-menor"><span class="k">A la biblioteca</span><span class="v">${resumen.ejerciciosNuevos} ${resumen.ejerciciosNuevos === 1 ? 'ejercicio nuevo' : 'ejercicios nuevos'}</span></div>
      <div class="fila-menor"><span class="k">Sin resolver</span><span class="v">${porResolver.length
        ? `${porResolver.length} ${porResolver.length === 1 ? 'nombre' : 'nombres'}, en ${apariciones} ${apariciones === 1 ? 'ejercicio' : 'ejercicios'}`
        : 'ninguno'}</span></div>
    </div>

    ${advertenciasHtml(resultadoParser.advertencias)}

    <div class="pie-fijo">
      ${porResolver.length
        ? '<button class="btn" id="pf-seguir">Resolver nombres</button>'
        : `<button class="btn" id="pf-guardar">${escaparHtml(textoBotonGuardar())}</button>`}
      <button class="btn sec" id="pf-volver">Volver</button>
    </div>
  `;

  actualizarDestino();
  $('pf-seguir')?.addEventListener('click', renderResolucion);
  $('pf-guardar')?.addEventListener('click', guardar);
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
 * esta pantalla. No relee el archivo ni pierde lo resuelto: actualiza sólo lo
 * que depende de la categoría, que es el destino y el botón de guardar.
 */
export function refrescarPlanFisico() {
  if (!estado) return;
  actualizarDestino();
  const boton = $('pf-guardar');
  if (boton && !estado.guardando) boton.textContent = textoBotonGuardar();
}

/* ---------- paso 2: resolución ---------- */

function renderResolucion() {
  const { porResolver } = estado;
  contenedor().innerHTML = `
    <div class="eyebrow">Nombres sin resolver</div>
    <div class="p">No están en la hoja "Ejercicios" del archivo ni en la biblioteca del club. Sin resolver también se guardan: el ejercicio queda completo, sin link al video.</div>
    <div class="al"><div class="tx" id="pf-contador"></div></div>

    <div class="grupo abierto" id="pf-grupo">
      <div class="grupo-h"><div class="t">Para resolver</div><div class="n">${porResolver.length}</div></div>
      <div class="grupo-cuerpo">
        ${porResolver.map((_, i) => `<div class="jug-sugerencia" data-i="${i}"></div>`).join('')}
      </div>
    </div>

    <div class="pie-fijo">
      <button class="btn" id="pf-guardar"></button>
      <button class="btn sec" id="pf-atras">Volver</button>
    </div>
  `;

  $('pf-grupo').querySelector('.grupo-h').addEventListener('click', () => $('pf-grupo').classList.toggle('abierto'));
  porResolver.forEach((_, i) => renderFila(i));
  actualizarContador();
  $('pf-guardar').addEventListener('click', guardar);
  $('pf-atras').addEventListener('click', renderPreview);
}

// Cada fila se repinta sola, no la lista entera: así el profe no pierde el
// lugar en una lista de 40 nombres cada vez que resuelve uno.
function renderFila(i) {
  const n = estado.porResolver[i];
  const fila = contenedor().querySelector(`.jug-sugerencia[data-i="${i}"]`);
  const decision = estado.decisiones[n.nombreClave];
  const via = decision ? estado.via[n.nombreClave] : 'pendiente';

  fila.innerHTML = `
    <div class="nom">${escaparHtml(n.nombresOriginales.join(' / '))}</div>
    <div class="det">${n.apariciones} ${n.apariciones === 1 ? 'vez' : 'veces'} en el plan · ${escaparHtml(textoDeDecision(decision))}</div>
    <div class="decision">
      <button data-accion="buscar" class="${via === 'buscar' ? 'on' : ''}">Buscar</button>
      <button data-accion="crear" class="${via === 'crear' ? 'on' : ''}">Crear</button>
      <button data-accion="pendiente" class="${via === 'pendiente' ? 'on' : ''}">Pendiente</button>
    </div>
  `;
  fila.querySelector('[data-accion="buscar"]').addEventListener('click', () => abrirBuscar(i));
  fila.querySelector('[data-accion="crear"]').addEventListener('click', () => abrirCrear(i));
  fila.querySelector('[data-accion="pendiente"]').addEventListener('click', () => {
    delete estado.decisiones[n.nombreClave];
    delete estado.via[n.nombreClave];
    renderFila(i);
    actualizarContador();
  });
}

function textoDeDecision(decision) {
  if (!decision) return 'queda pendiente';
  if (decision.tipo === 'existente') {
    const elegido = estado.biblioteca.find((f) => f.id === decision.ejercicioId);
    return `es ${elegido?.nombre ?? 'un ejercicio de la biblioteca'}`;
  }
  return `es ${decision.nombre}`;
}

function actualizarContador() {
  const quedan = estado.porResolver.filter((n) => !estado.decisiones[n.nombreClave]);
  const ejercicios = quedan.reduce((s, n) => s + n.apariciones, 0);
  const total = estado.porResolver.length;
  $('pf-contador').textContent = quedan.length
    ? `Quedan ${quedan.length} de ${total} sin resolver (${ejercicios} ${ejercicios === 1 ? 'ejercicio' : 'ejercicios'}).`
    : `Resolviste los ${total}.`;
  if (!estado.guardando) $('pf-guardar').textContent = textoBotonGuardar();
}

function textoBotonGuardar() {
  // El botón nombra la categoría: es lo último que se lee antes de escribir.
  // Cuántos quedan lo dice el contador; en el botón, a 375px, partía el texto
  // en dos líneas.
  return `Guardar en ${plantelElegido()?.categoria ?? ''}`;
}

/* ---------- hojas: buscar y crear ---------- */

function abrirBuscar(i) {
  const n = estado.porResolver[i];
  const opciones = bibliotecaParaElegir(estado.resultadoParser, estado.biblioteca, { porClave: decisionesSin(n.nombreClave) });

  abrirHoja({
    titulo: 'Elegir de la biblioteca',
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
      : `<div class="p">${opciones.length ? 'Ninguno con ese nombre. Podés crearlo desde la fila.' : 'La biblioteca está vacía. Podés crearlo desde la fila.'}</div>`;
    $('pf-opciones').querySelectorAll('[data-clave]').forEach((boton) => {
      boton.addEventListener('click', () => {
        const opcion = opciones.find((o) => o.clave === boton.dataset.clave);
        estado.decisiones[n.nombreClave] = decisionDesdeOpcion(opcion);
        estado.via[n.nombreClave] = 'buscar';
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

function abrirCrear(i) {
  const n = estado.porResolver[i];
  const previa = estado.via[n.nombreClave] === 'crear' ? estado.decisiones[n.nombreClave] : null;
  const opciones = bibliotecaParaElegir(estado.resultadoParser, estado.biblioteca, { porClave: decisionesSin(n.nombreClave) });
  const bloques = [...new Set(opciones.map((o) => o.bloque).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  abrirHoja({
    titulo: 'Crear en la biblioteca',
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
        <div class="ayuda">Opcional.</div>
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
    if (!nombre.trim()) {
      aviso('Poné un nombre.');
      return;
    }
    // Un nombre que ya existe no se da de alta de nuevo: se elige. Es el mismo
    // criterio que la RPC, dicho antes de guardar y no después.
    const existente = opciones.find((o) => o.clave === clavearNombre(nombre));
    if (existente) {
      aviso(`"${existente.nombre}" ya está en la biblioteca. Elegilo desde Buscar.`);
      return;
    }
    estado.decisiones[n.nombreClave] = {
      tipo: 'nueva',
      nombre,
      bloque: $('pf-bloque').value.trim() || null,
      link: $('pf-link').value.trim() || null,
    };
    estado.via[n.nombreClave] = 'crear';
    cerrarHoja();
    renderFila(i);
    actualizarContador();
  };

  $('pf-confirmar-crear').addEventListener('click', confirmar);
  $('pf-nombre').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmar(); });
  $('pf-cancelar-crear').addEventListener('click', () => cerrarHoja());
  $('pf-nombre').focus();
}

// Las decisiones de los demás nombres: lo que decidió esta misma fila no
// cuenta como "ya existe" cuando se la está cambiando.
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
  contenedor().innerHTML = `
    <div class="al ok"><div class="tx">Se guardaron ${r.sesiones} ${r.sesiones === 1 ? 'sesión' : 'sesiones'} y ${r.ejercicios} ${r.ejercicios === 1 ? 'ejercicio' : 'ejercicios'} en ${escaparHtml(categoria)}.</div></div>
    ${r.pendientes
      ? `<div class="p">${r.pendientes} ${r.pendientes === 1 ? 'ejercicio quedó pendiente' : 'ejercicios quedaron pendientes'}: sin ejercicio de la biblioteca asignado, y por eso sin link al video.</div>`
      : ''}
    ${advertenciasHtml(estado.resultadoParser.advertencias)}
    <div class="pie-fijo"><button class="btn" id="pf-volver">Volver a Datos</button></div>
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
  $('pf-volver')?.addEventListener('click', retornarDeImport);
}
