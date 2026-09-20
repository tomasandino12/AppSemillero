import { ir } from '../main.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { obtenerPasos } from '../../data/repositorio.js';
import {
  agruparPorBloque, diaDeLaSemana, pasoDeLinea, formatearKg, detalleDeLinea,
} from '../../data/escalones.js';
import { escaparHtml, esErrorDeRed, formatearFechaCorta } from '../nav.js';
import { esEnlaceWeb } from '../../data/enlaces.js';
import { abrirEscalones } from './fisicoEscalones.js';
import { abrirVideo, esVideoEmbebible } from '../componentes/video.js';
import { $ } from '../dom.js';
import { avisoDeError } from '../errores.js';

const contenedor = () => $('fisico-sesion-contenido');

// Controles de adentro de la tarjeta que hacen lo suyo y no abren los escalones.
const CONTROL_PROPIO = 'a, [data-ver-video]';

// Lo que se abrió desde FÍSICO: { plantelId, plan, sesion }.
let actual = null;

export function abrirSesion(datos) {
  actual = datos;
  ir('p-fisico-sesion', { push: true });
}

/**
 * Una sesión del plan: sus ejercicios por bloque, en el orden del archivo.
 * Series, reps, carga y pausa como texto, tal cual. Lo que no tiene video no
 * muestra nada de video. Se relee al volver desde escalones, así un escalón
 * recién definido aparece.
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
  let pasos;
  try {
    pasos = await obtenerPasos(club.id);
    if (obtenerPlantelActivo()?.id !== actual.plantelId) return;
  } catch (e) {
    if (!esErrorDeRed(e)) console.error('No se pudieron cargar los escalones:', e);
    contenedor().innerHTML = avisoDeError(e, 'No se pudo cargar la sesión.');
    return;
  }

  const { plan, sesion } = actual;
  const dia = diaDeLaSemana(sesion.fecha);
  contenedor().innerHTML = `
    <div class="pad">
      <div class="p"><b>${escaparHtml(dia.charAt(0).toUpperCase() + dia.slice(1))} ${formatearFechaCorta(sesion.fecha)}</b> · ${escaparHtml(plan.nombreArchivo)}</div>
      ${agruparPorBloque(sesion.lineas).map((grupo) => `
        ${grupo.bloque ? `<div class="eyebrow">${escaparHtml(grupo.bloque)}</div>` : ''}
        ${grupo.lineas.map((l) => tarjetaDeLinea(l, pasos)).join('')}
      `).join('')}
    </div>
  `;

  contenedor().querySelectorAll('[data-ver-video]').forEach((b) => {
    b.addEventListener('click', () => {
      const linea = sesion.lineas.find((l) => l.id === b.dataset.verVideo);
      if (linea) abrirVideo(linea.video.link, linea.nombreOriginal);
    });
  });

  contenedor().querySelectorAll('[data-linea]').forEach((tarjeta) => {
    const abrir = () => {
      const linea = sesion.lineas.find((l) => l.id === tarjeta.dataset.linea);
      abrirEscalones({ plantelId: actual.plantelId, plan, sesion, linea });
    };
    tarjeta.addEventListener('click', (e) => {
      if (e.target.closest(CONTROL_PROPIO)) return;   // "Ver video" abre el video, no los escalones
      abrir();
    });
    tarjeta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.closest(CONTROL_PROPIO)) abrir();
    });
  });
}

function tarjetaDeLinea(l, pasos) {
  const paso = pasoDeLinea(l.nombreOriginal, pasos)?.paso ?? null;
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
        ${esVideoEmbebible(l.video?.link) ? `<button class="btn sec chico" data-ver-video="${escaparHtml(l.id)}">Ver video</button>` : ''}
        ${esEnlaceWeb(l.video?.link) && !esVideoEmbebible(l.video.link) ? `<a class="btn sec chico" href="${escaparHtml(l.video.link)}" target="_blank" rel="noopener noreferrer">Ver video</a>` : ''}
        <span class="escalon">${escaparHtml(paso != null ? `Escalón ${formatearKg(paso)} kg` : 'Sin escalón')}</span>
      </div>
    </div>
  `;
}
