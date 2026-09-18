import { ir } from '../main.js';
import { iniciarPlanFisico } from './planFisico.js';
import { setRetornoPlanFisico } from './retornoPlanFisico.js';
import { abrirSesion } from './fisicoSesion.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { obtenerPlanesFisicos, obtenerPlanFisico } from '../../data/repositorio.js';
import {
  elegirPlanVisible, estadoDePlan, fechaLocal, diaDeLaSemana, bloquesDeLineas,
} from '../../data/escalones.js';
import { escaparHtml, esErrorDeRed, formatearFechaCorta } from '../nav.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('fisico-contenido');

/**
 * Pestaña FÍSICO: el plan de fuerza de la categoría activa. Cuál se muestra lo
 * decide elegirPlanVisible (el que contiene hoy, si no el próximo, si no el
 * último). El estado vacío es sólo el caso sin ningún plan.
 */

// El plan de "Otros planes" que abrió el profe. Vive en memoria mientras no
// cambie la categoría ni se recargue la página; no se guarda como preferencia.
let planAbierto = null;   // { plantelId, planId }

export async function renderFisico() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }
  if (planAbierto && planAbierto.plantelId !== plantel.id) planAbierto = null;

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando el plan…</div></div>${pieCargar()}`;
  ligarCargar();

  let planes;
  let sesiones;
  let visible;
  let otros;
  const hoy = fechaLocal();
  try {
    planes = await obtenerPlanesFisicos(club.id, plantel.id);
    if (obtenerPlantelActivo()?.id !== plantel.id) return;   // cambió el chip mientras cargaba
    const eleccion = elegirPlanVisible(planes, hoy);
    if (!eleccion.visible) {
      renderSinPlan();
      return;
    }
    const todos = [eleccion.visible, ...eleccion.otros];
    visible = todos.find((p) => p.id === planAbierto?.planId) ?? eleccion.visible;
    otros = todos.filter((p) => p.id !== visible.id);
    sesiones = await obtenerPlanFisico(visible.id);
    if (obtenerPlantelActivo()?.id !== plantel.id) return;
  } catch (e) {
    if (!esErrorDeRed(e)) console.error('No se pudo cargar el plan físico:', e);
    contenedor().innerHTML = `
      <div class="pad"><div class="al"><div class="tx">${
        esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar el plan.'
      }</div></div></div>
      ${pieCargar()}`;
    ligarCargar();
    return;
  }

  renderConPlan({ plantel, visible, otros, sesiones, hoy });
}

function renderSinPlan() {
  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Fuerza</div>
      <div class="estado-vacio">
        <h2>Plan de fuerza</h2>
        <div class="p">Cargá el plan de fuerza en <b>.xlsx</b> y queda guardado en la categoría elegida, con sus sesiones y sus ejercicios.</div>
      </div>
    </div>
    ${pieCargar()}
  `;
  ligarCargar();
}

function renderConPlan({ plantel, visible, otros, sesiones, hoy }) {
  const proxima = sesiones.find((s) => s.fecha >= hoy) ?? null;
  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Plan de fuerza</div>
      <div class="tarj">
        <div class="linea-fisico" style="cursor:default">
          <div class="nom">${escaparHtml(visible.nombreArchivo)}</div>
          <div class="det">${escaparHtml(rango(visible))} · ${sesiones.length} ${sesiones.length === 1 ? 'sesión' : 'sesiones'}</div>
          <div class="det">${escaparHtml(textoDeEstado(visible, hoy))}</div>
        </div>
      </div>

      ${proxima ? `<div class="eyebrow">Próxima sesión</div>${filaSesion(proxima, hoy)}` : ''}

      <div class="eyebrow">Sesiones</div>
      ${sesiones.map((s) => filaSesion(s, hoy)).join('')}

      ${otros.length ? `
        <div class="eyebrow">Otros planes</div>
        ${otros.map((p) => `
          <button class="jug" data-plan="${escaparHtml(p.id)}">
            <div style="flex:1;text-align:left">
              <div class="nom">${escaparHtml(p.nombreArchivo)}</div>
              <div class="det">${escaparHtml(rango(p))} · ${escaparHtml(textoDeEstado(p, hoy))}</div>
            </div>
            <div class="der">›</div>
          </button>`).join('')}` : ''}
    </div>
    ${pieCargar()}
  `;

  contenedor().querySelectorAll('[data-sesion]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const sesion = sesiones.find((s) => s.id === boton.dataset.sesion);
      abrirSesion({ plantelId: plantel.id, plan: visible, sesion });
    });
  });
  contenedor().querySelectorAll('[data-plan]').forEach((boton) => {
    boton.addEventListener('click', () => {
      planAbierto = { plantelId: plantel.id, planId: boton.dataset.plan };
      renderFisico();
    });
  });
  ligarCargar();
}

function filaSesion(s, hoy) {
  const dia = `${diaDeLaSemana(s.fecha).slice(0, 3)} ${formatearFechaCorta(s.fecha)}`;
  const bloques = bloquesDeLineas(s.lineas);
  return `
    <button class="jug" data-sesion="${escaparHtml(s.id)}">
      <div style="flex:1;text-align:left">
        <div class="nom">${escaparHtml(s.fecha === hoy ? `Hoy · ${dia}` : dia)}</div>
        <div class="det">${s.lineas.length} ${s.lineas.length === 1 ? 'ejercicio' : 'ejercicios'}${bloques.length ? ` · ${escaparHtml(bloques.join(', '))}` : ''}</div>
      </div>
      <div class="der">›</div>
    </button>
  `;
}

function rango(plan) {
  return plan.desde === plan.hasta
    ? formatearFechaCorta(plan.desde)
    : `${formatearFechaCorta(plan.desde)} al ${formatearFechaCorta(plan.hasta)}`;
}

function textoDeEstado(plan, hoy) {
  const estado = estadoDePlan(plan, hoy);
  if (estado === 'en_curso') return 'En curso';
  if (estado === 'proximo') return `Empieza el ${formatearFechaCorta(plan.desde)}`;
  return `Terminó el ${formatearFechaCorta(plan.hasta)}`;
}

// El inventario es del club, no de la categoría: el enlace está en todos los
// estados de FÍSICO y no depende del chip. Va en el mismo pie: una sola
// franja inferior por pantalla.
function pieCargar() {
  return `<div class="pie-fijo">
    <button class="btn" id="btn-cargar-plan-fisico">Cargar plan de fuerza</button>
    <button class="btn sec" id="btn-ver-inventario">Inventario del club</button>
  </div>`;
}

function ligarCargar() {
  $('btn-cargar-plan-fisico')?.addEventListener('click', () => $('input-plan-fisico').click());
  $('btn-ver-inventario')?.addEventListener('click', () => ir('p-inventario', { push: true }));
}

export function iniciarFisico() {
  // El input vive en index.html, fuera de las pantallas, para que el listener
  // se registre una sola vez en toda la vida de la página.
  $('input-plan-fisico').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    await ir('p-plan-fisico', { push: true });
    await iniciarPlanFisico(archivo);
  });

  // Todos los "Volver" del import de plan físico terminan acá, y el render
  // vuelve a leer: el plan recién importado aparece sin recargar.
  setRetornoPlanFisico(() => { ir('p-fisico'); });
}
