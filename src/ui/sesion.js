// Estado de sesión de la UI. Los nombres setClubActual/obtenerClubActual se
// conservan porque los usa la lógica del import de la Etapa 2B, que no se toca.
let clubActual = null;
let planteles = [];
let plantelActivoId = null;
let roles = { esEntrenador: false, esCoordinador: false };
let modo = 'entrenar';

export function setClubActual(club) {
  clubActual = club;
}

export function obtenerClubActual() {
  return clubActual;
}

export function setPlanteles(lista) {
  planteles = [...lista].sort((a, b) => a.categoria.localeCompare(b.categoria));
  if (!plantelActivoId || !planteles.some((p) => p.id === plantelActivoId)) {
    plantelActivoId = planteles.length ? planteles[0].id : null;
  }
}

export function obtenerPlanteles() {
  return planteles;
}

export function setPlantelActivoId(id) {
  plantelActivoId = id;
}

export function obtenerPlantelActivo() {
  return planteles.find((p) => p.id === plantelActivoId) ?? null;
}

/**
 * Quien entrena arranca entrenando aunque también coordine: es el uso de
 * todos los días. Quien sólo coordina no tiene otro modo.
 */
export function setRoles(nuevos) {
  roles = { esEntrenador: nuevos.esEntrenador === true, esCoordinador: nuevos.esCoordinador === true };
  modo = roles.esEntrenador ? 'entrenar' : 'coordinar';
}

export function obtenerRoles() {
  return roles;
}

export function obtenerModo() {
  return modo;
}

/** Ignora un modo que el rol no permite: la UI no puede quedar en un estado sin salida. */
export function setModo(nuevo) {
  if (nuevo === 'coordinar' && roles.esCoordinador) modo = 'coordinar';
  if (nuevo === 'entrenar' && roles.esEntrenador) modo = 'entrenar';
}

export function limpiarSesion() {
  clubActual = null;
  planteles = [];
  plantelActivoId = null;
  roles = { esEntrenador: false, esCoordinador: false };
  modo = 'entrenar';
}
