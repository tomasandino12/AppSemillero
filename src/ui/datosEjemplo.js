/**
 * Datos inventados para HOY, MEDIR y RECURSOS. Portados de js/app.js del
 * prototipo. Viven en src/ui/ y no en src/data/ porque son contenido de
 * pantalla, no una preocupación de la capa de datos.
 *
 * Ninguna pantalla que use esto puede renderizarse sin bannerEjemplo()
 * arriba (Etapa 3, Decisión 7).
 */
export const POS = [
  { id: 'esq_izq', n: 'Esquina izq.', c: 'ESQ IZQ', x: 32, y: 236 },
  { id: 'c45_izq', n: '45° izq.', c: '45 IZQ', x: 58, y: 158 },
  { id: 'frontal', n: 'Frontal', c: 'FRONTAL', x: 150, y: 118 },
  { id: 'c45_der', n: '45° der.', c: '45 DER', x: 242, y: 158 },
  { id: 'esq_der', n: 'Esquina der.', c: 'ESQ DER', x: 268, y: 236 },
];

export const TESTS = [
  ...POS.map((p) => ({ id: p.id, n: 'Tiro ' + p.n, tipo: 'tiro', u: '%', d: 'Aciertos sobre intentos' })),
  { id: 'libres', n: 'Tiros libres', tipo: 'tiro', u: '%', d: 'Aciertos sobre intentos' },
  { id: 'vel_con', n: 'Velocidad con pelota', tipo: 'tiempo', u: 's', d: 'Una cancha completa, en segundos' },
  { id: 'vel_sin', n: 'Velocidad sin pelota', tipo: 'tiempo', u: 's', d: 'Una cancha completa, en segundos' },
];

export const FECHAS = ['Mar', 'Abr', 'Jun', 'Ago'];

export const BIBLIO = [
  { t: 'Tiro de la esquina', d: 'Entrada con pies armados' },
  { t: 'Mecánica de libres', d: 'Rutina previa + 2 series' },
  { t: 'Manejo mano débil', d: 'Conos, cambio sin mirar' },
];

const NOMBRES = [
  ['Nicolás', 'Acosta'], ['Lautaro', 'Giménez'], ['Benjamín', 'Ríos'], ['Pablo', 'Sarmiento'],
  ['Tobías', 'Ferreyra'], ['Lautaro', 'Ojeda'], ['Ignacio', 'Villalba'], ['Facundo', 'Aguirre'],
  ['Máximo', 'Benítez'], ['Valentín', 'Sosa'], ['Bautista', 'Peralta'], ['Joaquín', 'Núñez'],
];

function rng(s) { let x = s * 7919 + 13; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }

function armar() {
  return NOMBRES.map(([n, a], i) => {
    const r = rng(307 + i * 13);
    const v = {};
    TESTS.forEach((t) => {
      let base = t.tipo === 'tiro' ? (t.id === 'libres' ? 45 + r() * 25 : 22 + r() * 30) : 4.4 + r() * 1.4;
      const s = [];
      for (let k = 0; k < FECHAS.length; k++) {
        s.push(+base.toFixed(t.tipo === 'tiempo' ? 1 : 0));
        base += t.tipo === 'tiempo' ? -(0.02 + r() * 0.12) : (r() * 5 - 0.6);
      }
      v[t.id] = s;
    });
    return {
      id: i, nom: n, ape: a, dor: 4 + i,
      pos: ['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'][Math.floor(r() * 5)],
      alt: Math.round(166 + r() * 16), peso: Math.round(48 + r() * 18),
      v, ini: (n[0] + a[0]),
    };
  });
}

export const JUGADORES_EJEMPLO = armar();
export const CARGADOS_EJEMPLO = { libres: 12, vel_sin: 12, esq_izq: 12, c45_izq: 12, frontal: 12 };

export function ultimo(j, id) { return j.v[id] ? j.v[id][FECHAS.length - 1] : null; }

export function promedio(id, k) {
  const a = JUGADORES_EJEMPLO.map((j) => (j.v[id] ? j.v[id][k] : null)).filter((x) => x != null);
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}
