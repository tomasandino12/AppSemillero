// Estado de sesión de la UI. Los nombres setClubActual/obtenerClubActual se
// conservan porque los usa la lógica del import de la Etapa 2B, que no se toca.
let clubActual = null;
let planteles = [];
let plantelActivoId = null;
let roles = { esEntrenador: false, esCoordinador: false, esJugador: false };
let modo = 'entrenar';
let cuenta = null;
let fichaJugador = null;

/** { id, email, nombre } de quien usa la app. nombre puede ser null (cuentas anteriores a 0019). */
export function setCuenta(nueva) {
  cuenta = nueva ? { ...nueva } : null;
}

export function obtenerCuenta() {
  return cuenta;
}

export function setNombreDeCuenta(nombre) {
  if (cuenta) cuenta = { ...cuenta, nombre };
}

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
 * todos los días. Quien sólo coordina no tiene otro modo. Un jugador nunca es
 * del cuerpo técnico (no tiene fila en miembro_club): su único modo es 'jugar'.
 */
export function setRoles(nuevos) {
  roles = {
    esEntrenador: nuevos.esEntrenador === true,
    esCoordinador: nuevos.esCoordinador === true,
    esJugador: nuevos.esJugador === true,
  };
  if (roles.esEntrenador) modo = 'entrenar';
  else if (roles.esCoordinador) modo = 'coordinar';
  else modo = roles.esJugador ? 'jugar' : 'coordinar';
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
  if (nuevo === 'jugar' && roles.esJugador) modo = 'jugar';
}

/** La ficha propia de un jugador con cuenta ({ jugadorId, clubId, planteles… }); null si no lo es. */
export function setFichaJugador(ficha) {
  fichaJugador = ficha;
}

export function obtenerFichaJugador() {
  return fichaJugador;
}

export function limpiarSesion() {
  clubActual = null;
  planteles = [];
  plantelActivoId = null;
  roles = { esEntrenador: false, esCoordinador: false, esJugador: false };
  modo = 'entrenar';
  cuenta = null;
  fichaJugador = null;
}
