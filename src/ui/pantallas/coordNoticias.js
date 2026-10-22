import {
  listarNoticias, crearNoticia, actualizarNoticia, borrarNoticia, subirFotoNoticia, borrarFotosNoticia, urlFotoNoticia,
} from '../../data/repositorio.js';
import {
  validarNoticia, validarArchivoFoto, medidasAchicadas, rutaFoto, rotuloDeEtiqueta, fechaDeNoticia, textoFechaCorta,
  ETIQUETAS_NOTICIA, MAX_FOTOS, MAX_BYTES_FOTO, CALIDADES_FOTO, TIPOS_FOTO_ORIGINAL,
} from '../../data/noticias.js';
import { hoyEnRosario } from '../../data/agenda.js';
import { LIMITE } from '../../data/limites.js';
import { obtenerClubActual } from '../sesion.js';
import { toast, esErrorDeRed } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { confirmarEnHoja } from '../componentes/confirmar.js';
import { $ } from '../dom.js';
import { html } from '../html.js';
import { avisoDeError, mensajeAlGuardar, mostrarAviso } from '../errores.js';
import { htmlDetalleNoticia } from '../portalNoticias.js';

/*
 * Noticias del portal del básquet (0064, spec 2026-10-21): la coordinación
 * escribe, publica, despublica y borra las noticias que las familias ven en
 * la página pública, con fotos. Se llega desde la pestaña FAMILIAS, como
 * Formularios.
 *
 * Lo publicado lo ve cualquiera, sin cuenta, y en un club formativo las fotos
 * son de menores: por eso el aviso de arriba, la descripción obligatoria de
 * cada foto (sin nombres) y la casilla de la autorización de imagen, que la
 * base también exige (check de 0064).
 */

let noticias = [];
// Del editor abierto: las fotos que quedan ({ ruta } ya guardadas o { blob }
// recién elegidas, con su url y su alt) y las rutas de las que se sacaron.
let fotos = [];
let quitadas = [];

const contenedor = () => $('coord-noticias-contenido');

const mensajeDeError = (e) => mensajeAlGuardar(e, {
  reglas: [
    [/noticia_fotos_autorizadas/, 'Falta confirmar la autorización de imagen de las familias.'],
    [/noticia_fotos_validas/, 'Una de las fotos no se guardó bien. Sacala y volvé a subirla.'],
    [/exceeded the maximum allowed size|Payload too large/i, 'Una de las fotos pesa más de 1 MB. Sacala y volvé a subirla.'],
  ],
  permiso: /NO_SE_PUDO|row-level security|permission denied|Unauthorized/i,
});

const CAMPO = { titulo: 'not-titulo', resumen: 'not-resumen', cuerpo: 'not-cuerpo', etiqueta: 'not-etiqueta', autorizacion: 'not-autorizacion' };
const campoDelError = (r) => (r.campo === 'fotos' ? (r.foto != null ? `not-alt-${r.foto}` : 'not-archivos') : CAMPO[r.campo]);

function filaHtml(n) {
  const fecha = n.publicadaEn ? ` · ${textoFechaCorta(fechaDeNoticia(n.publicadaEn))}` : '';
  return html`
    <div class="jug-fila form-fila">
      <button type="button" class="form-fila-texto" data-noticia="${n.id}">
        <span class="nom">${n.titulo}</span>
        <span class="det">${rotuloDeEtiqueta(n.etiqueta)}${fecha}</span>
      </button>
      ${n.publicada ? html`<span class="chip">Publicada</span>` : html`<span class="chip sin">Borrador</span>`}
    </div>`;
}

