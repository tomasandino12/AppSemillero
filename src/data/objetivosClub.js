/**
 * Objetivos de tiro por zona que fija el cuerpo técnico del club.
 *
 * La app NUNCA afirma cuál es el porcentaje correcto para una categoría: no
 * existen normas confiables para estas edades y no se inventan. Eso está
 * decidido para todo el proyecto.
 *
 * Un objetivo que fija el entrenador es otra cosa distinta y legítima: es una
 * decisión de entrenamiento, y la app la muestra atribuida a quien la tomó,
 * nunca como una verdad propia.
 *
 * Por defecto NO existe ninguno. Mientras estén todos en null no se dibuja
 * ninguna marca de objetivo, no se cuenta a nadie por debajo, y la card
 * funciona completa igual. Ese es el estado en el que arranca el piloto.
 *
 * La pantalla para configurarlos no se construye en esta etapa. Para fijar
 * uno a mano se reemplaza el null por un porcentaje entero (0 a 100) acá, que
 * es el único lugar del código donde vive este valor.
 */
export const OBJETIVOS_CLUB = {
  esq_izq: null,
  c45_izq: null,
  frontal: null,
  c45_der: null,
  esq_der: null,
  libres: null,
};

/** null salvo que el club haya fijado un número para esa zona. */
export function objetivoDeZona(zonaId, objetivos = OBJETIVOS_CLUB) {
  const valor = objetivos?.[zonaId];
  return typeof valor === 'number' ? valor : null;
}

/** true si el club fijó al menos un objetivo. Si no, la card no habla de objetivos. */
export function hayObjetivos(objetivos = OBJETIVOS_CLUB) {
  return Object.values(objetivos ?? {}).some((v) => typeof v === 'number');
}
