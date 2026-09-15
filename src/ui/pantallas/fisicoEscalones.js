import { ir } from '../main.js';
import { obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml } from '../nav.js';

const $ = (id) => document.getElementById(id);

// Lo que se abrió desde la sesión: { plantelId, plan, sesion, linea }.
let actual = null;

export function abrirEscalones(datos) {
  actual = datos;
  ir('p-fisico-escalones', { push: true });
}

export async function renderEscalones() {
  const plantel = obtenerPlantelActivo();
  if (!actual || !plantel || plantel.id !== actual.plantelId) {
    ir('p-fisico');
    return;
  }
  $('fisico-escalones-contenido').innerHTML = `<div class="pad"><div class="p">${escaparHtml(actual.linea.nombreOriginal)}</div></div>`;
}
