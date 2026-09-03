import { registrarPantalla } from '../main.js';
import { renderDatos, iniciarDatos } from './datos.js';

/**
 * Punto único donde se registran las pantallas. Existe para que main.js no
 * tenga que importar cada pantalla (y con eso, evitar ciclos de import entre
 * el router y las pantallas que lo usan para navegar).
 */
export function registrarPantallas() {
  registrarPantalla('p-login', { titulo: 'Ingresar' });
  registrarPantalla('p-datos', { titulo: 'Datos', render: renderDatos });
  registrarPantalla('p-confirmacion', { titulo: 'Confirmar partido' });
  registrarPantalla('p-resultado', { titulo: 'Partido guardado' });
  iniciarDatos();
}
