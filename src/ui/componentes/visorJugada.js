/*
 * El visor animado: play/pausa, paso anterior/siguiente, velocidad y la nota
 * del paso actual. Sirve para jugadas y para la pizarra de un ejercicio: el
 * ejercicio suma la fase "Al terminar" (la rotación) y, al llegar al final,
 * vuelve a empezar, porque un ejercicio es una repetición cíclica. Anima con requestAnimationFrame llamando a estadoEn en
 * cada cuadro; con prefers-reduced-motion salta de paso en paso sin
 * interpolar. `desmontar()` cancela lo que esté corriendo (rAF o intervalo):
 * sin esto, salir de la pantalla deja un timer animando un <svg> que ya no está.
 */
import { html } from '../html.js';
import { dibujarPizarra } from './pizarra.js';
import { estadoEn, DURACION_PASO_MS } from '../../data/animacionJugada.js';
import { estadoEjercicioEn, totalFases, esFaseDeRotacion } from '../../data/animacionEjercicio.js';

const VELOCIDADES = [0.5, 1, 2];
// Cuánto se queda el ejercicio en la rotación terminada antes de repetir, para que se alcance a leer.
const PAUSA_ANTES_DE_REPETIR_MS = 700;

export function montarVisor(contenedor, datos, nosotrosDefiende = false) {
  const esEjercicio = datos.modo === 'ejercicio';
  const cantidadDePasos = datos.pasos.length;
  // En un ejercicio, la rotación es una fase más después de los pasos.
  const totalPasos = esEjercicio ? totalFases(datos) : cantidadDePasos;
  let paso = 0;
  let t = 0;
  let jugando = false;
  let velocidad = 1;
  let ultimoFrame = null;
  let raf = null;
  let intervalo = null;
  let repiteEn = null;
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  contenedor.innerHTML = html`
    <div class="visor-jugada">
      <svg class="pz" role="img" aria-label="Pizarra táctica"></svg>
      <p class="visor-nota"></p>
      <div class="visor-controles">
        <button type="button" class="btn sec chico" data-accion="anterior" aria-label="Paso anterior">‹</button>
        <button type="button" class="btn chico visor-jugar" data-accion="jugar">Reproducir</button>
        <button type="button" class="btn sec chico" data-accion="siguiente" aria-label="Paso siguiente">›</button>
      </div>
      <div class="visor-velocidades">
        ${VELOCIDADES.map((v) => html`<button type="button" class="chip-tema${v === 1 ? ' on' : ''}" data-velocidad="${v}">×${String(v).replace('.', ',')}</button>`)}
      </div>
      <span class="visor-indicador mono"></span>
    </div>
  `.toString();

  const svg = contenedor.querySelector('svg.pz');
  const btnJugar = contenedor.querySelector('.visor-jugar');
  const btnAnterior = contenedor.querySelector('[data-accion="anterior"]');
  const btnSiguiente = contenedor.querySelector('[data-accion="siguiente"]');
  const botonesVelocidad = [...contenedor.querySelectorAll('[data-velocidad]')];
  const indicador = contenedor.querySelector('.visor-indicador');
  const notaEl = contenedor.querySelector('.visor-nota');

  if (!totalPasos) btnJugar.style.display = 'none';

  function dibujar() {
    const enRotacion = esEjercicio && esFaseDeRotacion(datos, paso);
    const estado = esEjercicio ? estadoEjercicioEn(datos, paso, t) : estadoEn(datos, paso, t);
    dibujarPizarra(svg, datos, estado, { paso: enRotacion ? undefined : paso, nosotrosDefiende, rotacion: enRotacion });
    notaEl.textContent = enRotacion ? 'Al terminar, rotan.' : datos.pasos[paso]?.nota || '';
    if (!totalPasos) indicador.textContent = 'Formación inicial';
    else indicador.textContent = enRotacion ? 'Al terminar' : `Paso ${paso + 1} de ${cantidadDePasos}`;
  }

  function detener() {
    jugando = false;
    if (raf != null) cancelAnimationFrame(raf);
    if (intervalo != null) clearInterval(intervalo);
    raf = null;
    intervalo = null;
    repiteEn = null;
    btnJugar.textContent = 'Reproducir';
  }

  function irAPaso(nuevo) {
    detener();
    paso = Math.max(0, Math.min(totalPasos - 1, nuevo));
    t = 0;
    dibujar();
  }

  function cuadro(ahora) {
    if (!jugando) return;
    if (ultimoFrame == null) ultimoFrame = ahora;
    t += ((ahora - ultimoFrame) * velocidad) / DURACION_PASO_MS;
    ultimoFrame = ahora;
    if (t >= 1) {
      if (paso >= totalPasos - 1) {
        t = 1;
        if (!esEjercicio) { dibujar(); detener(); return; }
        // El ejercicio se repite: una pausa con el final a la vista y arranca de nuevo.
        if (repiteEn == null) repiteEn = ahora + PAUSA_ANTES_DE_REPETIR_MS / velocidad;
        if (ahora >= repiteEn) { paso = 0; t = 0; repiteEn = null; }
      } else {
        paso += 1;
        t = 0;
      }
    }
    dibujar();
    raf = requestAnimationFrame(cuadro);
  }

  function reproducir() {
    if (!totalPasos) return;
    if (paso >= totalPasos - 1 && t >= 1) { paso = 0; t = 0; }
    jugando = true;
    btnJugar.textContent = 'Pausar';
    if (reducido) {
      intervalo = setInterval(() => {
        if (paso >= totalPasos - 1) {
          if (!esEjercicio) { detener(); return; }
          paso = -1;
        }
        paso += 1;
        dibujar();
      }, DURACION_PASO_MS / velocidad);
    } else {
      ultimoFrame = null;
      raf = requestAnimationFrame(cuadro);
    }
  }

  btnJugar.addEventListener('click', () => (jugando ? detener() : reproducir()));
  btnAnterior.addEventListener('click', () => irAPaso(paso - 1));
  btnSiguiente.addEventListener('click', () => irAPaso(paso + 1));
  botonesVelocidad.forEach((b) => b.addEventListener('click', () => {
    velocidad = Number(b.dataset.velocidad);
    botonesVelocidad.forEach((o) => o.classList.toggle('on', o === b));
  }));

  dibujar();

  return {
    desmontar: detener,
    // El paso visible: lo usa exportarJugada.js para titular el PNG que se descarga.
    pasoActual: () => paso,
  };
}
