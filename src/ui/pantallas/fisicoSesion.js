import { ir } from '../main.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { obtenerEscaleras } from '../../data/repositorio.js';
import {
  agruparPorBloque, diaDeLaSemana, escaleraDeLinea, textoDeEscalera, detalleDeLinea,
} from '../../data/escalones.js';
import { escaparHtml, esErrorDeRed, formatearFechaCorta } from '../nav.js';
import { abrirEscalones } from './fisicoEscalones.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('fisico-sesion-contenido');

// Lo que se abrió desde FÍSICO: { plantelId, plan, sesion }.
let actual = null;

export function abrirSesion(datos) {
  actual = datos;
  ir('p-fisico-sesion', { push: true });
}

/**
 * Una sesión del plan: sus ejercicios por bloque, en el orden del archivo.
 * Series, reps, carga y pausa como texto, tal cual. Lo que no tiene video no
 * muestra nada de video. Se relee al volver desde escalones, así una escalera
 * recién definida aparece.
 */
export async function renderSesion() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!actual || !club || !plantel) {
    ir('p-fisico');
    return;
  }
  // Un chip de otra categoría: esta sesión es de otro plantel.
  if (plantel.id !== actual.plantelId) {
    ir('p-fisico');
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando la sesión…</div></div>`;
  let escaleras;
  try {
    escaleras = await obtenerEscaleras(club.id);
    if (obtenerPlantelActivo()?.id !== actual.plantelId) return;
  } catch (e) {
    if (!esErrorDeRed(e)) console.error('No se pudieron cargar las escaleras:', e);
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar la sesión.'
    }</div></div></div>`;
    return;
  }

  const { plan, sesion } = actual;
  const dia = diaDeLaSemana(sesion.fecha);
  contenedor().innerHTML = `
    <div class="pad">
      <div class="p"><b>${escaparHtml(dia.charAt(0).toUpperCase() + dia.slice(1))} ${formatearFechaCorta(sesion.fecha)}</b> · ${escaparHtml(plan.nombreArchivo)}</div>
      ${agruparPorBloque(sesion.lineas).map((grupo) => `
        ${grupo.bloque ? `<div class="eyebrow">${escaparHtml(grupo.bloque)}</div>` : ''}
        ${grupo.lineas.map((l) => tarjetaDeLinea(l, escaleras)).join('')}
      `).join('')}
    </div>
  `;

  contenedor().querySelectorAll('[data-linea]').forEach((tarjeta) => {
    const abrir = () => {
      const linea = sesion.lineas.find((l) => l.id === tarjeta.dataset.linea);
      abrirEscalones({ plantelId: actual.plantelId, plan, sesion, linea });
    };
    tarjeta.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;   // "Ver video" abre el link, no los escalones
      abrir();
    });
    tarjeta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.closest('a')) abrir();
    });
  });
}

function tarjetaDeLinea(l, escaleras) {
  const escalera = escaleraDeLinea(l.nombreOriginal, escaleras);
  const detalle = detalleDeLinea(l);
  return `
    <div class="tarj linea-fisico" data-linea="${escaparHtml(l.id)}" role="button" tabindex="0">
      <div style="display:flex;gap:var(--sp-2)">
        <div class="nom">${l.orden != null ? `${l.orden} · ` : ''}${escaparHtml(l.nombreOriginal)}</div>
        <div aria-hidden="true">›</div>
      </div>
      ${detalle ? `<div class="det">${escaparHtml(detalle)}</div>` : ''}
      ${l.notas ? `<div class="det">${escaparHtml(l.notas)}</div>` : ''}
      <div class="pie-linea">
        ${l.video ? `<a class="btn sec chico" href="${escaparHtml(l.video.link)}" target="_blank" rel="noopener noreferrer">Ver video</a>` : ''}
        <span class="escalera">${escaparHtml(escalera ? `Escalera ${textoDeEscalera(escalera.pesos)}` : 'Sin escalera')}</span>
      </div>
    </div>
  `;
}
