/**
 * Saludo de la pantalla Hoy según la hora del dispositivo. Pura: recibe la hora
 * (0–23) en vez de leer el reloj, para poder probarla.
 *
 * "Buen día" llega hasta el mediodía; "buenas noches" arranca a las 20, que es
 * cuando en la cancha ya es de noche casi todo el año.
 */
export function saludoSegunHora(hora) {
  if (!Number.isInteger(hora) || hora < 0 || hora > 23) return 'Hola';
  if (hora >= 5 && hora < 12) return 'Buen día';
  if (hora >= 12 && hora < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
