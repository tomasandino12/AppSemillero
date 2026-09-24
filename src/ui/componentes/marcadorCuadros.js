import { html } from '../html.js';
import { tablaDeCuadros, cuadroEnTiempo } from '../../data/tablaCuadros.js';
import {
  tiempoDeVuelo, alturaDeSalto, validarTiempoDeVuelo, FPS_MIN, FPS_MAX,
} from '../../data/salto.js';
import { protocoloHtml } from './protocoloSalto.js';
import { toast } from '../nav.js';

// El moov de un mp4/mov está al principio o al final del archivo.
const BYTES_EXTREMO = 4 * 1024 * 1024;
const ESPERA_SEEK_MS = 1500;
const ESPERA_CARGA_MS = 10000;

async function leerTabla(archivo) {
  const cabeza = new Uint8Array(await archivo.slice(0, BYTES_EXTREMO).arrayBuffer());
  const deCabeza = tablaDeCuadros(cabeza);
  if (deCabeza) return deCabeza;
  if (archivo.size <= BYTES_EXTREMO) return null;
  const cola = new Uint8Array(await archivo.slice(archivo.size - BYTES_EXTREMO).arrayBuffer());
  return tablaDeCuadros(cola);
}

/**
 * Marca despegue y aterrizaje en un video y devuelve el tiempo de vuelo, o null
 * si se cancela. El video no se sube ni se guarda: sólo vive como objectURL
 * mientras el marcador está abierto.
 *
 * Se mueve por índice de cuadro, con la tabla leída del archivo, y no con
 * requestVideoFrameCallback: en la cámara lenta del S24 FE el primer cuadro
 * dura 1,17 s y, en pausa, un seek dentro del mismo cuadro no avisa nunca
 * (FUNDAMENTO.md §10). El video queda siempre en pausa y sin controles nativos.
 *
 * @param {{ archivo: File, fpsCaptura: number }} args
 * @returns {Promise<{ tiempoVueloMs: number, fpsCaptura: number } | null>}
 */
export async function abrirMarcador({ archivo, fpsCaptura }) {
  if (!(fpsCaptura >= FPS_MIN && fpsCaptura <= FPS_MAX)) {
    toast(`Los fps de captura tienen que estar entre ${FPS_MIN} y ${FPS_MAX}.`);
    return null;
  }
  let tabla;
  try {
    tabla = await leerTabla(archivo);
  } catch {
    tabla = null;
  }
  if (!tabla || tabla.tiempos.length < 2) {
    toast('No puedo leer los cuadros de este video. Grabalo con la app de Cámara, sin editarlo.');
    return null;
  }
  return new Promise((resolver) => montar(archivo, tabla, fpsCaptura, resolver));
}

