/**
 * La variación contra la batería anterior.
 *
 * Sólo lleva flecha y color cuando supera el margen de error de la
 * comparación. Dos baterías de ~700 intentos tienen ±2 pp cada una: una
 * diferencia de 2 pp entre sesiones está dentro del ruido, y pintarla verde
 * con una flecha para arriba le diría al entrenador que el equipo mejoró
 * cuando el dato no alcanza para afirmarlo.
 *
 * La flecha es la señal, no el color: quien no distinga los tonos igual ve
 * para qué lado se movió.
 *
 * Vive acá y no en hoy.js porque el panorama de coordinación la usa igual:
 * una sola forma de decir "no alcanza para afirmarlo" en toda la app.
 */
export function variacionHtml(variacion) {
  if (variacion == null) return '';
  const signo = variacion.pp > 0 ? '+' : '';
  const texto = `${signo}${variacion.pp}`;
  if (!variacion.concluyente) {
    return `<span class="var neutra" title="La diferencia no supera el margen de error">${texto} pp · sin diferencia clara</span>`;
  }
  const flecha = variacion.pp > 0 ? '▲' : '▼';
  return `<span class="var ${variacion.pp > 0 ? 'sube' : 'baja'}">${flecha} ${texto} pp</span>`;
}
