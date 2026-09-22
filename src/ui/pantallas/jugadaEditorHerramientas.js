/*
 * Plantillas del editor de jugadas: la barra de herramientas y el panel de
 * pasos. Sin estado propio ni lógica de mutación — eso vive en jugadaEditor.js,
 * que las llama con el estado actual y cablea los botones que insertan.
 * Separado sólo porque jugadaEditor.js ya pasaba las ~300 líneas (plan Task 8).
 */
import { html, crudo } from '../html.js';
import { TIPOS_ACCION, etiquetaDeTipo, resumenDePaso } from '../../data/jugadas.js';
import { LIMITE } from '../../data/limites.js';
import { iconoDeAccion } from '../componentes/pizarra.js';
import { ICONO, botonIcono } from '../componentes/iconos.js';

const ETIQUETA_ACCION = {
  corte: 'Corte', dribbling: 'Dribbling', pase: 'Pase', cortina: 'Cortina', tiro: 'Tiro', handoff: 'Handoff',
};

const AYUDA_AGREGAR = 'Las fichas y quién arranca con la pelota se eligen en la formación inicial (paso 1).';

const ICONO_PELOTA = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="6" class="pz-pelota"/></svg>';

const ICONO_CONO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polygon points="12,4 20,20 4,20" class="pz-cono"/></svg>';

/** `‹ Volver` · nombre + lápiz + tipo · deshacer/rehacer + Guardar. */
export function cabeceraEditorHtml({
  nombre, tipo, puedeDeshacer, puedeRehacer,
}) {
  return html`
    <div class="jed-cab">
      <button type="button" class="btn sec chico" id="btn-jed-volver">‹ Volver</button>
      <div class="jed-cab-nombre">
        <span class="nom" id="jed-cab-nombre">${nombre}</span>
        ${botonIcono({ id: 'btn-jed-renombrar', icono: ICONO.lapiz, etiqueta: 'Renombrar jugada' })}
        <span class="jed-cab-tipo">${etiquetaDeTipo(tipo)}</span>
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

export function barraDeHerramientasHtml({ herramienta, hayPasos, puedeAgregar }) {
  return html`
    <div class="jed-barra">
      <span class="jed-barra-titulo">Trazos</span>
      <button type="button" class="jed-herr-btn ${herramienta === 'seleccionar' ? 'on' : ''}" data-herramienta="seleccionar">
        ${crudo(ICONO.cursor)}<span>Elegir</span>
      </button>
      ${TIPOS_ACCION.map((t) => html`
        <button type="button" class="jed-herr-btn ${herramienta === t ? 'on' : ''}" data-herramienta="${t}" ${hayPasos ? '' : 'disabled'}>
          ${crudo(iconoDeAccion(t))}<span>${ETIQUETA_ACCION[t]}</span>
        </button>
      `)}
      <hr class="jed-barra-filete">
      <span class="jed-barra-titulo">Fichas</span>
      <button type="button" class="jed-herr-btn" data-agregar="ataque" ${puedeAgregar ? '' : 'disabled'} title="${puedeAgregar ? '' : AYUDA_AGREGAR}">
        <span class="jed-herr-letra">+A</span>
      </button>
      <button type="button" class="jed-herr-btn" data-agregar="defensa" ${puedeAgregar ? '' : 'disabled'} title="${puedeAgregar ? '' : AYUDA_AGREGAR}">
        <span class="jed-herr-letra">+D</span>
      </button>
      <button type="button" class="jed-herr-btn" data-agregar="cono" ${puedeAgregar ? '' : 'disabled'} title="${puedeAgregar ? '' : AYUDA_AGREGAR}">
        ${crudo(ICONO_CONO)}<span>Cono</span>
      </button>
      <button type="button" class="jed-herr-btn ${herramienta === 'pelota' ? 'on' : ''}" data-herramienta="pelota" ${puedeAgregar ? '' : 'disabled'} title="${puedeAgregar ? 'Tocá al atacante que arranca con la pelota' : AYUDA_AGREGAR}">
        ${crudo(ICONO_PELOTA)}<span>Pelota</span>
      </button>
      ${puedeAgregar ? '' : html`<div class="ayuda">${AYUDA_AGREGAR}</div>`}
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
