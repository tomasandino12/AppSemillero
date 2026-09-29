/**
 * Variaciones de un ejercicio: cómo subirle la complejidad. Lógica pura.
 *
 * Los ejes son las formas en que el básquet formativo progresa un ejercicio
 * (de sin oposición a oposición real, achicar el espacio, poner un límite de
 * tiempo, pasar de superioridad a inferioridad numérica, sumar una regla) más
 * la carga, que es la del físico. Es una lista CORTA y opcional: sirve para
 * que el profe piense qué cambia, no para clasificar. Como `tema`, la columna
 * no tiene check y la lista se edita acá.
 */

import { LIMITE } from './limites.js';

export const EJES = [
  { id: 'oposicion', nombre: 'Oposición' },
  { id: 'espacio', nombre: 'Espacio' },
  { id: 'tiempo', nombre: 'Tiempo' },
  { id: 'numero', nombre: 'Número' },
  { id: 'regla', nombre: 'Regla' },
  { id: 'carga', nombre: 'Carga' },
];

/** El mismo rango que el check de 0052 (tests/contratoVariacion.test.js). */
export const NIVEL = { min: 1, max: 5 };

/** Si el id no está en la lista devuelve el crudo: una variación vieja se sigue viendo. */
export function nombreDeEje(id) {
  if (!id) return '';
  return EJES.find((e) => e.id === id)?.nombre ?? String(id);
}

/** Uno más que el nivel más alto que ya hay, sin pasar del tope. */
export function nivelSugerido(variaciones) {
  const maximo = Math.max(NIVEL.min - 1, ...variaciones.map((v) => v.nivel));
  return Math.min(maximo + 1, NIVEL.max);
}

/** De más fácil a más difícil; a igual nivel, la más vieja primero. No toca el arreglo. */
export function ordenarVariaciones(variaciones) {
  return [...variaciones].sort((a, b) => a.nivel - b.nivel || String(a.creadoEn).localeCompare(String(b.creadoEn)));
}

const largo = (texto) => [...(texto ?? '')].length;

/** Devuelve `{ ok, errores }`; nunca lanza. */
export function validarVariacion({ titulo, nivel, eje, descripcion }) {
  const errores = [];
  if (!String(titulo ?? '').trim()) errores.push('Poné un título para la variación.');
  else if (largo(titulo) > LIMITE.titulo) errores.push(`El título no puede pasar de ${LIMITE.titulo} caracteres.`);
  if (!Number.isInteger(nivel) || nivel < NIVEL.min || nivel > NIVEL.max) {
    errores.push(`El nivel tiene que ser del ${NIVEL.min} al ${NIVEL.max}.`);
  }
  if (eje != null && !EJES.some((e) => e.id === eje)) errores.push('Ese eje no existe.');
  if (largo(descripcion) > LIMITE.descripcion) errores.push(`La descripción no puede pasar de ${LIMITE.descripcion} caracteres.`);
  return { ok: errores.length === 0, errores };
}
