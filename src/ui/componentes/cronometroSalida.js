import { html } from '../html.js';
import { validarIntentoSprint, formatearTiempoSprint } from '../../data/sprint.js';

const ESPERA_MIN_MS = 1000;
const ESPERA_MAX_MS = 2000;
// Si el navegador no avisa que terminó de hablar, se sigue igual.
const ESPERA_VOZ_MAX_MS = 4000;
const PITIDO_HZ = 1000;
const PITIDO_S = 0.35;

const TEXTO_MARCAS = 'En sus marcas… listos…';

/** Décimas con coma para el reloj en vivo: 3,4. */
const enVivo = (ms) => (Math.max(0, ms) / 1000).toFixed(1).replace('.', ',');

/** El toque llega con `timeStamp` en el reloj de performance.now(); en navegadores viejos era epoch. */
const instanteDelToque = (e) => (e.timeStamp > 1e12 ? performance.now() : e.timeStamp);

/**
 * Cronómetro de salida por sonido para el sprint de ida y vuelta: "En sus
 * marcas… listos…", una espera al azar y un pitido. El cero del reloj es el
 * instante programado del pitido en el reloj del audio (no el toque de
 * *Correr*). Después el profe toca dos veces, siempre desde la línea de
 * salida: *Giró* cuando el chico frena para dar la vuelta (el parcial) y
 * *Llegó* cuando vuelve a la línea (el total). Los dos toques se miden con el
 * `pointerdown`, que no suma la demora del `click`. Si el audio no arranca,
 * cae a un cronómetro manual (*Salida* / *Giró* / *Llegó*).
 *
 * El toque de *Correr* es el gesto que habilita el audio en el celular: el
 * AudioContext se crea ahí.
 *
 * @param {{ jugador: string, intento: number, distanciaM: number }} args
 * @returns {Promise<{ parcialMs: number, tiempoMs: number } | null>} null si se cancela.
 */
export function abrirCronometroSalida({ jugador, intento, distanciaM }) {
  return new Promise((resolver) => montar({ jugador, intento, distanciaM }, resolver));
}

