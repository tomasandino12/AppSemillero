/**
 * Los temas de un ejercicio.
 *
 * La unidad de planificación real del entrenador es el tema, no la sesión con
 * tiempos: "vamos con la idea de lo que queremos trabajar, por ejemplo pase, y
 * de ahí vamos con los ejercicios o improvisamos".
 *
 * Esta lista es CORTA y se edita acá, en el código. Por eso la columna `tema`
 * de la migración 0015 no tiene un CHECK: si lo tuviera, agregar "transición"
 * costaría una migración. La validación vive en esta función.
 *
 * No se convierte en una taxonomía anidada ni en etiquetas jerárquicas: no hay
 * evidencia de que haga falta y sí de que cargar tiene que costar segundos.
 */
export const TEMAS = [
  { id: 'pase', nombre: 'Pase' },
  { id: 'defensa', nombre: 'Defensa' },
  { id: 'tiro', nombre: 'Tiro' },
  { id: 'contraataque', nombre: 'Contraataque' },
  { id: 'rebote', nombre: 'Rebote' },
  { id: 'fisico', nombre: 'Físico' },
  { id: 'juego', nombre: 'Juego' },
  { id: 'otro', nombre: 'Otro' },
];

export function esTemaValido(id) {
  return TEMAS.some((t) => t.id === id);
}

/**
 * El nombre para mostrar. Si el id no está en la lista devuelve el id crudo:
 * un ejercicio guardado con un tema que después se sacó de la lista tiene que
 * seguir viéndose, no desaparecer de la pantalla.
 */
export function nombreDeTema(id) {
  if (!id) return '';
  return TEMAS.find((t) => t.id === id)?.nombre ?? String(id);
}
