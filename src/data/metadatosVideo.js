/**
 * Los fps reales de un video en cámara lenta, leídos de su metadata. Puro:
 * recibe bytes, no un File, así que la pantalla decide qué pedazos leer
 * (con `file.slice`, sin cargar un video de 100 MB entero).
 *
 * Android guarda `com.android.capture.fps` en la metadata estilo QuickTime:
 * el nombre va en el átomo `keys` y el valor, en el `ilst`, bajo el número de
 * orden de esa clave. En el S24 FE es un float32 (240.0), no texto
 * (FUNDAMENTO.md §10). Un video re-codificado en el celular la pierde: por
 * eso null es un resultado normal y la pantalla pide los fps a mano.
 */

const CLAVE = 'com.android.capture.fps';

// Tipos de "well-known data" de QuickTime.
const TIPO_TEXTO = 1;
const TIPO_ENTERO = 21;
const TIPO_NATURAL = 22;
const TIPO_FLOAT32 = 23;
const TIPO_FLOAT64 = 24;

// El `ilst` va pegado al `keys` dentro del mismo `meta`; esto sólo acota la búsqueda.
const DISTANCIA_MAX_ILST = 64 * 1024;

/** @param {Uint8Array} bytes @returns {number|null} */
export function fpsDeCaptura(bytes) {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Cualquier "keys" puede aparecer por azar dentro de los cuadros del video:
  // sólo cuenta el que tiene la estructura de un átomo `keys` válido.
  for (const inicioKeys of atomosDeTipo(bytes, vista, 'keys', 0)) {
    const indice = indiceDeClave(bytes, vista, inicioKeys);
    if (indice == null) continue;
    const finKeys = inicioKeys + vista.getUint32(inicioKeys);
    for (const inicioIlst of atomosDeTipo(bytes, vista, 'ilst', finKeys)) {
      if (inicioIlst - finKeys > DISTANCIA_MAX_ILST) break;
      const valor = valorEnIlst(bytes, vista, inicioIlst, indice);
      if (valor !== undefined) return valor;
    }
  }
  return null;
}

/** Posiciones donde empieza un átomo de ese tipo cuyo tamaño entra en los bytes. */
function* atomosDeTipo(bytes, vista, tipo, desde) {
  const [a, b, c, d] = [...tipo].map((ch) => ch.charCodeAt(0));
  for (let i = Math.max(4, desde + 4); i + 4 <= bytes.length; i += 1) {
    if (bytes[i] !== a || bytes[i + 1] !== b || bytes[i + 2] !== c || bytes[i + 3] !== d) continue;
    const inicio = i - 4;
    const tamanio = vista.getUint32(inicio);
    if (tamanio >= 8 && inicio + tamanio <= bytes.length) yield inicio;
  }
}

/** Número de orden (desde 1) de la clave en el átomo `keys`, o null si no está o el átomo no cierra. */
function indiceDeClave(bytes, vista, inicio) {
  const fin = inicio + vista.getUint32(inicio);
  if (fin - inicio < 16) return null;
  const cantidad = vista.getUint32(inicio + 12);
  let p = inicio + 16;
  for (let n = 1; n <= cantidad; n += 1) {
    if (p + 8 > fin) return null;
    const tamanio = vista.getUint32(p);
    if (tamanio < 8 || p + tamanio > fin) return null;
    if (texto(bytes, p + 8, p + tamanio) === CLAVE) return n;
    p += tamanio;
  }
  return null;
}

/**
 * El valor del ítem `indice` del `ilst`: número, null si está pero no es un
 * fps posible, o undefined si este `ilst` no lo tiene o no cierra.
 */
function valorEnIlst(bytes, vista, inicio, indice) {
  const fin = inicio + vista.getUint32(inicio);
  let p = inicio + 8;
  while (p + 8 <= fin) {
    const tamanio = vista.getUint32(p);
    if (tamanio < 8 || p + tamanio > fin) return undefined;
    if (vista.getUint32(p + 4) === indice) return leerData(bytes, vista, p + 8, p + tamanio);
    p += tamanio;
  }
  return undefined;
}

function leerData(bytes, vista, inicio, fin) {
  if (inicio + 16 > fin || texto(bytes, inicio + 4, inicio + 8) !== 'data') return null;
  const tamanio = vista.getUint32(inicio);
  if (inicio + tamanio > fin) return null;
  const tipo = vista.getUint32(inicio + 8) & 0xffffff; // el primer byte es la versión
  const desde = inicio + 16;
  const largo = inicio + tamanio - desde;
  let valor = null;
  if (tipo === TIPO_FLOAT32 && largo === 4) valor = vista.getFloat32(desde);
  else if (tipo === TIPO_FLOAT64 && largo === 8) valor = vista.getFloat64(desde);
  else if ((tipo === TIPO_ENTERO || tipo === TIPO_NATURAL) && [1, 2, 4].includes(largo)) {
    const conSigno = tipo === TIPO_ENTERO;
    if (largo === 1) valor = conSigno ? vista.getInt8(desde) : vista.getUint8(desde);
    else if (largo === 2) valor = conSigno ? vista.getInt16(desde) : vista.getUint16(desde);
    else valor = conSigno ? vista.getInt32(desde) : vista.getUint32(desde);
  } else if (tipo === TIPO_TEXTO) {
    const t = texto(bytes, desde, desde + largo).trim();
    valor = /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  }
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

function texto(bytes, desde, hasta) {
  let s = '';
  for (let i = desde; i < hasta; i += 1) s += String.fromCharCode(bytes[i]);
  return s;
}
