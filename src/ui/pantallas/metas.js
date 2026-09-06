import { POSICIONES_BATERIA } from '../../data/posiciones.js';
import { zonasDeSesion } from '../../data/estadisticas.js';
import { metaDeZona, validarMeta } from '../../data/objetivosClub.js';
import {
  obtenerMetasDelPlantel, guardarMetasPlantel,
  obtenerSesionesDeMedicion, obtenerMedicionesTiroDelPlantel,
} from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed, toast, textoPorcentaje } from '../nav.js';
import { volver } from '../main.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('metas-contenido');

/**
 * Edición de las metas del cuerpo técnico, una por zona.
 *
 * Sin asistentes y sin sugerencias: la app no propone ningún número, porque
 * proponerlo sería inventar una norma por la puerta de atrás. Lo único que
 * muestra al lado de cada campo es el porcentaje ACTUAL de esa zona, que es
 * un dato que el entrenador ya tiene — así fija la meta mirando de dónde
 * parte y no contra una expectativa arbitraria. Una meta inalcanzable
 * desmotiva, y el que mejor puede evitarlo es el que la pone.
 */
export async function renderMetas() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando metas...</div></div>`;

  let metas, sesiones, mediciones;
  try {
    [metas, sesiones, mediciones] = await Promise.all([
      obtenerMetasDelPlantel(club.id, plantel.id),
      obtenerSesionesDeMedicion(club.id, plantel.id),
      obtenerMedicionesTiroDelPlantel(club.id, plantel.id),
    ]);
  } catch (e) {
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudieron cargar las metas.'
    }</div></div></div>`;
    return;
  }

  const sesionesTiro = sesiones
    .filter((s) => s.tipo === 'tiro')
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const actual = sesionesTiro[0] ? zonasDeSesion(mediciones, sesionesTiro[0].id).porZona : {};

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Metas de ${escaparHtml(plantel.categoria)}</div>
      <div class="p">Las fija el cuerpo técnico, no la app. Son de esta categoría y esta temporada. Dejá el campo vacío para sacar una meta.</div>

      <div class="metas-lista">
        ${POSICIONES_BATERIA.map((z) => {
          const valor = actual[z.id] ?? null;
          const meta = metaDeZona(z.id, metas);
          return `
            <div class="meta-fila">
              <div class="et">
                <span class="nom">${escaparHtml(z.nombre)}</span>
                <span class="hoy">Hoy: ${valor ? textoPorcentaje(valor) : '<span class="sin">sin medir</span>'}</span>
              </div>
              <div class="campo-meta">
                <input id="meta-${z.id}" data-zona="${z.id}" type="text" inputmode="numeric"
                       autocomplete="off" placeholder="—" value="${meta == null ? '' : meta}"
                       aria-label="Meta de ${escaparHtml(z.nombre)} en porcentaje">
                <span class="u">%</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div id="metas-aviso"></div>
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-guardar-metas">Guardar las metas</button></div>
  `;

  $('btn-guardar-metas').addEventListener('click', guardar);
}

async function guardar() {
  const boton = $('btn-guardar-metas');
  if (boton.disabled) return;
  const aviso = $('metas-aviso');
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();

  const metas = [];
  const errores = [];
  for (const z of POSICIONES_BATERIA) {
    const { ok, valor, error } = validarMeta($(`meta-${z.id}`).value);
    if (!ok) errores.push(`${z.nombre}: ${error}`);
    else metas.push({ zona: z.id, objetivoPct: valor });
  }
  if (errores.length) {
    aviso.innerHTML = `<div class="al"><div class="tx">${escaparHtml(errores.join(' '))}</div></div>`;
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Guardando...';
  aviso.innerHTML = '';
  try {
    await guardarMetasPlantel({ clubId: club.id, plantelId: plantel.id, metas });
  } catch (e) {
    aviso.innerHTML = `<div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudieron guardar las metas.'
    }</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Guardar las metas';
    return;
  }

  toast('Metas guardadas');
  await volver();
}
