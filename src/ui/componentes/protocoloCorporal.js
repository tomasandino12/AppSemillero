// Cómo tomar las medidas del cuerpo que necesita la potencia del salto. Los
// rangos se leen de antropometria.js: si cambian allá, cambian acá solos.
import { html, crudo } from '../html.js';
import { abrirHoja, cerrarHoja } from './hoja.js';
import { ICONO, FIGURA } from './iconos.js';
import { $ } from '../dom.js';
import { etiquetaMetodologia } from '../../data/metodologia.js';
import {
  ALTURA_MIN_CM, ALTURA_MAX_CM, PESO_MIN_KG, PESO_MAX_KG,
  PIERNA_MIN_CM, PIERNA_MAX_CM, PIERNA_FLEXIONADA_MIN_CM, PIERNA_FLEXIONADA_MAX_CM,
} from '../../data/antropometria.js';

const rango = (min, max, unidad) => html`<span class="chip-rango">${min}–${max} ${unidad}</span>`;

export function abrirProtocoloCorporal(club) {
  const cuerpo = html`
    <div class="guia-cab">
      <span class="ico">${crudo(ICONO.piernaExtendida)}</span>
      <span class="tit">Protocolo de medidas</span>
      <span class="tag-metodo">${etiquetaMetodologia(club)}</span>
      <p class="sub">Con estas medidas y el peso se calcula la potencia media del salto.</p>
    </div>

    <div class="guia-paso">
      <span class="num">1</span><span class="tit">Pierna extendida</span>
      <div class="dibujo">${crudo(FIGURA.piernaExtendida)}${rango(PIERNA_MIN_CM, PIERNA_MAX_CM, 'cm')}</div>
      <div class="cuerpo">Del trocánter mayor (el hueso que sobresale en la cadera) a la punta del pie, con el tobillo estirado, como si estuviera en puntas. Al medio centímetro.</div>
    </div>

    <div class="guia-paso">
      <span class="num">2</span><span class="tit">Pierna flexionada</span>
      <div class="dibujo">${crudo(FIGURA.piernaFlexionada)}${rango(PIERNA_FLEXIONADA_MIN_CM, PIERNA_FLEXIONADA_MAX_CM, 'cm')}</div>
      <div class="cuerpo">
        <p>Del trocánter mayor al piso, en la posición desde la que el jugador arranca el salto.</p>
        <p>No hace falta una sentadilla profunda: pedile que se flexione como cuando se prepara para saltar, y medí ahí.</p>
      </div>
    </div>

    <div class="guia-paso">
      <span class="num">3</span><span class="tit">Altura y peso</span>
      <div class="dibujo">${rango(ALTURA_MIN_CM, ALTURA_MAX_CM, 'cm')}${rango(PESO_MIN_KG, PESO_MAX_KG, 'kg')}</div>
      <div class="cuerpo">
        <p>Altura: descalzo y de espaldas a la pared.</p>
        <p>Peso: con la menor carga encima posible (sin mochila, buzo ni calzado pesado).</p>
      </div>
    </div>

    <div class="guia-clave">
      Cualquiera de las medidas se puede dejar vacía. Sin las dos medidas de pierna y el peso no hay potencia media.
    </div>

    <button type="button" class="btn" id="guia-corporal-ok">Entendido</button>
  `;
  abrirHoja({ titulo: 'Cómo medir el cuerpo', cuerpo });
  $('guia-corporal-ok').addEventListener('click', cerrarHoja);
}
