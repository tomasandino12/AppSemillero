// Sirve el repo como lo sirve Vercel: con los rewrites y las cabeceras de
// vercel.json, CSP incluida. El servidor de esbuild (launch.json "app") no
// los aplica, así que /ayuda daba 404 y una CSP rota sólo se veía en
// producción. Uso: `npm run servir` → http://localhost:5174/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
};

/** "/src/(.*)" → RegExp anclada. El proyecto sólo usa el comodín (.*): lo demás es literal. */
export function patron(fuente) {
  const partes = fuente.split('(.*)').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${partes.join('(.*)')}$`);
}

const rutaDe = (url) => new URL(url, 'http://local').pathname;

/** El archivo que Vercel serviría para `url`: el primer rewrite que coincide, o la ruta tal cual. */
export function destino(url, rewrites) {
  const ruta = rutaDe(url);
  return rewrites.find((r) => patron(r.source).test(ruta))?.destination ?? ruta;
}

/** Como Vercel: las cabeceras de todas las reglas que coinciden con la ruta pedida. */
export function cabeceras(url, reglas) {
  const ruta = rutaDe(url);
  return Object.fromEntries(reglas.filter((r) => patron(r.source).test(ruta)).flatMap((r) => r.headers.map((h) => [h.key, h.value])));
}

/** La ruta en disco, o null si se sale de la carpeta (un %2e%2e decodificado). */
export function archivoPedido(raiz, url, rewrites) {
  let ruta;
  try {
    ruta = decodeURIComponent(destino(url, rewrites));
  } catch {
    return null; // un % mal formado no tiene que tirar el servidor
  }
  // Sólo lo que publica Vercel (.vercelignore): nada de .env, .git ni tests/fixtures.
  if (!/^\/(public|src)\//.test(ruta)) return null;
  const archivo = path.join(raiz, ruta);
  return archivo.startsWith(raiz + path.sep) ? archivo : null;
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { rewrites, headers } = JSON.parse(await readFile(path.join(raiz, 'vercel.json'), 'utf8'));
  const puerto = Number(process.env.PORT ?? 5174);
  createServer(async (req, res) => {
    const archivo = archivoPedido(raiz, req.url, rewrites);
    if (!archivo) { res.writeHead(403).end(); return; }
    try {
      const cuerpo = await readFile(archivo);
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream', ...cabeceras(req.url, headers) });
      res.end(cuerpo);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No existe');
    }
  }).listen(puerto, '127.0.0.1', () => console.log(`Portal en http://localhost:${puerto}/`));
}
