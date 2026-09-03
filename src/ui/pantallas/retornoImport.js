/**
 * Punto único de retorno del flujo de import. Existe para que las pantallas
 * del import no tengan que importar la pantalla de DATOS (evita un ciclo de
 * imports) y para que las dos rutas de vuelta — el "Volver" del contenido y
 * la flecha del chrome — terminen en exactamente el mismo lugar.
 */
let manejador = () => {};

export function setRetornoImport(fn) {
  manejador = fn;
}

export function retornarDeImport() {
  manejador();
}
