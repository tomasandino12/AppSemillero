import { obtenerSesionesDeMedicion } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo, obtenerCuenta } from '../sesion.js';
import { escaparHtml } from '../nav.js';
import { claveBorrador, leerBorrador, borrarBorrador } from '../borradorMedicion.js';
import { ir } from '../main.js';
import { $ } from '../dom.js';
import { textoDeError } from '../errores.js';

const contenedor = () => $('medir-contenido');

const NOMBRE_TIPO = { tiro: 'Batería de tiro', salto: 'Salto', sprint: 'Sprint', yoyo: 'Yo-Yo' };
const PANTALLA_TIPO = { tiro: 'p-medir-bateria', salto: 'p-medir-salto', sprint: 'p-medir-sprint', yoyo: 'p-medir-yoyo' };

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
  const nombre = NOMBRE_TIPO[tipo];
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
    tiro: leerBorrador(claveBorrador(obtenerCuenta()?.id, club.id, plantel.id, 'tiro')),
    salto: leerBorrador(claveBorrador(obtenerCuenta()?.id, club.id, plantel.id, 'salto')),
    sprint: leerBorrador(claveBorrador(obtenerCuenta()?.id, club.id, plantel.id, 'sprint')),
    yoyo: leerBorrador(claveBorrador(obtenerCuenta()?.id, club.id, plantel.id, 'yoyo')),
  };

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Medir ${escaparHtml(plantel.categoria)}</div>
      <div id="medir-borradores">
        ${borradores.tiro ? tarjetaBorrador(borradores.tiro, 'tiro') : ''}
        ${borradores.salto ? tarjetaBorrador(borradores.salto, 'salto') : ''}
        ${borradores.sprint ? tarjetaBorrador(borradores.sprint, 'sprint') : ''}
        ${borradores.yoyo ? tarjetaBorrador(borradores.yoyo, 'yoyo') : ''}
      </div>
      <div class="lista-2col">
        <button class="test-fila" id="btn-medir-bateria">
          <div class="ic">%</div>
          <div><div class="t">Batería de tiro</div><div class="d">6 posiciones, 10 tiros cada una</div></div>
        </button>
        <button class="test-fila" id="btn-medir-salto">
          <div class="ic">↑</div>
          <div><div class="t">Salto</div><div class="d">CMJ o Abalakov, por video</div></div>
        </button>
        <button class="test-fila" id="btn-medir-sprint">
          <div class="ic">→</div>
          <div><div class="t">Sprint</div><div class="d">20 o 30 m, cronómetro con pitido</div></div>
        </button>
        <button class="test-fila" id="btn-medir-yoyo">
          <div class="ic">⟷</div>
          <div><div class="t">Yo-Yo</div><div class="d">Resistencia, idas de 20 m con pitidos</div></div>
        </button>
      </div>
      <div class="eyebrow">Sesiones cargadas</div>
      <div class="p" id="medir-estado">Cargando sesiones...</div>
      <div id="medir-lista"></div>
    </div>
  `;

  $('btn-medir-bateria').addEventListener('click', () => ir('p-medir-bateria', { push: true }));
  $('btn-medir-salto').addEventListener('click', () => ir('p-medir-salto', { push: true }));
  $('btn-medir-sprint').addEventListener('click', () => ir('p-medir-sprint', { push: true }));
  $('btn-medir-yoyo').addEventListener('click', () => ir('p-medir-yoyo', { push: true }));
  contenedor().querySelectorAll('[data-seguir]').forEach((b) => {
    b.addEventListener('click', () => ir(PANTALLA_TIPO[b.dataset.seguir], { push: true }));
  });
  contenedor().querySelectorAll('[data-descartar]').forEach((b) => {
    b.addEventListener('click', async () => {
      borrarBorrador(claveBorrador(obtenerCuenta()?.id, club.id, plantel.id, b.dataset.descartar));
      await renderMedir();
    });
  });

  let sesiones;
  try {
    sesiones = await obtenerSesionesDeMedicion(club.id, plantel.id);
  } catch (e) {
    $('medir-estado').textContent = textoDeError(e, 'No se pudieron cargar las sesiones.');
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
        <div class="nom">${escaparHtml(NOMBRE_TIPO[s.tipo] ?? s.tipo)}</div>
        <div class="det">${escaparHtml(formatearFecha(s.fecha))}</div>
      </div>
    </div>
  `).join('')}</div>`;
}
