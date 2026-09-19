import { parsearPartidoCabb } from '../../parser/parserCabb.js';
import { calcularHashArchivo, mapearImportacion } from '../../data/mapearImportacion.js';
import { obtenerPlantelesDelClub, obtenerJugadoresDelClub, buscarImportacionPorHash, importarPartido } from '../../data/repositorio.js';
import { prepararPayloadImportacion } from '../../data/prepararPayloadImportacion.js';
import { obtenerClubActual } from '../sesion.js';
import { mostrarPantalla, toast, esErrorDeRed, escaparHtml } from '../nav.js';
import { mostrarResultado } from './resultadoImport.js';
import { retornarDeImport } from './retornoImport.js';
import { $ } from '../dom.js';
import { SIN_CONEXION, textoDeError } from '../errores.js';

const contenedor = () => $('confirmacion-contenido');

let estado = null;

export async function iniciarConfirmacion(archivo) {
  mostrarPantalla('p-confirmacion');
  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  estado = {
    archivo,
    resultadoParser: null,
    hashArchivo: null,
    condicionPropia: null,
    fecha,
    planteles: [],
    plantelId: null,
    jugadoresExistentes: null,
    resultadoMapeo: null,
    decisionesSugerencias: {},
    nuevosExcluidos: new Set(),
    guardando: false,
  };
  contenedor().innerHTML = `<div class="p">Leyendo archivo...</div>`;

  const club = obtenerClubActual();
  let datos;
  try {
    datos = await archivo.arrayBuffer();
  } catch {
    contenedor().innerHTML = `<div class="al"><div class="tx">No se pudo leer el archivo. Probá de nuevo.</div></div>` + botonVolver();
    ligarBotonVolver();
    return;
  }

  const resultadoParser = parsearPartidoCabb(datos, archivo.name);
  if (resultadoParser.errores.length > 0) {
    contenedor().innerHTML = `
      <div class="eyebrow">No se pudo leer el partido</div>
      ${resultadoParser.errores.map((e) => `<div class="al"><div class="tx">${escaparHtml(e.mensaje)}</div></div>`).join('')}
    ` + botonVolver();
    ligarBotonVolver();
    return;
  }
  estado.resultadoParser = resultadoParser;

  let hashArchivo, planteles;
  try {
    hashArchivo = await calcularHashArchivo(datos);
    planteles = await obtenerPlantelesDelClub(club.id);
  } catch (e) {
    contenedor().innerHTML = `<div class="al"><div class="tx">${textoDeError(e, 'Ocurrió un error inesperado.')}</div></div>` + botonVolver();
    ligarBotonVolver();
    return;
  }
  estado.hashArchivo = hashArchivo;
  estado.planteles = planteles;

  let importacionExistente;
  try {
    importacionExistente = await buscarImportacionPorHash(club.id, hashArchivo);
  } catch (e) {
    contenedor().innerHTML = `<div class="al"><div class="tx">${textoDeError(e, 'Ocurrió un error inesperado.')}</div></div>` + botonVolver();
    ligarBotonVolver();
    return;
  }
  if (importacionExistente) {
    // buscarImportacionPorHash (Etapa 2A, sin cambios) devuelve la fila cruda
    // de Supabase sin remapear a camelCase — a diferencia del resto de
    // repositorio.js, acá es nombre_archivo, no nombreArchivo.
    contenedor().innerHTML = `<div class="al ok"><div class="tx">Este partido ya fue importado (${escaparHtml(importacionExistente.nombre_archivo ?? '')}).</div></div>` + botonVolver();
    ligarBotonVolver();
    return;
  }

  renderPasoEquipoYPlantel();
}

function botonVolver() {
  return `<div class="pie-fijo"><button class="btn sec" id="btn-volver-inicio">Volver</button></div>`;
}
function ligarBotonVolver() {
  $('btn-volver-inicio')?.addEventListener('click', retornarDeImport);
}