function montar({ jugador, intento, distanciaM }, resolver) {
  const raiz = document.createElement('div');
  raiz.className = 'crono-salida';
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-label', 'Cronómetro de salida');
  document.body.appendChild(raiz);

  let fase = 'listo';
  let audio = null;
  let inicioMs = null; // en el reloj de performance.now()
  let parcialMs = null; // la ida, desde el cero
  let tiempoMs = null; // el total, desde el cero
  let manual = false;
  let mensaje = null;
  let cuadro = null;
  const temporizadores = [];

  const esperar = (ms, fn) => temporizadores.push(setTimeout(fn, ms));

  function limpiar() {
    temporizadores.forEach(clearTimeout);
    temporizadores.length = 0;
    if (cuadro) cancelAnimationFrame(cuadro);
    cuadro = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Sin voz no pasa nada: el texto ya está en pantalla.
    }
    audio?.close?.().catch(() => {});
    audio = null;
  }

  function cerrar(valor) {
    limpiar();
    document.removeEventListener('keydown', alTeclear);
    raiz.remove();
    resolver(valor);
  }

  function alTeclear(e) {
    if (e.key === 'Escape') cerrar(null);
  }
  document.addEventListener('keydown', alTeclear);

  const titulo = html`
    <button type="button" class="jvc-cerrar" data-c="cerrar" aria-label="Cerrar">&#10005;</button>
    <div class="crono-quien">
      <div class="crono-nombre">${jugador}</div>
      <div class="crono-sub">Intento ${intento} · ${distanciaM} + ${distanciaM} metros</div>
    </div>
  `;

  function pintar() {
    let cuerpo;
    if (fase === 'listo') {
      cuerpo = html`
        ${mensaje && html`<p class="crono-aviso" role="alert">${mensaje}</p>`}
        <div class="crono-tiempo" aria-hidden="true">0,0<span class="u">s</span></div>
        <button type="button" class="btn crono-boton" data-c="correr">Correr</button>
        <button type="button" class="btn sec chico" data-c="manual">Sin sonido: salida manual</button>
      `;
    } else if (fase === 'marcas') {
      cuerpo = html`<p class="crono-marcas" role="status">${TEXTO_MARCAS}</p>`;
    } else if (fase === 'manual') {
      cuerpo = html`
        <div class="crono-tiempo" aria-hidden="true">0,0<span class="u">s</span></div>
        <button type="button" class="crono-llego" data-c="salida">¡Salida!</button>
      `;
    } else if (fase === 'corriendo') {
      const yaGiro = parcialMs != null;
      cuerpo = html`
        <div class="crono-tiempo" data-c="reloj" role="timer">0,0<span class="u">s</span></div>
        <div class="crono-parcial" role="status">${yaGiro ? `Ida ${formatearTiempoSprint(parcialMs)}` : ''}</div>
        ${yaGiro
    ? html`<button type="button" class="crono-llego" data-c="llego">¡Llegó!<span class="ayuda">Tocá cuando vuelva a la línea de salida</span></button>`
    : html`<button type="button" class="crono-llego" data-c="giro">¡Giró!<span class="ayuda">Tocá cuando frene para dar la vuelta</span></button>`}
      `;
    } else {
      const v = validarIntentoSprint(parcialMs / 1000, tiempoMs / 1000);
      cuerpo = html`
        <div class="crono-tiempo" role="status">${formatearTiempoSprint(tiempoMs)?.replace(' s', '')}<span class="u">s</span></div>
        <div class="crono-desglose">
          <span>Ida <b class="mono">${formatearTiempoSprint(parcialMs)}</b></span>
          <span>Vuelta <b class="mono">${formatearTiempoSprint(tiempoMs - parcialMs)}</b></span>
        </div>
        ${!v.ok && html`<p class="crono-aviso" role="alert">${v.error} Repetí el intento.</p>`}
        <div class="crono-acciones">
          <button type="button" class="btn sec" data-c="repetir">Repetir</button>
          <button type="button" class="btn" data-c="guardar" ${v.ok ? '' : 'disabled'}>Guardar</button>
        </div>
      `;
    }
    raiz.innerHTML = html`<div class="crono-cuerpo">${titulo}${cuerpo}</div>`.toString();
  }

  // Un solo listener delegado: se repinta entero en cada fase.
  raiz.addEventListener('pointerdown', (e) => {
    const boton = e.target.closest('[data-c]');
    if (!boton || boton.disabled) return;
    const accion = boton.dataset.c;
    // Salida, Giró y Llegó se miden con el pointerdown, que no suma la demora del click.
    if (accion === 'llego') llego(instanteDelToque(e));
    else if (accion === 'giro') giro(instanteDelToque(e));
    else if (accion === 'salida') salida(instanteDelToque(e));
  });
  raiz.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-c]');
    if (!boton || boton.disabled) return;
    const accion = boton.dataset.c;
    if (accion === 'cerrar') cerrar(null);
    else if (accion === 'correr') correr();
    else if (accion === 'manual') { manual = true; fase = 'manual'; pintar(); }
    else if (accion === 'repetir') { mensaje = null; parcialMs = null; tiempoMs = null; fase = manual ? 'manual' : 'listo'; pintar(); }
    else if (accion === 'guardar') cerrar({ parcialMs, tiempoMs });
  });

  function correr() {
    const Contexto = window.AudioContext ?? window.webkitAudioContext;
    try {
      if (!Contexto) throw new Error('sin audio');
      audio = new Contexto();
      audio.resume?.();
    } catch {
      mensaje = 'No se pudo usar el sonido. Usá la salida manual.';
      manual = true;
      fase = 'manual';
      pintar();
      return;
    }
    mensaje = null;
    manual = false;
    parcialMs = null;
    fase = 'marcas';
    pintar();
    decirMarcas(programarPitido);
  }

  /** "En sus marcas… listos…" por voz si hay; si no, sólo el texto en pantalla. */
  function decirMarcas(alTerminar) {
    let seguido = false;
    const seguir = () => {
      if (seguido) return;
      seguido = true;
      alTerminar();
    };
    try {
      const voz = window.speechSynthesis;
      if (!voz || typeof SpeechSynthesisUtterance === 'undefined') throw new Error('sin voz');
      const frase = new SpeechSynthesisUtterance(TEXTO_MARCAS);
      frase.lang = 'es-AR';
      frase.onend = seguir;
      frase.onerror = seguir;
      voz.cancel();
      voz.speak(frase);
      esperar(ESPERA_VOZ_MAX_MS, seguir);
    } catch {
      esperar(2400, seguir);
    }
  }

  function programarPitido() {
    if (!audio) return;
    const espera = ESPERA_MIN_MS + Math.random() * (ESPERA_MAX_MS - ESPERA_MIN_MS);
    const cero = audio.currentTime + espera / 1000;
    const oscilador = audio.createOscillator();
    const volumen = audio.createGain();
    oscilador.frequency.value = PITIDO_HZ;
    volumen.gain.setValueAtTime(0.0001, cero);
    volumen.gain.linearRampToValueAtTime(1, cero + 0.01);
    volumen.gain.setValueAtTime(1, cero + PITIDO_S - 0.02);
    volumen.gain.linearRampToValueAtTime(0.0001, cero + PITIDO_S);
    oscilador.connect(volumen).connect(audio.destination);
    oscilador.start(cero);
    oscilador.stop(cero + PITIDO_S);

    // El cero, pasado al reloj de performance.now(). getOutputTimestamp cuenta
    // la latencia de salida; sin él se resta la que informe el contexto.
    const marca = audio.getOutputTimestamp?.();
    inicioMs = marca && marca.performanceTime > 0
      ? marca.performanceTime + (cero - marca.contextTime) * 1000
      : performance.now() + (cero - audio.currentTime) * 1000 - (audio.outputLatency ?? 0) * 1000;

    // El reloj arranca en pantalla cuando suena el pitido.
    esperar(Math.max(0, inicioMs - performance.now()), () => {
      fase = 'corriendo';
      pintar();
      animarReloj();
    });
  }

  function animarReloj() {
    const reloj = raiz.querySelector('[data-c="reloj"]');
    if (!reloj || fase !== 'corriendo') return;
    reloj.innerHTML = html`${enVivo(performance.now() - inicioMs)}<span class="u">s</span>`.toString();
    cuadro = requestAnimationFrame(animarReloj);
  }

  function salida(instante) {
    inicioMs = instante;
    parcialMs = null;
    fase = 'corriendo';
    pintar();
    animarReloj();
  }

  function giro(instante) {
    if (fase !== 'corriendo' || parcialMs != null) return;
    parcialMs = Math.round(instante - inicioMs);
    // pintar() reemplaza el reloj: el lazo viejo se corta antes de arrancar otro.
    if (cuadro) cancelAnimationFrame(cuadro);
    pintar();
    animarReloj();
  }

  function llego(instante) {
    if (fase !== 'corriendo' || parcialMs == null) return;
    if (cuadro) cancelAnimationFrame(cuadro);
    cuadro = null;
    tiempoMs = Math.round(instante - inicioMs);
    limpiar();
    fase = 'resultado';
    pintar();
  }

  pintar();
}
