import { bannerEjemplo } from '../componentes/bannerEjemplo.js';
import { cancha } from '../componentes/graficos.js';
import { POS, TESTS, FECHAS, JUGADORES_EJEMPLO, CARGADOS_EJEMPLO, promedio, ultimo } from '../datosEjemplo.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);

export function renderHoy() {
  const faltan = TESTS.filter((t) => !CARGADOS_EJEMPLO[t.id]).length;
  const sinProgreso = JUGADORES_EJEMPLO.filter((j) => ultimo(j, 'libres') - j.v.libres[0] <= 0);
  const valores = {};
  POS.forEach((p) => { valores[p.id] = promedio(p.id, FECHAS.length - 1); });
  const promTiro = Math.round(POS.reduce((s, p) => s + valores[p.id], 0) / 5);

  $('hoy-contenido').innerHTML = `
    ${bannerEjemplo()}
    <div class="pad">
      <h2 class="h2">Buen día</h2>
      <div class="p">Así se vería el resumen de la categoría cuando haya mediciones cargadas.</div>

      <div class="eyebrow">Para revisar</div>
      <div class="al"><div class="ico">!</div><div class="tx">
        <b>${faltan} tests sin cargar.</b><div class="mt">Última medición completa: 9 de agosto</div></div></div>
      <div class="al"><div class="ico">!</div><div class="tx">
        <b>${sinProgreso.length} chicos sin mejora en tiro desde marzo.</b>
        <div class="mt">${sinProgreso.slice(0, 3).map((j) => j.nom + ' ' + j.ape).join(', ')}${sinProgreso.length > 3 ? '…' : ''}</div></div></div>
      <div class="al ok"><div class="ico">✓</div><div class="tx">
        <b>El promedio de tiro subió 6 puntos.</b><div class="mt">De marzo a agosto, en las 5 posiciones</div></div></div>

      <div class="eyebrow">Tiro de campo</div>
      <div class="tarj">
        <div class="tarj-h"><div class="t">Promedio de la categoría</div><div class="n">${promTiro}<small> %</small></div></div>
        <svg class="g" id="hoy-cancha"></svg>
        <div class="leyenda"><span>Cuanto más lleno el círculo, mejor el porcentaje</span></div>
      </div>
      <button class="btn sec" id="btn-hoy-plantel">Ver el plantel real</button>
    </div>
  `;
  cancha($('hoy-cancha'), valores);
  $('btn-hoy-plantel').addEventListener('click', () => ir('p-plantel'));
}
