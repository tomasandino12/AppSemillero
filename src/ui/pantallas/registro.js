import { registrarPantalla } from '../main.js';
import { renderDatos, iniciarDatos } from './datos.js';
import { renderPlantel, setAbrirFicha, setAbrirAltaManual } from './plantel.js';
import { renderFicha, abrirFicha } from './fichaJugador.js';
import { iniciarHoja } from '../componentes/hoja.js';
import { iniciarVerDetalles } from '../componentes/verDetalles.js';
import { abrirAltaManual } from './altaJugador.js';
import { renderHoy } from './hoy.js';
import { renderMedir } from './medir.js';
import { renderBateria } from './medirBateria.js';
import { renderVelocidad } from './medirVelocidad.js';
import { renderRecursos } from './recursos.js';
import { setAbrirEjercicio } from './ejercicios.js';
import { renderEjercicio, abrirEjercicio } from './ejercicio.js';
import { setAbrirJugada } from './jugadas.js';
import { renderJugada, abrirJugada } from './jugada.js';
import { renderMetas } from './metas.js';
import { renderPanorama } from './coordPanorama.js';
import { renderProfes } from './coordProfes.js';
import { renderInventarioCoordinacion, renderInventarioLectura } from './inventario.js';
import { renderMiPerfil } from './miPerfil.js';
import { refrescarPlanFisico } from './planFisico.js';
import { renderFisico, iniciarFisico } from './fisico.js';
import { renderSesion } from './fisicoSesion.js';
import { renderEscalones } from './fisicoEscalones.js';
import { renderJugRecursos } from './jugRecursos.js';
import { renderJugFisico } from './jugFisico.js';
import { renderJugSesion } from './jugSesion.js';
import { renderJugProgreso } from './jugProgreso.js';

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
  registrarPantalla('p-plan-fisico', { titulo: 'Plan físico', render: refrescarPlanFisico });
  registrarPantalla('p-hoy', { titulo: 'Hoy', render: renderHoy });
  registrarPantalla('p-medir', { titulo: 'Medir', render: renderMedir });
  registrarPantalla('p-medir-bateria', { titulo: 'Batería de tiro', render: renderBateria });
  registrarPantalla('p-medir-velocidad', { titulo: 'Velocidad', render: renderVelocidad });
  registrarPantalla('p-fisico', { titulo: 'Físico', render: renderFisico });
  registrarPantalla('p-fisico-sesion', { titulo: 'Sesión', render: renderSesion });
  registrarPantalla('p-fisico-escalones', { titulo: 'Escalones', render: renderEscalones });
  registrarPantalla('p-inventario', { titulo: 'Inventario', render: renderInventarioLectura });
  registrarPantalla('p-recursos', { titulo: 'Recursos', render: renderRecursos });
  registrarPantalla('p-ejercicio', { titulo: 'Ejercicio', render: renderEjercicio });
  registrarPantalla('p-jugada', { titulo: 'Jugada', render: renderJugada });
  registrarPantalla('p-metas', { titulo: 'Metas', render: renderMetas });
  registrarPantalla('p-coord-panorama', { titulo: 'Panorama', render: renderPanorama });
  registrarPantalla('p-coord-profes', { titulo: 'Profes', render: renderProfes });
  registrarPantalla('p-coord-inventario', { titulo: 'Inventario', render: renderInventarioCoordinacion });
  registrarPantalla('p-mi-perfil', { titulo: 'Mi perfil', render: renderMiPerfil });
  // Modo jugador (0030): sólo lectura, sólo lo suyo.
  registrarPantalla('p-jug-recursos', { titulo: 'Recursos', render: renderJugRecursos });
  registrarPantalla('p-jug-fisico', { titulo: 'Físico', render: renderJugFisico });
  registrarPantalla('p-jug-sesion', { titulo: 'Sesión', render: renderJugSesion });
  registrarPantalla('p-jug-progreso', { titulo: 'Mi progreso', render: renderJugProgreso });
  setAbrirFicha(abrirFicha);
  setAbrirEjercicio(abrirEjercicio);
  setAbrirJugada(abrirJugada);
  iniciarDatos();
  iniciarFisico();
  iniciarHoja();
  iniciarVerDetalles();
  setAbrirAltaManual(abrirAltaManual);
}
