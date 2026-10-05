import { POSICIONES } from '../../data/posiciones.js';

const COL_MUTED = '#726E65'; // mismo tono que --gris-cl (auditoría de accesibilidad del prototipo)

/**
 * El rojo del club y la tinta viven en tokens.css (--primario, --tinta): un
 * club nuevo cambia el CSS y nada más. El SVG se arma como texto, donde un
 * atributo `fill` no entiende `var()`, así que se lee el valor ya resuelto una
 * vez por render. Sin documento (los tests, que corren en node) cae a
 * `currentColor`, que igual es un color válido.
 */
export function coloresDelClub() {
  if (typeof getComputedStyle !== 'function' || typeof document === 'undefined') {
    return { primario: 'currentColor', tinta: 'currentColor' };
  }
  const estilo = getComputedStyle(document.documentElement);
  return {
    primario: estilo.getPropertyValue('--primario').trim() || 'currentColor',
    tinta: estilo.getPropertyValue('--tinta').trim() || 'currentColor',
  };
}

// El SVG se dibuja con coordenadas, así que un lector de pantalla no ve nada.
// El aria-label repite en texto lo que el dibujo cuenta, con el mismo
// denominador que se ve: ningún porcentaje sin sus intentos.
export function resumenDeCancha(valores) {
  const partes = POSICIONES.map((p) => {
    const v = valores?.[p.id] ?? null;
    return v?.pct == null ? `${p.nombre}: sin medir` : `${p.nombre}: ${v.pct}%, ${v.anotados} de ${v.intentos}`;
  });
  return `Cancha de tiro por posición. ${partes.join('; ')}.`;
}

export function resumenDeGrafico({ etiquetas, series }, { u = '%', dec = 0 } = {}) {
  const partes = series.map((s) => {
    const idx = s.d.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
    if (idx.length === 0) return null;
    const ult = idx[idx.length - 1];
    const unidad = u === '%' ? '%' : ` ${u}`;
    const txt = `${s.nombre ? `${s.nombre}: ` : ''}${s.d[ult].toFixed(dec)}${unidad} el ${etiquetas[ult]}`;
    if (idx.length === 1) return txt;
    const primero = idx[0];
    return `${txt}, desde ${s.d[primero].toFixed(dec)}${unidad} el ${etiquetas[primero]}`;
  }).filter(Boolean);
  return `Gráfico de evolución. ${partes.join('; ')}.`;
}

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
  const L = '#C9C5BE';
  const { primario: P, tinta: T } = coloresDelClub();
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
    g += `<circle cx="${p.x}" cy="${p.y}" r="21" fill="${P}" opacity="${op}"/>`;
    // Muestra chica: contorno punteado. Es una señal que no depende del color
    // ni del hover, así que sobrevive en cualquier pantalla.
    g += `<circle cx="${p.x}" cy="${p.y}" r="21" fill="none" stroke="${P}" stroke-width="1.6"${v?.muestraChica ? ' stroke-dasharray="4 3"' : ''}/>`;
    g += `<text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-family="IBM Plex Mono" font-size="14.5" font-weight="600" fill="${op > 0.55 ? '#fff' : T}">${pct == null ? '—' : pct}</text>`;
    g += `<text x="${p.x}" y="${p.y + 34}" text-anchor="middle" font-family="Barlow Condensed" font-size="10" letter-spacing="1" fill="#6E6B66">${p.corto}</text>`;
    if (v) {
      g += `<text x="${p.x}" y="${p.y + 45}" text-anchor="middle" font-family="IBM Plex Mono" font-size="9.5" fill="${COL_MUTED}">${v.anotados}/${v.intentos}</text>`;
    }
  });

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', resumenDeCancha(valores));
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
 * datos.series: [{ nombre, c: 'primario' | 'tinta' | un color CSS, dash?: boolean, d: (number|null)[],
 *                   chico?: (boolean)[] }]
 *   `chico[i]` marca el punto i como muestra chica: se dibuja hueco y
 *   punteado. Es opcional — quien no lo pase se dibuja como siempre.
 *   Cada `d` tiene el mismo largo que `etiquetas`. Los null son huecos.
 *
 * `min` y `max`, si vienen los dos, fijan la escala del eje Y. El panorama de
 * coordinación los usa en 0–100 para que dos tarjetas lado a lado no se lean
 * como comparables por tener escalas distintas.
 *
 * Devuelve false si no había nada que dibujar, para que la pantalla muestre
 * su estado vacío en vez de un cuadro en blanco.
 */
