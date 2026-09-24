// Guía de interpretación del salto: qué mide cada número y por qué el W/kg
// es el que importa. Los ejemplos se calculan con las mismas funciones que
// usa la ficha, así el texto no se desalinea si cambia la fórmula.
import { html, crudo } from '../html.js';
import { abrirHoja, cerrarHoja } from './hoja.js';
import { ICONO } from './iconos.js';
import { $ } from '../dom.js';
import { etiquetaMetodologia } from '../../data/metodologia.js';
import { alturaDeSalto, potenciaSamozino } from '../../data/salto.js';

const coma = (n, dec = 1) => n.toFixed(dec).replace('.', ',');

const PIVOT = {
  masaKg: 95, alturaCm: 30, piernaCm: 105, piernaFlexionadaCm: 58,
};
const BASE = {
  masaKg: 65, alturaCm: 35, piernaCm: 95, piernaFlexionadaCm: 50,
};

function ejemplo(nombre, datos) {
  const p = potenciaSamozino(datos);
  return html`<li><strong>${nombre}:</strong> ${datos.masaKg} kg, salta ${datos.alturaCm} cm, pierna extendida ${datos.piernaCm} y flexionada ${datos.piernaFlexionadaCm} → <span class="mono">${Math.round(p.potenciaW)} W · ${coma(p.potenciaWKg)} W/kg</span></li>`;
}

export function abrirGuiaSalto(club) {
  const cuerpo = html`
    <div class="guia-cab">
      <span class="ico">${crudo(ICONO.info)}</span>
      <span class="tit">Guía de interpretación</span>
      <span class="tag-metodo">${etiquetaMetodologia(club)}</span>
      <p class="sub">Qué te dice cada número del salto y cómo usarlo sin engañarte.</p>
    </div>

    <div class="guia-paso">
      <span class="num">1</span><span class="tit">Altura y tiempo en el aire</span>
      <div class="cuerpo">
        <p>La altura sale del tiempo que el chico está en el aire: h = g·t²/8. Con 0,45 s da ${coma(alturaDeSalto(0.45))} cm.</p>
        <p>Al marcar los cuadros del despegue y el aterrizaje hay un error de unos 2 cm a 120 fps. Por eso una diferencia de 1 o 2 cm entre sesiones no significa nada.</p>
      </div>
    </div>

    <div class="guia-clave">
      <div class="tit">2 · ¿Por qué W/kg? El parámetro clave</div>
      <p>Mide la potencia en relación con el propio peso, así que sirve para comparar chicos de distinto tamaño. Un ejemplo:</p>
      <ul class="lista-guia">
        ${ejemplo('Pivot', PIVOT)}
        ${ejemplo('Base', BASE)}
      </ul>
      <p>El pivot tiene más watts, pero la base tiene más potencia para su cuerpo.</p>
    </div>

    <div class="guia-paso">
      <span class="num">3</span><span class="tit">Watts o W/kg, y cómo comparar</span>
      <div class="cuerpo">
        <p>La potencia usa el peso, la pierna extendida y la pierna flexionada, tomados a la fecha del salto. Si falta alguno de los tres, aparece "sin datos".</p>
        <p>Comparalo con el mismo chico, con el mismo test (CMJ con CMJ) y con el mismo protocolo de filmación.</p>
      </div>
    </div>

    <button type="button" class="btn" id="guia-salto-ok">Entendido</button>
  `;
  abrirHoja({ titulo: 'Cómo leer el salto', cuerpo });
  $('guia-salto-ok').addEventListener('click', cerrarHoja);
}
