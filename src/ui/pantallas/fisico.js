import { ir } from '../main.js';
import { iniciarPlanFisico } from './planFisico.js';
import { setRetornoPlanFisico } from './retornoPlanFisico.js';

const $ = (id) => document.getElementById(id);

/**
 * Pestaña FÍSICO: el trabajo físico, al lado de MEDIR (medir el cuerpo de un
 * lado, trabajarlo del otro). Hoy tiene una sola cosa, el plan de fuerza. No se
 * dibujan lugares para áreas que todavía no existen: cuando haya otra, se suma
 * acá con su propio contenido.
 */
export function renderFisico() {
  $('fisico-contenido').innerHTML = `
    <div class="pad">
      <div class="eyebrow">Fuerza</div>
      <div class="estado-vacio">
        <h2>Plan de fuerza</h2>
        <div class="p">Cargá el plan de fuerza en <b>.xlsx</b> y queda guardado en la categoría elegida, con sus sesiones y sus ejercicios.</div>
      </div>
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-cargar-plan-fisico">Cargar plan de fuerza</button></div>
  `;
  $('btn-cargar-plan-fisico').addEventListener('click', () => $('input-plan-fisico').click());
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

  // Todos los "Volver" del import de plan físico terminan acá.
  setRetornoPlanFisico(() => { ir('p-fisico'); });
}
