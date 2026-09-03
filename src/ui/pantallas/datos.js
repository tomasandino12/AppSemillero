import { obtenerPartidosDelPlantel } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed } from '../nav.js';
import { ir } from '../main.js';
import { iniciarConfirmacion } from './confirmacionImport.js';
import { setRetornoImport } from './retornoImport.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('datos-contenido');

function formatearFecha(iso) {
  // 'YYYY-MM-DD' → 'DD/MM'. Se parsea a mano para no depender de la zona
  // horaria del navegador (new Date('2026-05-01') es UTC y puede correrse un día).
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio.slice(2)}`;
}

function filaPartido(p) {
  const propios = p.puntosPropios ?? '-';
  const rival = p.puntosRival ?? '-';
  const ganado = p.puntosPropios != null && p.puntosRival != null && p.puntosPropios > p.puntosRival;
  return `
    <div class="jug-fila">
      <div style="flex:1">
        <div class="nom">${escaparHtml(p.rivalNombre ?? 'Rival sin nombre')}</div>
        <div class="det">${formatearFecha(p.fecha)} · ${p.condicionPropia === 'local' ? 'Local' : 'Visitante'}</div>
      </div>
      <div class="chip ${ganado ? 'sube' : ''}">${propios}–${rival}</div>
    </div>
  `;
}

export async function renderDatos() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Partidos de ${escaparHtml(plantel.categoria)}</div>
      <div class="p" id="datos-estado">Cargando partidos...</div>
      <div id="datos-lista"></div>
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-cargar-partido">Cargar partido</button></div>
  `;
  $('btn-cargar-partido').addEventListener('click', () => $('input-archivo').click());

  let partidos;
  try {
    partidos = await obtenerPartidosDelPlantel(club.id, plantel.id);
  } catch (e) {
    $('datos-estado').textContent = esErrorDeRed(e)
      ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
      : 'No se pudieron cargar los partidos.';
    return;
  }

  if (!partidos.length) {
    $('datos-estado').outerHTML = `
      <div class="estado-vacio">
        <h2>Todavía no cargaste partidos</h2>
        <div class="p">Cargá la planilla <b>.xlsx</b> que exporta la app de la CABB y los datos del partido quedan guardados, con las estadísticas de cada jugador.</div>
      </div>
    `;
    return;
  }

  $('datos-estado').remove();
  $('datos-lista').innerHTML = `<div class="lista-2col">${partidos.map(filaPartido).join('')}</div>`;
}

export function iniciarDatos() {
  // El input de archivo vive en index.html, fuera de las pantallas, para que
  // el listener se registre una sola vez en toda la vida de la página.
  $('input-archivo').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    await ir('p-confirmacion', { push: true });
    await iniciarConfirmacion(archivo);
  });

  // Punto único de retorno del import: vuelve a DATOS y releé la lista, así
  // el partido recién importado aparece sin recargar la página.
  setRetornoImport(() => { ir('p-datos'); });
}
