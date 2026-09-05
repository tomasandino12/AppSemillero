/**
 * Las posiciones de la batería de tiro, con la geometría que usa cancha()
 * para dibujarlas.
 *
 * Es dato real de la app, no de ejemplo: venía del archivo de datos
 * ficticios de la Etapa 3 (borrado en la Task 17) porque nunca fue un dato
 * inventado, sólo estaba guardado en el lugar equivocado.
 *
 * Las 5 caen sobre el arco de triples: el arco se dibuja en
 * "M28 284 L28 232 A126 126 0 0 1 272 232 L272 284" y cada posición está
 * sobre él (el desfasaje de ~12px hacia adentro es padding visual para que
 * los círculos de r=21 no se salgan de la cancha). Por eso la pareja
 * honesta contra el partido es `tres`, y no una posición contra otra: el
 * boxscore de la CABB no dice desde dónde se tiró. Ver el spec, sección 1.
 */
export const POSICIONES = [
  { id: 'esq_izq', nombre: 'Esquina izquierda', corto: 'ESQ IZQ', x: 32, y: 236 },
  { id: 'c45_izq', nombre: '45° izquierda', corto: '45 IZQ', x: 58, y: 158 },
  { id: 'frontal', nombre: 'Frontal', corto: 'FRONTAL', x: 150, y: 118 },
  { id: 'c45_der', nombre: '45° derecha', corto: '45 DER', x: 242, y: 158 },
  { id: 'esq_der', nombre: 'Esquina derecha', corto: 'ESQ DER', x: 268, y: 236 },
];

/** Libres no se dibuja en la cancha: se mide y se grafica aparte. */
export const LIBRES = { id: 'libres', nombre: 'Tiros libres', corto: 'LIBRES' };

/** Las 6 que se cargan en una batería. */
export const POSICIONES_BATERIA = [...POSICIONES, LIBRES];

/** Siempre 10 intentos por posición. Es lo que define el protocolo. */
export const INTENTOS_POR_POSICION = 10;
