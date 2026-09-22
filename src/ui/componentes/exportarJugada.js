/*
 * Exportar una jugada fuera de la app: PNG de un paso e impresión con todos.
 * Sin servidor — SVG → Blob → Image → canvas → toBlob para el PNG; window.print()
 * para el papel (el usuario elige "Guardar como PDF" desde ahí). El blob: del
 * PNG necesita entrar en img-src de vercel.json (riesgo del spec).
 */
import { dibujarPizarra } from './pizarra.js';
import { estadoAlInicioDelPaso } from '../../data/jugadas.js';
import { escaparHtml } from '../nav.js';
import { $ } from '../dom.js';

const ANCHO_PNG = 1600;
const ALTO_TITULO = 90;

function cargarImagen(url) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error('No se pudo generar la imagen.'));
    img.src = url;
  });
}

function nombreDeArchivo(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'jugada';
}

/** Descarga un PNG de 1600px de ancho del paso que se ve en `svg`, con el nombre y el paso como título. */
export async function descargarPaso(svg, { nombre, paso, totalPasos }) {
  const [, , anchoSvg, altoSvg] = svg.getAttribute('viewBox').split(' ').map(Number);
  const clon = svg.cloneNode(true);
  clon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const svgBlob = new Blob([new XMLSerializer().serializeToString(clon)], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  const altoCancha = Math.round((ANCHO_PNG * altoSvg) / anchoSvg);
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO_PNG;
  canvas.height = ALTO_TITULO + altoCancha;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#F3F1ED';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  try {
    const img = await cargarImagen(svgUrl);
    ctx.drawImage(img, 0, ALTO_TITULO, ANCHO_PNG, altoCancha);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }

  ctx.fillStyle = '#131316';
  ctx.font = '600 34px Inter, sans-serif';
  ctx.fillText(nombre, 32, 46);
  ctx.fillStyle = '#6E6B66';
  ctx.font = '500 24px Inter, sans-serif';
  ctx.fillText(totalPasos ? `Paso ${paso + 1} de ${totalPasos}` : 'Formación inicial', 32, 76);

  const pngBlob = await new Promise((resolver) => canvas.toBlob(resolver, 'image/png'));
  const pngUrl = URL.createObjectURL(pngBlob);
  const etiquetaPaso = totalPasos ? `paso-${paso + 1}` : 'formacion';
  const a = document.createElement('a');
  a.href = pngUrl;
  a.download = `${nombreDeArchivo(nombre)}-${etiquetaPaso}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(pngUrl);
}

/**
 * Arma una hoja con la formación inicial y el estado final de cada paso (con
 * sus trazos) y llama a window.print(). El contenedor vive siempre en
 * index.html, oculto salvo en @media print (componentes.css).
 */
export function imprimirJugada(datos, nombre) {
  const contenedor = $('jugada-impresion');
  const totalPasos = datos.pasos.length;
  const tiles = [
    { titulo: 'Formación inicial', nota: '', estado: estadoAlInicioDelPaso(datos, 0), opciones: {} },
    ...datos.pasos.map((p, k) => ({
      titulo: `Paso ${k + 1} de ${totalPasos}`,
      nota: p.nota,
      estado: estadoAlInicioDelPaso(datos, k + 1),
      opciones: { paso: k },
    })),
  ];

  contenedor.innerHTML = `
    <h1>${escaparHtml(nombre)}</h1>
    <div class="ji-grilla">
      ${tiles.map((t, i) => `
        <div class="ji-tile">
          <svg class="pz" id="ji-svg-${i}"></svg>
          <div class="ji-pie"><strong>${escaparHtml(t.titulo)}</strong>${t.nota ? ` — ${escaparHtml(t.nota)}` : ''}</div>
        </div>
      `).join('')}
    </div>
  `;
  tiles.forEach((t, i) => dibujarPizarra($(`ji-svg-${i}`), datos, t.estado, t.opciones));

  window.print();
  // Sólo esta llamada la necesita: se vacía después para no dejar la última
  // jugada impresa colgando del DOM (aunque está oculta fuera de @media print).
  window.addEventListener('afterprint', function limpiar() {
    contenedor.innerHTML = '';
    window.removeEventListener('afterprint', limpiar);
  });
}