export async function renderNoticias() {
  const club = obtenerClubActual();
  if (!club) return;
  contenedor().innerHTML = html`<div class="pad"><div class="p" role="status">Cargando…</div></div>`;
  try {
    noticias = await listarNoticias(club.id);
  } catch (e) {
    contenedor().innerHTML = html`${avisoDeError(e, 'No se pudieron cargar las noticias.')}
      <div class="pad"><button class="btn sec" id="btn-reintentar-noticias">Reintentar</button></div>`;
    $('btn-reintentar-noticias').addEventListener('click', () => renderNoticias());
    return;
  }

  const cuerpo = noticias.length
    ? html`<div class="eyebrow">Noticias <span class="der">${noticias.filter((n) => n.publicada).length} publicadas</span></div>
      ${noticias.map(filaHtml)}`
    : html`<div class="estado-vacio"><h2>Noticias</h2>
        <div class="p">Todavía no hay noticias. Las que publiques aparecen en la página del básquet, en el inicio y en Noticias.</div>
      </div>`;

  contenedor().innerHTML = html`
    <div class="pad">
      <div class="p det">Lo que publicás acá lo ve cualquiera que abra la página del básquet, sin entrar con ninguna cuenta: no pongas nombres de chicos ni datos personales, ni en el texto ni en la descripción de las fotos. Las fotos van sólo con la autorización de imagen firmada por las familias. Despublicar no saca las fotos: para eso, quitalas o borrá la noticia.</div>
      <p class="p det"><a href="/noticias" target="_blank" rel="noopener">Ver cómo lo ven las familias</a></p>
      ${cuerpo}
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-nueva-noticia">Nueva noticia</button></div>`;

  $('btn-nueva-noticia').addEventListener('click', () => abrirEditor(null));
  contenedor().querySelectorAll('[data-noticia]').forEach((b) => b.addEventListener('click', () => {
    abrirEditor(noticias.find((n) => n.id === b.dataset.noticia));
  }));
}

const aBlob = (lienzo, tipo, calidad) => new Promise((listo) => lienzo.toBlob(listo, tipo, calidad));

/**
 * Achica la foto a LADO_MAX_FOTO y la pasa a webp. Safari no sabe codificar
 * webp desde un canvas (devuelve png): ahí va jpeg. Prueba calidades hasta que
 * pesa menos que lo que acepta el bucket. Tira un Error con el mensaje para la
 * persona si la foto no sirve.
 */
async function achicarFoto(archivo) {
  const problema = validarArchivoFoto(archivo);
  if (problema) throw new Error(problema);
  let imagen;
  try {
    imagen = await createImageBitmap(archivo);
  } catch {
    throw new Error('No pudimos abrir esa foto. Probá con otra o mandá una captura.');
  }
  const { ancho, alto } = medidasAchicadas(imagen.width, imagen.height);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext('2d').drawImage(imagen, 0, 0, ancho, alto);
  imagen.close();
  for (const calidad of CALIDADES_FOTO) {
    let blob = await aBlob(lienzo, 'image/webp', calidad);
    if (blob?.type !== 'image/webp') blob = await aBlob(lienzo, 'image/jpeg', calidad);
    if (blob && blob.size <= MAX_BYTES_FOTO) return blob;
  }
  throw new Error('La foto sigue pesando más de 1 MB después de achicarla. Probá con otra.');
}

function liberarPrevias() {
  for (const f of fotos) if (f.blob) URL.revokeObjectURL(f.url);
}

function pintarFotos() {
  $('not-fotos').innerHTML = html`${fotos.map((f, i) => html`<div class="not-foto">
    <img src="${f.url}" alt="" width="72" height="72">
    <div class="campo">
      <label for="not-alt-${i}">Qué se ve en la foto ${i + 1}</label>
      <input id="not-alt-${i}" type="text" maxlength="${LIMITE.altFoto}" value="${f.alt}" data-alt="${i}" placeholder="Ej.: La U13 en el Microestadio (sin nombres)">
    </div>
    <button type="button" class="btn sec chico" data-quitar="${i}">Quitar</button>
  </div>`)}`;
  $('not-archivos').disabled = fotos.length >= MAX_FOTOS;
}

async function agregarFotos(input) {
  const lugar = MAX_FOTOS - fotos.length;
  const elegidos = [...input.files].slice(0, lugar);
  const sobran = input.files.length - elegidos.length;
  input.value = '';
  $('not-aviso').innerHTML = '';
  const avisos = [];
  if (sobran > 0) avisos.push(`Hasta ${MAX_FOTOS} fotos por noticia: ${sobran === 1 ? 'una quedó afuera' : `${sobran} quedaron afuera`}.`);
  for (const archivo of elegidos) {
    try {
      const blob = await achicarFoto(archivo);
      fotos.push({ blob, url: URL.createObjectURL(blob), alt: '' });
    } catch (e) {
      avisos.push(e.message);
    }
  }
  if (avisos.length) mostrarAviso($('not-aviso'), avisos.join(' '));
  pintarFotos();
}

