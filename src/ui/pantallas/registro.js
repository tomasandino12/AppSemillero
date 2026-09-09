import { registrarPantalla } from '../main.js';
import { renderDatos, iniciarDatos } from './datos.js';
import { renderPlantel, setAbrirFicha, setAbrirAltaManual } from './plantel.js';
import { renderFicha, abrirFicha } from './fichaJugador.js';
import { iniciarHoja } from '../componentes/hoja.js';
import { abrirAltaManual } from './altaJugador.js';
import { renderHoy } from './hoy.js';
import { renderMedir } from './medir.js';
import { renderBateria } from './medirBateria.js';
import { renderVelocidad } from './medirVelocidad.js';
import { renderRecursos } from './recursos.js';
import { setAbrirEjercicio } from './ejercicios.js';
import { renderEjercicio, abrirEjercicio } from './ejercicio.js';
import { renderMetas } from './metas.js';

/**
 * Punto único donde se registran las pantallas. Existe para que main.js no
 * tenga que importar cada pantalla (y con eso, evitar ciclos de import entre
 * el router y las pantallas que lo usan para navegar).
 */
export function registrarPantallas() {
  registrarPantalla('p-plantel', { titulo: 'Plantel', render: renderPlantel });
  registrarPantalla('p-ficha', { titulo: 'Jugador', render: renderFicha });
  registrarPantalla('p-datos', { titulo: 'Datos', render: renderDatos });
  registrarPantalla('p-confirmacion', { titulo: 'Cargar partido' });
  registrarPantalla('p-resultado', { titulo: 'Cargar partido' });
  registrarPantalla('p-hoy', { titulo: 'Hoy', render: renderHoy });
  registrarPantalla('p-medir', { titulo: 'Medir', render: renderMedir });
  registrarPantalla('p-medir-bateria', { titulo: 'Batería de tiro', render: renderBateria });
  registrarPantalla('p-medir-velocidad', { titulo: 'Velocidad', render: renderVelocidad });
  registrarPantalla('p-recursos', { titulo: 'Recursos', render: renderRecursos });
  registrarPantalla('p-ejercicio', { titulo: 'Ejercicio', render: renderEjercicio });
  registrarPantalla('p-metas', { titulo: 'Metas', render: renderMetas });
  setAbrirFicha(abrirFicha);
  setAbrirEjercicio(abrirEjercicio);
  iniciarDatos();
  iniciarHoja();
  setAbrirAltaManual(abrirAltaManual);
}
