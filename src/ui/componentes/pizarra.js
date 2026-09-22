/*
 * Dibuja la cancha, las fichas, la pelota y los trazos del paso actual en un
 * <svg>. La usan el visor, el editor (task 8) y la miniatura de la biblioteca
 * (task 7): un solo lugar sabe cómo se ve una jugada, así que el trazo de un
 * pase o el triángulo de un defensor no se dibujan dos veces distinto.
 *
 * Coordenadas de `datos` (0–1) escaladas a un viewBox fijo de W×alto. Todos
 * los colores son clases de public/css/componentes.css (var(--token)): un
 * atributo `fill`/`stroke` con var() no lo interpreta el navegador, por eso
 * nada de color se escribe acá, sólo `class`.
 */
import { estadoAlInicioDelPaso } from '../../data/jugadas.js';
import { direccionFinal, trazoSvg } from '../../data/animacionJugada.js';
import { W, altoDe, formasDeUnExtremo, AROS } from '../../data/geometriaCancha.js';

const R_FICHA = 12;
const LARGO_T = 9; // largo de la T de la cortina; también fija el alto del viewBox del ícono.

let contador = 0;

/** Un extremo de cancha: zona, círculo de tiros libres, arco de tres y aro. Baseline en y=0 (medidas FIBA, geometriaCancha.js). */
function mitadDeCancha() {
  const { zona, circuloLibres, triple, aro, tablero } = formasDeUnExtremo();
  const { rectaIzq, rectaDer, arco } = triple;
  // De izquierda a derecha pasando por abajo: el arco cubre menos de 180°
  // porque los dos extremos quedan por debajo del centro del aro.
  const dArco = `M ${rectaIzq.x} ${rectaIzq.y2} A ${arco.r} ${arco.r} 0 0 0 ${rectaDer.x} ${rectaDer.y2}`;
  return `
    <rect x="${zona.x}" y="${zona.y}" width="${zona.ancho}" height="${zona.alto}" class="pz-linea" fill="none"/>
    <circle cx="${circuloLibres.cx}" cy="${circuloLibres.cy}" r="${circuloLibres.r}" class="pz-linea" fill="none"/>
    <line x1="${rectaIzq.x}" y1="${rectaIzq.y1}" x2="${rectaIzq.x}" y2="${rectaIzq.y2}" class="pz-linea"/>
    <line x1="${rectaDer.x}" y1="${rectaDer.y1}" x2="${rectaDer.x}" y2="${rectaDer.y2}" class="pz-linea"/>
    <path d="${dArco}" class="pz-linea" fill="none"/>
    <circle cx="${aro.cx}" cy="${aro.cy}" r="${aro.r}" class="pz-aro" fill="none"/>
    <line x1="${tablero.x1}" y1="${tablero.y}" x2="${tablero.x2}" y2="${tablero.y}" class="pz-tablero"/>
  `;
}

function fondoDeCancha(cancha) {
  const alto = altoDe(cancha);
  const { circuloCentral } = formasDeUnExtremo();
  let g = `<rect x="0" y="0" width="${W}" height="${alto}" class="pz-cancha"/>`;
  g += `<rect x="1" y="1" width="${W - 2}" height="${alto - 2}" class="pz-linea" fill="none"/>`;
  if (cancha === 'entera') {
    const mitad = alto / 2;
    g += mitadDeCancha();
    // La otra mitad es la misma forma, reflejada: evita repetir la geometría con signos al revés.
    g += `<g transform="translate(0,${alto}) scale(1,-1)">${mitadDeCancha()}</g>`;
    g += `<line x1="0" y1="${mitad}" x2="${W}" y2="${mitad}" class="pz-linea"/>`;
    g += `<circle cx="${W / 2}" cy="${mitad}" r="${circuloCentral.r}" class="pz-linea" fill="none"/>`;
  } else {
    g += mitadDeCancha();
    // Media cancha: sólo la mitad de adentro del círculo central, apoyada en la línea de mitad de cancha.
    g += `<path d="M ${W / 2 - circuloCentral.r} ${alto} A ${circuloCentral.r} ${circuloCentral.r} 0 0 1 ${W / 2 + circuloCentral.r} ${alto}" class="pz-linea" fill="none"/>`;
  }
  return g;
}

