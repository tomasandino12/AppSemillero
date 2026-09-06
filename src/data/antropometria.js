/**
 * Altura, peso y edad. Funciones puras: sin red, sin DOM, sin estado.
 *
 * El histórico existe para poder separar "mejoró" de "creció" al comparar
 * generaciones: un chico que sube el porcentaje de tiro mientras pega el
 * estirón no mejoró lo mismo que uno que lo subió sin cambiar de cuerpo.
 * Por eso cada medición guarda su fecha y ninguna pisa a la anterior.
 */

/**
 * Rangos plausibles para las categorías del club (13 a 21 años). No son
 * normas de referencia ni se comparan contra nadie: son el filtro que evita
 * que un error de tipeo entre como dato. Están también como CHECK en la
 * base (0012), acá para poder avisar antes de mandar la fila.
 */
export const ALTURA_MIN_CM = 120;
export const ALTURA_MAX_CM = 230;
export const PESO_MIN_KG = 25;
export const PESO_MAX_KG = 150;

/** 'YYYY-MM-DD' del día de hoy en hora local, no UTC. */
export function hoyLocal(fecha = new Date()) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/**
 * Edad cumplida a una fecha dada. Devuelve null si no hay fecha de
 * nacimiento — que es el caso de todos los jugadores que entraron por una
 * planilla de la CABB, porque esas planillas no la traen.
 */
export function edadEnAnios(fechaNacimiento, hastaIso = hoyLocal()) {
  if (!fechaNacimiento) return null;
  const [anioN, mesN, diaN] = fechaNacimiento.split('-').map(Number);
  const [anioH, mesH, diaH] = hastaIso.split('-').map(Number);
  if (!anioN || !anioH) return null;
  let edad = anioH - anioN;
  // Todavía no cumplió años en el año de referencia.
  if (mesH < mesN || (mesH === mesN && diaH < diaN)) edad -= 1;
  return edad < 0 ? null : edad;
}

/** La medición más reciente de una lista. null si la lista está vacía. */
export function ultimaMedicion(mediciones) {
  if (!mediciones?.length) return null;
  return [...mediciones].sort((a, b) => b.fechaMedicion.localeCompare(a.fechaMedicion))[0];
}

/** Map de jugadorId → su medición más reciente. Para la lista de PLANTEL. */
export function ultimaMedicionPorJugador(mediciones) {
  const porJugador = new Map();
  for (const m of mediciones ?? []) {
    const previa = porJugador.get(m.jugadorId);
    if (!previa || m.fechaMedicion.localeCompare(previa.fechaMedicion) > 0) {
      porJugador.set(m.jugadorId, m);
    }
  }
  return porJugador;
}

/** Ordenadas de la más reciente a la más vieja, para mostrar el histórico. */
export function ordenarMediciones(mediciones) {
  return [...(mediciones ?? [])].sort((a, b) => b.fechaMedicion.localeCompare(a.fechaMedicion));
}

/** Acepta coma o punto como separador decimal: el teclado es-AR ofrece coma. */
function aNumero(valor) {
  if (valor == null || String(valor).trim() === '') return null;
  const n = Number(String(valor).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Valida y normaliza lo que se cargó en el formulario.
 *
 * Devuelve `{ ok, errores, valores }`. `valores.alturaCm` y `valores.pesoKg`
 * son null cuando el campo quedó vacío — vacío es "no se midió", nunca cero,
 * y las dos son independientes: se puede pesar a alguien sin medirlo.
 */
export function validarMedicion({ fechaMedicion, altura, peso }, hoyIso = hoyLocal()) {
  const errores = [];

  if (!fechaMedicion) errores.push('Poné la fecha en que se lo midió.');
  else if (fechaMedicion.localeCompare(hoyIso) > 0) errores.push('La fecha no puede ser futura.');

  const alturaCm = aNumero(altura);
  if (Number.isNaN(alturaCm)) {
    errores.push('La altura tiene que ser un número.');
  } else if (alturaCm != null && (alturaCm < ALTURA_MIN_CM || alturaCm > ALTURA_MAX_CM)) {
    errores.push(`La altura tiene que estar entre ${ALTURA_MIN_CM} y ${ALTURA_MAX_CM} cm.`);
  }

  const pesoKg = aNumero(peso);
  if (Number.isNaN(pesoKg)) {
    errores.push('El peso tiene que ser un número.');
  } else if (pesoKg != null && (pesoKg < PESO_MIN_KG || pesoKg > PESO_MAX_KG)) {
    errores.push(`El peso tiene que estar entre ${PESO_MIN_KG} y ${PESO_MAX_KG} kg.`);
  }

  // Una fila sin ningún valor no es una medición: sería una fecha sola.
  if (!errores.length && alturaCm == null && pesoKg == null) {
    errores.push('Cargá al menos la altura o el peso.');
  }

  return {
    ok: errores.length === 0,
    errores,
    valores: {
      fechaMedicion,
      alturaCm: Number.isNaN(alturaCm) ? null : (alturaCm == null ? null : Math.round(alturaCm)),
      pesoKg: Number.isNaN(pesoKg) ? null : (pesoKg == null ? null : Math.round(pesoKg * 10) / 10),
    },
  };
}

/** Valida una fecha de nacimiento suelta. Vacío es válido: significa "no se sabe". */
export function validarFechaNacimiento(fechaNacimiento, hoyIso = hoyLocal()) {
  if (!fechaNacimiento) return { ok: true, errores: [], valor: null };
  if (fechaNacimiento.localeCompare(hoyIso) > 0) {
    return { ok: false, errores: ['La fecha de nacimiento no puede ser futura.'], valor: null };
  }
  const edad = edadEnAnios(fechaNacimiento, hoyIso);
  if (edad == null || edad > 60) {
    return { ok: false, errores: ['Revisá la fecha: esa edad no es de un jugador de inferiores.'], valor: null };
  }
  return { ok: true, errores: [], valor: fechaNacimiento };
}
