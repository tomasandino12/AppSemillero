import { obtenerSesionesDeMedicion } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed } from '../nav.js';
import { claveBorrador, leerBorrador, borrarBorrador } from '../borradorMedicion.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('medir-contenido');

/** 'YYYY-MM-DD' → 'DD/MM/YY', a mano para no depender de la zona horaria. */
export function formatearFecha(iso) {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio.slice(2)}`;
}

function cuantosCargados(borrador) {
  return Object.values(borrador?.valores ?? {}).filter((v) => (
    v?.ausente || Object.keys(v ?? {}).some((k) => k !== 'ausente' && v[k] != null)
  )).length;
}

function tarjetaBorrador(borrador, tipo) {
  const cargados = cuantosCargados(borrador);
  const nombre = tipo === 'tiro' ? 'Batería de tiro' : 'Velocidad';
  return `
    <div class="al">
      <div class="ico">!</div>
      <div class="tx">
        <b>Sesión sin terminar</b>
        <div class="mt">${escaparHtml(nombre)} del ${escaparHtml(formatearFecha(borrador.fecha))} · ${cargados} jugador${cargados === 1 ? '' : 'es'} cargado${cargados === 1 ? '' : 's'}</div>
        <div class="acciones-al">
          <button class="btn chico" data-seguir="${tipo}">Continuar</button>
          <button class="btn sec chico" data-descartar="${tipo}">Descartar</button>
        </div>
      </div>
    </div>
  `;
}

export async function renderMedir() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  const borradores = {
    tiro: leerBorrador(claveBorrador(club.id, plantel.id, 'tiro')),
    velocidad: leerBorrador(claveBorrador(club.id, plantel.id, 'velocidad')),
  };

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Medir ${escaparHtml(plantel.categoria)}</div>
      <div id="medir-borradores">
        ${borradores.tiro ? tarjetaBorrador(borradores.tiro, 'tiro') : ''}
        ${borradores.velocidad ? tarjetaBorrador(borradores.velocidad, 'velocidad') : ''}
      </div>
      <div class="lista-2col">
        <button class="test-fila" id="btn-medir-bateria">
          <div class="ic">%</div>
          <div><div class="t">Batería de tiro</div><div class="d">6 posiciones, 10 tiros cada una</div></div>
        </button>
        <button class="test-fila" id="btn-medir-velocidad">
          <div class="ic">s</div>
          <div><div class="t">Velocidad</div><div class="d">Largo de cancha, un intento</div></div>
        </button>
      </div>
      <div class="eyebrow">Sesiones cargadas</div>
      <div class="p" id="medir-estado">Cargando sesiones...</div>
      <div id="medir-lista"></div>
    </div>
  `;

  $('btn-medir-bateria').addEventListener('click', () => ir('p-medir-bateria', { push: true }));
  $('btn-medir-velocidad').addEventListener('click', () => ir('p-medir-velocidad', { push: true }));
  contenedor().querySelectorAll('[data-seguir]').forEach((b) => {
    b.addEventListener('click', () => ir(b.dataset.seguir === 'tiro' ? 'p-medir-bateria' : 'p-medir-velocidad', { push: true }));
  });
  contenedor().querySelectorAll('[data-descartar]').forEach((b) => {
    b.addEventListener('click', async () => {
      borrarBorrador(claveBorrador(club.id, plantel.id, b.dataset.descartar));
      await renderMedir();
    });
  });

  let sesiones;
  try {
    sesiones = await obtenerSesionesDeMedicion(club.id, plantel.id);
  } catch (e) {
    $('medir-estado').textContent = esErrorDeRed(e)
      ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
      : 'No se pudieron cargar las sesiones.';
    return;
  }

  if (!sesiones.length) {
    $('medir-estado').outerHTML = `
      <div class="estado-vacio">
        <h2>Todavía no hay mediciones</h2>
        <div class="p">La batería son 6 posiciones de 10 tiros cada una. Con una sola sesión ya podés ver desde dónde tira mejor cada chico; recién con la segunda empieza a verse si mejora.</div>
      </div>
    `;
    return;
  }

  $('medir-estado').remove();
  $('medir-lista').innerHTML = `<div class="lista-2col">${sesiones.map((s) => `
    <div class="jug-fila">
      <div style="flex:1">
        <div class="nom">${s.tipo === 'tiro' ? 'Batería de tiro' : 'Velocidad'}</div>
        <div class="det">${escaparHtml(formatearFecha(s.fecha))}</div>
      </div>
    </div>
  `).join('')}</div>`;
}
