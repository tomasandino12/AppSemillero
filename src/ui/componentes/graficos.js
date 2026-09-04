import { POSICIONES } from '../../data/posiciones.js';

const COL_MUTED = '#726E65'; // mismo tono que --gris-cl (auditoría de accesibilidad del prototipo)

/**
 * Cancha con marcadores por posición. El dibujo viene del prototipo sin
 * cambios; lo que cambió en la Etapa 4 es que `valores` ahora trae el objeto
 * completo de porcentaje() y no un número suelto, para poder mostrar los
 * intentos debajo de cada posición — ningún porcentaje sin su denominador.
 *
 * valores: { [posicionId]: {pct, anotados, intentos, muestraChica} | null }
 * Una posición en null se dibuja vacía con un guión: es "sin medir", no cero.
 */
export function cancha(svg, valores, { alto = 200 } = {}) {
  const W = 300, H = 300;
  const L = '#C9C5BE', T = '#131316';
  let g = `<rect x="6" y="6" width="288" height="278" fill="#FBFAF8" stroke="${L}" stroke-width="1.5"/>`;
  g += `<rect x="104" y="176" width="92" height="108" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  g += `<circle cx="150" cy="176" r="34" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  g += `<line x1="134" y1="272" x2="166" y2="272" stroke="${T}" stroke-width="2.5"/>`;
  g += `<line x1="150" y1="272" x2="150" y2="266" stroke="${T}" stroke-width="2"/>`;
  g += `<circle cx="150" cy="262" r="6" fill="none" stroke="${T}" stroke-width="2"/>`;
  g += `<path d="M28 284 L28 232 A126 126 0 0 1 272 232 L272 284" fill="none" stroke="${L}" stroke-width="1.5"/>`;

  let hayAlguno = false;
  POSICIONES.forEach((p) => {
    const v = valores?.[p.id] ?? null;
    const pct = v?.pct ?? null;
    if (pct != null) hayAlguno = true;
    const op = pct == null ? 0 : Math.max(0.18, Math.min(1, (pct - 15) / 55));
    g += `<circle cx="${p.x}" cy="${p.y}" r="21" fill="#D9122E" opacity="${op}"/>`;
    // Muestra chica: contorno punteado. Es una señal que no depende del color
    // ni del hover, así que sobrevive en cualquier pantalla.
    g += `<circle cx="${p.x}" cy="${p.y}" r="21" fill="none" stroke="#D9122E" stroke-width="1.6"${v?.muestraChica ? ' stroke-dasharray="4 3"' : ''}/>`;
    g += `<text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-family="IBM Plex Mono" font-size="14.5" font-weight="600" fill="${op > 0.55 ? '#fff' : '#131316'}">${pct == null ? '—' : pct}</text>`;
    g += `<text x="${p.x}" y="${p.y + 34}" text-anchor="middle" font-family="Barlow Condensed" font-size="10" letter-spacing="1" fill="#6E6B66">${p.corto}</text>`;
    if (v) {
      g += `<text x="${p.x}" y="${p.y + 45}" text-anchor="middle" font-family="IBM Plex Mono" font-size="9.5" fill="${COL_MUTED}">${v.anotados}/${v.intentos}</text>`;
    }
  });

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.height = alto + 'px';
  svg.innerHTML = g;
  return hayAlguno;
}

/**
 * Gráfico de líneas. Generalizado en la Etapa 4: recibe las etiquetas del eje
 * X en vez de importarlas de un array fijo, y maneja explícitamente 0 y 1
 * punto. El club arranca sin un solo dato cargado, así que los casos chicos
 * son el caso normal, no el borde.
 *
 * datos.etiquetas: string[]  — el eje X ya formateado
 * datos.series: [{ nombre, c: color, dash?: boolean, d: (number|null)[] }]
 *   Cada `d` tiene el mismo largo que `etiquetas`. Los null son huecos.
 *
 * Devuelve false si no había nada que dibujar, para que la pantalla muestre
 * su estado vacío en vez de un cuadro en blanco.
 */
export function grafico(svg, { etiquetas, series }, { u = '%', alto = 170, dec = 0 } = {}) {
  const n = etiquetas?.length ?? 0;
  const todos = (series ?? []).flatMap((s) => s.d).filter((v) => v != null);
  if (n === 0 || todos.length === 0) {
    svg.innerHTML = '';
    svg.removeAttribute('viewBox');
    svg.style.height = '0px';
    return false;
  }

  const W = 320, H = alto, ml = 30, mr = 8, mt = 12, mb = 24;
  let min = Math.min(...todos), max = Math.max(...todos);
  const pad = (max - min) * 0.25 || 1;
  min = min - pad; max = max + pad;
  if (u === '%') min = Math.max(0, min);

  // Con un solo punto no hay eje que repartir: se centra. La versión vieja
  // dividía por (n - 1) y se rompía acá.
  const X = n === 1
    ? () => (ml + (W - mr)) / 2
    : (i) => ml + i * (W - ml - mr) / (n - 1);
  const Y = (v) => mt + (1 - (v - min) / (max - min)) * (H - mt - mb);

  let g = '';
  for (let k = 0; k <= 3; k++) {
    const v = min + (max - min) * k / 3, y = Y(v);
    g += `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="#EAE6DF" stroke-width="1"/>`;
    g += `<text x="${ml - 6}" y="${y + 3.5}" text-anchor="end" font-family="IBM Plex Mono" font-size="10" fill="${COL_MUTED}">${v.toFixed(dec)}</text>`;
  }
  g += `<line x1="${ml}" y1="${Y(min)}" x2="${W - mr}" y2="${Y(min)}" stroke="#C9C5BE" stroke-width="1.2"/>`;
  etiquetas.forEach((f, i) => {
    g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-family="Barlow Condensed" font-size="11.5" letter-spacing=".7" fill="#6E6B66">${String(f).toUpperCase()}</text>`;
  });
  g += `<text x="4" y="9" font-family="Barlow Condensed" font-size="10" letter-spacing="1" fill="${COL_MUTED}">${u.toUpperCase()}</text>`;

  series.forEach((s) => {
    const puntos = s.d
      .map((v, i) => (v == null ? null : { x: X(i), y: Y(v), ultimo: i === s.d.length - 1 }))
      .filter(Boolean);
    if (puntos.length > 1) {
      g += `<polyline points="${puntos.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${s.c}" stroke-width="${s.w || 2.4}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`;
    }
    puntos.forEach((p) => {
      g += `<circle cx="${p.x}" cy="${p.y}" r="${p.ultimo ? 4 : 2.8}" fill="${p.ultimo ? s.c : '#fff'}" stroke="${s.c}" stroke-width="1.8"/>`;
    });
  });

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.height = alto + 'px';
  svg.innerHTML = g;
  return true;
}
