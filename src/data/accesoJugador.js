/*
 * Lista declarada de las funciones que las migraciones de la cuenta de jugador
 * (0029 y 0030) otorgan con `grant execute ... to authenticated`. Sin lógica.
 *
 * El jugador comparte el rol `authenticated` con el cuerpo técnico, así que
 * todo lo que se otorga ahí lo puede ejecutar. Lo que lo frena no es el grant
 * sino el cuerpo de cada función (chequea mi_jugador() o el plantel de quien
 * llama). Por eso esta lista existe: tests/contratoAccesoJugador.test.js lee las
 * migraciones y falla si aparece un grant que no está acá, o si acá hay uno que
 * ninguna migración otorga. Sumar una función es sumarla en las dos partes, a
 * propósito.
 */

/** Lo que lee el jugador: cuatro funciones y nada más. Ninguna tabla. */
export const LECTURA_DEL_JUGADOR = ['mi_ficha', 'mis_recursos', 'mi_plan', 'mi_progreso'];

/** Las que usa quien todavía no tiene club, para pedir acceso. */
export const ALTA_DEL_JUGADOR = ['clubes_para_solicitar', 'crear_solicitud_jugador', 'mi_solicitud_jugador'];

/** Las del entrenador del plantel: ver, aprobar, rechazar y revocar. */
export const DEL_CUERPO_TECNICO = [
  'solicitudes_del_plantel',
  'aprobar_solicitud_jugador',
  'rechazar_solicitud_jugador',
  'revocar_cuenta_jugador',
];

export const FUNCIONES_OTORGADAS = [...LECTURA_DEL_JUGADOR, ...ALTA_DEL_JUGADOR, ...DEL_CUERPO_TECNICO];