function renderPasoEquipoYPlantel() {
  const { resultadoParser, planteles } = estado;
  const [equipoA, equipoB] = resultadoParser.equipos;
  const categoriaSugerida = resultadoParser.partido.categoria;
  const plantelSugeridoId = planteles.find((p) => p.codigoCabb === categoriaSugerida)?.id ?? null;
  if (estado.plantelId === null) estado.plantelId = plantelSugeridoId;

  contenedor().innerHTML = `
    <div class="eyebrow">¿Cuál es tu equipo?</div>
    <div class="equipos">
      <button class="opt" data-condicion="local" data-nombre="${escaparHtml(equipoA.nombre ?? '')}"><div class="t">${escaparHtml(equipoA.nombre ?? '(sin nombre)')}</div></button>
      <button class="opt" data-condicion="visitante" data-nombre="${escaparHtml(equipoB.nombre ?? '')}"><div class="t">${escaparHtml(equipoB.nombre ?? '(sin nombre)')}</div></button>
    </div>

    <div class="eyebrow">Fecha del partido</div>
    <div class="campo"><input type="date" id="in-fecha" value="${estado.fecha}"></div>

    <div class="eyebrow">Plantel</div>
    <div id="planteles"></div>

    <div id="resultado-marcador"></div>

    <div class="pie-fijo">
      <button class="btn" id="btn-confirmar-equipo-plantel" disabled>Elegí tu equipo y el plantel</button>
    </div>
  `;

  document.querySelectorAll('.equipos .opt').forEach((boton) => {
    boton.addEventListener('click', () => {
      document.querySelectorAll('.equipos .opt').forEach((b) => b.classList.remove('on'));
      boton.classList.add('on');
      estado.condicionPropia = boton.dataset.condicion;
      actualizarMarcador();
      actualizarBotonConfirmar();
    });
  });

  $('in-fecha').addEventListener('change', (e) => { estado.fecha = e.target.value; });

  renderPlanteles(plantelSugeridoId);

  $('btn-confirmar-equipo-plantel').addEventListener('click', avanzarAJugadores);
}

function renderPlanteles(plantelSugeridoId) {
  const cont = $('planteles');
  cont.innerHTML = estado.planteles.map((p) => `
    <button class="opt plantel-opt ${p.id === estado.plantelId ? 'on' : ''}" data-id="${p.id}">
      <div class="t">${escaparHtml(p.categoria)}</div>
      ${p.id === plantelSugeridoId ? '<div class="d">Sugerido</div>' : ''}
    </button>
  `).join('');
  cont.querySelectorAll('.plantel-opt').forEach((boton) => {
    boton.addEventListener('click', () => {
      cont.querySelectorAll('.plantel-opt').forEach((b) => b.classList.remove('on'));
      boton.classList.add('on');
      estado.plantelId = boton.dataset.id;
      actualizarBotonConfirmar();
    });
  });
}

function actualizarMarcador() {
  if (!estado.condicionPropia) { $('resultado-marcador').innerHTML = ''; return; }
  const { resultadoParser, condicionPropia } = estado;
  const propio = resultadoParser.equipos.find((e) => e.condicion === condicionPropia);
  const rival = resultadoParser.equipos.find((e) => e.condicion !== condicionPropia);
  const ptsPropios = propio.totales ? propio.totales.pts : null;
  const ptsRival = rival.totales ? rival.totales.pts : null;
  $('resultado-marcador').innerHTML = `
    <div class="tarj">
      <div class="marcador">
        <div class="lado"><div class="n">${ptsPropios ?? '-'}</div><div class="nom">Nosotros</div></div>
        <div class="vs">VS</div>
        <div class="lado"><div class="n">${ptsRival ?? '-'}</div><div class="nom">${escaparHtml(rival.nombre ?? 'Rival')}</div></div>
      </div>
    </div>
  `;
}

function actualizarBotonConfirmar() {
  const boton = $('btn-confirmar-equipo-plantel');
  const listo = estado.condicionPropia && estado.plantelId && estado.fecha;
  boton.disabled = !listo;
  boton.textContent = listo ? 'Ver jugadores' : 'Elegí tu equipo y el plantel';
}

