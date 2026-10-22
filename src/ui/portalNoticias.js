import { html } from './html.js';
import { $ } from './dom.js';
import { noticiasPublicas, noticiaPublica } from '../data/repositorio.js';
import { PORTAL } from '../data/portal.js';
import { fechaLarga } from '../data/agenda.js';
import {
  rotuloDeEtiqueta, textoFechaCorta, parrafos, esIdNoticia, urlFotoValida, NOTICIAS_POR_PAGINA,
} from '../data/noticias.js';
import { destinoDeAuth } from '../data/entradaAuth.js';
import { iniciarMarco } from './portalMarco.js';

/*
 * Noticias en el portal (0064, spec 2026-10-21): las últimas 3 en el inicio,
 * todas en /noticias y una entera en /noticias?n=<id>. Lo que escribió la
 * coordinación sale escapado (html``), y una foto sólo se muestra si es del
 * bucket de noticias del proyecto (`base` = window.SUPABASE_URL).
 */

/** Una tarjeta, como las del sitio del club: foto, etiqueta, título, resumen, fecha y "Leer". */
export function htmlTarjetaNoticia(n, base) {
  const foto = n.foto ? urlFotoValida(n.foto.url, base) : null;
  const etiqueta = rotuloDeEtiqueta(n.etiqueta);
  return html`<article class="portal-not"><a href="/noticias?n=${n.id}">
    ${foto && html`<img src="${foto}" alt="${n.foto.alt}" loading="lazy">`}
    <div class="portal-not-cuerpo">
      ${etiqueta && html`<span class="portal-not-et">${etiqueta}</span>`}
      <h3>${n.titulo}</h3>
      <p>${n.resumen}</p>
      <div class="portal-not-pie">${n.fecha && html`<time datetime="${n.fecha}">${textoFechaCorta(n.fecha)}</time>`}<span aria-hidden="true">Leer →</span></div>
    </div>
  </a></article>`;
}

/** La grilla de tarjetas. Sin ninguna, nada: quien la usa oculta la sección. */
export function htmlListaNoticias(lista, base) {
  const validas = (lista ?? []).filter((n) => esIdNoticia(n?.id));
  if (!validas.length) return html``;
  return html`<div class="portal-nots">${validas.map((n) => htmlTarjetaNoticia(n, base))}</div>`;
}

/**
 * Una noticia entera. `previa`: la vista previa del panel, donde una foto
 * recién elegida todavía es un blob: y no hay lista a la que volver.
 */
export function htmlDetalleNoticia(n, base, { previa = false } = {}) {
  const fotos = (n.fotos ?? []).map((f) => ({ url: urlFotoValida(f.url, base, { previa }), alt: f.alt })).filter((f) => f.url);
  const etiqueta = rotuloDeEtiqueta(n.etiqueta);
  return html`<article class="portal-art">
    ${!previa && html`<a class="portal-art-volver" href="/noticias">← Todas las noticias</a>`}
    ${etiqueta && html`<span class="portal-not-et">${etiqueta}</span>`}
    <h1>${n.titulo}</h1>
    ${n.fecha && html`<time datetime="${n.fecha}">${fechaLarga(n.fecha)}</time>`}
    <p class="portal-art-bajada">${n.resumen}</p>
    ${fotos.length > 0 && html`<div class="portal-art-fotos">${fotos.map((f) => html`<figure><img src="${f.url}" alt="${f.alt}" loading="lazy"></figure>`)}</div>`}
    <div class="portal-art-cuerpo">${parrafos(n.cuerpo).map((p) => html`<p>${p}</p>`)}</div>
  </article>`;
}

export function htmlNoticiaNoEsta() {
  return html`<div class="portal-art">
    <h1>Esta noticia ya no está</h1>
    <p class="portal-not-nada">Puede que la hayan sacado, o que el link haya llegado cortado.</p>
    <p><a class="btn" href="/noticias">Ver todas las noticias</a></p>
  </div>`;
}

export const htmlSinNoticias = () => html`<p class="portal-not-nada">Todavía no hay noticias publicadas.</p>`;

export const htmlErrorNoticias = () => html`<p class="portal-not-nada">No pudimos traer las noticias. Probá de nuevo en un rato.</p>`;

/** Inicio: las últimas 4 (la primera va destacada, ver portal.css). Sin noticias, sin red o sin 0064 en la base, la sección queda oculta. */
export async function iniciarUltimasNoticias() {
  try {
    const lista = await noticiasPublicas(PORTAL.clubId, { limite: 4 });
    const contenido = htmlListaNoticias(lista, window.SUPABASE_URL).toString();
    $('portal-noticias').innerHTML = contenido;
    $('noticias').hidden = !contenido;
  } catch {
    // La función todavía no existe (0064 sin aplicar) o no hay red: el resto del inicio sigue igual.
  }
}

async function mostrarDetalle(id) {
  $('noticias-cab').hidden = true;
  $('noticias').removeAttribute('aria-labelledby');
  const lugar = $('portal-noticias');
  if (!esIdNoticia(id)) {
    lugar.innerHTML = htmlNoticiaNoEsta();
    return;
  }
  let noticia;
  try {
    noticia = await noticiaPublica(PORTAL.clubId, id);
  } catch {
    lugar.innerHTML = htmlErrorNoticias();
    return;
  }
  if (!noticia) {
    lugar.innerHTML = htmlNoticiaNoEsta();
    return;
  }
  document.title = `${noticia.titulo} · Básquet Newell's`;
  lugar.innerHTML = htmlDetalleNoticia(noticia, window.SUPABASE_URL);
}

async function mostrarLista() {
  const base = window.SUPABASE_URL;
  let mostradas = [];
  const traer = async (antesDe) => {
    const nuevas = await noticiasPublicas(PORTAL.clubId, { limite: NOTICIAS_POR_PAGINA, antesDe });
    mostradas = [...mostradas, ...nuevas];
    $('portal-noticias').innerHTML = mostradas.length ? htmlListaNoticias(mostradas, base) : htmlSinNoticias();
    $('noticias-mas').hidden = nuevas.length < NOTICIAS_POR_PAGINA;
  };
  $('btn-noticias-mas').addEventListener('click', async (ev) => {
    const boton = ev.currentTarget;
    if (boton.disabled) return;
    boton.disabled = true;
    try {
      await traer(mostradas.at(-1)?.publicadaEn ?? null);
      boton.textContent = 'Ver más noticias';
    } catch {
      boton.textContent = 'No se pudo. Tocá para probar de nuevo';
    } finally {
      boton.disabled = false;
    }
  });
  try {
    await traer(null);
  } catch {
    $('portal-noticias').innerHTML = htmlErrorNoticias();
  }
}

/** /noticias: la lista de a páginas, o una entera con ?n=<id>. */
export async function iniciarPaginaNoticias() {
  const marco = iniciarMarco();
  if (destinoDeAuth(window.location.search, window.location.hash)) return;
  const id = new URLSearchParams(window.location.search).get('n');
  await (id !== null ? mostrarDetalle(id) : mostrarLista());
  await marco;
}
