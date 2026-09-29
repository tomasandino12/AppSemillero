/*
 * Interpolación de la pizarra de un ejercicio: dónde está cada ficha y cada
 * pelota en el instante t (0–1) de una fase. Lógica pura, sin DOM. Es el par
 * de animacionJugada.js: allá hay una pelota, acá hay varias, y después de
 * los pasos hay una fase más, la rotación ("al terminar").
 */

import { estadoAlInicioEjercicio } from './pizarraEjercicio.js';
import { puntoEnTrazo, AROS } from './animacionJugada.js';

const DE_MOVIMIENTO = ['corte', 'dribbling', 'cortina', 'ajuste'];
const DE_ENTREGA = ['pase', 'handoff'];

/** Cuántas fases tiene el visor: los pasos y, si hay rotación, una más al final. */
export function totalFases(datos) {
  return datos.pasos.length + (datos.rotacion?.length ? 1 : 0);
}

/** La fase que sigue a los pasos: las fichas van a donde rotan y la repetición termina. */
export function esFaseDeRotacion(datos, k) {
  return k >= datos.pasos.length && Boolean(datos.rotacion?.length);
}

/**
 * Posiciones de las fichas y de cada pelota (`pelotasEn[i]`, un punto) en el
 * instante t de la fase k. Con k = cantidad de pasos es la rotación. Una
 * pelota que sigue a su dueño va con él; una suelta espera en el aro.
 */
export function estadoEjercicioEn(datos, k, t) {
  const u = Math.min(1, Math.max(0, t));
  const aro = AROS[datos.cancha] ?? AROS.media;
  const inicio = estadoAlInicioEjercicio(datos, k);
  const posiciones = new Map(inicio.posiciones);

  if (esFaseDeRotacion(datos, k)) {
    for (const r of datos.rotacion) {
      posiciones.set(r.ficha, puntoEnTrazo(inicio.posiciones.get(r.ficha), r.a, null, u));
    }
    return { posiciones, pelotasEn: inicio.pelotas.map((d) => (d === null ? { ...aro } : { ...posiciones.get(d) })) };
  }

  const acciones = datos.pasos[k]?.acciones ?? [];
  for (const a of acciones) {
    if (DE_MOVIMIENTO.includes(a.tipo)) posiciones.set(a.ficha, puntoEnTrazo(inicio.posiciones.get(a.ficha), a.hasta, a.control, u));
  }

  // Los rebotes se reparten entre las pelotas sueltas en orden, igual que pelotasTrasElPaso.
  const rebotes = acciones.filter((a) => a.tipo === 'rebote');
  let sueltaN = 0;
  const pelotasEn = inicio.pelotas.map((dueno) => {
    if (dueno === null) {
      const rebote = rebotes[sueltaN];
      sueltaN += 1;
      return rebote ? puntoEnTrazo(aro, posiciones.get(rebote.ficha), rebote.control, u) : { ...aro };
    }
    const propia = posiciones.get(dueno);
    for (const a of acciones) {
      if (a.ficha !== dueno) continue;
      if (DE_ENTREGA.includes(a.tipo)) return puntoEnTrazo(propia, posiciones.get(a.a), a.control, u);
      if (a.tipo === 'tiro') return puntoEnTrazo(propia, aro, a.control, u);
    }
    return { ...propia };
  });
  return { posiciones, pelotasEn };
}
