import { cronograma } from '../../data/yoyo.js';

/** Segundos de cuenta regresiva antes de la primera ida. */
export const CUENTA_S = 5;
// Cuánto por delante se programan los pitidos: en tandas cortas, así detener()
// no deja cientos de osciladores esperando.
const TANDA_S = 10;
const REVISION_MS = 2000;
const PITIDO_HZ = 1000;
const PITIDO_LARGO_HZ = 1500;
const PITIDO_S = 0.18;
const PITIDO_LARGO_S = 0.5;
const SEPARACION_DOBLE_S = 0.25;

/**
 * Los pitidos del Yo-Yo, programados en el reloj del audio: uno al final de
 * cada ida y doble cuando empieza un nivel más rápido (`cronograma()`), con
 * una cuenta de 5 s antes de la primera ida. `tiempoActual()` sale de
 * `audioCtx.currentTime`, el mismo reloj que los pitidos, así lo que muestra
 * la pantalla no se corre respecto de lo que se oye.
 *
 * `empezar()` tiene que llamarse desde un toque (el gesto que habilita el
 * audio en el celular). Mientras corre pide que la pantalla no se apague
 * (Wake Lock) y lo renueva al volver a la pestaña. Si el celular se bloquea o
 * el audio se suspende, avisa con `alAviso(texto)`: los pitidos ya no son
 * confiables y hay que rehacer la prueba.
 *
 * @param {{ alAviso?: (texto: string) => void }} [opciones]
 * @returns {{ empezar: () => boolean, detener: () => void, tiempoActual: () => number | null }}
 */
export function crearPitidosYoyo({ alAviso = () => {} } = {}) {
  let audio = null;
  let cero = null; // instante del arranque en el reloj del audio
  let siguiente = 0; // índice del próximo pitido del cronograma sin programar
  let cuentaProgramada = false;
  let revision = null;
  let wakeLock = null;
  let avisado = false;
  const pitidos = cronograma();

  function avisar(texto) {
    if (avisado) return;
    avisado = true;
    alAviso(texto);
  }

  function sonar(en, hz, duracion) {
    const oscilador = audio.createOscillator();
    const volumen = audio.createGain();
    oscilador.frequency.value = hz;
    volumen.gain.setValueAtTime(0.0001, en);
    volumen.gain.linearRampToValueAtTime(1, en + 0.01);
    volumen.gain.setValueAtTime(1, en + duracion - 0.03);
    volumen.gain.linearRampToValueAtTime(0.0001, en + duracion);
    oscilador.connect(volumen).connect(audio.destination);
    oscilador.start(en);
    oscilador.stop(en + duracion);
  }

  /** Programa todo lo que caiga dentro de la próxima tanda. */
  function programar() {
    if (!audio) return;
    const limite = audio.currentTime + TANDA_S;
    if (!cuentaProgramada) {
      // Tres cortos en los últimos segundos y uno largo al arrancar.
      for (const antes of [3, 2, 1]) sonar(cero - antes, PITIDO_HZ, PITIDO_S);
      sonar(cero, PITIDO_LARGO_HZ, PITIDO_LARGO_S);
      cuentaProgramada = true;
    }
    while (siguiente < pitidos.length && cero + pitidos[siguiente].t <= limite) {
      const { t, cambioDeNivel } = pitidos[siguiente];
      sonar(cero + t, PITIDO_HZ, PITIDO_S);
      if (cambioDeNivel) sonar(cero + t + SEPARACION_DOBLE_S, PITIDO_HZ, PITIDO_S);
      siguiente += 1;
    }
    if (siguiente >= pitidos.length && revision) {
      clearInterval(revision);
      revision = null;
    }
  }

  async function pedirPantallaPrendida() {
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      // Sin Wake Lock (o denegado) la pantalla puede apagarse: se avisa si el audio se corta.
      wakeLock = null;
    }
  }

  function alVolverALaPestana() {
    if (!audio) return;
    if (document.visibilityState === 'visible') {
      pedirPantallaPrendida();
      // El navegador puede haber frenado el reloj del audio mientras estuvo oculta.
      if (audio.state !== 'running') avisar('El celular se bloqueó y los pitidos se cortaron. Hay que rehacer la prueba.');
    } else {
      avisar('La pantalla se ocultó: los pitidos pueden haberse cortado.');
    }
  }

  function empezar() {
    const Contexto = window.AudioContext ?? window.webkitAudioContext;
    if (!Contexto) return false;
    try {
      audio = new Contexto();
      audio.resume?.();
    } catch {
      audio = null;
      return false;
    }
    avisado = false;
    siguiente = 0;
    cuentaProgramada = false;
    cero = audio.currentTime + CUENTA_S;
    audio.addEventListener?.('statechange', () => {
      if (audio && audio.state !== 'running') avisar('El audio se suspendió: los pitidos ya no son confiables. Hay que rehacer la prueba.');
    });
    document.addEventListener('visibilitychange', alVolverALaPestana);
    pedirPantallaPrendida();
    programar();
    revision = setInterval(programar, REVISION_MS);
    return true;
  }

  function detener() {
    if (revision) clearInterval(revision);
    revision = null;
    document.removeEventListener('visibilitychange', alVolverALaPestana);
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
    audio?.close?.().catch(() => {});
    audio = null;
  }

  /** Segundos desde el arranque (negativo durante la cuenta), o null si no está corriendo. */
  function tiempoActual() {
    return audio ? audio.currentTime - cero : null;
  }

  return { empezar, detener, tiempoActual };
}
