// PreToolUse (Edit|Write): una migración que ya está commiteada se considera
// aplicada y no se edita; los cambios van en una migración nueva. Las nuevas
// (sin commitear) se pueden escribir y editar libremente.
import { execFileSync } from 'node:child_process';

const BARRA_INVERTIDA = String.fromCharCode(92);

let entrada = '';
for await (const trozo of process.stdin) entrada += trozo;

let ruta = '';
try {
  ruta = JSON.parse(entrada)?.tool_input?.file_path ?? '';
} catch {
  process.exit(0);
}

const normal = ruta.split(BARRA_INVERTIDA).join('/');
if (!/\/supabase\/migrations\/[^/]+\.sql$/.test(normal)) process.exit(0);

let commiteada = false;
try {
  // Git for Windows no entiende "/c/..."; se lo pasamos como "C:/...".
  const paraGit = normal.replace(/^\/([a-zA-Z])\//, '$1:/');
  execFileSync('git', ['ls-files', '--error-unmatch', '--', paraGit], {
    cwd: process.env.CLAUDE_PROJECT_DIR || undefined,
    stdio: 'ignore',
  });
  commiteada = true;
} catch {
  // no está trackeada: es una migración nueva
}

if (commiteada) {
  console.error(
    `Bloqueado: ${normal.split('/').pop()} ya está commiteada (se asume aplicada). ` +
    'Creá una migración nueva (/nueva-migracion) en vez de editarla.'
  );
  process.exit(2);
}
