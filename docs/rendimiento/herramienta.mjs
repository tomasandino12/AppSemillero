// Herramienta de verificación visual. Necesita el preview `app` corriendo (puerto 5173),
// la galería generada (hacer-galeria.mjs) y puppeteer-core: `npm i --no-save puppeteer-core`.
// Variables opcionales: CHROME (ruta a chrome.exe) y SALIDA (carpeta de bases y capturas).
// Se corre desde la raíz del repo:
//   node docs/rendimiento/herramienta.mjs recorrido            -> frames largos con CPU 4x, 375px (CORRIDAS=n)
//   node docs/rendimiento/herramienta.mjs base                 -> guarda los estilos computados actuales como base
//   node docs/rendimiento/herramienta.mjs comparar             -> compara contra la base
//   node docs/rendimiento/herramienta.mjs capturas <carpeta>   -> PNGs de cada vista a 375 y 1280
//   node docs/rendimiento/herramienta.mjs js <vista> <ancho> "<expr>"  -> evalúa una expresión (REDUCIDO=1 emula prefers-reduced-motion; CAPTURA=ruta.png saca un PNG al final)
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

const ORIGEN = 'http://localhost:5173';
const RAIZ = process.env.SALIDA ?? `${process.cwd()}/.claude/worktrees/_galeria/salida`;
const GAL = `${ORIGEN}/.claude/worktrees/_galeria/galeria.html`;
const VISTAS = {
  landing: `${ORIGEN}/public/`,
  hoy: `${GAL}#hoy`, plantel: `${GAL}#plantel`, datos: `${GAL}#datos`, hoja: `${GAL}#hoja`,
};
const ANCHOS = [375, 1280];

const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME ?? 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--no-sandbox'],
});

async function abrir(vista, ancho, { cpu = 1, reducido = false } = {}) {
  const p = await navegador.newPage();
  await p.setViewport({ width: ancho, height: ancho < 600 ? 812 : 800, deviceScaleFactor: 1, isMobile: ancho < 600, hasTouch: ancho < 600 });
  if (cpu > 1) await (await p.createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: cpu });
  if (reducido) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.goto(VISTAS[vista], { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.fonts.ready);
  await p.addScriptTag({ url: `${ORIGEN}/.claude/worktrees/_galeria/dump.js` });
  // Que termine cualquier animación de entrada antes de leer estilos o sacar la captura.
  await new Promise((r) => setTimeout(r, 900));
  return p;
}

// Sólo la primera familia: la lista de respaldo (ui-monospace, sans-serif...) puede cambiar a propósito.
const IDX_FUENTE = 7;
const norm = (v) => v && v.split('|').map((x, i) => (i === IDX_FUENTE ? x.split(',')[0] : x)).join('|');

const cmd = process.argv[2];
try {
  mkdirSync(RAIZ, { recursive: true });
  if (cmd === 'recorrido') {
    const p = await abrir('hoy', 375, { cpu: 4 });
    const res = [];
    for (let i = 0; i < Number(process.env.CORRIDAS ?? 3); i++) res.push(await p.evaluate(() => window.recorrido()));
    // bloqueo = lo que cada frame largo pasa de 50 ms, sumado: mide cuánto, no sólo cuántos.
    console.log(JSON.stringify(res.map((r) => ({ largos: r.largos, peor: r.peor, bloqueo: r.frames.reduce((a, d) => a + Math.max(0, d - 50), 0), raf25: r.raf25, rafPeor: r.rafPeor }))));
  } else if (cmd === 'base' || cmd === 'comparar') {
    mkdirSync(`${RAIZ}/base`, { recursive: true });
    let total = 0;
    for (const vista of Object.keys(VISTAS)) {
      for (const ancho of ANCHOS) {
        const p = await abrir(vista, ancho);
        const dump = await p.evaluate(() => window.dumpEstilos());
        const nombres = await p.evaluate(() => window.PROPS_ESTILOS);
        const f = `${RAIZ}/base/${vista}-${ancho}.json`;
        if (cmd === 'base') { writeFileSync(f, JSON.stringify(dump)); total += Object.keys(dump).length; continue; }
        const base = JSON.parse(readFileSync(f, 'utf8'));
        const dif = [];
        for (const k of new Set([...Object.keys(base), ...Object.keys(dump)])) {
          const a = norm(base[k]), b = norm(dump[k]);
          if (a === b) continue;
          const [va, vb] = [a?.split('|') ?? [], b?.split('|') ?? []];
          dif.push(`${k}: ` + (nombres.map((n, i) => (va[i] !== vb[i] ? `${n} ${va[i]} -> ${vb[i]}` : null)).filter(Boolean).join(' ; ') || 'elemento distinto'));
        }
        console.log(`${vista}@${ancho}: ${Object.keys(dump).length} elementos, ${dif.length} con diferencias`);
        dif.slice(0, 8).forEach((d) => console.log('  ' + d.slice(0, 260)));
        await p.close();
      }
    }
    if (cmd === 'base') console.log('base guardada,', total, 'entradas');
  } else if (cmd === 'capturas') {
    const dir = `${RAIZ}/cap/${process.argv[3]}`;
    mkdirSync(dir, { recursive: true });
    for (const vista of Object.keys(VISTAS)) for (const ancho of ANCHOS) {
      const p = await abrir(vista, ancho);
      await p.screenshot({ path: `${dir}/${vista}-${ancho}.png` });
      await p.close();
    }
    console.log('capturas en', dir);
  } else if (cmd === 'js') {
    const p = await abrir(process.argv[3], Number(process.argv[4]), { reducido: process.env.REDUCIDO === '1', cpu: Number(process.env.CPU ?? 1) });
    console.log(JSON.stringify(await p.evaluate(process.argv[5]), null, 1));
    if (process.env.CAPTURA) await p.screenshot({ path: process.env.CAPTURA });
  }
} finally {
  await navegador.close();
}
