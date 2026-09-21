// Qué archivos de fuente descarga cada vista. Uso (desde la raíz, con el preview y la galería):
//   node docs/rendimiento/fuentes.mjs "<la URL de Google Fonts de public/index.html>"
import puppeteer from 'puppeteer-core';
const O = 'http://localhost:5173', G = `${O}/.claude/worktrees/_galeria/galeria.html`;
const vistas = { landing: `${O}/public/`, hoy: `${G}#hoy`, plantel: `${G}#plantel`, datos: `${G}#datos`, hoja: `${G}#hoja` };
const b = await puppeteer.launch({ executablePath: process.env.CHROME ?? 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const p0 = await b.newPage();
// mapa url -> familia/peso leyendo el CSS de Google con el mismo UA
const css = await p0.evaluate(async (u) => (await fetch(u)).text(), process.argv[2]);
const mapa = {};
for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
  const fam = m[1].match(/font-family:\s*'([^']+)'/)?.[1], w = m[1].match(/font-weight:\s*([\d ]+);/)?.[1].trim(), url = m[1].match(/url\(([^)]+)\)/)?.[1];
  const rango = m[1].match(/unicode-range:\s*([^;]+)/)?.[1].slice(0, 12);
  mapa[url] = `${fam} ${w} [${rango}]`;
}
console.log('caras declaradas:', Object.keys(mapa).length);
for (const [nombre, url] of Object.entries(vistas)) {
  const p = await b.newPage(); const cargadas = [];
  p.on('response', (r) => { if (r.url().includes('fonts.gstatic')) cargadas.push(mapa[r.url()] ?? r.url().slice(-30)); });
  await p.setViewport({ width: 375, height: 812 }); await p.goto(url, { waitUntil: 'networkidle0' }); await p.evaluate(() => document.fonts.ready);
  console.log(nombre.padEnd(8), cargadas.sort().join(' | '));
  await p.close();
}
await b.close();
