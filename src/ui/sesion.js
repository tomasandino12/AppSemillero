// Estado de sesión de la UI. Los nombres setClubActual/obtenerClubActual se
// conservan porque los usa la lógica del import de la Etapa 2B, que no se toca.
let clubActual = null;
let planteles = [];
let plantelActivoId = null;

export function setClubActual(club) {
  clubActual = club;
}

export function obtenerClubActual() {
  return clubActual;
}

export function setPlanteles(lista) {
  planteles = lista;
  if (!plantelActivoId || !lista.some((p) => p.id === plantelActivoId)) {
    plantelActivoId = lista.length ? lista[0].id : null;
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

export function limpiarSesion() {
  clubActual = null;
  planteles = [];
  plantelActivoId = null;
}
