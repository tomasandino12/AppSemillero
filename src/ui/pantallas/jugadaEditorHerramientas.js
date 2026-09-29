/*
 * Plantillas del editor de jugadas: la barra de herramientas y el panel de
 * pasos. Sin estado propio ni lógica de mutación — eso vive en jugadaEditor.js,
 * que las llama con el estado actual y cablea los botones que insertan.
 * Separado sólo porque jugadaEditor.js ya pasaba las ~300 líneas (plan Task 8).
 */
import { html, crudo } from '../html.js';
import { TIPOS_ACCION, etiquetaDeTipo, resumenDePaso } from '../../data/jugadas.js';
import { TIPOS_ACCION_EJERCICIO, FILA } from '../../data/pizarraEjercicio.js';
import { LIMITE } from '../../data/limites.js';
import { iconoDeAccion } from '../componentes/pizarra.js';
import { ICONO, botonIcono } from '../componentes/iconos.js';

const ETIQUETA_ACCION = {
  corte: 'Corte', dribbling: 'Dribbling', pase: 'Pase', cortina: 'Cortina', tiro: 'Tiro', handoff: 'Handoff', rebote: 'Rebote',
};

const AYUDA_AGREGAR = 'Las fichas y quién arranca con la pelota se eligen en la formación inicial (paso 1).';
const AYUDA_ROTACION = 'Tocá la ficha que rota y después adónde va (o tocá la fila a la que se suma). Se dibuja donde termina el último paso.';

const ICONO_PELOTA = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="6" class="pz-pelota"/></svg>';

const ICONO_CONO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polygon points="12,4 20,20 4,20" class="pz-cono"/></svg>';

/**
 * `‹ Volver` · nombre + lápiz + tipo · deshacer/rehacer + Guardar. El nombre
 * de un ejercicio es el del ejercicio: no se renombra desde acá.
 */
export function cabeceraEditorHtml({
  nombre, tipo, puedeDeshacer, puedeRehacer, esEjercicio = false,
}) {
  return html`
    <div class="jed-cab">
      <button type="button" class="btn sec chico" id="btn-jed-volver">‹ Volver</button>
      <div class="jed-cab-nombre">
        <span class="nom" id="jed-cab-nombre">${nombre}</span>
        ${esEjercicio ? '' : botonIcono({ id: 'btn-jed-renombrar', icono: ICONO.lapiz, etiqueta: 'Renombrar jugada' })}
        <span class="jed-cab-tipo">${esEjercicio ? 'Ejercicio' : etiquetaDeTipo(tipo)}</span>
      </div>
      <div class="jed-cab-acciones">
        ${botonIcono({
    id: 'btn-jed-deshacer', icono: ICONO.deshacer, etiqueta: 'Deshacer (Ctrl+Z)', disabled: !puedeDeshacer,
  })}
        ${botonIcono({
    id: 'btn-jed-rehacer', icono: ICONO.rehacer, etiqueta: 'Rehacer (Ctrl+Y)', disabled: !puedeRehacer,
  })}
        <button type="button" class="btn chico" id="btn-jed-guardar">Guardar</button>
      </div>
    </div>
  `;
}

/** "Fila  −  4  +": cuántos chicos hay en la fila tocada. */
function cantidadDeFilaHtml(cantidad) {
  return html`
    <div class="jed-fila-cant" role="group" aria-label="Chicos en la fila">
      <button type="button" class="jed-herr-btn" data-fila-cantidad="-1" aria-label="Uno menos en la fila" ${cantidad <= FILA.min ? 'disabled' : ''}><span class="jed-herr-letra">−</span></button>
      <span class="jed-herr-letra" aria-live="polite">×${cantidad}</span>
      <button type="button" class="jed-herr-btn" data-fila-cantidad="1" aria-label="Uno más en la fila" ${cantidad >= FILA.max ? 'disabled' : ''}><span class="jed-herr-letra">+</span></button>
    </div>
  `;
}

/**
 * `modo` 'ejercicio' suma el rebote, la rotación, la fila y el entrenador.
 * `cantidadDeFila` viene cuando la ficha elegida es una fila.
 */