function pintarPrevia() {
  $('not-previa-cuerpo').innerHTML = htmlDetalleNoticia({
    titulo: $('not-titulo').value, resumen: $('not-resumen').value, cuerpo: $('not-cuerpo').value,
    etiqueta: $('not-etiqueta').value, fecha: hoyEnRosario(), fotos: fotos.map((f) => ({ url: f.url, alt: f.alt })),
  }, window.SUPABASE_URL, { previa: true });
}

/** Alta (noticia nula) o edición. */
function abrirEditor(noticia) {
  liberarPrevias();
  fotos = (noticia?.fotos ?? []).map((f) => ({ ruta: f.ruta, url: urlFotoNoticia(f.ruta), alt: f.alt }));
  quitadas = [];
  const v = noticia ?? { titulo: '', resumen: '', cuerpo: '', etiqueta: 'club', autorizacionImagen: false, publicada: false };
  abrirHoja({
    titulo: noticia ? 'Editar noticia' : 'Nueva noticia',
    alCerrar: liberarPrevias,
    cuerpo: html`
      <div class="campo">
        <label for="not-titulo">Título</label>
        <input id="not-titulo" type="text" maxlength="${LIMITE.tituloNoticia}" autocomplete="off" value="${v.titulo}" placeholder="Ej.: Arrancó la temporada de la U13">
      </div>
      <div class="campo">
        <label for="not-resumen">Resumen (es lo que se ve en la tarjeta)</label>
        <textarea id="not-resumen" rows="2" maxlength="${LIMITE.resumenNoticia}">${v.resumen}</textarea>
      </div>
      <div class="campo">
        <label for="not-cuerpo">Texto</label>
        <textarea id="not-cuerpo" rows="8" maxlength="${LIMITE.cuerpoNoticia}">${v.cuerpo}</textarea>
      </div>
      <div class="p det">Para separar párrafos, dejá una línea en blanco.</div>
      <div class="campo">
        <label for="not-etiqueta">De qué es</label>
        <span class="env"><select id="not-etiqueta">
          ${ETIQUETAS_NOTICIA.map((e) => html`<option value="${e.clave}"${v.etiqueta === e.clave && html` selected`}>${e.rotulo}</option>`)}
        </select></span>
      </div>
      <div class="campo">
        <label for="not-archivos">Fotos (hasta ${MAX_FOTOS})</label>
        <div id="not-fotos"></div>
        <input id="not-archivos" type="file" accept="${TIPOS_FOTO_ORIGINAL.join(',')}" multiple>
      </div>
      <label class="acepto" for="not-autorizacion">
        <input id="not-autorizacion" type="checkbox"${v.autorizacionImagen && html` checked`}>
        <span>Tengo la autorización de imagen firmada por las familias de los chicos que se ven en las fotos.</span>
      </label>
      <details id="not-previa"><summary>Vista previa</summary><div class="portal-papel" id="not-previa-cuerpo"></div></details>
      <div id="not-aviso"></div>
      <div class="acciones-hoja">
        <button type="button" class="btn sec" id="not-borrador">${v.publicada ? 'Despublicar' : 'Guardar borrador'}</button>
        <button type="button" class="btn" id="not-publicar">${v.publicada ? 'Guardar' : 'Publicar'}</button>
      </div>
      ${noticia && html`<div class="acciones-hoja"><button type="button" class="btn sec" id="not-borrar">Borrar noticia</button></div>`}`.toString(),
  });
  pintarFotos();
  $('not-fotos').addEventListener('input', (ev) => {
    const i = ev.target.dataset.alt;
    if (i !== undefined) fotos[Number(i)].alt = ev.target.value;
  });
  $('not-fotos').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-quitar]');
    if (!b) return;
    const [f] = fotos.splice(Number(b.dataset.quitar), 1);
    if (f.ruta) quitadas.push(f.ruta);
    if (f.blob) URL.revokeObjectURL(f.url);
    pintarFotos();
  });
  $('not-archivos').addEventListener('change', (ev) => agregarFotos(ev.target));
  $('not-previa').addEventListener('toggle', () => { if ($('not-previa').open) pintarPrevia(); });
  $('not-borrador').addEventListener('click', () => guardar(noticia, false, $('not-borrador')));
  $('not-publicar').addEventListener('click', () => guardar(noticia, true, $('not-publicar')));
  $('not-borrar')?.addEventListener('click', () => borrar(noticia));
}

