/*
 * Formaciones iniciales de la pizarra, fijas en código: el profe elige una al
 * crear la jugada y después la mueve. Lógica pura, sin DOM ni red.
 *
 * Los ataques van hacia arriba (y chico, el aro está arriba). Cada formación
 * es una jugada válida sin pasos; si tiene atacantes, la pelota la tiene el 1.
 */

import { jugadaVacia } from './jugadas.js';

const atacante = (n, x, y) => ({ id: `a${n}`, tipo: 'ataque', numero: n, x, y });
const defensor = (n, x, y) => ({ id: `d${n}`, tipo: 'defensa', numero: n, x, y });

const conAtacantes = (cancha, fichas) => ({ cancha, fichas, pelota: 'a1', pasos: [] });

// Cinco afuera: base arriba del perímetro, dos alas y dos rincones.
const CINCO_ABIERTOS = [
  atacante(1, 0.5, 0.6), atacante(2, 0.82, 0.38), atacante(3, 0.18, 0.38),
  atacante(4, 0.92, 0.16), atacante(5, 0.08, 0.16),
];

export const FORMACIONES = [
  { clave: 'vacia-media', etiqueta: 'Cancha vacía (media)', datos: jugadaVacia('media') },
  { clave: 'vacia-entera', etiqueta: 'Cancha vacía (entera)', datos: jugadaVacia('entera') },
  {
    clave: 'cinco-abiertos',
    etiqueta: '5 abiertos',
    datos: conAtacantes('media', CINCO_ABIERTOS),
  },
  {
    clave: 'uno-cuatro-alto',
    etiqueta: '1-4 alto',
    datos: conAtacantes('media', [
      atacante(1, 0.5, 0.62), atacante(2, 0.1, 0.36), atacante(3, 0.9, 0.36),
      atacante(4, 0.37, 0.36), atacante(5, 0.63, 0.36),
    ]),
  },
  {
    clave: 'cuernos',
    etiqueta: 'Cuernos',
    datos: conAtacantes('media', [
      atacante(1, 0.5, 0.62), atacante(2, 0.9, 0.2), atacante(3, 0.1, 0.2),
      atacante(4, 0.36, 0.32), atacante(5, 0.64, 0.32),
    ]),
  },
  {
    clave: 'zona-2-3',
    etiqueta: 'Zona 2-3',
    datos: conAtacantes('media', [
      ...CINCO_ABIERTOS,
      defensor(1, 0.38, 0.34), defensor(2, 0.62, 0.34),
      defensor(3, 0.2, 0.16), defensor(4, 0.5, 0.14), defensor(5, 0.8, 0.16),
    ]),
  },
  {
    clave: 'zona-3-2',
    etiqueta: 'Zona 3-2',
    datos: conAtacantes('media', [
      ...CINCO_ABIERTOS,
      defensor(1, 0.25, 0.36), defensor(2, 0.5, 0.4), defensor(3, 0.75, 0.36),
      defensor(4, 0.35, 0.15), defensor(5, 0.65, 0.15),
    ]),
  },
  {
    // Los atacantes sacan de fondo abajo; el 1-2-1-1 los presiona subiendo.
    clave: 'presion-1-2-1-1',
    etiqueta: 'Presión 1-2-1-1',
    datos: conAtacantes('entera', [
      atacante(1, 0.5, 0.96), atacante(2, 0.25, 0.8), atacante(3, 0.75, 0.8),
      atacante(4, 0.5, 0.7), atacante(5, 0.5, 0.55),
      defensor(1, 0.5, 0.88), defensor(2, 0.3, 0.72), defensor(3, 0.7, 0.72),
      defensor(4, 0.5, 0.55), defensor(5, 0.5, 0.3),
    ]),
  },
];
