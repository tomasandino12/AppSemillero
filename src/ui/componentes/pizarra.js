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
import { AROS, direccionFinal, trazoSvg } from '../../data/animacionJugada.js';

const W = 300;
const ALTO = { media: 280, entera: 520 };
const R_FICHA = 12;

let contador = 0;

function altoDe(cancha) {
  return ALTO[cancha] ?? ALTO.media;
}

/** Un extremo de cancha: zona, círculo de tiros libres, arco de tres y aro. Baseline en y=0. */
function mitadDeCancha(mitadAlto) {
  const cx = W / 2;
  const anchoZona = W * 0.36;
  const altoZona = mitadAlto * 0.38;
  const rAro = mitadAlto * 0.035;
  const yAro = mitadAlto * 0.09;
  const rArco = mitadAlto * 0.58;
  return `
    <rect x="${cx - anchoZona / 2}" y="0" width="${anchoZona}" height="${altoZona}" class="pz-linea" fill="none"/>
    <circle cx="${cx}" cy="${altoZona}" r="${mitadAlto * 0.14}" class="pz-linea" fill="none"/>
    <path d="M ${cx + rArco} ${yAro} A ${rArco} ${rArco} 0 0 1 ${cx - rArco} ${yAro}" class="pz-linea" fill="none"/>
    <circle cx="${cx}" cy="${yAro}" r="${rAro}" class="pz-aro" fill="none"/>
    <line x1="${cx - mitadAlto * 0.08}" y1="${yAro - rAro - 2}" x2="${cx + mitadAlto * 0.08}" y2="${yAro - rAro - 2}" class="pz-tablero"/>
  `;
}

function fondoDeCancha(cancha) {
  const alto = altoDe(cancha);
  let g = `<rect x="0" y="0" width="${W}" height="${alto}" class="pz-cancha"/>`;
  g += `<rect x="1" y="1" width="${W - 2}" height="${alto - 2}" class="pz-linea" fill="none"/>`;
  if (cancha === 'entera') {
    const mitad = alto / 2;
    g += mitadDeCancha(mitad);
    // La otra mitad es la misma forma, reflejada: evita repetir la geometría con signos al revés.
    g += `<g transform="translate(0,${alto}) scale(1,-1)">${mitadDeCancha(mitad)}</g>`;
    g += `<line x1="0" y1="${mitad}" x2="${W}" y2="${mitad}" class="pz-linea"/>`;
    g += `<circle cx="${W / 2}" cy="${mitad}" r="${mitad * 0.12}" class="pz-linea" fill="none"/>`;
  } else {
    g += mitadDeCancha(alto);
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
  if (ficha.tipo === 'cono') {
    return `<polygon points="${puntosTriangulo(x, y, R_FICHA * 0.6)}" class="pz-cono"/>`;
  }
  if (ficha.tipo === 'defensa') {
    let g = `<polygon points="${puntosTriangulo(x, y, R_FICHA + 2)}" class="pz-defensa"/>`;
    if (ficha.numero != null) g += `<text x="${x}" y="${y + 5}" class="pz-numero pz-numero-defensa">${ficha.numero}</text>`;
    return g;
  }
  let g = `<circle cx="${x}" cy="${y}" r="${R_FICHA}" class="pz-ataque"/>`;
  if (ficha.numero != null) g += `<text x="${x}" y="${y + 4}" class="pz-numero pz-numero-ataque">${ficha.numero}</text>`;
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

function dibujarT(hasta, dx, dy, alto) {
  const x = hasta.x * W;
  const y = hasta.y * alto;
  const largo = 9;
  const px = -dy * largo;
  const py = dx * largo;
  return `<line x1="${x + px}" y1="${y + py}" x2="${x - px}" y2="${y - py}" class="pz-trazo pz-trazo-cortina"/>`;
}

function dibujarTrazo(a, inicio, cancha, alto, uid) {
  const desde = inicio.posiciones.get(a.ficha);
  const hasta = a.tipo === 'tiro' ? (AROS[cancha] ?? AROS.media)
    : (a.tipo === 'pase' || a.tipo === 'handoff') ? inicio.posiciones.get(a.a)
    : a.hasta;
  if (!desde || !hasta) return '';
  const d = escalarPath(trazoSvg(desde, hasta, a.control, a.tipo), alto);
  const marcador = a.tipo === 'corte' ? ` marker-end="url(#pz-flecha-${uid})"` : '';
  let g = `<path d="${d}" class="pz-trazo pz-trazo-${a.tipo}" fill="none"${marcador}/>`;
  if (a.tipo === 'cortina') {
    const { dx, dy } = direccionFinal(desde, hasta, a.control);
    g += dibujarT(hasta, dx, dy, alto);
  }
  return g;
}

function dibujarAcciones(datos, paso, alto, uid) {
  const acciones = datos.pasos[paso]?.acciones;
  if (paso == null || !acciones) return '';
  const inicio = estadoAlInicioDelPaso(datos, paso);
  return acciones.map((a) => dibujarTrazo(a, inicio, datos.cancha, alto, uid)).join('');
}

function defs(uid) {
  return `<defs><marker id="pz-flecha-${uid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="pz-flecha"/></marker></defs>`;
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

  let g = defs(uid);
  g += fondoDeCancha(datos.cancha);
  g += dibujarAcciones(datos, opciones.paso, alto, uid);
  for (const ficha of datos.fichas) {
    g += dibujarFicha(ficha, estado.posiciones.get(ficha.id) ?? ficha, alto);
  }
  if (pelotaEn) g += dibujarPelota(pelotaEn, estado.posiciones, alto);

  svg.setAttribute('viewBox', `0 0 ${W} ${alto}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.innerHTML = g;
}