function montar(archivo, { tiempos, intervaloS }, fpsCaptura, resolver) {
  const ultimo = tiempos.length - 1;
  const url = URL.createObjectURL(archivo);
  const raiz = document.createElement('div');
  raiz.className = 'marcador-cuadros';
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-label', 'Marcar el salto');
  // Chrome informa igual un bloqueo de la CSP que otros rechazos de la URL
  // ("URL safety check"). Este evento sólo llega si fue la CSP, y trae la
  // política aplicada: si no tiene media-src, la página es de antes del deploy.
  // Va antes del innerHTML porque el video empieza a cargar al crearse.
  let violacion = null;
  const alViolarCsp = (e) => {
    if (e.effectiveDirective !== 'media-src' && !e.blockedURI.startsWith('blob')) return;
    violacion = e;
    avisarSinVideo(e.originalPolicy.includes('media-src')
      ? `La política de seguridad bloqueó el video (${e.effectiveDirective}).`
      : 'La página abierta es de una versión anterior y bloquea el video. Cerrá la pestaña y volvé a abrir la app.');
  };
  document.addEventListener('securitypolicyviolation', alViolarCsp);
  raiz.innerHTML = html`
    <div class="marcador-cuerpo">
      <button type="button" class="jvc-cerrar" data-m="cerrar" aria-label="Cerrar">&#10005;</button>
      <video class="marcador-video" muted playsinline preload="auto" src="${url}"></video>
      <p class="marcador-resultado" data-m="aviso-video" role="alert" hidden></p>
      <input type="range" class="marcador-slider" data-m="slider" min="0" max="${ultimo}" value="0" step="1" aria-label="Cuadro del video">
      <p class="marcador-cuadro">Cuadro <span class="mono" data-m="cuadro">0</span> de ${ultimo}</p>
      <div class="marcador-pasos">
        <button type="button" class="btn sec chico" data-paso="-10">−10</button>
        <button type="button" class="btn sec chico" data-paso="-1">−1</button>
        <button type="button" class="btn sec chico" data-paso="1">+1</button>
        <button type="button" class="btn sec chico" data-paso="10">+10</button>
      </div>
      <div class="marcador-marcas">
        <button type="button" class="btn sec" data-m="despegue">Despegue <span class="mono" data-m="vd">—</span></button>
        <button type="button" class="btn sec" data-m="aterrizaje">Aterrizaje <span class="mono" data-m="va">—</span></button>
      </div>
      <p class="marcador-resultado" data-m="resultado" role="status">Marcá el despegue y el aterrizaje.</p>
      <button type="button" class="btn" data-m="usar" disabled>Usar este salto</button>
      <details class="marcador-protocolo">
        <summary>¿Cómo se mide?</summary>
        ${protocoloHtml()}
      </details>
    </div>
  `.toString();
  document.body.appendChild(raiz);

  const $m = (n) => raiz.querySelector(`[data-m="${n}"]`);
  const video = raiz.querySelector('video');
  let actual = 0;
  let despegue = null;
  let aterrizaje = null;
  let resultado = null;
  let yendo = false;
  let pendiente = null;

  function alTeclear(e) {
    if (e.key === 'Escape') cerrar(null);
    else if (e.key === 'ArrowLeft') irA(actual - 1);
    else if (e.key === 'ArrowRight') irA(actual + 1);
  }

  function cerrar(valor) {
    document.removeEventListener('keydown', alTeclear);
    document.removeEventListener('securitypolicyviolation', alViolarCsp);
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
    raiz.remove();
    resolver(valor);
  }

  // A mitad del cuadro, no en su borde: en el borde el navegador puede
  // redondear al cuadro vecino.
  const instanteDe = (i) => tiempos[i] + ((tiempos[i + 1] ?? tiempos[i] + intervaloS) - tiempos[i]) / 2;

  function irA(i) {
    actual = Math.min(ultimo, Math.max(0, i));
    $m('cuadro').textContent = String(actual);
    $m('slider').value = String(actual);
    if (yendo) { pendiente = actual; return; }
    yendo = true;
    let listo = false;
    const terminar = () => {
      if (listo) return;
      listo = true;
      video.removeEventListener('seeked', terminar);
      yendo = false;
      if (pendiente != null) {
        const p = pendiente;
        pendiente = null;
        irA(p);
      }
    };
    video.addEventListener('seeked', terminar);
    // Si el seek cae en el mismo cuadro, `seeked` puede no llegar: el timeout evita colgarse.
    setTimeout(terminar, ESPERA_SEEK_MS);
    video.currentTime = instanteDe(actual);
  }

  function recalcular() {
    $m('vd').textContent = despegue == null ? '—' : String(despegue);
    $m('va').textContent = aterrizaje == null ? '—' : String(aterrizaje);
    resultado = null;
    const usar = $m('usar');
    const texto = $m('resultado');
    usar.disabled = true;
    if (despegue == null || aterrizaje == null) {
      texto.textContent = 'Marcá el despegue y el aterrizaje.';
      return;
    }
    const cuadros = aterrizaje - despegue;
    const tv = tiempoDeVuelo(cuadros, fpsCaptura);
    const veredicto = validarTiempoDeVuelo(tv);
    if (!veredicto.ok) {
      texto.textContent = veredicto.motivo;
      return;
    }
    // Centésimas de ms, como numeric(6,2) de medicion_salto.
    resultado = { tiempoVueloMs: Math.round(tv * 100000) / 100, fpsCaptura };
    texto.textContent = `${cuadros} cuadros a ${fpsCaptura} fps: vuelo de ${Math.round(tv * 1000)} ms, salto de ${alturaDeSalto(tv).toFixed(1)} cm.`;
    usar.disabled = false;
  }

  raiz.addEventListener('click', (e) => {
    const paso = e.target.closest('[data-paso]');
    if (paso) irA(actual + Number(paso.dataset.paso));
  });
  $m('slider').addEventListener('input', (e) => irA(Number(e.target.value)));
  $m('despegue').addEventListener('click', () => { despegue = actual; recalcular(); });
  $m('aterrizaje').addEventListener('click', () => { aterrizaje = actual; recalcular(); });
  $m('usar').addEventListener('click', () => { if (resultado) cerrar(resultado); });
  $m('cerrar').addEventListener('click', () => cerrar(null));
  document.addEventListener('keydown', alTeclear);

  // Si el navegador no puede abrir el video (HEVC en muchas PC), el <video>
  // queda en negro sin avisar. El detalle técnico va a la vista porque es la
  // única pista que llega desde el celular del profe.
  function avisarSinVideo(texto) {
    const aviso = $m('aviso-video');
    aviso.textContent = texto;
    aviso.hidden = false;
  }
  video.addEventListener('error', () => {
    if (violacion) return;
    const e = video.error;
    const detalle = `error ${e?.code ?? '?'}${e?.message ? `: ${e.message}` : ''}`;
    avisarSinVideo(e?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
      ? `Este navegador no puede abrir el video (${detalle}). Probá desde el celular, o grabá con "Videos de alta eficiencia" desactivado en la cámara.`
      : `No se pudo cargar el video (${detalle}).`);
  });
  setTimeout(() => {
    if (raiz.isConnected && !video.error && video.readyState < HTMLMediaElement.HAVE_METADATA) {
      avisarSinVideo(`El video no terminó de cargar (readyState ${video.readyState}, networkState ${video.networkState}).`);
    }
  }, ESPERA_CARGA_MS);

  video.addEventListener('loadedmetadata', () => {
    actual = cuadroEnTiempo(tiempos, video.currentTime);
    irA(actual);
  }, { once: true });
}
