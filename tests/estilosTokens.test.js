import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Los cuatro CSS y tokens.css se leen como texto: no hay build ni navegador
 * en los tests, así que esto no valida cómo se ve nada. Valida los contratos
 * que se rompen sin que nadie lo note: una variable que se usa y no existe
 * (el navegador la ignora en silencio) y un texto sobre el color del club que
 * deja de leerse.
 */
const ARCHIVOS = ['tokens', 'base', 'layout', 'componentes', 'publico'];
const css = Object.fromEntries(ARCHIVOS.map((n) => [n, readFileSync(`public/css/${n}.css`, 'utf8')]));
const tokens = css.tokens;

const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '');

/** Luminancia relativa y contraste WCAG entre dos colores #rgb / #rrggbb. */
function luminancia(hex) {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}
const valorDeToken = (nombre) => tokens.match(new RegExp(`${nombre}\\s*:\\s*(#[0-9a-fA-F]{3,6})\\b`))?.[1];

test('todo var(--x) usado está definido en tokens.css', () => {
  const definidos = new Set([...sinComentarios(tokens).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const faltan = [];
  for (const [nombre, texto] of Object.entries(css)) {
    for (const m of sinComentarios(texto).matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!definidos.has(m[1])) faltan.push(`${nombre}.css usa ${m[1]}`);
    }
  }
  assert.deepEqual([...new Set(faltan)], []);
});

test('ningún CSS usa el nombre viejo --rojo: el color es del club, no rojo', () => {
  for (const [nombre, texto] of Object.entries(css)) {
    assert.doesNotMatch(sinComentarios(texto), /--rojo/, `${nombre}.css`);
  }
});

test('el texto por defecto sobre el color del club llega a 4.5:1', () => {
  const club = valorDeToken('--club');
  const sobre = valorDeToken('--sobre-club');
  assert.ok(club && sobre, 'tokens.css tiene que definir --club y --sobre-club con un hex');
  const c = contraste(club, sobre);
  assert.ok(c >= 4.5, `contraste ${c.toFixed(2)}:1 entre ${sobre} y ${club}`);
});

test('los derivados del club tienen un respaldo literal para navegadores sin color-mix', () => {
  // Fuera del @supports: si sólo existieran adentro, sin color-mix quedarían
  // inválidos y un botón apretado se vería transparente.
  const fueraDeSupports = sinComentarios(tokens).replace(/@supports[^{]*\{[\s\S]*?\}\s*\}/, '');
  for (const nombre of ['--primario-osc', '--primario-cl', '--primario-tenue']) {
    assert.match(fueraDeSupports, new RegExp(`${nombre}\\s*:`), nombre);
  }
});

test('no hay colores fuera de tokens.css', () => {
  // Hex y rgb()/rgba() sueltos: cada color vive en un token con nombre, así
  // cambiar una superficie o el color de un club es tocar un solo archivo.
  const sueltos = [];
  for (const [nombre, texto] of Object.entries(css)) {
    if (nombre === 'tokens') continue;
    for (const m of sinComentarios(texto).matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) {
      sueltos.push(`${nombre}.css: ${m[0]}`);
    }
  }
  assert.deepEqual(sueltos, []);
});

// ---- movimiento ----
const PERMITIDAS = new Set(['transform', 'opacity']);

/** Parte por comas de primer nivel: cubic-bezier(a,b,c,d) no se corta. */
function partirPorComas(texto) {
  const partes = [];
  let nivel = 0, actual = '';
  for (const c of texto) {
    if (c === '(') nivel++;
    if (c === ')') nivel--;
    if (c === ',' && nivel === 0) { partes.push(actual); actual = ''; } else actual += c;
  }
  partes.push(actual);
  return partes.map((p) => p.trim()).filter(Boolean);
}

/** Propiedades animadas por cada `transition:` / `transition-property:` de los CSS. */
function propiedadesDeTransiciones() {
  const halladas = [];
  for (const [nombre, texto] of Object.entries(css)) {
    for (const m of sinComentarios(texto).matchAll(/(?<![\w-])transition(-property)?\s*:\s*([^;}]+)/g)) {
      const valor = m[2].replace(/!important/, '').trim();
      if (valor === 'none') continue;
      for (const parte of partirPorComas(valor)) {
        // En el atajo la propiedad es la primera palabra; en transition-property es todo el segmento.
        halladas.push({ archivo: nombre, propiedad: parte.split(/\s+/)[0], declaracion: m[0] });
      }
    }
  }
  return halladas;
}

