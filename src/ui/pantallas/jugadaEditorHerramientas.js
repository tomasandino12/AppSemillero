/*
 * Plantillas del editor de jugadas: la barra de herramientas y el panel de
 * pasos. Sin estado propio ni lógica de mutación — eso vive en jugadaEditor.js,
 * que las llama con el estado actual y cablea los botones que insertan.
 * Separado sólo porque jugadaEditor.js ya pasaba las ~300 líneas (plan Task 8).
 */
import { html, crudo } from '../html.js';
import { TIPOS_ACCION } from '../../data/jugadas.js';
import { LIMITE } from '../../data/limites.js';
import { iconoDeAccion } from '../componentes/pizarra.js';

const ETIQUETA_ACCION = {
  corte: 'Corte', dribbling: 'Dribbling', pase: 'Pase', cortina: 'Cortina', tiro: 'Tiro', handoff: 'Handoff',
};

const AYUDA_AGREGAR = 'Las fichas se suman en la formación inicial (paso 1).';

export function barraDeHerramientasHtml({ herramienta, puedeDeshacer, puedeRehacer, hayPasos, puedeAgregar }) {
  return html`
    <div class="jed-herramientas">
      <div class="jed-grupo" role="group" aria-label="Herramientas">
        <span class="jed-grupo-titulo">Herramientas</span>
        <div class="jed-grupo-botones">
          <button type="button" class="chip-tema ${herramienta === 'seleccionar' ? 'on' : ''}" data-herramienta="seleccionar">Seleccionar</button>
          ${TIPOS_ACCION.map((t) => html`<button type="button" class="chip-tema ${herramienta === t ? 'on' : ''}" data-herramienta="${t}" ${hayPasos ? '' : 'disabled'}>${crudo(iconoDeAccion(t))}${ETIQUETA_ACCION[t]}</button>`)}
        </div>
      </div>
      <div class="jed-grupo" role="group" aria-label="Agregar">
        <span class="jed-grupo-titulo">Agregar</span>
        <div class="jed-grupo-botones">
          <button type="button" class="chip-tema" data-agregar="ataque" ${puedeAgregar ? '' : 'disabled'} title="${puedeAgregar ? '' : AYUDA_AGREGAR}">+ Atacante</button>
          <button type="button" class="chip-tema" data-agregar="defensa" ${puedeAgregar ? '' : 'disabled'} title="${puedeAgregar ? '' : AYUDA_AGREGAR}">+ Defensor</button>
          <button type="button" class="chip-tema" data-agregar="cono" ${puedeAgregar ? '' : 'disabled'} title="${puedeAgregar ? '' : AYUDA_AGREGAR}">+ Cono</button>
        </div>
        ${puedeAgregar ? '' : html`<div class="ayuda">${AYUDA_AGREGAR}</div>`}
      </div>
      <div class="jed-grupo" role="group" aria-label="Historial">
        <span class="jed-grupo-titulo">Historial</span>
        <div class="jed-grupo-botones">
          <button type="button" class="btn sec chico" id="btn-jed-deshacer" ${puedeDeshacer ? '' : 'disabled'}>Deshacer</button>
          <button type="button" class="btn sec chico" id="btn-jed-rehacer" ${puedeRehacer ? '' : 'disabled'}>Rehacer</button>
          ${hayPasos ? html`<button type="button" class="btn sec chico" id="btn-jed-ver-animacion">Ver animación</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

export function panelDePasosHtml(datos, pasoActual) {
  const total = datos.pasos.length;
  return html`
    <div class="jed-panel">
      <div class="jed-panel-cab">
        <span class="eyebrow">Pasos</span>
        <button type="button" class="btn sec chico" id="btn-jed-paso-nuevo">Nuevo paso</button>
      </div>
      ${total === 0 ? html`<div class="p">Todavía es sólo la formación inicial: "Nuevo paso" arranca la secuencia.</div>` : html`
        <div class="jed-paso-nav">
          <button type="button" class="btn sec chico" id="btn-jed-paso-anterior" ${pasoActual === 0 ? 'disabled' : ''} aria-label="Paso anterior">‹</button>
          <span class="mono">Paso ${pasoActual + 1} de ${total}</span>
          <button type="button" class="btn sec chico" id="btn-jed-paso-siguiente" ${pasoActual === total - 1 ? 'disabled' : ''} aria-label="Paso siguiente">›</button>
        </div>
        <button type="button" class="btn sec chico" id="btn-jed-paso-borrar">Borrar este paso</button>
        <div class="campo">
          <label for="jed-nota">Nota de este paso</label>
          <textarea id="jed-nota" rows="3" maxlength="${LIMITE.notaPaso}">${datos.pasos[pasoActual]?.nota ?? ''}</textarea>
        </div>
      `}
      <div class="jed-panel-salir">
        <button type="button" class="btn sec chico" id="btn-jed-volver">Volver</button>
        <button type="button" class="btn chico" id="btn-jed-guardar">Guardar</button>
      </div>
    </div>
  `;
}