function puntosTriangulo(cx, cy, r) {
  const bajada = r * 0.3;
  return [
    [cx, cy - r - bajada],
    [cx - r, cy + r - bajada],
    [cx + r, cy + r - bajada],
  ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function dibujarFicha(ficha, p, alto) {
  const x = p.x * W;
  const y = p.y * alto;
  const id = `data-ficha-id="${ficha.id}"`;
  if (ficha.tipo === 'cono') {
    return `<polygon points="${puntosTriangulo(x, y, R_FICHA * 0.6)}" class="pz-cono" ${id}/>`;
  }
  if (ficha.tipo === 'defensa') {
    let g = `<polygon points="${puntosTriangulo(x, y, R_FICHA + 2)}" class="pz-defensa" ${id}/>`;
    if (ficha.numero != null) g += `<text x="${x}" y="${y + 5}" class="pz-numero pz-numero-defensa" ${id}>${ficha.numero}</text>`;
    return g;
  }
  let g = `<circle cx="${x}" cy="${y}" r="${R_FICHA}" class="pz-ataque" ${id}/>`;
  if (ficha.numero != null) g += `<text x="${x}" y="${y + 4}" class="pz-numero pz-numero-ataque" ${id}>${ficha.numero}</text>`;
  return g;
}

/** Offset chico cuando la pelota está en manos de una ficha, para que no la tape. */
function dibujarPelota(pelotaEn, posiciones, alto) {
  const sostenida = [...posiciones.values()].some((p) => Math.abs(p.x - pelotaEn.x) < 1e-6 && Math.abs(p.y - pelotaEn.y) < 1e-6);
  const off = sostenida ? 0.026 : 0;
  const x = (pelotaEn.x + off) * W;
  const y = (pelotaEn.y + off) * alto;
  return `<circle cx="${x}" cy="${y}" r="4" class="pz-pelota"/>`;
}

/** Escala un `d` de trazoSvg (coordenadas 0–1) a píxeles: alterna x,y en orden, ignora las letras de comando. */
function escalarPath(d, alto) {
  let esX = true;
  return d.split(/\s+/).map((tok) => {
    if (/^[A-Za-z]$/.test(tok)) return tok;
    const n = Number(tok) * (esX ? W : alto);
    esX = !esX;
    return n.toFixed(2);
  }).join(' ');
}

function dibujarT(hasta, dx, dy, alto, extra) {
  const x = hasta.x * W;
  const y = hasta.y * alto;
  const px = -dy * LARGO_T;
  const py = dx * LARGO_T;
  return `<line x1="${x + px}" y1="${y + py}" x2="${x - px}" y2="${y - py}" class="pz-trazo pz-trazo-cortina" ${extra}/>`;
}

/**
 * El SVG de un trazo (el `path` con la clase de su tipo, la flecha del corte
 * vía `idFlecha` y la T de la cortina): lo usan la cancha y el ícono de la
 * barra, para que un tipo de acción se vea igual en los dos. `desde`/`hasta`/
 * `control` en 0–1; `extra` es el atributo que la cancha suma a cada
 * elemento (`data-accion-indice="…"`), vacío para el ícono.
 */
function svgDeTrazo({ tipo, desde, hasta, control }, alto, idFlecha, extra = '') {
  const d = escalarPath(trazoSvg(desde, hasta, control, tipo), alto);
  const marcador = tipo === 'corte' ? ` marker-end="url(#${idFlecha})"` : '';
  let g = `<path d="${d}" class="pz-trazo pz-trazo-${tipo}" fill="none"${marcador} ${extra}/>`;
  if (tipo === 'cortina') {
    const { dx, dy } = direccionFinal(desde, hasta, control);
    g += dibujarT(hasta, dx, dy, alto, extra);
  }
  return g;
}

function dibujarTrazo(a, indice, inicio, cancha, alto, uid) {
  const desde = inicio.posiciones.get(a.ficha);
  const hasta = a.tipo === 'tiro' ? (AROS[cancha] ?? AROS.media)
    : (a.tipo === 'pase' || a.tipo === 'handoff') ? inicio.posiciones.get(a.a)
    : a.hasta;
  if (!desde || !hasta) return '';
  const extra = `data-accion-indice="${indice}"`;
  let g = svgDeTrazo({ tipo: a.tipo, desde, hasta, control: a.control }, alto, `pz-flecha-${uid}`, extra);
  // El trazo visible sigue siendo fino; un segundo trazo invisible y más
  // ancho es el que realmente se toca (una línea de 2px es imposible de
  // acertar con el dedo). Sólo lo agrega la cancha: el ícono no se toca.
  const dToque = escalarPath(trazoSvg(desde, hasta, a.control, a.tipo), alto);
  g += `<path d="${dToque}" class="pz-trazo-toque" fill="none" ${extra}/>`;
  return g;
}

function dibujarAcciones(datos, paso, alto, uid) {
  const acciones = datos.pasos[paso]?.acciones;
  if (paso == null || !acciones) return '';
  const inicio = estadoAlInicioDelPaso(datos, paso);
  return acciones.map((a, i) => dibujarTrazo(a, i, inicio, datos.cancha, alto, uid)).join('');
}

function defs(idFlecha) {
  return `<defs><marker id="${idFlecha}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="pz-flecha"/></marker></defs>`;
}

// Segmento horizontal, en coordenadas de cancha (0–1) sobre `media`, que
// arma el ícono de cada acción: mismo trazo que en la cancha, a escala 1:1.
const DESDE_ICONO = { x: 0.44, y: 0.5 };
const HASTA_ICONO = { x: 0.56, y: 0.5 };
const MARGEN_ICONO_X = 4; // aire para que no se corte la punta de la flecha del corte
const MARGEN_ICONO_Y = 2; // aire de trazo arriba/abajo de la T de la cortina

/** viewBox que encierra el segmento del ícono con aire para la flecha y la T; igual para los seis tipos. */
function viewBoxIcono() {
  const alto = altoDe('media');
  const xDesde = DESDE_ICONO.x * W;
  const xHasta = HASTA_ICONO.x * W;
  const yCentro = DESDE_ICONO.y * alto;
  const semiAlto = LARGO_T + MARGEN_ICONO_Y;
  return {
    x: xDesde - MARGEN_ICONO_X,
    y: yCentro - semiAlto,
    ancho: xHasta - xDesde + MARGEN_ICONO_X * 2,
    alto: semiAlto * 2,
  };
}

/**
 * Mini-ícono de una acción para la barra de herramientas: el mismo trazo que
 * dibuja la cancha (mismo punteado, zigzag, flecha o T), a escala 1:1 — así
 * el botón de "Corte" se ve exactamente como el corte que dibuja.
 */
export function iconoDeAccion(tipo) {
  const { x, y, ancho, alto: altoVb } = viewBoxIcono();
  const idFlecha = `pz-flecha-icono-${tipo}`;
  const trazo = svgDeTrazo({ tipo, desde: DESDE_ICONO, hasta: HASTA_ICONO, control: null }, altoDe('media'), idFlecha);
  return `<svg class="pz pz-icono" viewBox="${x} ${y} ${ancho} ${altoVb}" aria-hidden="true" focusable="false">${defs(idFlecha)}${trazo}</svg>`;
}

/**
 * Dibuja la jugada completa en `svg`. `estado` es `{ posiciones, pelota|pelotaEn }`
 * (estadoAlInicioDelPaso o estadoEn); `opciones.paso`, si viene, muestra los
 * trazos de las acciones de ese paso.
 */
export function dibujarPizarra(svg, datos, estado, opciones = {}) {
  if (!svg.dataset.pzId) svg.dataset.pzId = `u${contador++}`;
  const uid = svg.dataset.pzId;
  const alto = altoDe(datos.cancha);
  const pelotaEn = estado.pelotaEn !== undefined ? estado.pelotaEn
    : estado.pelota != null ? estado.posiciones.get(estado.pelota) : null;

  let g = defs(`pz-flecha-${uid}`);
  g += fondoDeCancha(datos.cancha);
  g += dibujarAcciones(datos, opciones.paso, alto, uid);
  for (const ficha of datos.fichas) {
    g += dibujarFicha(ficha, estado.posiciones.get(ficha.id) ?? ficha, alto);
  }
  if (pelotaEn) g += dibujarPelota(pelotaEn, estado.posiciones, alto);

  svg.setAttribute('viewBox', `0 0 ${W} ${alto}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  // Sin esto, un <svg> sin atributos width/height no tiene tamaño intrínseco
  // para el navegador: con max-height sola (editor en fila, ≥64rem) mediría
  // 0×0 en vez de escalar. width:100% (miniatura, visor) no lo necesita.
  svg.style.aspectRatio = `${W} / ${alto}`;
  svg.innerHTML = g;
}

/**
 * El punto de un click/touch sobre `svg`, en unidades del viewBox (`xSvg`,
 * `ySvg`) y normalizado 0–1 (`x`, `y`, recortado a la cancha). El editor
 * (task 8) lo usa para saber dónde tocó el profe; `preserveAspectRatio` deja
 * franjas (letterbox) en el eje que sobra, por eso la escala es la MENOR de
 * las dos (el mismo criterio que "meet").
 */
export function puntoDesdeEvento(svg, datos, evento) {
  const rect = svg.getBoundingClientRect();
  const alto = altoDe(datos.cancha);
  const escala = Math.min(rect.width / W, rect.height / alto) || 1;
  const margenX = (rect.width - W * escala) / 2;
  const margenY = (rect.height - alto * escala) / 2;
  const xSvg = (evento.clientX - rect.left - margenX) / escala;
  const ySvg = (evento.clientY - rect.top - margenY) / escala;
  return {
    xSvg,
    ySvg,
    x: Math.min(1, Math.max(0, xSvg / W)),
    y: Math.min(1, Math.max(0, ySvg / alto)),
  };
}

/** La ficha más cercana a (xSvg, ySvg), dentro de un radio de toque; null si ninguna entra. */
export function fichaEnPunto(datos, estado, xSvg, ySvg, radio = R_FICHA * 1.6) {
  const alto = altoDe(datos.cancha);
  let mejorId = null;
  let mejorDistancia = radio;
  for (const ficha of datos.fichas) {
    const p = estado.posiciones.get(ficha.id) ?? ficha;
    const d = Math.hypot(p.x * W - xSvg, p.y * alto - ySvg);
    if (d <= mejorDistancia) {
      mejorDistancia = d;
      mejorId = ficha.id;
    }
  }
  return mejorId;
}

/** El círculo punteado que marca la ficha de origen mientras se espera el segundo toque de una acción. */
export function resaltoDeFicha(datos, estado, fichaId) {
  const alto = altoDe(datos.cancha);
  const p = estado.posiciones.get(fichaId);
  if (!p) return '';
  return `<circle cx="${p.x * W}" cy="${p.y * alto}" r="${R_FICHA + 5}" class="pz-resalto" fill="none"/>`;
}

/** El punto de control de una acción (el real, o el punto medio del trazo si todavía no tiene uno), para arrastrarlo. */
export function puntoDeControl(datos, k, indice) {
  const inicio = estadoAlInicioDelPaso(datos, k);
  const a = datos.pasos[k]?.acciones?.[indice];
  if (!a) return null;
  if (a.control) return a.control;
  const desde = inicio.posiciones.get(a.ficha);
  const hasta = a.tipo === 'tiro' ? (AROS[datos.cancha] ?? AROS.media)
    : (a.tipo === 'pase' || a.tipo === 'handoff') ? inicio.posiciones.get(a.a)
    : a.hasta;
  if (!desde || !hasta) return null;
  return { x: (desde.x + hasta.x) / 2, y: (desde.y + hasta.y) / 2 };
}

/** El manija (asa) del punto de control, en píxeles del viewBox: para dibujarla y para calcular el radio de arrastre. */
export function asaDeControl(datos, punto) {
  const alto = altoDe(datos.cancha);
  return `<circle cx="${punto.x * W}" cy="${punto.y * alto}" r="6" class="pz-asa"/>`;
}
