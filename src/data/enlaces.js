/**
 * Si un link se puede guardar y mostrar como <a href>. Es la misma regla que
 * el CHECK de la base (0027: `~* '^https?://'`), y las dos tienen que decir lo
 * mismo: tests/enlaces.test.js compara el texto de la migración.
 *
 * escaparHtml() protege el atributo href, pero no el esquema: un
 * "javascript:..." escapado sigue ejecutándose al tocarlo, con la sesión del
 * profe en localStorage al alcance. Y sin "https://" el navegador lo resuelve
 * como ruta de la app. Por eso, cualquier link que venga de la base o de un
 * archivo pasa por acá antes de dibujarse o de guardarse.
 *
 * No recorta espacios a propósito: quien guarda recorta primero, y la base
 * rechaza lo que empieza con un espacio.
 */
export function esEnlaceWeb(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

export const MENSAJE_ENLACE_NO_WEB = 'El link tiene que empezar con http:// o https://.';