export function barraDeHerramientasHtml({
  herramienta, hayPasos, puedeAgregar, modo = 'jugada', cantidadDeFila = null,
}) {
  const esEjercicio = modo === 'ejercicio';
  return html`
    <div class="jed-barra">
      <span class="jed-barra-titulo">Trazos</span>
      <button type="button" class="jed-herr-btn ${herramienta === 'seleccionar' ? 'on' : ''}" data-herramienta="seleccionar">
        ${crudo(ICONO.cursor)}<span>Elegir</span>
      </button>
      ${(esEjercicio ? TIPOS_ACCION_EJERCICIO : TIPOS_ACCION).map((t) => html`
        <button type="button" class="jed-herr-btn ${herramienta === t ? 'on' : ''}" data-herramienta="${t}" ${hayPasos ? '' : 'disabled'}>
          ${crudo(iconoDeAccion(t))}<span>${ETIQUETA_ACCION[t]}</span>
        </button>
      `)}
      ${esEjercicio && html`
        <button type="button" class="jed-herr-btn ${herramienta === 'rotacion' ? 'on' : ''}" data-herramienta="rotacion" title="Al terminar, adónde va cada uno">
          ${crudo(iconoDeAccion('rotacion'))}<span>Rotación</span>
        </button>
      `}
      ${esEjercicio && herramienta === 'rotacion' && html`<div class="ayuda">${AYUDA_ROTACION}</div>`}
      ${cantidadDeFila != null && cantidadDeFilaHtml(cantidadDeFila)}
      ${puedeAgregar ? html`
        <hr class="jed-barra-filete">
        <span class="jed-barra-titulo">Fichas</span>
        <button type="button" class="jed-herr-btn" data-agregar="ataque">
          <span class="jed-herr-letra">+A</span>
        </button>
        <button type="button" class="jed-herr-btn" data-agregar="defensa">
          <span class="jed-herr-letra">+D</span>
        </button>
        ${esEjercicio && html`
          <button type="button" class="jed-herr-btn" data-agregar="fila" title="Una fila de chicos">
            <span class="jed-herr-letra">+F</span>
          </button>
          <button type="button" class="jed-herr-btn" data-agregar="entrenador" title="El entrenador">
            <span class="jed-herr-letra">+E</span>
          </button>
        `}
        <button type="button" class="jed-herr-btn" data-agregar="cono">
          ${crudo(ICONO_CONO)}<span>Cono</span>
        </button>
        <button type="button" class="jed-herr-btn ${herramienta === 'pelota' ? 'on' : ''}" data-herramienta="pelota" title="Tocá al atacante que arranca con la pelota">
          ${crudo(ICONO_PELOTA)}<span>Pelota</span>
        </button>
      ` : html`<div class="ayuda">${AYUDA_AGREGAR}</div>`}
    </div>
  `;
}

export function panelDePasosHtml(datos, pasoActual) {
  const total = datos.pasos.length;
  return html`
    <div class="jed-panel">
      <div class="jed-panel-cab">
        <span class="eyebrow">Secuencia de pasos</span>
        <button type="button" class="btn sec chico" id="btn-jed-paso-nuevo">+ Nuevo paso</button>
      </div>
      ${total === 0 ? html`<div class="p">Todavía es sólo la formación inicial: "+ Nuevo paso" arranca la secuencia.</div>` : html`
        <div class="jed-paso-nav">
          <button type="button" class="btn sec chico" id="btn-jed-paso-anterior" ${pasoActual === 0 ? 'disabled' : ''} aria-label="Paso anterior">‹</button>
          <span class="mono">Paso ${pasoActual + 1} de ${total}</span>
          <button type="button" class="btn sec chico" id="btn-jed-paso-siguiente" ${pasoActual === total - 1 ? 'disabled' : ''} aria-label="Paso siguiente">›</button>
        </div>
        <ol class="jed-paso-lista" id="jed-paso-lista">
          ${datos.pasos.map((p, i) => {
            const { numero, titulo } = resumenDePaso(p, i);
            const activo = i === pasoActual;
            return html`
              <li class="jed-paso-fila${activo ? ' on' : ''}">
                <button type="button" class="jed-paso-item" data-paso="${i}"${activo ? html` aria-current="step"` : ''}>
                  <span class="jed-paso-num">${numero}</span>
                  <span class="jed-paso-titulo" data-paso-titulo="${i}">${titulo}</span>
                </button>
                ${activo ? botonIcono({ id: 'btn-jed-paso-borrar', icono: ICONO.tacho, etiqueta: 'Borrar este paso' }) : ''}
              </li>
            `;
          })}
        </ol>
        <button type="button" class="btn sec chico jed-btn-ancho" id="btn-jed-ver-animacion">${crudo(ICONO.reproducir)}<span>Ver animación</span></button>
        <div class="campo">
          <label for="jed-nota">Indicaciones del paso ${pasoActual + 1}</label>
          <textarea id="jed-nota" rows="3" maxlength="${LIMITE.notaPaso}">${datos.pasos[pasoActual]?.nota ?? ''}</textarea>
        </div>
      `}
    </div>
  `;
}
