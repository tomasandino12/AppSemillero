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

/**
 * Cuánto llegó un recurso, a partir de la fila anónima de resumen_recursos()
 * (nunca hay nombres). `estado` dice por qué falta el porcentaje:
 *   'ok'           hay porcentaje
 *   'sin-envios'   no se lo enviaron a nadie de este plantel
 *   'sin-cuentas'  ningún jugador con cuenta a quien se lo enviaron: no hay dato
 *   'pocos'        hay cuentas pero muy pocas: la base no informa cuántos abrieron
 *   'sin-resumen'  no se pudo leer el resumen
 * Sin datos no es 0 %: `porcentaje` es null.
 */
export function alcanceDeRecurso(fila) {
  if (!fila) return { estado: 'sin-resumen', enviados: null, conCuenta: null, abrieron: null, porcentaje: null };
  const { enviados, conCuenta, abrieron } = fila;
  if (enviados === 0) return { estado: 'sin-envios', enviados, conCuenta: 0, abrieron: null, porcentaje: null };
  if (conCuenta === 0) return { estado: 'sin-cuentas', enviados, conCuenta, abrieron: null, porcentaje: null };
  if (abrieron == null) return { estado: 'pocos', enviados, conCuenta, abrieron: null, porcentaje: null };
  return { estado: 'ok', enviados, conCuenta, abrieron, porcentaje: Math.round((abrieron / conCuenta) * 100) };
}

/**
 * Panel de impacto de RECURSOS: todo agregado, sin nombres de jugadores.
 *   ofrecidos         cuántos recursos hay
 *   conCuenta         jugadores del plantel con cuenta (el denominador honesto)
 *   abrieronAlguno    jugadores que abrieron al menos uno (null si son pocos)
 *   masAbierto        { recursoId, titulo, abrieron } o null; empata el más reciente
 *   tendencia         { esteMes, mesAnterior, delta } o null si no hay mes anterior
 *
 * `recursos` son los de obtenerRecursos() y `resumen` el de
 * obtenerResumenRecursos() (null si no se pudo leer o no es entrenador).
 */
export function resumenDeImpacto(recursos, resumen) {
  const base = { ofrecidos: recursos.length, conCuenta: null, abrieronAlguno: null, masAbierto: null, tendencia: null };
  if (!resumen) return base;

  const porId = new Map(resumen.recursos.map((f) => [f.recursoId, f]));
  let masAbierto = null;
  let esteMes = 0;
  let mesAnterior = 0;
  let hayDatoDelMes = false;
  for (const r of recursos) {
    const fila = porId.get(r.id);
    if (!fila) continue;
    if (fila.abrieron != null && fila.abrieron > 0) {
      const gana = !masAbierto
        || fila.abrieron > masAbierto.abrieron
        || (fila.abrieron === masAbierto.abrieron && r.creadoEn > masAbierto.creadoEn);
      if (gana) masAbierto = { recursoId: r.id, titulo: r.titulo, abrieron: fila.abrieron, creadoEn: r.creadoEn };
    }
    if (fila.primerasEsteMes != null && fila.primerasMesAnterior != null) {
      hayDatoDelMes = true;
      esteMes += fila.primerasEsteMes;
      mesAnterior += fila.primerasMesAnterior;
    }
  }

  return {
    ...base,
    conCuenta: resumen.conCuenta,
    abrieronAlguno: resumen.abrieronAlguno,
    masAbierto: masAbierto && { recursoId: masAbierto.recursoId, titulo: masAbierto.titulo, abrieron: masAbierto.abrieron },
    // Sin aperturas el mes anterior no hay contra qué comparar (y dividir por
    // cero o mostrar "+∞" sería inventar).
    tendencia: hayDatoDelMes && mesAnterior > 0 ? { esteMes, mesAnterior, delta: esteMes - mesAnterior } : null,
  };
}

/**
 * A quién de UN plantel le llegó un recurso. Un recurso es del club, así que
 * `envios` puede traer jugadores de otros planteles: sólo cuentan los del
 * `jugadores` que se pasa.
 *   estado  'sin-plantel' | 'ninguno' | 'parcial' | 'todos'
 *   faltan  los jugadores del plantel que todavía no lo recibieron
 * Es lo que evita ofrecer de nuevo a quien ya lo tiene.
 */
export function estadoDeEnvio(envios, jugadores) {
  const ids = new Set(jugadores.map((j) => j.id));
  const delPlantel = envios.filter((e) => ids.has(e.jugadorId));
  const recibieron = new Set(delPlantel.map((e) => e.jugadorId));
  const faltan = jugadores.filter((j) => !recibieron.has(j.id));
  let estado = 'parcial';
  if (jugadores.length === 0) estado = 'sin-plantel';
  else if (recibieron.size === 0) estado = 'ninguno';
  else if (faltan.length === 0) estado = 'todos';
  return {
    estado,
    total: jugadores.length,
    enviados: recibieron.size,
    faltan,
    ultimaFecha: delPlantel.length ? delPlantel.map((e) => e.fecha).sort().at(-1) : null,
  };
}
