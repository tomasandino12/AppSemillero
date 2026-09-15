/**
 * Punto único de retorno del import de plan físico. Mismo patrón que
 * retornoImport.js y separado de él a propósito: el import de partido vuelve
 * a DATOS y éste a FÍSICO. Existe para que planFisico.js no tenga que importar
 * la pantalla de FÍSICO (evita un ciclo de imports) y para que todos sus
 * "Volver" terminen en exactamente el mismo lugar.
 */
let manejador = () => {};

export function setRetornoPlanFisico(fn) {
  manejador = fn;
}

export function retornarDePlanFisico() {
  manejador();
}
