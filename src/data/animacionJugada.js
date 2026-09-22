/*
 * Interpolación de una jugada: dónde está cada ficha y la pelota en el
 * instante t (0–1) del paso k, y la forma de cada trazo. Lógica pura, sin DOM:
 * el visor sólo pide `estadoEn` en cada cuadro y dibuja.
 */

import { estadoAlInicioDelPaso } from './jugadas.js';
import { AROS } from './geometriaCancha.js';

export const DURACION_PASO_MS = 1200;

/** Posición del aro según la cancha (medidas FIBA reales, geometriaCancha.js); los ataques van hacia arriba (y chico). */
export { AROS };

const DE_MOVIMIENTO = ['corte', 'dribbling', 'cortina', 'ajuste'];
const DE_ENTREGA = ['pase', 'handoff'];

// Zigzag del dribbling, en unidades de cancha (0–1).
const AMPLITUD_ZIGZAG = 0.012;
const LARGO_DIENTE = 0.035;

const recortar = (t) => Math.min(1, Math.max(0, t));
const redondear = (n) => Math.round(n * 10000) / 10000;
const punto = (p) => `${redondear(p.x)} ${redondear(p.y)}`;

/** Punto del trazo en t: recta sin control, bezier cuadrática con control. */
export function puntoEnTrazo(desde, hasta, control, t) {
  const u = recortar(t);
  if (!control) {
    return { x: desde.x + (hasta.x - desde.x) * u, y: desde.y + (hasta.y - desde.y) * u };
  }
  const a = (1 - u) ** 2;
  const b = 2 * (1 - u) * u;
  const c = u ** 2;
  return {
    x: a * desde.x + b * control.x + c * hasta.x,
    y: a * desde.y + b * control.y + c * hasta.y,
  };
}

/** Tangente unitaria al final del trazo: para orientar la flecha y la T de la cortina. */
export function direccionFinal(desde, hasta, control) {
  const origen = control ?? desde;
  const dx = hasta.x - origen.x;
  const dy = hasta.y - origen.y;
  const largo = Math.hypot(dx, dy);
  return largo === 0 ? { dx: 0, dy: -1 } : { dx: dx / largo, dy: dy / largo };
}

function zigzag(desde, hasta, control) {
  const aprox = Math.hypot(hasta.x - desde.x, hasta.y - desde.y);
  const dientes = Math.max(4, Math.round(aprox / LARGO_DIENTE));
  const partes = [`M ${punto(desde)}`];
  for (let i = 1; i < dientes; i++) {
    const t = i / dientes;
    const p = puntoEnTrazo(desde, hasta, control, t);
    const antes = puntoEnTrazo(desde, hasta, control, t - 0.01);
    const despues = puntoEnTrazo(desde, hasta, control, t + 0.01);
    const largo = Math.hypot(despues.x - antes.x, despues.y - antes.y) || 1;
    const lado = i % 2 === 0 ? 1 : -1;
    partes.push(`L ${punto({
      x: p.x - ((despues.y - antes.y) / largo) * AMPLITUD_ZIGZAG * lado,
      y: p.y + ((despues.x - antes.x) / largo) * AMPLITUD_ZIGZAG * lado,
    })}`);
  }
  partes.push(`L ${punto(hasta)}`);
  return partes.join(' ');
}

/**
 * Atributo `d` de un trazo: `M…L` (recto), `M…Q` (con control) o, para el
 * dribbling, un zigzag de tramos `L` que sigue la misma curva. El punteado del
 * pase y del tiro y la T de la cortina los pone la UI con `direccionFinal`.
 */
export function trazoSvg(desde, hasta, control, tipo) {
  if (tipo === 'dribbling') return zigzag(desde, hasta, control);
  if (control) return `M ${punto(desde)} Q ${punto(control)} ${punto(hasta)}`;
  return `M ${punto(desde)} L ${punto(hasta)}`;
}

/**
 * Posiciones de las fichas y de la pelota en el instante t del paso k.
 * `pelotaEn` es null si la jugada no tiene pelota. En t=0 coincide con
 * `estadoAlInicioDelPaso(datos, k)` y en t=1 con el del paso k+1.
 */
export function estadoEn(datos, k, t) {
  const u = recortar(t);
  const inicio = estadoAlInicioDelPaso(datos, k);
  const acciones = datos.pasos[k]?.acciones ?? [];

  const posiciones = new Map(inicio.posiciones);
  for (const a of acciones) {
    if (!DE_MOVIMIENTO.includes(a.tipo)) continue;
    posiciones.set(a.ficha, puntoEnTrazo(inicio.posiciones.get(a.ficha), a.hasta, a.control, u));
  }

  return { posiciones, pelotaEn: pelotaEn(datos, k, inicio.pelota, posiciones, acciones, u) };
}

function pelotaEn(datos, k, dueno, posiciones, acciones, u) {
  const aro = AROS[datos.cancha] ?? AROS.media;
  if (dueno === null) {
    // Sin dueño sólo queda la pelota que ya se tiró, o que no hay pelota.
    const seTiro = datos.pasos.slice(0, k).some((p) => p.acciones.some((a) => a.tipo === 'tiro'));
    return seTiro ? { ...aro } : null;
  }
  const propia = posiciones.get(dueno);
  for (const a of acciones) {
    if (a.ficha !== dueno) continue;
    if (DE_ENTREGA.includes(a.tipo)) return puntoEnTrazo(propia, posiciones.get(a.a), a.control, u);
    if (a.tipo === 'tiro') return puntoEnTrazo(propia, aro, a.control, u);
  }
  return { ...propia };
}
