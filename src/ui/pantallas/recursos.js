import { bannerEjemplo } from '../componentes/bannerEjemplo.js';
import { BIBLIO } from '../datosEjemplo.js';
import { toast } from '../nav.js';

const $ = (id) => document.getElementById(id);

export function renderRecursos() {
  $('recursos-contenido').innerHTML = `
    ${bannerEjemplo()}
    <div class="pad">
      <h2 class="h2">Recursos</h2>
      <div class="p">Material que dejás disponible para que el que quiera progrese por su cuenta. No es obligación ni control.</div>
      <div class="eyebrow">Ofrecidos</div>
      ${BIBLIO.map((b, i) => `
        <div class="rec">
          <div class="t">${b.t}</div>
          <div class="d">${b.d}</div>
          <div class="m"><span class="tag rojo">${i === 1 ? 'Todo el plantel' : `${2 + i} jugadores`}</span><span class="tag">${2 + i} lo abrieron</span></div>
        </div>
      `).join('')}
      <div class="p">Nadie queda “en falta” por no abrirlo. Si te interesa saber si sirvió, preguntá en el entrenamiento.</div>
      <button class="btn sec" id="btn-ofrecer">Ofrecer un recurso</button>
    </div>
  `;
  $('btn-ofrecer').addEventListener('click', () => toast('Ofrecer recursos todavía no está construido.'));
}