test('las transiciones sólo animan transform u opacity', () => {
  const cargas = propiedadesDeTransiciones();
  assert.ok(cargas.length > 0, 'no se encontró ninguna transición: ¿cambió el parser?');
  const malas = cargas.filter((t) => !PERMITIDAS.has(t.propiedad)).map((t) => `${t.archivo}.css: ${t.declaracion}`);
  assert.deepEqual(malas, []);
});

test('no hay transition: all', () => {
  for (const [nombre, texto] of Object.entries(css)) {
    assert.doesNotMatch(sinComentarios(texto), /transition[^;}]*\ball\b/, `${nombre}.css`);
  }
});

test('los keyframes sólo tocan transform u opacity', () => {
  const malos = [];
  for (const [nombre, texto] of Object.entries(css)) {
    const limpio = sinComentarios(texto);
    for (const m of limpio.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      // Se recorre el bloque contando llaves hasta cerrar el @keyframes.
      let nivel = 1, i = m.index + m[0].length;
      const inicio = i;
      while (nivel > 0 && i < limpio.length) { if (limpio[i] === '{') nivel++; if (limpio[i] === '}') nivel--; i++; }
      for (const d of limpio.slice(inicio, i - 1).matchAll(/([\w-]+)\s*:/g)) {
        if (!PERMITIDAS.has(d[1])) malos.push(`${nombre}.css @keyframes ${m[1]}: ${d[1]}`);
      }
    }
  }
  assert.deepEqual(malos, []);
});

test('los keyframes sólo definen "from": con reduced-motion el estado final queda visible', () => {
  // Sin `to` ni porcentajes, cuando la animación se apaga (animation:none) el
  // elemento queda con sus estilos normales y no oculto en el primer cuadro.
  const malos = [];
  for (const [nombre, texto] of Object.entries(css)) {
    const limpio = sinComentarios(texto);
    for (const m of limpio.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      let nivel = 1, i = m.index + m[0].length;
      const inicio = i;
      while (nivel > 0 && i < limpio.length) { if (limpio[i] === '{') nivel++; if (limpio[i] === '}') nivel--; i++; }
      const cuerpo = limpio.slice(inicio, i - 1).trim();
      if (!/^from\s*\{[^{}]*\}$/.test(cuerpo)) malos.push(`${nombre}.css @keyframes ${m[1]}`);
    }
  }
  assert.deepEqual(malos, []);
});

test('el texto de la landing llega a 4.5:1 sobre su tarjeta y su fondo', () => {
  // El texto secundario es --gris-osc y el principal --sobre-oscuro. El
  // resplandor del color del club sólo suma rojo oscuro atrás del hero: el peor
  // caso es el fondo liso, que es lo que se mide.
  const pares = [
    ['--gris-osc', '--pub-tarjeta'], ['--gris-osc', '--pub-fondo'],
    ['--sobre-oscuro', '--pub-tarjeta'], ['--sobre-oscuro', '--pub-fondo'],
  ];
  for (const [texto, fondo] of pares) {
    const [t, f] = [valorDeToken(texto), valorDeToken(fondo)];
    assert.ok(t && f, `${texto} y ${fondo} tienen que ser hex en tokens.css`);
    const c = contraste(t, f);
    assert.ok(c >= 4.5, `${texto} sobre ${fondo}: ${c.toFixed(2)}:1`);
  }
});
