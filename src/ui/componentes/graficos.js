import { POS, FECHAS } from '../datosEjemplo.js';

const COL_MUTED = '#726E65'; // mismo tono que --gris-cl (auditoría de accesibilidad del prototipo)

/** Cancha con marcadores por posición. Portado tal cual del prototipo. */
export function cancha(svg, vals, { alto = 200 } = {}) {
  const W = 300, H = 290;
  const L = '#C9C5BE', T = '#131316';
  let g = `<rect x="6" y="6" width="288" height="278" fill="#FBFAF8" stroke="${L}" stroke-width="1.5"/>`;
  g += `<rect x="104" y="176" width="92" height="108" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  g += `<circle cx="150" cy="176" r="34" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  g += `<line x1="134" y1="272" x2="166" y2="272" stroke="${T}" stroke-width="2.5"/>`;
  g += `<line x1="150" y1="272" x2="150" y2="266" stroke="${T}" stroke-width="2"/>`;
  g += `<circle cx="150" cy="262" r="6" fill="none" stroke="${T}" stroke-width="2"/>`;
  g += `<path d="M28 284 L28 232 A126 126 0 0 1 272 232 L272 284" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  POS.forEach((p) => {
    const v = vals[p.id];
    const op = v == null ? 0 : Math.max(0.18, Math.min(1, (v - 15) / 55));
    g += `<circle cx="${p.x}" cy="${p.y}" r="21" fill="#D9122E" opacity="${op}"/>`;
    g += `<circle cx="${p.x}" cy="${p.y}" r="21" fill="none" stroke="#D9122E" stroke-width="1.6"/>`;
    g += `<text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-family="IBM Plex Mono" font-size="14.5" font-weight="600" fill="${op > 0.55 ? '#fff' : '#131316'}">${v == null ? '—' : Math.round(v)}</text>`;
    g += `<text x="${p.x}" y="${p.y + 34}" text-anchor="middle" font-family="Barlow Condensed" font-size="10" letter-spacing="1" fill="#6E6B66">${p.c}</text>`;
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.height = alto + 'px';
  svg.innerHTML = g;
}

/** Gráfico de líneas con ejes. Portado tal cual del prototipo. */
export function grafico(svg, series, { u = '%', alto = 170, dec = 0 } = {}) {
  const W = 320, H = alto, ml = 30, mr = 8, mt = 12, mb = 24;
  const todos = series.flatMap((s) => s.d);
  let min = Math.min(...todos), max = Math.max(...todos);
  const pad = (max - min) * 0.25 || 1;
  min = min - pad; max = max + pad;
  if (u === '%') min = Math.max(0, min);
  const X = (i) => ml + i * (W - ml - mr) / (FECHAS.length - 1);
  const Y = (v) => mt + (1 - (v - min) / (max - min)) * (H - mt - mb);
  let g = '';
  for (let k = 0; k <= 3; k++) {
    const v = min + (max - min) * k / 3, y = Y(v);
    g += `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="#EAE6DF" stroke-width="1"/>`;
    g += `<text x="${ml - 6}" y="${y + 3.5}" text-anchor="end" font-family="IBM Plex Mono" font-size="10" fill="${COL_MUTED}">${v.toFixed(dec)}</text>`;
  }
  g += `<line x1="${ml}" y1="${Y(min)}" x2="${W - mr}" y2="${Y(min)}" stroke="#C9C5BE" stroke-width="1.2"/>`;
  FECHAS.forEach((f, i) => {
    g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-family="Barlow Condensed" font-size="11.5" letter-spacing=".7" fill="#6E6B66">${f.toUpperCase()}</text>`;
  });
  g += `<text x="4" y="9" font-family="Barlow Condensed" font-size="10" letter-spacing="1" fill="${COL_MUTED}">${u.toUpperCase()}</text>`;
  series.forEach((s) => {
    const pts = s.d.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="${s.c}" stroke-width="${s.w || 2.4}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`;
    if (!s.dash) s.d.forEach((v, i) => {
      g += `<circle cx="${X(i)}" cy="${Y(v)}" r="${i === s.d.length - 1 ? 4 : 2.8}" fill="${i === s.d.length - 1 ? s.c : '#fff'}" stroke="${s.c}" stroke-width="1.8"/>`;
    });
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.height = alto + 'px';
  svg.innerHTML = g;
}
