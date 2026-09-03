import { bannerEjemplo } from '../componentes/bannerEjemplo.js';
import { TESTS, CARGADOS_EJEMPLO, JUGADORES_EJEMPLO } from '../datosEjemplo.js';
import { toast } from '../nav.js';

const $ = (id) => document.getElementById(id);

function filaTest(t) {
  const hechos = CARGADOS_EJEMPLO[t.id];
  return `
    <button class="test-fila ${hechos ? 'hecho' : ''}" data-test="${t.id}">
      <div class="ic">${hechos ? '✓' : (t.u === '%' ? '%' : t.u)}</div>
      <div>
        <div class="t">${t.n}</div>
        <div class="d">${hechos ? `${hechos} de ${JUGADORES_EJEMPLO.length} cargados` : (t.d || 'Sin cargar')}</div>
      </div>
    </button>
  `;
}

export function renderMedir() {
  const hechos = Object.keys(CARGADOS_EJEMPLO).length;
  $('medir-contenido').innerHTML = `
    ${bannerEjemplo()}
    <div class="pad">
      <h2 class="h2">Medición</h2>
      <div class="p">Así se vería la batería de tests. La carga de mediciones todavía no está construida.</div>
      <div class="eyebrow">Batería base <span class="der">${hechos} de ${TESTS.length}</span></div>
      <div class="lista-2col">${TESTS.map(filaTest).join('')}</div>
    </div>
  `;
  $('medir-contenido').querySelectorAll('[data-test]').forEach((boton) => {
    boton.addEventListener('click', () => toast('La carga de mediciones todavía no está construida.'));
  });
}
