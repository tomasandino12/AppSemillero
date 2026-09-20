/*
 * Armar el registro de un error del cliente: lo que se va a guardar cuando
 * algo se rompe en el teléfono de un profe. Lógica pura, sin red ni DOM.
 *
 * La regla que manda acá es la del proyecto: hay datos de menores. Un registro
 * de errores es de los lugares más fáciles para filtrarlos sin querer, porque
 * nadie lo mira hasta que pasa algo. Por eso este módulo no junta contexto: no
 * toca la URL, ni el almacenamiento, ni el jugador que estaba abierto. Sólo el
 * mensaje, el stack, el id de la pantalla y el navegador.
 *
 * Y sobre todo depura el mensaje, que es la parte contraintuitiva. Postgres
 * escribe el valor adentro del texto del error: una violación de unicidad
 * llega como `Key (nombre_clave)=(Juan Perez) already exists`. Guardar eso
 * crudo es publicar el nombre de un chico en una tabla de logs.
 */

/**
 * Largos con los que se corta antes de guardar. Cuando exista la tabla, estos
 * números tienen que ser los mismos que sus `check (char_length(...))` y hay
 * que compararlos con un test de contrato, como hace limites.js con 0028.
 * No se agregan a limites.js todavía: ese archivo es el espejo exacto de 0028
 * y su test exige que las dos listas coincidan.
 */
export const LARGO = { mensaje: 500, stack: 2000, pantalla: 60, agente: 300 };

/** El valor que Postgres mete entre paréntesis en los errores de constraint. */
const VALOR_DE_CONSTRAINT = /(Key \([^)]*\)=\()[^)]*\)/g;
const MAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
/** Cuatro dígitos o más seguidos: un DNI, un teléfono, una fecha de nacimiento. */
const NUMERO_LARGO = /\d{4,}/g;

/**
 * Saca del texto lo que pueda identificar a una persona. Es a propósito más
 * agresivo de lo necesario: perder un dato de diagnóstico es barato, filtrar
 * el nombre de un menor no.
 */
export function depurar(texto) {
  return String(texto ?? '')
    .replace(VALOR_DE_CONSTRAINT, '$1…)')
    .replace(MAIL, '…@…')
    .replace(NUMERO_LARGO, '…');
}

/**
 * El texto de lo que se haya tirado. No se usa String(error) como red de
 * seguridad a propósito: un objeto cualquiera da "[object Object]", que ocupa
 * lugar en la columna y no dice nada. Mejor quedarse sin mensaje y que el
 * registro valga por la pantalla y el stack.
 */
function textoDelError(error) {
  if (typeof error?.message === 'string') return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'number' || typeof error === 'boolean') return String(error);
  return '';
}

function cortar(texto, largo) {
  const limpio = depurar(texto);
  return limpio.length <= largo ? limpio : `${limpio.slice(0, largo - 1)}…`;
}

/**
 * @param {unknown} error - Lo que se haya tirado. No siempre es un Error: se
 *   puede hacer `throw 'texto'`, y una promesa puede rechazar con undefined.
 * @param {object} contexto
 * @param {string} contexto.pantalla - Id de la pantalla visible, o ''.
 * @param {string} contexto.agente - navigator.userAgent.
 */
export function registroDeError(error, { pantalla = '', agente = '' } = {}) {
  return {
    // Sin mensaje no hay nada que leer después, pero el registro igual sirve:
    // que haya fallado algo en tal pantalla ya es información.
    mensaje: cortar(textoDelError(error) || 'Error sin mensaje', LARGO.mensaje),
    stack: error?.stack ? cortar(error.stack, LARGO.stack) : null,
    pantalla: cortar(pantalla, LARGO.pantalla),
    agente: cortar(agente, LARGO.agente),
  };
}
