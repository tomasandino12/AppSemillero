/**
 * Etiqueta "Metodología <apodo del club>" de las guías. Pura: el azar entra
 * por parámetro para poder testearla.
 *
 * Los límites se repiten en la migración 0046 (`apodos_validos`);
 * tests/contratoApodos.test.js los compara.
 */
export const MAX_APODOS = 3;
export const LARGO_APODO = 20;

const apodoValido = (a) => typeof a === 'string'
  && a !== '' && a.trim() === a && a.length <= LARGO_APODO;

export function etiquetaMetodologia(club, azar = Math.random) {
  if (!club) return 'Metodología del club';
  const apodos = Array.isArray(club.apodos)
    ? club.apodos.filter(apodoValido).slice(0, MAX_APODOS)
    : [];
  if (apodos.length === 0) return `Metodología ${club.nombre}`;
  const i = Math.min(Math.floor(azar() * apodos.length), apodos.length - 1);
  return `Metodología ${apodos[i]}`;
}