async function guardar(noticia, publicada, boton) {
  if (boton.disabled) return;
  $('not-aviso').innerHTML = '';
  const r = validarNoticia({
    titulo: $('not-titulo').value, resumen: $('not-resumen').value, cuerpo: $('not-cuerpo').value,
    etiqueta: $('not-etiqueta').value, fotos, autorizacionImagen: $('not-autorizacion').checked,
  });
  if (r.error) {
    mostrarAviso($('not-aviso'), r.error, { campo: $(campoDelError(r)) });
    return;
  }
  const club = obtenerClubActual();
  // El id de una noticia nueva lo pone el navegador: las fotos se suben a la carpeta de la noticia antes de crear la fila.
  const id = noticia?.id ?? crypto.randomUUID();
  const texto = boton.textContent;
  // Los tres botones: con sólo el tocado deshabilitado, un segundo toque en el otro guardaba dos veces (dos ids, fotos subidas dos veces).
  const deshabilitar = (v) => document.querySelectorAll('.acciones-hoja button').forEach((b) => { b.disabled = v; });
  deshabilitar(true);
  boton.textContent = 'Guardando…';
  const subidas = [];
  try {
    const guardadas = [];
    for (const [i, f] of fotos.entries()) {
      let { ruta } = f;
      if (!ruta) {
        ruta = rutaFoto(club.id, id, crypto.randomUUID(), f.blob.type);
        await subirFotoNoticia(ruta, f.blob);
        subidas.push(ruta);
      }
      guardadas.push({ ruta, alt: r.noticia.alts[i] });
    }
    const { titulo, resumen, cuerpo, etiqueta, autorizacionImagen } = r.noticia;
    const datos = { titulo, resumen, cuerpo, etiqueta, fotos: guardadas, autorizacionImagen, publicada };
    await (noticia ? actualizarNoticia(id, datos) : crearNoticia({ id, clubId: club.id, ...datos }));
  } catch (e) {
    // Si no se guardó, las fotos que alcanzaron a subir no quedan sueltas en el bucket.
    // Salvo que se haya cortado la red: puede que la fila sí se haya guardado y las nombre, y borrarlas la dejaría con fotos rotas.
    if (!esErrorDeRed(e)) await borrarFotosNoticia(subidas).catch(() => {});
    mostrarAviso($('not-aviso'), esErrorDeRed(e) ? 'Se cortó la conexión y no sabemos si se guardó. Cerrá esta hoja y mirá la lista antes de volver a intentar.' : mensajeDeError(e));
    deshabilitar(false);
    boton.textContent = texto;
    return;
  }
  // Las que se sacaron, recién ahora que la noticia ya no las nombra. Si esto
  // falla, quedan en el bucket sin que ninguna página las muestre.
  await borrarFotosNoticia(quitadas).catch(() => {});
  cerrarHoja();
  toast(publicada ? 'Noticia publicada.' : 'Guardada. Las familias no la ven.');
  await renderNoticias();
}

function borrar(noticia) {
  confirmarEnHoja({
    titulo: 'Borrar noticia',
    texto: `Se borra «${noticia.titulo}» con sus fotos y deja de verse en la página. No se puede deshacer.`,
    verbo: 'Borrar',
    alConfirmar: async () => {
      try {
        await borrarNoticia(noticia);
      } catch (e) {
        toast(mensajeDeError(e));
        throw e;
      }
      toast('Noticia borrada.');
      await renderNoticias();
    },
  });
}
