/*
 * Lógica pura de los recursos (videos, PDFs, links) que el profe le manda a
 * sus jugadores: tipos, validación de los datos opcionales, filtros y el
 * clasificador de links. Sin red ni DOM.
 *
 * La lista de tipos y los rangos son los mismos que los check de
 * supabase/migrations/0033_recurso_metadatos.sql; tests/contratoRecurso.test.js
 * los compara.
 */
import { decimalEstricto } from './numeros.js';
import { idDeYoutube } from './youtube.js';

export const TIPOS_RECURSO = [
  { clave: 'tiro', etiqueta: 'Tiro' },
  { clave: 'pies', etiqueta: 'Pies' },
  { clave: 'manejo', etiqueta: 'Manejo' },
  { clave: 'fisico', etiqueta: 'Físico' },
  { clave: 'lectura', etiqueta: 'Lectura de juego' },
  { clave: 'otro', etiqueta: 'Otro' },
];

export const RANGO_FRECUENCIA = { min: 1, max: 7 };
export const RANGO_MINUTOS = { min: 1, max: 180 };

/** Clave especial de los chips para los recursos que no tienen tipo (los viejos). */
export const SIN_TIPO = 'sin_tipo';

const CLAVES_TIPO = new Set(TIPOS_RECURSO.map((t) => t.clave));

export function etiquetaDeTipo(clave) {
  return TIPOS_RECURSO.find((t) => t.clave === clave)?.etiqueta ?? null;
}

function enteroEnRango(valor, { min, max }, nombre) {
  const n = decimalEstricto(valor);
  if (n === null) return { valor: null };
  if (Number.isNaN(n) || !Number.isInteger(n) || n < min || n > max) {
    return { error: `${nombre}: un número entero entre ${min} y ${max}.` };
  }
  return { valor: n };
}

/**
 * Valida los tres datos opcionales del alta. Vacío es `null` ("no lo dijo"),
 * nunca 0. Devuelve { valor: { tipo, frecuenciaSemanal, minutos } } o { error }.
 */
export function validarMetadatos({ tipo, frecuenciaSemanal, minutos } = {}) {
  const tipoLimpio = tipo == null || tipo === '' ? null : tipo;
  if (tipoLimpio !== null && !CLAVES_TIPO.has(tipoLimpio)) return { error: 'Elegí un tipo de la lista.' };
  const frecuencia = enteroEnRango(frecuenciaSemanal, RANGO_FRECUENCIA, 'Veces por semana');
  if (frecuencia.error) return { error: frecuencia.error };
  const duracion = enteroEnRango(minutos, RANGO_MINUTOS, 'Minutos');
  if (duracion.error) return { error: duracion.error };
  return { valor: { tipo: tipoLimpio, frecuenciaSemanal: frecuencia.valor, minutos: duracion.valor } };
}

/** Cantidad de recursos por tipo, más `todos` y los que no tienen tipo. */
export function contarPorTipo(recursos) {
  const cuenta = { todos: recursos.length, [SIN_TIPO]: 0 };
  for (const t of TIPOS_RECURSO) cuenta[t.clave] = 0;
  for (const r of recursos) cuenta[r.tipo && r.tipo in cuenta ? r.tipo : SIN_TIPO] += 1;
  return cuenta;
}

/** `clave` vacía o 'todos' no filtra. */
export function filtrarPorTipo(recursos, clave) {
  if (!clave || clave === 'todos') return recursos;
  if (clave === SIN_TIPO) return recursos.filter((r) => !r.tipo);
  return recursos.filter((r) => r.tipo === clave);
}

/**
 * De qué es el link, para elegir el ícono cuando no hay miniatura de YouTube:
 * 'youtube' | 'drive' | 'pdf' | 'otro' (y null si no hay link).
 */
export function claseDeEnlace(enlace) {
  if (typeof enlace !== 'string' || enlace.trim() === '') return null;
  if (idDeYoutube(enlace)) return 'youtube';
  let u;
  try {
    u = new URL(enlace);
  } catch {
    return 'otro';
  }
  if (u.hostname === 'drive.google.com' || u.hostname === 'docs.google.com') return 'drive';
  if (u.pathname.toLowerCase().endsWith('.pdf')) return 'pdf';
  return 'otro';
}
