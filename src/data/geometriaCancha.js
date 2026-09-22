/*
 * Medidas FIBA de la cancha de básquet, en metros, escaladas a 20 px/m: única
 * fuente de estos números. `pizarra.js` arma el SVG desde acá y
 * `animacionJugada.js` reexporta `AROS`, así el aro que se dibuja coincide con
 * el aro al que apunta la animación del tiro (antes, cada uno tenía el suyo).
 */

const ANCHO_M = 15;
const MEDIA_M = 14;
const ARO_DESDE_FONDO_M = 1.575;
const RADIO_ARO_M = 0.225;
const TABLERO_DESDE_FONDO_M = 1.2;
const ANCHO_TABLERO_M = 1.8;
const ZONA_ANCHO_M = 4.9;
const ZONA_LARGO_M = 5.8;
const RADIO_LIBRES_M = 1.8;
const RADIO_TRIPLE_M = 6.75;
const TRIPLE_DESDE_LATERAL_M = 0.9;
const RADIO_CENTRAL_M = 1.8;
const PX_POR_M = 20;
// Banda alrededor de la cancha: ahí se para quien saca de lateral o de fondo.
const FUERA_M = 1.5;

export const W = ANCHO_M * PX_POR_M;
export const ALTO = { media: MEDIA_M * PX_POR_M, entera: MEDIA_M * 2 * PX_POR_M };

export function altoDe(cancha) {
  return ALTO[cancha] ?? ALTO.media;
}

/** Ancho de la banda de afuera, en px del viewBox (igual en los cuatro lados). */
export const MARGEN = FUERA_M * PX_POR_M;

/**
 * Hasta dónde puede estar un punto, en coordenadas 0–1 de la cancha: un poco
 * menos de 0 y un poco más de 1, lo que mide la banda de afuera en cada eje.
 */
export function limitesDe(cancha) {
  const alto = altoDe(cancha);
  return { minX: -MARGEN / W, maxX: 1 + MARGEN / W, minY: -MARGEN / alto, maxY: 1 + MARGEN / alto };
}

const Y_ARO = ARO_DESDE_FONDO_M * PX_POR_M;

export const AROS = {
  media: { x: 0.5, y: Y_ARO / ALTO.media },
  entera: { x: 0.5, y: Y_ARO / ALTO.entera },
};

/**
 * Formas de un extremo de cancha, en px del viewBox, con la línea de fondo en
 * y=0 (hacia adentro de la cancha, y crece). Un extremo mide lo mismo en
 * media y en entera: el reflejo de la otra mitad lo arma `pizarra.js`.
 */
export function formasDeUnExtremo() {
  const cx = W / 2;
  const anchoZona = ZONA_ANCHO_M * PX_POR_M;
  const largoZona = ZONA_LARGO_M * PX_POR_M;
  const rTriple = RADIO_TRIPLE_M * PX_POR_M;
  const xTripleIzq = TRIPLE_DESDE_LATERAL_M * PX_POR_M;
  const xTripleDer = W - xTripleIzq;
  // Corte recta/arco por Pitágoras: la recta está a `dx` del aro, el arco a `rTriple`.
  const dx = cx - xTripleIzq;
  const yCorte = Y_ARO + Math.sqrt(rTriple ** 2 - dx ** 2);

  return {
    zona: { x: cx - anchoZona / 2, y: 0, ancho: anchoZona, alto: largoZona },
    circuloLibres: { cx, cy: largoZona, r: RADIO_LIBRES_M * PX_POR_M },
    triple: {
      rectaIzq: { x: xTripleIzq, y1: 0, y2: yCorte },
      rectaDer: { x: xTripleDer, y1: 0, y2: yCorte },
      arco: { cx, cy: Y_ARO, r: rTriple, desde: { x: xTripleIzq, y: yCorte }, hasta: { x: xTripleDer, y: yCorte } },
    },
    aro: { cx, cy: Y_ARO, r: RADIO_ARO_M * PX_POR_M },
    tablero: {
      x1: cx - (ANCHO_TABLERO_M * PX_POR_M) / 2,
      x2: cx + (ANCHO_TABLERO_M * PX_POR_M) / 2,
      y: TABLERO_DESDE_FONDO_M * PX_POR_M,
    },
    circuloCentral: { r: RADIO_CENTRAL_M * PX_POR_M },
  };
}
