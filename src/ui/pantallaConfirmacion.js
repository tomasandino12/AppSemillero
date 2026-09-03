import { mostrarPantalla } from './nav.js';

export function iniciarConfirmacion(archivo) {
  mostrarPantalla('p-confirmacion');
  document.getElementById('confirmacion-contenido').textContent = `Archivo elegido: ${archivo.name}`;
}