async function avanzarAJugadores() {
  const club = obtenerClubActual();
  document.getElementById('cargando-jugadores')?.remove();
  document.getElementById('btn-volver-inicio')?.remove();
  contenedor().insertAdjacentHTML('beforeend', `<div class="p" id="cargando-jugadores">Cargando plantel...</div>`);
  $('btn-confirmar-equipo-plantel').disabled = true;

  const plantel = estado.planteles.find((p) => p.id === estado.plantelId);

  let jugadoresExistentes;
  try {
    jugadoresExistentes = await obtenerJugadoresDelClub(club.id);
  } catch (e) {
    $('cargando-jugadores').textContent = textoDeError(e, 'Ocurrió un error inesperado.');
    $('btn-confirmar-equipo-plantel').disabled = false;
    $('btn-confirmar-equipo-plantel').insertAdjacentHTML('afterend', '<button class="btn sec" id="btn-volver-inicio" style="margin-top:8px">Volver</button>');
    ligarBotonVolver();
    return;
  }
  estado.jugadoresExistentes = jugadoresExistentes;

  const resultadoMapeo = mapearImportacion(
    estado.resultadoParser,
    { condicionPropia: estado.condicionPropia, clubId: club.id, plantelId: estado.plantelId, temporadaId: plantel.temporadaId, fecha: estado.fecha },
    jugadoresExistentes,
  );
  if (resultadoMapeo.error) {
    $('cargando-jugadores').textContent = 'Ocurrió un error inesperado: ' + resultadoMapeo.error;
    $('btn-confirmar-equipo-plantel').disabled = false;
    $('btn-confirmar-equipo-plantel').insertAdjacentHTML('afterend', '<button class="btn sec" id="btn-volver-inicio" style="margin-top:8px">Volver</button>');
    ligarBotonVolver();
    return;
  }
  estado.resultadoMapeo = resultadoMapeo;

  mostrarGrupos();
}

function mostrarGrupos() {
  const { resultadoMapeo } = estado;
  const yaCargados = resultadoMapeo.jugadoresCoincidentes.filter((c) => !c.requierePertenenciaNueva);
  const otraCategoria = resultadoMapeo.jugadoresCoincidentes.filter((c) => c.requierePertenenciaNueva);
  const sugerencias = resultadoMapeo.sugerencias;
  const nuevos = resultadoMapeo.jugadoresNuevos;

  contenedor().innerHTML = `
    ${grupoHtml('ya-cargados', 'Ya cargados', yaCargados.length, false, yaCargados.map((c) => filaSimpleHtml(c.nombreClave)).join(''))}
    ${grupoHtml('otra-categoria', 'Ya está en otra categoría', otraCategoria.length, true, otraCategoria.map((c) => filaOtraCategoriaHtml(c)).join(''))}
    ${grupoHtml('sugerencias', 'Posible coincidencia', sugerencias.length, true, sugerencias.map((s) => filaSugerenciaHtml(s)).join(''))}
    ${grupoHtml('nuevos', 'Nuevos', nuevos.length, true, nuevos.map((n) => filaNuevoHtml(n)).join(''))}
    <div class="pie-fijo">
      <button class="btn" id="btn-guardar" disabled>Guardar</button>
      <button class="btn sec" id="btn-volver-inicio">Volver</button>
    </div>
  `;

  document.querySelectorAll('.grupo-h').forEach((h) => {
    h.addEventListener('click', () => h.closest('.grupo').classList.toggle('abierto'));
  });

  sugerencias.forEach((s) => {
    const fila = document.querySelector(`[data-sugerencia="${cssEscape(s.nombreClave)}"]`);
    fila.querySelectorAll('.decision button').forEach((boton) => {
      boton.addEventListener('click', () => {
        fila.querySelectorAll('.decision button').forEach((b) => b.classList.remove('on'));
        boton.classList.add('on');
        estado.decisionesSugerencias[s.nombreClave] = boton.dataset.decision;
        actualizarBotonGuardar();
      });
    });
  });

  nuevos.forEach((n) => {
    const chk = document.querySelector(`[data-nuevo-chk="${cssEscape(n.nombreClave)}"]`);
    chk.addEventListener('click', () => {
      if (estado.nuevosExcluidos.has(n.nombreClave)) {
        estado.nuevosExcluidos.delete(n.nombreClave);
        chk.classList.add('on');
        chk.textContent = '✓';
      } else {
        estado.nuevosExcluidos.add(n.nombreClave);
        chk.classList.remove('on');
        chk.textContent = '';
      }
      actualizarBotonGuardar();
    });
  });

  actualizarBotonGuardar();
  $('btn-guardar').addEventListener('click', guardar);
  ligarBotonVolver();
}

