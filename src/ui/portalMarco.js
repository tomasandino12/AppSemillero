import { html } from './html.js';
import { $ } from './dom.js';
import { formulariosPublicos } from '../data/repositorio.js';
import { PORTAL, paginaActual, sedeValida } from '../data/portal.js';
import { resolverFormularios, separarFormularios, accionesPrincipales } from '../data/formulariosPortal.js';
import { destinoDeAuth } from '../data/entradaAuth.js';

/*
 * Lo común a las cinco páginas del portal (spec 2026-10-21): la barra con las
 * dos acciones que más usan las familias, el pie con la sede y la página
 * actual marcada en la navegación. El encabezado y el pie están escritos en
 * el HTML de cada página (se ven sin JS): acá sólo se completan.
 *
 * Lee formularios_publicos UNA vez por página y le devuelve lo leído a la
 * página, que lo usa para su propio contenido (el hero, la ayuda).
 */

/**
 * Las dos acciones: la primera (Inscribir o Quiero jugar, la regla de
 * accionesPrincipales) y el comprobante. La que no tiene formulario se ve
 * apagada, con "Pronto". Sin ninguna abierta no hay barra: no hay nada que
 * hacer, y dos botones apagados fijos en la pantalla sólo estorban.
 */
export function htmlBarraAcciones({ primera, comprobante }) {
  if (!primera.url && !comprobante.url) return html``;
  const boton = (clase, texto, url) => (url
    ? html`<a class="portal-acc-btn ${clase}" href="${url}" target="_blank" rel="noopener">${texto}</a>`
    : html`<span class="portal-acc-btn apagada" aria-disabled="true">${texto}<small>Pronto</small></span>`);
  const titulo = primera.tipo === 'inscribir' ? 'Inscribir a mi hijo o hija' : 'Quiero jugar en Newell\'s';
  return html`${boton('principal', titulo, primera.url)}${boton('pago', 'Enviar comprobante', comprobante.url)}`;
}

/** La sede en el pie. Sin una sede válida, nada. */
export function htmlSedePie(sede) {
  const s = sedeValida(sede);
  if (!s) return html``;
  return html`<b>${s.nombre}</b>${s.direccion && html`<br>${s.direccion}`}${s.mapa && html`<br><a href="${s.mapa}" target="_blank" rel="noopener">Cómo llegar</a>`}`;
}

function marcarPaginaActual() {
  const actual = paginaActual(window.location.pathname);
  if (!actual) return;
  document.querySelectorAll('.portal-nav a, .portal-pie-nav a').forEach((a) => {
    if (a.getAttribute('href') === actual) a.setAttribute('aria-current', 'page');
  });
}

/** El botón Copiar del alias (hero del inicio y Ayuda). */
function iniciarCopiar() {
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-copiar]');
    if (!b) return;
    try {
      await navigator.clipboard.writeText(b.dataset.copiar);
      b.textContent = '¡Copiado!';
    } catch {
      // Sin permiso para el portapapeles: el alias queda a la vista para copiarlo a mano.
      b.textContent = 'Copialo a mano';
    }
  });
}

function pintarBarra(acciones) {
  const barra = $('portal-acc-barra');
  const contenido = htmlBarraAcciones(acciones).toString();
  barra.innerHTML = contenido;
  barra.hidden = !contenido;
  $('publico').classList.toggle('con-barra', Boolean(contenido));
}

/**
 * Arranca lo común. Hasta que responde la base, la barra queda oculta: nunca
 * un botón a un formulario que quizá ya cerró. Si la URL es la vuelta de un
 * login, portalEntrada.js ya está mandando a /app y acá no se consulta nada
 * (el cliente de Supabase canjearía el ?code= en esta página).
 */
export async function iniciarMarco() {
  marcarPaginaActual();
  $('portal-pie-sede').innerHTML = htmlSedePie(PORTAL.sede);
  iniciarCopiar();
  if (destinoDeAuth(window.location.search, window.location.hash)) return null;
  const { estado, formularios } = await resolverFormularios(() => formulariosPublicos(PORTAL.clubId), PORTAL.formularios);
  const separados = separarFormularios(formularios);
  pintarBarra(accionesPrincipales(separados));
  return { estado, ...separados };
}

/**
 * En el inicio, las tarjetas del hero ya son esos dos botones: la barra se
 * esconde mientras se ven y flota cuando salen de pantalla. Sin
 * IntersectionObserver, la barra queda siempre a la vista.
 */
export function esconderBarraMientrasSeVea(elemento) {
  const barra = $('portal-acc-barra');
  barra.classList.add('flotante');
  if (!elemento || typeof IntersectionObserver !== 'function') return;
  barra.classList.add('escondida');
  // threshold 1: con letra agrandada las tarjetas no entran enteras, y con un pedazo a la vista la barra seguiría escondida sin que se vea el segundo botón.
  new IntersectionObserver(([e]) => barra.classList.toggle('escondida', e.intersectionRatio >= 1), { threshold: 1 }).observe(elemento);
}
