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
  for (const nombre of ['--primario-osc', '--primario-cl', '--primario-brillo']) {
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
