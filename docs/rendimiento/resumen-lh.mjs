// uso (desde la raíz): node docs/rendimiento/resumen-lh.mjs <prefijo>  -> mediana de 3 corridas de Lighthouse
import { readFileSync, existsSync } from 'node:fs';
const D = (process.env.SALIDA ?? `${process.cwd()}/.claude/worktrees/_galeria/salida`) + '/lh';
const pref = process.argv[2];
const corridas = [1, 2, 3].map((i) => `${D}/${pref}-${i}.json`).filter(existsSync).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const mediana = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const m = {
  Performance: (r) => Math.round(r.categories.performance.score * 100),
  'LCP (ms)': (r) => Math.round(r.audits['largest-contentful-paint'].numericValue),
  'FCP (ms)': (r) => Math.round(r.audits['first-contentful-paint'].numericValue),
  CLS: (r) => Number(r.audits['cumulative-layout-shift'].numericValue.toFixed(3)),
  'TBT (ms)': (r) => Math.round(r.audits['total-blocking-time'].numericValue),
};
console.log(`${corridas.length} corridas`);
for (const [nombre, fn] of Object.entries(m)) {
  const v = corridas.map(fn);
  console.log(`${nombre}: mediana ${mediana(v)}  (corridas: ${v.join(', ')})`);
}
