import { parsearPartidoCabb } from '../parser/parserCabb.js';
import { calcularHashArchivo, mapearImportacion } from '../data/mapearImportacion.js';
import { obtenerPlantelesDelClub, obtenerJugadoresDelClub, buscarImportacionPorHash } from '../data/repositorio.js';
import { obtenerClubActual } from './sesion.js';
import { mostrarPantalla, toast, esErrorDeRed, escaparHtml } from './nav.js';
import { mostrarInicio } from './pantallaInicio.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('confirmacion-contenido');

let estado = null;

export async function iniciarConfirmacion(archivo) {
  mostrarPantalla('p-confirmacion');
  estado = {
    archivo,
    resultadoParser: null,
    hashArchivo: null,
    condicionPropia: null,
    fecha: new Date().toISOString().slice(0, 10),
    planteles: [],
    plantelId: null,
    jugadoresExistentes: null,
    resultadoMapeo: null,
    decisionesSugerencias: {},
    nuevosExcluidos: new Set(),
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
    contenedor().innerHTML = `<div class="al"><div class="tx">${esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'Ocurrió un error inesperado.'}</div></div>` + botonVolver();
    ligarBotonVolver();
    return;
  }
  estado.hashArchivo = hashArchivo;
  estado.planteles = planteles;

  let importacionExistente;
  try {
    importacionExistente = await buscarImportacionPorHash(club.id, hashArchivo);
  } catch (e) {
    contenedor().innerHTML = `<div class="al"><div class="tx">${esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'Ocurrió un error inesperado.'}</div></div>` + botonVolver();
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
  $('btn-volver-inicio')?.addEventListener('click', mostrarInicio);
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
  contenedor().insertAdjacentHTML('beforeend', `<div class="p" id="cargando-jugadores">Cargando plantel...</div>`);
  $('btn-confirmar-equipo-plantel').disabled = true;

  const plantel = estado.planteles.find((p) => p.id === estado.plantelId);

  let jugadoresExistentes;
  try {
    jugadoresExistentes = await obtenerJugadoresDelClub(club.id);
  } catch (e) {
    $('cargando-jugadores').textContent = esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'Ocurrió un error inesperado.';
    $('btn-confirmar-equipo-plantel').disabled = false;
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
    return;
  }
  estado.resultadoMapeo = resultadoMapeo;

  mostrarGrupos();
}

// Implementación real en Task 10 — acá solo un marcador visible para poder
// verificar manualmente el Step 2 de este task antes de que exista Task 10.
function mostrarGrupos() {
  contenedor().innerHTML = `<div class="p">(grupos de jugadores — Task 10)</div>`;
}