function grupoHtml(id, titulo, cantidad, abiertoPorDefecto, filasHtml) {
  return `
    <div class="grupo ${abiertoPorDefecto && cantidad > 0 ? 'abierto' : ''}" id="grupo-${id}">
      <div class="grupo-h"><div class="t">${escaparHtml(titulo)}</div><div class="n">${cantidad}</div></div>
      <div class="grupo-cuerpo">${cantidad > 0 ? filasHtml : '<div class="p">Ninguno.</div>'}</div>
    </div>
  `;
}
function filaSimpleHtml(nombreClave) {
  return `<div class="jug-fila"><div class="nom">${escaparHtml(nombreClave)}</div></div>`;
}
function filaOtraCategoriaHtml(c) {
  const plantelDestino = estado.planteles.find((p) => p.id === estado.plantelId);
  return `<div class="jug-fila"><div><div class="nom">${escaparHtml(c.nombreClave)}</div><div class="det">Ya está cargado en otra categoría, se lo suma también a ${escaparHtml(plantelDestino?.categoria ?? '')}</div></div></div>`;
}
function filaSugerenciaHtml(s) {
  return `
    <div class="jug-sugerencia" data-sugerencia="${escaparHtml(s.nombreClave)}">
      <div class="nom">${escaparHtml(s.nombreLimpio)}</div>
      <div class="det">¿Es ${escaparHtml(s.candidato.nombreLimpio)}, ya cargado?</div>
      <div class="decision">
        <button data-decision="mismo">Es el mismo</button>
        <button data-decision="otro">Es otro</button>
      </div>
    </div>
  `;
}
function filaNuevoHtml(n) {
  return `
    <div class="jug-fila">
      <div style="flex:1"><div class="nom">${escaparHtml(n.nombreLimpio)}</div></div>
      <button class="chk on" data-nuevo-chk="${escaparHtml(n.nombreClave)}">✓</button>
    </div>
  `;
}
function cssEscape(s) {
  return s.replace(/"/g, '\\"');
}

function contarACrear() {
  const { resultadoMapeo, decisionesSugerencias, nuevosExcluidos } = estado;
  let n = resultadoMapeo.jugadoresNuevos.filter((j) => !nuevosExcluidos.has(j.nombreClave)).length;
  for (const s of resultadoMapeo.sugerencias) {
    if (decisionesSugerencias[s.nombreClave] === 'otro' && !nuevosExcluidos.has(s.nombreClave)) n++;
  }
  return n;
}

function actualizarBotonGuardar() {
  const boton = $('btn-guardar');
  if (estado.guardando) {
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    return;
  }
  const { resultadoMapeo, decisionesSugerencias } = estado;
  const faltaAlgunaDecision = resultadoMapeo.sugerencias.some((s) => !decisionesSugerencias[s.nombreClave]);
  boton.disabled = faltaAlgunaDecision;
  const nuevosACrear = contarACrear();
  boton.textContent = faltaAlgunaDecision
    ? 'Confirmá las coincidencias'
    : `Guardar (${nuevosACrear} jugador${nuevosACrear === 1 ? '' : 'es'} nuevo${nuevosACrear === 1 ? '' : 's'})`;
}

async function guardar() {
  estado.guardando = true;
  const boton = $('btn-guardar');
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Guardando...';

  const plantel = estado.planteles.find((p) => p.id === estado.plantelId);
  const { payload, error: errorPayload } = prepararPayloadImportacion(
    estado.resultadoMapeo,
    estado.jugadoresExistentes,
    { sugerencias: estado.decisionesSugerencias, nuevosExcluidos: [...estado.nuevosExcluidos] },
    {
      temporadaId: plantel.temporadaId,
      hashArchivo: estado.hashArchivo,
      idPartidoCabb: estado.resultadoParser.origen.idPartidoCabb,
      nombreArchivo: estado.archivo.name,
      advertencias: estado.resultadoParser.advertencias,
    },
  );
  if (errorPayload) {
    toast('Ocurrió un error inesperado: ' + errorPayload);
    estado.guardando = false;
    boton.disabled = false;
    boton.textContent = textoOriginal;
    return;
  }

  try {
    await importarPartido(payload);
  } catch (e) {
    if (e?.message === 'IMPORTACION_DUPLICADA') {
      toast('Este partido ya fue importado.');
    } else if (esErrorDeRed(e)) {
      toast(SIN_CONEXION);
    } else {
      toast('No se pudo guardar. Intentá de nuevo.');
    }
    estado.guardando = false;
    boton.disabled = false;
    boton.textContent = textoOriginal;
    return;
  }

  const nombreRival = estado.resultadoParser.equipos.find((e) => e.condicion !== estado.condicionPropia).nombre ?? 'el rival';
  mostrarResultado({
    resumen: `Partido vs. ${nombreRival} guardado — ${contarACrear()} jugador${contarACrear() === 1 ? '' : 'es'} nuevo${contarACrear() === 1 ? '' : 's'}.`,
    advertencias: estado.resultadoParser.advertencias,
  });
}
