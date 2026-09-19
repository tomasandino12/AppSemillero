/*
 * Lectura estricta de números tecleados. Lógica pura, sin red ni DOM.
 *
 * `Number("1e2")` es 100, `Number("0x10")` es 16 y `Number(true)` es 1: la
 * coerción de JavaScript acepta como número cosas que nadie quiso escribir
 * como número. Acá se acepta una sola forma: dígitos, con coma o punto
 * decimal (el teclado numérico es-AR ofrece coma) y signo opcional.
 */

const FORMA_DECIMAL = /^[+-]?\d+(?:[.,]\d+)?$/;

/**
 * Texto (o número) → número, con estas salidas:
 *   null   vacío, null o undefined: "no se escribió nada"
 *   NaN    algo que no es un decimal (notación científica, hexadecimal,
 *          "true", "12abc", Infinity...)
 *   número el valor, con la coma pasada a punto
 *
 * Un número que ya es número se acepta sólo si es finito.
 */
export function decimalEstricto(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN;
  if (valor == null) return null;
  if (typeof valor !== 'string') return NaN;
  const texto = valor.trim();
  if (texto === '') return null;
  if (!FORMA_DECIMAL.test(texto)) return NaN;
  return Number(texto.replace(',', '.'));
}
