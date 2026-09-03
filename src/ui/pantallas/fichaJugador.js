import { obtenerJugadoresDelPlantel, obtenerPertenenciasDeJugador } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed } from '../nav.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('ficha-contenido');

let jugadorId = null;

export function abrirFicha(id) {
  jugadorId = id;
  ir('p-ficha', { push: true });
}

function dato(k, valor, unidad) {
  const sin = valor == null;
  return `
    <div class="dato">
      <div class="k">${escaparHtml(k)}</div>
      <div class="v ${sin ? 'sin' : ''}">${sin ? 'sin medir' : escaparHtml(String(valor)) + (unidad ? `<small> ${unidad}</small>` : '')}</div>
    </div>
  `;
}

export async function renderFicha() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel || !jugadorId) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay un jugador seleccionado.</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando jugador...</div></div>`;

  let jugador;
  let pertenencias = [];
  try {
    const jugadores = await obtenerJugadoresDelPlantel(club.id, plantel.id);
    jugador = jugadores.find((j) => j.id === jugadorId) ?? null;
    if (jugador) pertenencias = await obtenerPertenenciasDeJugador(club.id, jugadorId);
  } catch (e) {
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar el jugador.'
    }</div></div></div>`;
    return;
  }

  if (!jugador) {
    contenedor().innerHTML = `<div class="pad"><div class="p">Este jugador ya no está en ${escaparHtml(plantel.categoria)}.</div></div>`;
    return;
  }

  const categorias = pertenencias.map((p) => p.categoria).filter(Boolean);
  contenedor().innerHTML = `
    <div class="ficha-top">
      <div class="nom">${escaparHtml(jugador.nombreLimpio)}</div>
      <div class="sub">${categorias.length ? escaparHtml(categorias.join(' · ')) : 'Sin categoría vigente'}</div>
      <div class="datos-ficha">
        ${dato('Talla', jugador.tallaCm, 'cm')}
        ${dato('Peso', jugador.pesoKg, 'kg')}
      </div>
    </div>
    <div class="pad">
      <div class="eyebrow">Mediciones</div>
      <div class="p">${
        jugador.fechaMedicion
          ? `Última medición: ${escaparHtml(jugador.fechaMedicion)}.`
          : 'Todavía no tiene mediciones cargadas. Talla y peso salen de los estudios médicos de principio de año y se cargan aparte.'
      }</div>
    </div>
  `;
}
