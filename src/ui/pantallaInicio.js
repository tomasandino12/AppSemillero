import { mostrarPantalla } from './nav.js';
import { iniciarConfirmacion } from './pantallaConfirmacion.js';

const $ = (id) => document.getElementById(id);

export function mostrarInicio() {
  mostrarPantalla('p-inicio');
}

export function iniciarPantallaInicio() {
  $('btn-cargar-partido').addEventListener('click', () => $('input-archivo').click());
  $('input-archivo').addEventListener('change', (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (archivo) iniciarConfirmacion(archivo);
  });
}