export function grafico(svg, { etiquetas, series }, { u = '%', alto = 170, dec = 0, min: minFijo = null, max: maxFijo = null } = {}) {
  const n = etiquetas?.length ?? 0;
  const todos = (series ?? []).flatMap((s) => s.d).filter((v) => v != null);
  if (n === 0 || todos.length === 0) {
    svg.innerHTML = '';
    svg.removeAttribute('viewBox');
    svg.removeAttribute('role');
    svg.removeAttribute('aria-label');
    svg.style.height = '0px';
    return false;
  }

  const W = 320, H = alto, ml = 30, mr = 8, mt = 12, mb = 24;
  let min, max;
  if (minFijo != null && maxFijo != null) {
    min = minFijo;
    max = maxFijo;
  } else {
    min = Math.min(...todos);
    max = Math.max(...todos);
    const pad = (max - min) * 0.25 || 1;
    min = min - pad; max = max + pad;
    if (u === '%') min = Math.max(0, min);
  }

  // Con un solo punto no hay eje que repartir: se centra. La versión vieja
  // dividía por (n - 1) y se rompía acá.
  const X = n === 1
    ? () => (ml + (W - mr)) / 2
    : (i) => ml + i * (W - ml - mr) / (n - 1);
  const Y = (v) => mt + (1 - (v - min) / (max - min)) * (H - mt - mb);

  const colores = coloresDelClub();
  let g = '';
  for (let k = 0; k <= 3; k++) {
    const v = min + (max - min) * k / 3, y = Y(v);
    g += `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="#EAE6DF" stroke-width="1"/>`;
    g += `<text x="${ml - 6}" y="${y + 3.5}" text-anchor="end" font-family="IBM Plex Mono" font-size="10" fill="${COL_MUTED}">${v.toFixed(dec)}</text>`;
  }
  g += `<line x1="${ml}" y1="${Y(min)}" x2="${W - mr}" y2="${Y(min)}" stroke="#C9C5BE" stroke-width="1.2"/>`;
  // Una fecha ocupa ~30 de los 320 de ancho: con más de 7 se enciman y no se
  // lee ninguna. Se escriben la primera, la última y las del medio cada
  // `salto`; los puntos se dibujan todos igual. Si la anteúltima escrita cae
  // pegada a la última, se omite.
  const maxEtiquetas = Math.max(2, Math.floor((W - ml - mr) / 40));
  const salto = Math.max(1, Math.ceil((n - 1) / (maxEtiquetas - 1)));
  const escribir = (i) => i === 0 || i === n - 1 || (i % salto === 0 && n - 1 - i >= salto / 2);
  etiquetas.forEach((f, i) => {
    if (!escribir(i)) return;
    g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-family="Barlow Condensed" font-size="11.5" letter-spacing=".7" fill="#6E6B66">${String(f).toUpperCase()}</text>`;
  });
  g += `<text x="4" y="9" font-family="Barlow Condensed" font-size="10" letter-spacing="1" fill="${COL_MUTED}">${u.toUpperCase()}</text>`;

  series.forEach((serie) => {
    const s = { ...serie, c: colores[serie.c] ?? serie.c };
    const puntos = s.d
      .map((v, i) => (v == null ? null : { x: X(i), y: Y(v), ultimo: i === s.d.length - 1, chico: s.chico?.[i] === true }))
      .filter(Boolean);
    if (puntos.length > 1) {
      g += `<polyline points="${puntos.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${s.c}" stroke-width="${s.w || 2.4}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`;
    }
    puntos.forEach((p) => {
      // Un punto de muestra chica se dibuja hueco y con el borde punteado:
      // es forma, no color, así que sobrevive en cualquier pantalla y para
      // cualquiera. Sin esto, un 1/2 se ve igual de sólido que un 25/50.
      const chico = p.chico === true;
      g += `<circle cx="${p.x}" cy="${p.y}" r="${p.ultimo ? 4 : 2.8}" fill="${chico ? '#fff' : (p.ultimo ? s.c : '#fff')}" stroke="${s.c}" stroke-width="1.8"${chico ? ' stroke-dasharray="2 1.6"' : ''}/>`;
    });
  });

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', resumenDeGrafico({ etiquetas, series }, { u, dec }));
  svg.style.height = alto + 'px';
  svg.innerHTML = g;
  return true;
}
