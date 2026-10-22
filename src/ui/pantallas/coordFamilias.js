import { obtenerVinculosFamiliaDelClub, cerrarVinculoFamilia } from '../../data/repositorio.js';
import { obtenerClubActual } from '../sesion.js';
import { toast, formatearFechaCorta } from '../nav.js';
import { confirmarEnHoja } from '../componentes/confirmar.js';
import { html, crudo } from '../html.js';
import { avisoDeError, mensajeAlGuardar } from '../errores.js';
import { $ } from '../dom.js';
import { renderPapeles } from './coordPapeles.js';
import { ir } from '../main.js';

const contenedor = () => $('coord-cuentas-contenido');
const anfitrion = () => $('coord-familias-contenido');

/**
 * Control posterior de los vínculos de familia (spec 2026-10-18, §6.2): nadie
 * aprueba un vínculo antes, pero acá se ve quién se vinculó con qué chico y
 * cuándo, y se puede dar de baja. La baja cierra el vínculo, no lo borra, y
 * no se reabre sola si la familia vuelve a entrar.
 */

const REGLAS = [[/VINCULO_NO_ENCONTRADO/, 'Ese vínculo ya no está. Actualizá la lista.']];

// Los formularios (0058) y las noticias (0064) de la página del básquet viven
// acá porque son de las familias: se cargan desde estas pantallas, no desde
// una pestaña más (la barra de coordinación ya tiene cinco).
const accesoFormularios = html`
  <div class="acciones"><button class="btn sec" id="fam-ir-formularios">Formularios de la página del básquet</button>
    <button class="btn sec" id="fam-ir-noticias">Noticias de la página del básquet</button></div>`;
const cablearFormularios = () => {
  $('fam-ir-formularios').addEventListener('click', () => ir('p-coord-formularios', { push: true }));
  $('fam-ir-noticias').addEventListener('click', () => ir('p-coord-noticias', { push: true }));
};

const filaHtml = (v) => html`
  <div class="profe">
    <div class="nom">${v.jugador}</div>
    <div class="det">${v.categorias ?? 'Sin categoría'}</div>
    <div class="det">Cuenta: ${v.nombre ?? 'sin nombre'} · ${v.emailEnmascarado} · desde el ${formatearFechaCorta(v.desde.slice(0, 10))}</div>
    <button class="btn sec chico" data-baja="${v.id}">Dar de baja</button>
  </div>
`;

async function renderCuentas() {
  const club = obtenerClubActual();
  contenedor().innerHTML = '<div class="pad"><div class="p" role="status">Cargando…</div></div>';
  let vinculos;
  try {
    vinculos = await obtenerVinculosFamiliaDelClub(club.id);
  } catch (e) {
    contenedor().innerHTML = `${avisoDeError(e, 'No se pudieron cargar las familias.')}
      <div class="pad"><button class="btn sec" id="btn-reintentar-familias">Reintentar</button></div>`;
    $('btn-reintentar-familias').addEventListener('click', () => renderCuentas());
    return;
  }

  const explicacion = html`
    <p class="p">Cada familia se vincula sola, con el mail con el que inscribió a su hijo. Acá ves quién quedó vinculado con quién. Si algo no corresponde, dalo de baja.</p>
  `;
  if (!vinculos.length) {
    contenedor().innerHTML = html`
      <div class="pad">
        <div class="estado-vacio">
          <h2>Todavía no hay familias vinculadas</h2>
          <div class="p">Aparecen cuando un padre entra a la app con el mail con el que inscribió a su hijo y el profe ya cargó la inscripción en su categoría.</div>
        </div>
        ${accesoFormularios}
      </div>`;
    cablearFormularios();
    return;
  }
  contenedor().innerHTML = html`
    <div class="pad">
      ${accesoFormularios}
      ${explicacion}
      <div class="eyebrow">Vinculadas <span class="der">${vinculos.length}</span></div>
      ${vinculos.map(filaHtml)}
    </div>`;
  cablearFormularios();
  contenedor().querySelectorAll('[data-baja]').forEach((b) => {
    b.addEventListener('click', () => {
      const v = vinculos.find((x) => x.id === b.dataset.baja);
      if (v) pedirBaja(v);
    });
  });
}

function pedirBaja(v) {
  confirmarEnHoja({
    titulo: 'Dar de baja el vínculo',
    texto: `${v.nombre ?? 'Esta cuenta'} (${v.emailEnmascarado}) deja de ver a ${v.jugador}. Si la familia vuelve a entrar, no se vuelve a vincular sola.`,
    verbo: 'Dar de baja',
    alConfirmar: async () => {
      try {
        await cerrarVinculoFamilia(v.id);
      } catch (e) {
        toast(mensajeAlGuardar(e, { reglas: REGLAS, generico: 'No se pudo dar de baja. Probá de nuevo.' }));
        throw e;
      }
      toast('Listo: el vínculo se dio de baja.');
      renderCuentas();
    },
  });
}

const PESTANAS = [
  { id: 'papeles', titulo: 'Papeles y pagos' },
  { id: 'cuentas', titulo: 'Cuentas' },
];
let pestanaActiva = 'papeles';

/** Panorama manda a Papeles y pagos con la tarjeta de resumen. */
export function abrirPapelesYPagos() {
  pestanaActiva = 'papeles';
}

function elegirPestana(id) {
  pestanaActiva = id;
  for (const p of PESTANAS) {
    const on = p.id === id;
    const tab = $(`coord-tab-${p.id}`);
    tab.classList.toggle('on', on);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`coord-pan-${p.id}`).hidden = !on;
  }
}

/**
 * Familias tiene dos pestañas: Papeles y pagos (lo que manda Google) y Cuentas
 * (las familias vinculadas). Las dos se piden al entrar; la pestaña sólo
 * muestra u oculta su panel.
 */
export function renderFamilias() {
  anfitrion().innerHTML = html`
    <div class="pestanas fija" role="tablist" aria-label="Secciones de Familias" id="coord-pestanas">
      ${PESTANAS.map((p) => html`
        <button type="button" class="pest ${p.id === pestanaActiva ? 'on' : ''}" role="tab" id="coord-tab-${p.id}"
          data-pestana="${p.id}" aria-controls="coord-pan-${p.id}" aria-selected="${p.id === pestanaActiva}"
          tabindex="${p.id === pestanaActiva ? '0' : '-1'}">${p.titulo}</button>`)}
    </div>
    <div role="tabpanel" id="coord-pan-papeles" aria-labelledby="coord-tab-papeles" ${pestanaActiva === 'papeles' ? '' : crudo('hidden')}>
      <div id="coord-papeles-contenido"></div>
    </div>
    <div role="tabpanel" id="coord-pan-cuentas" aria-labelledby="coord-tab-cuentas" ${pestanaActiva === 'cuentas' ? '' : crudo('hidden')}>
      <div id="coord-cuentas-contenido"></div>
    </div>`;
  $('coord-pestanas').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-pestana]');
    if (tab) elegirPestana(tab.dataset.pestana);
  });
  // Flechas entre pestañas, como pide el patrón de tabs accesibles.
  $('coord-pestanas').addEventListener('keydown', (e) => {
    const paso = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!paso) return;
    const i = PESTANAS.findIndex((p) => p.id === pestanaActiva);
    const siguiente = PESTANAS[(i + paso + PESTANAS.length) % PESTANAS.length].id;
    elegirPestana(siguiente);
    $(`coord-tab-${siguiente}`).focus();
  });
  renderPapeles();
  renderCuentas();
}
