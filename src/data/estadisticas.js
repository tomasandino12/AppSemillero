/**
 * Cálculos estadísticos. Funciones puras: sin red, sin DOM, sin estado.
 * Las vistas sólo dibujan lo que estas funciones devuelven.
 */

/**
 * Umbral de muestra chica: por debajo de esta cantidad de intentos, un
 * porcentaje se muestra atenuado y marcado como "pocos datos".
 *
 * 10 es el tamaño fijo de una posición de la batería. Un chico de U17 tira
 * pocos triples por partido: mostrar un 50% que sale de 1 de 2 le enseña al
 * entrenador a leer ruido como si fuera señal.
 *
 * Es el ÚNICO lugar donde vive este número. Para ajustarlo, se cambia acá.
 */
export const UMBRAL_INTENTOS = 10;

export function esMuestraChica(intentos) {
  return intentos == null || intentos < UMBRAL_INTENTOS;
}

/**
 * Nunca devuelve un número pelado: quien quiera pintar el porcentaje tiene
 * el denominador en la mano sí o sí. Es la forma de que "ningún porcentaje
 * sin sus intentos" sea estructural y no una regla que alguien recuerde.
 *
 * Devuelve null cuando no hay nada que mostrar (sin intentos, o sin medir).
 * OJO: 0 anotados sobre 10 intentos NO es null — es un dato real.
 */
export function porcentaje(anotados, intentos) {
  if (anotados == null || intentos == null || intentos === 0) return null;
  return {
    pct: Math.round((anotados / intentos) * 100),
    anotados,
    intentos,
    muestraChica: esMuestraChica(intentos),
  };
}
