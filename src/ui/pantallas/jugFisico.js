import { obtenerMiPlan } from '../../data/repositorio.js';
import { fechaLocal, diaDeLaSemana, bloquesDeLineas } from '../../data/escalones.js';
import { sesionesDeLosPlanes, proximaSesion } from '../../data/planDelJugador.js';
import { html } from '../html.js';
import { formatearFechaCorta } from '../nav.js';
import { avisoDeError } from '../errores.js';
import { abrirSesionJugador } from './jugSesion.js';
import { $ } from '../dom.js';

const contenedor = () => $('jug-fisico-contenido');

/**
 * Pestaña FÍSICO del jugador: la sesión de hoy (o la próxima) arriba, y todas
 * las del plan por fecha. El plan ya viene elegido por la base (mi_plan), uno
 * por cada categoría en la que está. Sólo lectura: no marca nada como hecho.
 */
const filaSesion = (s, hoy, { conCategoria }) => {
  const dia = `${diaDeLaSemana(s.fecha).slice(0, 3)} ${formatearFechaCorta(s.fecha)}`;
  const bloques = bloquesDeLineas(s.lineas);
  const cuantos = `${s.lineas.length} ${s.lineas.length === 1 ? 'ejercicio' : 'ejercicios'}`;
  return html`
    <button class="jug" data-sesion="${s.id}">
      <div style="flex:1;text-align:left">
        <div class="nom">${s.fecha === hoy ? `Hoy · ${dia}` : dia}</div>
        <div class="det">${cuantos}${bloques.length ? ` · ${bloques.join(', ')}` : ''}</div>
        ${conCategoria && html`<div class="det">${s.categoria}</div>`}
      </div>
      <div class="der">›</div>
    </button>
  `;
};

export async function renderJugFisico() {
  contenedor().innerHTML = '<div class="pad"><div class="p">Cargando tu plan…</div></div>';

  let plan;
  try {
    plan = await obtenerMiPlan();
  } catch (e) {
    contenedor().innerHTML = `${avisoDeError(e, 'No se pudo cargar tu plan.')}
      <div class="pad"><button class="btn sec" id="btn-reintentar-jug-fisico">Reintentar</button></div>`;
    $('btn-reintentar-jug-fisico').addEventListener('click', () => renderJugFisico());
    return;
  }

  const sesiones = sesionesDeLosPlanes(plan.planes);
  if (!sesiones.length) {
    contenedor().innerHTML = html`
      <div class="pad">
        <div class="estado-vacio">
          <h2>Todavía no hay nada cargado</h2>
          <div class="p">Cuando tu profe cargue el plan de fuerza de tu categoría, vas a ver acá tus sesiones.</div>
        </div>
      </div>
    `;
    return;
  }

  const hoy = fechaLocal();
  const proxima = proximaSesion(sesiones, hoy);
  const opciones = { conCategoria: plan.planes.length > 1 };
  contenedor().innerHTML = html`
    <div class="pad">
      ${proxima
        ? html`<div class="eyebrow">${proxima.fecha === hoy ? 'Hoy' : 'Próxima sesión'}</div>${filaSesion(proxima, hoy, opciones)}`
        : html`<div class="p">Ya pasaron todas las sesiones de tu plan. Cuando tu profe cargue uno nuevo, aparece acá.</div>`}
      <div class="eyebrow">Todas las sesiones</div>
      ${sesiones.map((s) => filaSesion(s, hoy, opciones))}
    </div>
  `;

  contenedor().querySelectorAll('[data-sesion]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const sesion = sesiones.find((s) => s.id === boton.dataset.sesion);
      if (sesion) abrirSesionJugador({ sesion, pesos: plan.pesos });
    });
  });
}
