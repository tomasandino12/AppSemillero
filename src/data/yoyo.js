/**
 * Yo-Yo Endurance Test nivel 1 (Bangsbo), continuo y con idas de 20 m: la
 * tabla de pitidos, dónde está cada jugador en un instante y cómo se cuentan
 * los resultados. Funciones puras: sin red, sin DOM.
 *
 * En la base se guardan las idas completas (0049), nunca el nivel ni los
 * metros: los calcula este módulo, así una corrección de la tabla recalcula
 * todo el histórico.
 */
import { decimalEstricto } from './numeros.js';

export const IDA_M = 20;

/**
 * Niveles del YYET1: arranca a 8,0 km/h y sube 0,5 por nivel hasta 17,5, con
 * las idas de cada uno. Fuente: theyoyotest.com/table-YYEL1.htm. Antes de
 * comparar con el CReAR hay que confirmar que usan esta misma versión: si no,
 * sólo cambia esta tabla (y el tope de idas de 0049).
 */
const IDAS_POR_NIVEL = [7, 8, 8, 8, 9, 9, 10, 10, 11, 11, 11, 12, 12, 13, 13, 13, 14, 14, 15, 15];

export const TABLA_YYET1 = IDAS_POR_NIVEL.map((idas, i) => ({
  nivel: i + 1,
  kmh: 8 + i * 0.5,
  idas,
}));

/** Todas las idas de la prueba: quien las completa todas llegó al final. */
export const IDAS_MAX = IDAS_POR_NIVEL.reduce((suma, n) => suma + n, 0);

/** Segundos que dura una ida de 20 m a esa velocidad. */
export function duracionIdaS(kmh) {
  return IDA_M / (kmh / 3.6);
}

/**
 * Un pitido al final de cada ida, con `t` en segundos desde el arranque.
 * `cambioDeNivel` marca el pitido con el que empieza un nivel más rápido
 * (suena doble): el último de la prueba no lo lleva, no hay nivel siguiente.
 */
export function cronograma() {
  const pitidos = [];
  let t = 0;
  for (const { nivel, kmh, idas } of TABLA_YYET1) {
    for (let ida = 1; ida <= idas; ida += 1) {
      t += duracionIdaS(kmh);
      pitidos.push({
        t, nivel, ida, cambioDeNivel: ida === idas && nivel < TABLA_YYET1.length,
      });
    }
  }
  return pitidos;
}

const PITIDOS = cronograma();

/**
 * Dónde va la prueba a los `tS` segundos del arranque: el nivel y la ida en
 * curso (la de dentro del nivel, desde 1) y cuántas idas se completaron. En el
 * instante exacto de un pitido esa ida ya está completa. Antes del arranque
 * es la primera; después del final, la última.
 */
export function posicionEn(tS) {
  const completas = PITIDOS.filter((p) => p.t <= tS).length;
  const enCurso = PITIDOS[Math.min(completas, PITIDOS.length - 1)];
  return { nivel: enCurso.nivel, ida: enCurso.ida, idasCompletas: completas };
}

export const metrosDe = (idas) => idas * IDA_M;

/**
 * La última ida completada, como se lee en las planillas: "7.4" es el nivel 7,
 * ida 4. Sin ninguna ida completa es "0".
 */
export function nivelYIda(idas) {
  if (!(idas > 0)) return '0';
  const { nivel, ida } = PITIDOS[Math.min(idas, PITIDOS.length) - 1];
  return `${nivel}.${ida}`;
}

/** Idas tecleadas para corregir a mano → `{ ok, idas, error }`. */
export function validarIdas(texto) {
  const n = decimalEstricto(texto);
  if (n === null) return { ok: false, idas: null, error: 'Falta la cantidad de idas.' };
  if (Number.isNaN(n) || !Number.isInteger(n) || n < 0 || n > IDAS_MAX) {
    return { ok: false, idas: null, error: `Escribí un número entero de idas, de 0 a ${IDAS_MAX}.` };
  }
  return { ok: true, idas: n, error: null };
}

/** Segundos que faltan para el próximo pitido a los `tS` del arranque; null si ya sonó el último. */
export function segundosAlPitido(tS) {
  const proximo = PITIDOS.find((p) => p.t > tS);
  return proximo ? proximo.t - tS : null;
}

/**
 * Los resultados de UN jugador (uno por sesión), la sesión más reciente
 * primero. `idas` null es ausente: se conserva en la lista pero no cuenta como dato.
 */
export function sesionesDeYoyo(resultados) {
  return [...(resultados ?? [])]
    .map((r) => ({
      sesionId: r.sesionId, fecha: r.fecha, idas: r.idas ?? null, origen: r.origen ?? 'propio',
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * La última sesión con dato y las anteriores con dato (las ausencias quedan
 * afuera: no hay con qué comparar). `variacionM` = metros de la última menos
 * los de la anterior (positivo = mejoró); null con una sola. null si no hay ninguna.
 */
export function ultimaYAnterioresYoyo(sesiones) {
  const conDato = (sesiones ?? []).filter((s) => s.idas != null);
  if (!conDato.length) return null;
  const [ultima, ...anteriores] = conDato;
  const variacionM = anteriores.length ? metrosDe(ultima.idas) - metrosDe(anteriores[0].idas) : null;
  return { ultima, anteriores, variacionM };
}
