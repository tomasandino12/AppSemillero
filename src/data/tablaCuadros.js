/**
 * La tabla de tiempos de cada cuadro de un video mp4/mov, leída del átomo
 * `moov` sin decodificar nada. Puro: recibe bytes (la pantalla lee el principio
 * y el final del archivo con `file.slice`, ahí vive el `moov`).
 *
 * Por qué existe: el marcador no puede depender de `requestVideoFrameCallback`.
 * En la cámara lenta del S24 FE el cuadro 0 dura 1,17 s y los demás 33,33 ms
 * (FUNDAMENTO.md §10), y con el video en pausa un seek que cae dentro del mismo
 * cuadro no presenta ninguno nuevo, así que rVFC nunca avisa. La tabla dice
 * cuántos cuadros hay y cuándo empieza cada uno, y el marcador se mueve de
 * cuadro en cuadro por índice, sin esperar al reproductor.
 */

/**
 * @param {Uint8Array} bytes
 * @returns {{ tiempos: number[], intervaloS: number } | null}
 *   `tiempos[i]` es el segundo en que empieza el cuadro i (ordenado por
 *   presentación, con el primero en 0); `intervaloS` es la mediana entre cuadros.
 */
export function tablaDeCuadros(bytes) {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Un "moov" puede aparecer por azar dentro de los cuadros del video: sólo
  // cuenta el que cierra dentro de los bytes y arranca con un `mvhd`.
  for (const inicio of posicionesDeMoov(bytes, vista)) {
    const tabla = tablaDeUnMoov(bytes, vista, inicio);
    if (tabla) return tabla;
  }
  return null;
}

/** Índice del cuadro que se está mostrando en el segundo `t` (el último que empezó antes). */
export function cuadroEnTiempo(tiempos, t) {
  let lo = 0;
  let hi = tiempos.length - 1;
  while (lo < hi) {
    const medio = (lo + hi + 1) >> 1;
    if (tiempos[medio] <= t) lo = medio;
    else hi = medio - 1;
  }
  return lo;
}

function* posicionesDeMoov(bytes, vista) {
  for (let i = 4; i + 8 <= bytes.length; i += 1) {
    if (bytes[i] !== 0x6d || bytes[i + 1] !== 0x6f || bytes[i + 2] !== 0x6f || bytes[i + 3] !== 0x76) continue;
    const inicio = i - 4;
    const tamanio = vista.getUint32(inicio);
    if (tamanio < 16 || inicio + tamanio > bytes.length) continue;
    if (tipoEn(bytes, inicio + 12) === 'mvhd') yield inicio;
  }
}

function tablaDeUnMoov(bytes, vista, inicio) {
  const fin = inicio + vista.getUint32(inicio);
  for (const trak of hijos(vista, bytes, inicio + 8, fin, 'trak')) {
    const mdia = hijos(vista, bytes, trak.desde, trak.hasta, 'mdia')[0];
    if (!mdia) continue;
    const hdlr = hijos(vista, bytes, mdia.desde, mdia.hasta, 'hdlr')[0];
    // hdlr: versión+flags (4), pre_defined (4), luego el tipo de la pista.
    if (!hdlr || tipoEn(bytes, hdlr.desde + 8) !== 'vide') continue;
    const mdhd = hijos(vista, bytes, mdia.desde, mdia.hasta, 'mdhd')[0];
    const minf = hijos(vista, bytes, mdia.desde, mdia.hasta, 'minf')[0];
    const stbl = minf && hijos(vista, bytes, minf.desde, minf.hasta, 'stbl')[0];
    if (!mdhd || !stbl) continue;
    const escala = escalaDeTiempo(vista, mdhd);
    const stts = hijos(vista, bytes, stbl.desde, stbl.hasta, 'stts')[0];
    const ctts = hijos(vista, bytes, stbl.desde, stbl.hasta, 'ctts')[0];
    const tabla = stts && armarTabla(vista, stts, ctts, escala);
    if (tabla) return tabla;
  }
  return null;
}

function armarTabla(vista, stts, ctts, escala) {
  if (!(escala > 0)) return null;
  const dts = [];
  const n = vista.getUint32(stts.desde + 4);
  if (stts.desde + 8 + n * 8 > stts.hasta) return null;
  let t = 0;
  for (let k = 0; k < n; k += 1) {
    const cantidad = vista.getUint32(stts.desde + 8 + k * 8);
    const duracion = vista.getUint32(stts.desde + 12 + k * 8);
    for (let c = 0; c < cantidad; c += 1) { dts.push(t); t += duracion; }
  }
  if (dts.length < 2) return null;

  const pts = dts.slice();
  if (ctts) {
    const conSigno = vista.getUint8(ctts.desde) >= 1; // la versión 1 trae desfases con signo
    const entradas = vista.getUint32(ctts.desde + 4);
    if (ctts.desde + 8 + entradas * 8 > ctts.hasta) return null;
    let i = 0;
    for (let k = 0; k < entradas; k += 1) {
      const cantidad = vista.getUint32(ctts.desde + 8 + k * 8);
      const desfase = conSigno ? vista.getInt32(ctts.desde + 12 + k * 8) : vista.getUint32(ctts.desde + 12 + k * 8);
      for (let c = 0; c < cantidad && i < pts.length; c += 1, i += 1) pts[i] += desfase;
    }
    if (i !== dts.length) return null; // la tabla de desfases no cubre todos los cuadros
  }

  pts.sort((a, b) => a - b);
  const tiempos = pts.map((x) => (x - pts[0]) / escala);
  const pasos = [];
  for (let i = 1; i < tiempos.length; i += 1) pasos.push(tiempos[i] - tiempos[i - 1]);
  pasos.sort((a, b) => a - b);
  const intervaloS = pasos[pasos.length >> 1];
  return intervaloS > 0 ? { tiempos, intervaloS } : null;
}

function escalaDeTiempo(vista, mdhd) {
  // La versión 1 usa fechas de 64 bits: la escala queda 8 bytes más adelante.
  const version = vista.getUint8(mdhd.desde);
  return vista.getUint32(mdhd.desde + (version === 1 ? 20 : 12));
}

/** Los átomos hijos de `tipo` entre `desde` y `hasta`; `desde`/`hasta` de cada uno acotan su contenido. */
function hijos(vista, bytes, desde, hasta, tipo) {
  const salida = [];
  let p = desde;
  while (p + 8 <= hasta) {
    const tamanio = vista.getUint32(p);
    if (tamanio < 8 || p + tamanio > hasta) break;
    if (tipoEn(bytes, p + 4) === tipo) salida.push({ desde: p + 8, hasta: p + tamanio });
    p += tamanio;
  }
  return salida;
}

function tipoEn(bytes, p) {
  return String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
}
