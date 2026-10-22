# Portal multipágina con Noticias — plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: **superpowers:subagent-driven-development**. Este plan se ejecuta con subagentes, task por task: un implementador fresco por task y un revisor fresco antes de pasar a la siguiente, y al final un review de toda la rama. Lo pidió el usuario explícitamente el 2026-10-21. **Esto pisa, sólo para este plan, dos reglas de `CLAUDE.md`**: "planes cortos y sin código" y "ejecutar en la sesión, sin subagentes". El resto de `CLAUDE.md` sigue valiendo entero. Los pasos usan checkboxes (`- [ ]`).

**Goal:** Pasar el portal de las familias (`/`) de una página larga a cinco páginas (Inicio, Noticias, Categorías, Calendario, Ayuda) con la identidad del sitio oficial de Newell's. Las dos acciones que más se usan ("Quiero jugar en Newell's" o "Inscribir a mi hijo o hija", y "Enviar comprobante") tienen que verse siempre sin scrollear. Suma Noticias con fotos que publica el coordinador desde Semillero.

**Architecture:** HTML estático por página (encabezado, barra de acciones y pie idénticos en las cinco) y un módulo de arranque por página. `src/ui/portalMarco.js` hace lo común: lee `formularios_publicos` una vez, pinta la barra y marca la página actual. La regla de qué botón mostrar sale de `src/ui/portal.js` y pasa a una función pura (`accionesPrincipales`). Noticias suma la migración 0064 (tabla `noticia` con RLS de coordinador, dos funciones `security definer` para anon y el bucket público `noticias` de Storage), lógica pura en `src/data/noticias.js`, el repo `src/data/repos/noticias.js`, la página pública `src/ui/portalNoticias.js` y la pantalla `coordNoticias.js` en el panel.

**Tech Stack:** JS vanilla con módulos ES, sin build ni framework. Supabase (Postgres + RLS + Storage) con `supabase-js` vendorizado. Deploy estático en Vercel (`vercel.json`). Tests con `node --test` (un archivo por módulo en `tests/`, sin DOM).

**Spec:** [`docs/superpowers/specs/2026-10-21-portal-multipagina-design.md`](../specs/2026-10-21-portal-multipagina-design.md). Cada implementador lee el spec y este plan antes de su task.

## Restricciones globales

- **No se inventa contenido.** Lo que se muestra sale de `src/data/portal.js`, de la base o de Google Calendar. Lo que falta queda oculto. Nunca "Próximamente" (lo verifica un test), nunca cifras, historia, profes ni horarios que el club no pasó. Las dos Primeras siguen con "Horario a confirmar".
- **Todo local.** Rama `feat/portal-multipagina` del repo git local. Sin `git push`, sin remoto y sin `npx supabase db push`. No hay Supabase local: la migración se valida con tests de contrato que leen el SQL.
- **No cambian:** `formularios_publicos`, los destinos de formulario (0061–0063), el panel de Formularios, las URLs `/`, `/app`, `/consultas`, `/privacidad` y `/terminos`, ni `portalEntrada.js` como primer script de `/`.
- **CSP:** las cinco páginas llevan el import map **idéntico, byte por byte,** al de `public/index.html` (mismo hash en `script-src`). Ningún `<script>` inline más. Ningún host nuevo salvo el de Supabase en `img-src` (Task 13).
- **Arquitectura (`tests/arquitectura.test.js`):** la UI pide datos sólo por `src/data/repositorio.js`. `src/data/*.js` es puro (sin DOM, sin `fetch`, sin repos). Un repo nuevo = un archivo en `src/data/repos/` + una línea en la fachada. HTML nuevo siempre con `html\`…\`` de `src/ui/html.js`. Sin clases.
- **Estilos (`DESIGN.md`, `tests/estilosTokens.test.js`):** colores sólo como `var(--x)` de `tokens.css`. `transition` y `@keyframes` sólo con `transform`/`opacity`, y los `@keyframes` sólo definen `from`. Media queries de ancho sólo en `layout.css` (cortes `40rem` y `64rem`); el hover, dentro de `@media (hover:hover)`. Sin animaciones `infinite`, sin cinta que corre, sin cuenta regresiva, sin fuentes nuevas.
- **Textos:** UI y comentarios en español rioplatense con voseo. Los comentarios explican el porqué.
- **El WhatsApp del coordinador aparece una sola vez en todo el sitio:** el bloque final de `htmlAyuda`, en `/ayuda`.
- **Datos de menores:** nada de nombres de chicos en el portal. Una noticia con fotos exige `autorizacion_imagen = true` (la base y la interfaz).
- **Texto que escribe un usuario:** su largo en `src/data/limites.js` (`maxlength` en el campo) y en un `check (char_length(...))` de la migración, comparados por `tests/contratoLimites.test.js`.
- **Commits:** uno por task, en español, con el estilo del repo (`feat(portal): …`, `refactor(portal): …`, `test(portal): …`). Refactor y feature no van en el mismo commit. Si una task cambia un test existente, el cuerpo del commit dice cuál y por qué.
- **Antes de cada commit:** `npm run test:q` en verde. Si algo falla, correr sólo ese archivo con `node --test tests/<archivo>.test.js`. No usar `npm test` (saca ~60 KB).

## Foco de revisión

Lo que el spec implica y ningún test de una task sola cubre del todo. Cada línea tiene su test o su verificación en la task que es dueña del código.

1. **Pantalla chica o letra agrandada (320×568, zoom de texto 130 %):** las dos acciones se ven sin scrollear en las cinco páginas. Verificación manual con capturas en las Tasks 4, 8 y 15.
2. **Links viejos `/#ayuda`, `/#categorias` y `/#calendario`** redirigen a su página, y una vuelta de login (`?code=`, `#access_token=`) nunca se toma por un ancla vieja. Test `paginaDeAncla: ...` en la Task 4.
3. **Noticia con fotos sin la autorización de imagen:** la rechazan la base (check `noticia_fotos_autorizadas`) y la interfaz (`validarNoticia`). Tests en las Tasks 10 y 11.
4. **Texto hostil en una noticia** (`<script>`, una palabra de 300 letras, saltos de línea): sale escapado, en párrafos y sin desbordar. Tests `detalle: escapa…` y `párrafos…` en las Tasks 11 y 13.
5. **Foto HEIC, de 20 MB o que no es imagen, y `?n=` que no es un uuid:** mensaje claro, sin subir nada y sin consultar la base. Tests `validarArchivoFoto…` (Task 11) y `esIdNoticia…` (Tasks 11 y 13).

## Notas de entorno

Leerlas antes de la Task 1: son lo que más tiempo hace perder.

1. **`npm ci` antes que nada.** Los tests importan `src/ui/portal.js`, que llega a `@supabase/supabase-js` por `repositorio.js` → `cliente.js`. Sin `node_modules`, fallan con "Cannot find package".
2. **Los tests no tienen DOM.** Los armadores de HTML (`htmlX(...)`) son funciones exportadas que devuelven un fragmento de `html\`\``: se testean con `.toString()`. El código que toca `document`/`window` (los `iniciarX`) no se testea: se verifica en el navegador. Por eso los arranques viven en archivos aparte (`portalArranque.js` y los nuevos `*Arranque.js`): importar `portal.js` no tiene que ejecutar nada.
3. **El servidor de `.claude/launch.json` ("app", esbuild en 5173) no aplica los rewrites ni las cabeceras de `vercel.json`:** `/ayuda` daría 404. La Task 1 suma `scripts/servir.mjs` (configuración "portal", puerto 5174), que sirve como Vercel, con rewrites, cabeceras y CSP. Todas las verificaciones manuales se hacen ahí.
4. **El portal local lee la base real.** `formularios_publicos` es de sólo lectura y anónima, así que es seguro. `noticias_publicas` todavía no existe en la base real (no hay `db push`): en local, la sección de noticias tiene que quedar oculta. Eso también se verifica.
5. **Fines de línea.** Git avisa LF→CRLF en Windows. Los tests que comparan HTML normalizan con `.replace(/\r\n/g, '\n')`. Copiar el import map desde `public/portal.html`, no tipearlo.
6. **Los tests de texto son estrictos con el HTML.** Varios tests buscan HTML exacto con regex (por ejemplo `<header class="portal-barra">`). Escribir el marcado tal cual aparece en este plan.

## Estructura de archivos

**Creados**

| Archivo | Responsabilidad | Task |
| :--- | :--- | :--- |
| `scripts/servir.mjs` | Servidor local con rewrites y cabeceras de `vercel.json` | 1 |
| `tests/servir.test.js` | `patron`, `destino`, `cabeceras`, `archivoPedido` | 1 |
| `public/css/portal.css` | Estilos nuevos del portal (encabezado, barra, papel, noticias, categorías, contacto, pie) | 3 |
| `src/ui/portalMarco.js` | `iniciarMarco`, `htmlBarraAcciones`, `htmlSedePie`, `esconderBarraMientrasSeVea` | 4 |
| `tests/portalMarco.test.js` | Barra, sede del pie, `paginaDeAncla`, `paginaActual` | 4 |
| `public/ayuda.html` + `src/ui/ayudaArranque.js` | Página Ayuda | 5 |
| `public/categorias.html` + `src/ui/categoriasArranque.js` | Página Categorías | 6 |
| `public/calendario.html` + `src/ui/calendarioArranque.js` | Página Calendario | 7 |
| `tests/paginasPortal.test.js` | Consistencia de las cinco páginas | 9 |
| `supabase/migrations/0064_noticias.sql` | Tabla, RLS, funciones públicas, bucket y policies de Storage | 10 |
| `tests/contratoNoticia.test.js` | Contrato SQL ↔ JS de noticias | 10 |
| `tests/rollback0064.sql`, `tests/verificarNoticias.sql` | Deshacer y verificar 0064 (se corren recién con la base real) | 10 |
| `src/data/noticias.js` | Lógica pura de noticias | 11 |
| `tests/noticias.test.js` | Sus tests | 11 |
| `src/data/repos/noticias.js` | Acceso a la tabla, las funciones y Storage | 12 |
| `src/ui/portalNoticias.js` + `src/ui/noticiasArranque.js` + `public/noticias.html` | Noticias en el portal | 13 |
| `tests/portalNoticias.test.js` | Sus tests | 13 |
| `src/ui/pantallas/coordNoticias.js` | Panel del coordinador | 14 |
| `tests/coordNoticias.test.js` | Sus tests | 14 |

**Modificados**

| Archivo | Cambio | Task |
| :--- | :--- | :--- |
| `package.json`, `.claude/launch.json` | Script y configuración `servir` / "portal" | 1 |
| `src/data/formulariosPortal.js` | `accionesPrincipales` | 2 |
| `src/ui/portal.js` | `htmlHeroe` usa `accionesPrincipales` (2). Sale el `<dialog>`, se suman las inits por página y `htmlContacto`, `htmlCategoriaDetalle`, `htmlIndiceCategorias` (4–8) | 2, 4–8 |
| `tests/formulariosPortal.test.js` | Tests de `accionesPrincipales` | 2 |
| `tests/estilosTokens.test.js` | Suma `portal` a `ARCHIVOS` | 3 |
| `public/css/layout.css` | Cortes de ancho y hover de lo nuevo | 3 |
| `DESIGN.md` | Sección "Portal multipágina" | 3 |
| `src/data/portal.js` | `PAGINAS_PORTAL`, `paginaDeAncla`, `paginaActual`, `categoriasConDetalle`, `slugCategoria`, campo `detalle` | 4, 6 |
| `public/portal.html` | Encabezado nuevo, barra, pie (4). Inicio rediseñado (8) | 4, 8 |
| `tests/portalPagina.test.js` | Tests que cambian a propósito (cada task dice cuáles) | 4–8 |
| `vercel.json` | Rewrites y `no-store` de cada página (5–7, 13), `img-src` (13) | 5–7, 13 |
| `public/sitemap.xml` | Las cuatro páginas nuevas | 9 |
| `src/data/limites.js`, `tests/contratoLimites.test.js`, `supabase/ESQUEMA.md` | Límites y tabla de noticias | 10 |
| `src/data/repositorio.js` | `export * from './repos/noticias.js';` | 12 |
| `tests/csp.test.js` | Test de `img-src` | 13 |
| `public/index.html`, `src/ui/pantallas/registro.js`, `src/ui/pantallas/coordFamilias.js`, `public/css/componentes.css` | Pantalla de noticias en el panel | 14 |
| `docs/COORDINACION.md`, `docs/legal/cambios-portal.md`, `docs/SEO.md` | Documentación | 15 |

---

### Task 0: Línea de base

**Files:** ninguno.

- [ ] **Step 1: Instalar dependencias**

Run: `npm ci`
Expected: termina sin errores y crea `node_modules/`.

- [ ] **Step 2: Correr la suite**

Run: `npm run test:q`
Expected: verde. Los tests que necesitan `.xlsx` reales de `tests/fixtures/` se saltean, y eso es normal. Si algo falla **antes de tocar nada**, anotar qué falla y avisar al controlador: no se arregla en esta rama.

- [ ] **Step 3: Confirmar la rama**

Run: `git status --short && git branch --show-current`
Expected: árbol limpio, rama `feat/portal-multipagina`. Sin commit en esta task.

---

### Task 1: Servidor local como Vercel

Hace falta para mirar `/ayuda`, `/categorias`, etc. en local con la CSP real (Nota de entorno 3). Es una herramienta de desarrollo: no se publica (`.vercelignore` ya deja afuera `scripts/`; verificarlo en el Step 7).

**Files:**
- Create: `scripts/servir.mjs`
- Create: `tests/servir.test.js`
- Modify: `package.json` (script `servir`)
- Modify: `.claude/launch.json` (configuración "portal")

**Interfaces:**
- Consume: `vercel.json` (`rewrites`, `headers`).
- Produce: `patron(fuente: string): RegExp`, `destino(url: string, rewrites: {source,destination}[]): string`, `cabeceras(url: string, reglas: {source,headers}[]): Record<string,string>`, `archivoPedido(raiz: string, url: string, rewrites): string|null`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/servir.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { patron, destino, cabeceras, archivoPedido } from '../scripts/servir.mjs';

/**
 * scripts/servir.mjs sirve el repo como Vercel: con los rewrites y las
 * cabeceras de vercel.json, CSP incluida. Sin esto, en local /ayuda da 404
 * y una CSP rota recién se ve en producción.
 */
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));

test('patron: el comodín (.*) de vercel.json, anclado', () => {
  assert.ok(patron('/src/(.*)').test('/src/ui/portal.js'));
  assert.ok(!patron('/src/(.*)').test('/srcx/ui.js'));
  assert.ok(patron('/').test('/'));
  assert.ok(!patron('/').test('/app'));
  assert.ok(patron('/public/index.html').test('/public/index.html'));
  assert.ok(!patron('/public/index.html').test('/public/indexXhtml'), 'el punto es literal');
});

test('destino: los rewrites de vercel.json; lo demás, tal cual', () => {
  assert.equal(destino('/', vercel.rewrites), '/public/portal.html');
  assert.equal(destino('/app', vercel.rewrites), '/public/index.html');
  assert.equal(destino('/consultas?x=1', vercel.rewrites), '/public/consultas.html');
  assert.equal(destino('/public/css/base.css', vercel.rewrites), '/public/css/base.css');
});

test('cabeceras: se suman todas las reglas que coinciden, CSP incluida', () => {
  const h = cabeceras('/', vercel.headers);
  assert.equal(h['Cache-Control'], 'no-store');
  assert.match(h['Content-Security-Policy'], /default-src 'self'/);
  assert.equal(cabeceras('/src/ui/portal.js', vercel.headers)['Cache-Control'], 'no-cache');
});

test('archivoPedido: nunca sale de la carpeta del repo', () => {
  const raiz = path.resolve('.');
  assert.equal(archivoPedido(raiz, '/', vercel.rewrites), path.join(raiz, 'public', 'portal.html'));
  assert.equal(archivoPedido(raiz, '/%2e%2e/%2e%2e/secreto.txt', vercel.rewrites), null);
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `node --test tests/servir.test.js`
Expected: FAIL con `Cannot find module '…/scripts/servir.mjs'`.

- [ ] **Step 3: Implementar `scripts/servir.mjs`**

```js
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
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
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
  const archivo = path.join(raiz, decodeURIComponent(destino(url, rewrites)));
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
  }).listen(puerto, () => console.log(`Portal en http://localhost:${puerto}/`));
}
```

Nota: `destino` trabaja sobre el pathname sin decodificar, como Vercel. `archivoPedido` decodifica recién al armar la ruta en disco, y ahí está la guarda.

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `node --test tests/servir.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Script y configuración de launch**

En `package.json`, dentro de `"scripts"`, sumar después de `"cartel-qr"`:

```json
    "servir": "node scripts/servir.mjs"
```

(Ojo con la coma de la línea anterior.) En `.claude/launch.json`, sumar una segunda configuración al array `configurations`:

```json
    {
      "name": "portal",
      "runtimeExecutable": "node",
      "runtimeArgs": ["scripts/servir.mjs"],
      "port": 5174
    }
```

- [ ] **Step 6: Probarlo a mano**

Run: `npm run servir` (en segundo plano) y abrir `http://localhost:5174/`.
Expected: el portal actual se ve igual que en producción. En DevTools → Network, la respuesta de `/` trae `Content-Security-Policy` y `Cache-Control: no-store`, y la consola no muestra violaciones de CSP.

- [ ] **Step 7: Confirmar que no se publica**

Run: `grep -n "scripts" .vercelignore`
Expected: `scripts` aparece (ya está ignorado). Si no aparece, sumar la línea `scripts/`.

- [ ] **Step 8: Commit**

```bash
git add scripts/servir.mjs tests/servir.test.js package.json .claude/launch.json
git commit -m "feat(dev): servidor local con los rewrites y la CSP de vercel.json"
```

---

### Task 2 (refactor): `accionesPrincipales`

Saca de `htmlHeroe` la regla de qué botón mostrar, para que la use también la barra de acciones (Task 4). Sin cambios de comportamiento: `tests/portalPagina.test.js` tiene que pasar **sin tocarlo**.

**Files:**
- Modify: `src/data/formulariosPortal.js` (sumar `accionesPrincipales`)
- Modify: `src/ui/portal.js` (`htmlHeroe`)
- Modify: `tests/formulariosPortal.test.js`

**Interfaces:**
- Consume: `enlaceFormulario(valor: string): string|null` de `src/data/portal.js` (ya importado en `formulariosPortal.js`).
- Produce: `accionesPrincipales({ inscripcion?, consultas?, comprobante? }): { primera: { tipo: 'inscribir'|'jugar', url: string|null }, comprobante: { url: string|null } }`. Cada argumento es un formulario `{ titulo, texto, enlace, destino }` o `null`.

- [ ] **Step 1: Escribir los tests que fallan**

Al final de `tests/formulariosPortal.test.js` (sumar `accionesPrincipales` al import de `../src/data/formulariosPortal.js`):

```js
// ---- Los dos botones principales (hero y barra de acciones) ----

const F = (enlace) => ({ titulo: 'x', texto: 'y', enlace, destino: null });

test('accionesPrincipales: inscripción activa → inscribir, aunque haya consultas', () => {
  assert.deepEqual(
    accionesPrincipales({ inscripcion: F('https://forms.gle/Ins1'), consultas: F('https://forms.gle/Jug1'), comprobante: F('https://forms.gle/Com1') }),
    { primera: { tipo: 'inscribir', url: 'https://forms.gle/Ins1' }, comprobante: { url: 'https://forms.gle/Com1' } },
  );
});

test('accionesPrincipales: inscripción cerrada → "Quiero jugar" al formulario de consultas', () => {
  assert.deepEqual(accionesPrincipales({ consultas: F('https://forms.gle/Jug1') }),
    { primera: { tipo: 'jugar', url: 'https://forms.gle/Jug1' }, comprobante: { url: null } });
});

test('accionesPrincipales: sin formularios, las dos sin url', () => {
  assert.deepEqual(accionesPrincipales({}), { primera: { tipo: 'jugar', url: null }, comprobante: { url: null } });
  assert.deepEqual(accionesPrincipales(), { primera: { tipo: 'jugar', url: null }, comprobante: { url: null } });
});

test('accionesPrincipales: un enlace que no es de Google Forms cuenta como cerrado', () => {
  const r = accionesPrincipales({ inscripcion: F('https://evil.com/forms/x'), consultas: F('https://forms.gle/Jug1'), comprobante: F('javascript:alert(1)') });
  assert.deepEqual(r, { primera: { tipo: 'jugar', url: 'https://forms.gle/Jug1' }, comprobante: { url: null } });
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `node --test tests/formulariosPortal.test.js`
Expected: FAIL con `accionesPrincipales is not a function` (o un SyntaxError del import).

- [ ] **Step 3: Implementar en `src/data/formulariosPortal.js`**

Debajo de `separarFormularios`:

```js
/**
 * Qué muestran los dos botones principales del portal: las tarjetas del hero
 * del inicio y la barra de acciones de cada página. Con la inscripción
 * activa (destino inscripcion, 0062), el primero es "Inscribir"; si no,
 * "Quiero jugar" (destino consultas, 0061). El comprobante va aparte: alguien
 * se puede inscribir sin pagar nada. Un enlace que no es de Google Forms
 * cuenta como cerrado: nunca un botón a cualquier lado.
 */
export function accionesPrincipales({ inscripcion = null, consultas = null, comprobante = null } = {}) {
  const url = (f) => (f ? enlaceFormulario(f.enlace) : null);
  const ins = url(inscripcion);
  return {
    primera: ins ? { tipo: 'inscribir', url: ins } : { tipo: 'jugar', url: url(consultas) },
    comprobante: { url: url(comprobante) },
  };
}
```

- [ ] **Step 4: Usarla en `htmlHeroe` (`src/ui/portal.js`)**

Sumar `accionesPrincipales` al import de `'../data/formulariosPortal.js'`. Reemplazar el cuerpo de `htmlHeroe` hasta el `return` por:

```js
export function htmlHeroe({ inscripcion = null, consultas = null, comprobante = null, temporada = null, alias = null } = {}) {
  const { primera: p, comprobante: c } = accionesPrincipales({ inscripcion, consultas, comprobante });
  const primera = p.tipo === 'inscribir'
    ? accion({ clase: 'principal', icono: 'inscribir', titulo: 'Inscribir a mi hijo o hija', url: p.url, detalle: `Inscripción${temporada ? ` ${temporada}` : ''} abierta: formulario de Google` })
    : accion({ clase: 'principal', icono: 'jugar', titulo: 'Quiero jugar en Newell\'s', url: p.url,
      detalle: 'Dejá tus datos y te contactamos para venir a probar', cerrado: 'Se habilita cuando abra el formulario' });
```

y en el `return`, la tarjeta de pago usa `url: c.url` en lugar de `url: url(comprobante)`. La constante local `url` de `htmlHeroe` desaparece.

- [ ] **Step 5: Correr la suite**

Run: `npm run test:q`
Expected: PASS. `tests/portalPagina.test.js` sin tocar.

- [ ] **Step 6: Commit**

```bash
git add src/data/formulariosPortal.js src/ui/portal.js tests/formulariosPortal.test.js
git commit -m "refactor(portal): la regla de los dos botones principales pasa a accionesPrincipales"
```

---
### Task 3: Estilos del portal y DESIGN.md

Todo el CSS nuevo, de una vez, para que las tasks de páginas sólo escriban HTML y JS. Las reglas `.portal-*` que ya existen **se quedan en `publico.css`**: no se mueven ni se reescriben. Lo nuevo va en `public/css/portal.css`, que sólo enlazan las páginas del portal (y `index.html` en la Task 14, por la vista previa del panel). Los cortes de ancho van en `layout.css`, como pide `DESIGN.md`.

**Files:**
- Create: `public/css/portal.css`
- Modify: `public/css/layout.css` (bloque nuevo al final)
- Modify: `tests/estilosTokens.test.js` (`ARCHIVOS`)
- Modify: `DESIGN.md` (sección nueva al final)
- Modify: `public/portal.html` (enlazar `portal.css`)

**Interfaces:**
- Produce las clases que usan las Tasks 4–14: `.portal-logo`, `.portal-nav`, `.portal-acc-barra` (con los estados `.flotante` y `.escondida`), `.portal-acc-btn` (`.principal`, `.pago`, `.apagada`), `.con-barra`, `.portal-papel`, `.portal-papel-cab`, `.portal-ver`, `.portal-nots`, `.portal-not` (`-cuerpo`, `-et`, `-pie`, `-nada`), `.portal-mas`, `.portal-art` (`-volver`, `-bajada`, `-fotos`, `-cuerpo`), `.portal-cat-indice`, `.portal-cat-sec`, `.portal-cat-datos`, `.portal-cat-confirmar`, `.portal-cat-detalle`, `.portal-cat-ir`, `.portal-contacto`, `.portal-contacto-sede`, `.portal-dudas`, `.portal-pie` (`-marca`, `-nav`, `-sede`).

- [ ] **Step 1: Sumar `portal` a los CSS que verifica el test**

En `tests/estilosTokens.test.js`, cambiar la línea de `ARCHIVOS` por:

```js
const ARCHIVOS = ['tokens', 'base', 'layout', 'componentes', 'publico', 'legal', 'portal'];
```

y actualizar el comentario de arriba ("Los cuatro CSS…") para que diga "Los CSS".

- [ ] **Step 2: Correrlo y ver que falla**

Run: `node --test tests/estilosTokens.test.js`
Expected: FAIL con `ENOENT … public/css/portal.css`.

- [ ] **Step 3: Crear `public/css/portal.css`**

```css
/* =====================================================================
   PORTAL MULTIPÁGINA — lo nuevo del portal de las familias (spec
   2026-10-21-portal-multipagina). Las reglas .portal-* de antes siguen en
   publico.css. Ritmo tomado del sitio del club: negro, papel y rojo.
   Sin media queries de ancho: los cortes viven en layout.css. Sólo se
   animan transform y opacity.
   ===================================================================== */

/* ---- encabezado: la marca lleva al inicio; la navegación es una fila que
   se desliza en el celular y se pone al lado de la marca en compu ---- */
.portal-barra{flex-wrap:wrap}
.portal-logo{display:flex;align-items:center;gap:var(--sp-2);min-width:0;color:inherit;text-decoration:none}
.portal-nav{order:3;flex:1 0 100%;display:flex;gap:var(--sp-1);overflow-x:auto;scrollbar-width:none;margin:var(--sp-2) calc(var(--sp-4) * -1) 0;padding:0 var(--sp-3)}
.portal-nav::-webkit-scrollbar{display:none}
.portal-nav a{
  flex:0 0 auto;display:inline-flex;align-items:center;min-height:var(--tap);padding:0 var(--sp-2);
  font-family:var(--ff-titulo);font-weight:700;font-size:var(--fs-145);letter-spacing:.08em;text-transform:uppercase;
  color:var(--gris-osc);text-decoration:none;border-bottom:2px solid transparent
}
.portal-nav a[aria-current="page"]{color:var(--sobre-oscuro);border-bottom-color:var(--primario)}

/* ---- barra de acciones: en el celular, fija abajo y visible desde el
   primer pantallazo; en compu, pegada arriba (layout.css). La pinta
   portalMarco.js; [hidden] mientras no responde la base o si no hay
   ningún formulario abierto ---- */
@keyframes portal-sube{from{transform:translateY(100%)}}
@keyframes portal-baja{from{transform:translateY(-100%)}}
.portal-acc-barra{
  position:fixed;left:0;right:0;bottom:0;z-index:4;
  display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-2);
  padding:var(--sp-2) var(--sp-3) calc(var(--sp-2) + env(safe-area-inset-bottom));
  background:var(--pub-fondo);border-top:1px solid var(--pub-borde);
  animation:portal-sube var(--dur-3) var(--ease-salida)
}
.portal-acc-barra[hidden],.portal-acc-barra.escondida{display:none}
.portal-acc-btn{
  display:flex;flex-direction:column;justify-content:center;align-items:center;gap:.125rem;
  min-height:var(--tap);padding:var(--sp-1) var(--sp-2);border-radius:var(--r-btn);
  font-family:var(--ff-titulo);font-weight:700;font-size:var(--fs-145);line-height:1.05;letter-spacing:.06em;
  text-transform:uppercase;text-align:center;text-decoration:none;transition:transform var(--dur-1) var(--ease-salida)
}
.portal-acc-btn:active{transform:scale(.97)}
.portal-acc-btn.principal{background:var(--primario);color:var(--sobre-club)}
.portal-acc-btn.pago{background:var(--sobre-oscuro);color:var(--pub-fondo)}
.portal-acc-btn.apagada{border:1px dashed var(--pub-borde);color:var(--gris-osc)}
.portal-acc-btn small{font-family:var(--ff-cuerpo);font-weight:500;font-size:var(--fs-100);letter-spacing:.04em;text-transform:none}
/* Lo último de la página no queda tapado por la barra fija del celular. */
.con-barra{padding-bottom:calc(var(--tap) + var(--sp-6) + env(safe-area-inset-bottom))}

/* ---- secciones sobre papel, como "Lo último" del sitio del club ---- */
.portal-papel{background:var(--papel);color:var(--tinta);padding:var(--sp-8) var(--sp-4);margin-top:var(--sp-8)}
.portal-papel .portal-st{color:var(--primario-osc)}
.portal-papel h1,.portal-papel h2{color:var(--tinta)}
.portal-papel-cab{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--sp-3);margin-bottom:var(--sp-5)}
.portal-papel-cab h1,.portal-papel-cab h2{font-size:clamp(2rem,1.6rem + 2vw,3rem);line-height:.92}
.portal-ver{
  display:inline-flex;align-items:center;min-height:var(--tap);font-family:var(--ff-titulo);font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;font-size:var(--fs-135);color:var(--sobre-oscuro);text-decoration:none;white-space:nowrap
}
.portal-papel .portal-ver{color:var(--primario-osc)}

/* ---- tarjetas de noticia: foto, etiqueta roja, título condensado,
   fecha en mono y "LEER →" (como las del sitio del club) ---- */
.portal-nots{display:grid;gap:var(--sp-4)}
.portal-not a{display:flex;flex-direction:column;height:100%;background:var(--blanco);color:var(--tinta);text-decoration:none;border-radius:var(--r-s);overflow:hidden;box-shadow:var(--sombra)}
.portal-not img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:var(--fondo-chip)}
.portal-not-cuerpo{display:flex;flex-direction:column;gap:var(--sp-2);flex:1;padding:var(--sp-4)}
.portal-not-et{
  align-self:flex-start;background:var(--primario);color:var(--sobre-club);font-family:var(--ff-titulo);font-weight:700;
  font-size:var(--fs-100);letter-spacing:.1em;text-transform:uppercase;padding:.125rem var(--sp-2);border-radius:var(--r-btn)
}
.portal-not h3{font-size:var(--fs-220);line-height:1;color:var(--tinta)}
.portal-not p{margin:0;font-size:var(--fs-135);color:var(--gris);line-height:1.45}
.portal-not-pie{
  margin-top:auto;display:flex;justify-content:space-between;align-items:center;padding-top:var(--sp-3);
  border-top:1px solid var(--linea);font-size:var(--fs-115);letter-spacing:.08em;text-transform:uppercase
}
.portal-not-pie time{font-family:var(--ff-mono);color:var(--gris)}
.portal-not-pie span{font-family:var(--ff-titulo);font-weight:700;color:var(--primario-osc)}
.portal-not-nada{font-size:var(--fs-145);color:var(--gris);margin:0}
.portal-mas{margin-top:var(--sp-6);text-align:center}

/* ---- una noticia entera ---- */
.portal-art{max-width:44rem;margin-inline:auto}
.portal-art-volver{
  display:inline-flex;align-items:center;min-height:var(--tap);margin-bottom:var(--sp-3);font-family:var(--ff-titulo);font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;font-size:var(--fs-135);color:var(--primario-osc);text-decoration:none
}
.portal-art h1{font-size:clamp(2rem,1.6rem + 2.4vw,3.25rem);line-height:.95;margin:var(--sp-3) 0 var(--sp-2)}
.portal-art time{display:block;font-family:var(--ff-mono);font-size:var(--fs-125);color:var(--gris);text-transform:uppercase;letter-spacing:.06em}
.portal-art-bajada{font-size:var(--fs-170);line-height:1.45;color:var(--tinta);margin:var(--sp-4) 0}
.portal-art-fotos{display:grid;gap:var(--sp-3);margin:var(--sp-4) 0}
.portal-art-fotos figure{margin:0}
.portal-art-fotos img{display:block;width:100%;height:auto;border-radius:var(--r-s);background:var(--fondo-chip)}
/* pre-line: un salto de línea dentro de un párrafo se respeta, sin HTML. */
.portal-art-cuerpo p{font-size:var(--fs-160);line-height:1.6;margin:0 0 var(--sp-4);white-space:pre-line}

/* ---- página Categorías ---- */
.portal-cat-indice{display:flex;flex-wrap:wrap;gap:var(--sp-2);margin-top:var(--sp-4)}
.portal-cat-indice a{
  display:inline-flex;align-items:center;min-height:var(--tap);padding:0 var(--sp-3);border:1px solid var(--pub-borde);border-radius:var(--r-btn);
  font-family:var(--ff-titulo);font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:var(--fs-135);color:var(--sobre-oscuro);text-decoration:none
}
.portal-cat-sec{padding:var(--sp-6) 0;border-top:1px solid var(--linea);scroll-margin-top:calc(var(--tap) + var(--sp-8))}
.portal-cat-sec:first-child{border-top:0;padding-top:0}
.portal-cat-sec h2{font-size:clamp(2rem,1.6rem + 2vw,3rem);line-height:.92;margin:var(--sp-1) 0 var(--sp-4)}
.portal-cat-datos{display:grid;gap:var(--sp-4);margin:0}
.portal-cat-datos div{display:grid;gap:var(--sp-1);align-content:start}
.portal-cat-datos dt{font-family:var(--ff-titulo);font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:var(--fs-115);color:var(--gris)}
.portal-cat-datos dd{margin:0;font-size:var(--fs-145);color:var(--tinta);line-height:1.45}
.portal-cat-datos li + li{margin-top:var(--sp-1)}
.portal-cat-datos a{color:var(--primario-osc)}
.portal-cat-confirmar{font-style:italic;color:var(--gris)}
.portal-cat-detalle{margin:var(--sp-4) 0 0;font-size:var(--fs-145);line-height:1.55;color:var(--tinta)}
.portal-cat-ir{display:inline-flex;align-items:center;min-height:var(--tap);color:var(--sobre-oscuro);font-size:var(--fs-135)}

/* ---- Ayuda: sede y alias ---- */
.portal-contacto{display:grid;gap:var(--sp-3)}
.portal-contacto-sede{padding:var(--sp-4);background:var(--pub-tarjeta);border:1px solid var(--pub-borde);border-radius:var(--r)}
.portal-contacto-sede b{display:block;font-family:var(--ff-titulo);font-weight:700;text-transform:uppercase;letter-spacing:.03em;font-size:var(--fs-200);margin-top:var(--sp-1)}
.portal-contacto-sede p{margin:var(--sp-1) 0 var(--sp-3);color:var(--gris-osc);font-size:var(--fs-135);line-height:1.5}
.portal-contacto-sede .btn{text-decoration:none}
.portal-contacto .portal-alias{margin:0}

/* ---- inicio: franja "¿Dudas?" ---- */
.portal-dudas{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--sp-3);padding:var(--sp-5);background:var(--pub-tarjeta);border:1px solid var(--pub-borde);border-radius:var(--r)}
.portal-dudas b{display:block;font-family:var(--ff-titulo);font-weight:700;text-transform:uppercase;font-size:var(--fs-230);line-height:1}
.portal-dudas span{display:block;color:var(--gris-osc);font-size:var(--fs-135);margin-top:var(--sp-1)}
.portal-dudas .btn{text-decoration:none}

/* ---- pie ---- */
.portal-pie{display:grid;gap:var(--sp-5);width:100%;max-width:64rem;margin:var(--sp-8) auto 0;padding:var(--sp-8) var(--sp-4) var(--sp-6);border-top:3px solid var(--primario)}
.portal-pie-marca{display:flex;align-items:center;gap:var(--sp-3)}
.portal-pie-marca img{width:2.5rem;height:2.5rem;flex:0 0 auto}
.portal-pie-marca b{display:block;font-family:var(--ff-titulo);font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-size:var(--fs-200);line-height:1}
.portal-pie-marca span{color:var(--gris-osc);font-size:var(--fs-115);letter-spacing:.12em;text-transform:uppercase}
.portal-pie-nav{display:flex;flex-wrap:wrap;gap:0 var(--sp-4)}
.portal-pie-nav a{display:inline-flex;align-items:center;min-height:var(--tap);color:var(--sobre-oscuro);text-decoration:none;font-family:var(--ff-titulo);font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:var(--fs-145)}
.portal-pie-sede{color:var(--gris-osc);font-size:var(--fs-135);line-height:1.5}
.portal-pie-sede b{color:var(--sobre-oscuro);font-weight:600}
.portal-pie-sede a{color:var(--sobre-oscuro)}
.portal-pie .pie-legal{margin:0}
```

- [ ] **Step 4: Cortes de ancho y hover en `public/css/layout.css`**

Al final del archivo:

```css
/* ---- portal multipágina (portal.css) ---- */
@media (min-width:40rem){
  .publico .portal-nav{order:0;flex:0 1 auto;margin:0 0 0 auto;padding:0;overflow:visible}
  .publico .portal-barra-acc{order:1;margin-left:var(--sp-3)}
  /* En compu la barra va pegada arriba, en el flujo; en el inicio flota
     (fija) recién cuando las tarjetas del hero salen de pantalla. */
  .publico .portal-acc-barra{
    position:sticky;top:0;bottom:auto;grid-template-columns:repeat(2,minmax(0,15rem));justify-content:end;
    padding:var(--sp-2) var(--sp-6);border-top:0;border-bottom:1px solid var(--pub-borde);animation:none
  }
  .publico .portal-acc-barra.flotante{position:fixed;top:0;left:0;right:0;animation:portal-baja var(--dur-3) var(--ease-salida)}
  .publico.con-barra{padding-bottom:0}
  .publico .portal-papel{padding:var(--sp-8) var(--sp-6)}
  .publico .portal-nots{grid-template-columns:repeat(2,minmax(0,1fr))}
  .publico .portal-art-fotos{grid-template-columns:repeat(2,minmax(0,1fr))}
  .publico .portal-cat-datos{grid-template-columns:repeat(3,minmax(0,1fr))}
  .publico .portal-contacto{grid-template-columns:repeat(2,minmax(0,1fr))}
  .publico .portal-pie{grid-template-columns:1fr auto;align-items:start;padding-inline:var(--sp-6)}
}
@media (min-width:64rem){
  .publico .portal-nots{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (hover:hover){
  .publico .portal-nav a:hover{color:var(--sobre-oscuro)}
  .publico .portal-not a:hover h3{color:var(--primario-osc)}
}
```

- [ ] **Step 5: Enlazar `portal.css` en el inicio**

En `public/portal.html`, debajo de `<link rel="stylesheet" href="/public/css/publico.css">`:

```html
<link rel="stylesheet" href="/public/css/portal.css">
```

- [ ] **Step 6: Correr los tests**

Run: `node --test tests/estilosTokens.test.js && npm run test:q`
Expected: PASS. Si "todo var(--x) usado está definido" falla, se escribió mal un token: corregir el nombre, **no** inventar uno nuevo.

- [ ] **Step 7: Documentar en `DESIGN.md`**

Al final, sumar:

```markdown
## Portal multipágina (spec 2026-10-21)

- **Ritmo de lo público:** el portal de las familias deja de ser sólo oscuro y alterna, como el sitio del club, **negro** (hero, encabezado, pie), **papel** (`.portal-papel`: noticias y el detalle de categorías) y **rojo** (`.portal-banda`). La landing y la autenticación de `/app` siguen oscuras.
- **Archivos:** lo nuevo vive en `public/css/portal.css`. Las reglas `.portal-*` anteriores siguen en `publico.css`. Los cortes de ancho están en `layout.css`.
- **Barra de acciones (`.portal-acc-barra`):** las dos acciones principales. En el celular va fija abajo y entra subiendo (`portal-sube`, sólo `transform`). En compu va pegada arriba. En el inicio se esconde mientras se ven las tarjetas del hero (`.escondida`) y después flota (`.flotante`). Sin formularios abiertos, no aparece.
- **Tarjeta de noticia (`.portal-not`):** foto 16:10, etiqueta roja, título condensado, fecha en mono y "LEER →". La etiqueta es `--sobre-club` sobre `--primario` (4.5:1, lo mide `estilosTokens`).
- **Lo que no se copió del sitio del club, a propósito:** la cinta que corre ("HACETE SOCIO" en loop), la cuenta regresiva por segundo y los contadores animados. Son animaciones continuas, que este documento prohíbe (ver Reglas duras).
```

- [ ] **Step 8: Mirarlo**

Run: `npm run servir` y abrir `http://localhost:5174/`.
Expected: el portal se ve igual que antes (las clases nuevas todavía no se usan) y la consola no muestra errores de CSS.

- [ ] **Step 9: Commit**

```bash
git add public/css/portal.css public/css/layout.css tests/estilosTokens.test.js DESIGN.md public/portal.html
git commit -m "feat(portal): estilos del portal multipágina (negro, papel y rojo)"
```

---

### Task 4: Marco común (encabezado, barra de acciones, pie)

**Files:**
- Modify: `src/data/portal.js` (sumar `PAGINAS_PORTAL`, `paginaDeAncla`, `paginaActual`)
- Create: `src/ui/portalMarco.js`
- Create: `tests/portalMarco.test.js`
- Modify: `src/ui/portal.js` (usar `iniciarMarco`; sacar `iniciarCopiar`)
- Modify: `public/portal.html` (encabezado, barra, pie)
- Modify: `tests/portalPagina.test.js`. Cambian **a propósito** tres tests: "el encabezado tiene Ayuda…" (el botón Ayuda pasa a la navegación), "el portal no consulta nada si la URL es la vuelta de un login…" (la lectura de formularios se muda al marco) y "el portal aparta los formularios con lugar propio…" (cambia de dónde salen los formularios).

**Interfaces:**
- Consume: `accionesPrincipales` (Task 2), `separarFormularios`, `resolverFormularios`, `formulariosPublicos`, `sedeValida`, `destinoDeAuth`.
- Produce:
  - `PAGINAS_PORTAL: readonly { href: string, texto: string }[]`: `/` Inicio, `/noticias` Noticias, `/categorias` Categorías, `/calendario` Calendario, `/ayuda` Ayuda, en ese orden.
  - `paginaDeAncla(hash: string): '/ayuda'|'/categorias'|'/calendario'|null`.
  - `paginaActual(pathname: string): string|null`, el `href` de `PAGINAS_PORTAL` que corresponde.
  - `htmlBarraAcciones(acciones): Html` (`acciones` = salida de `accionesPrincipales`).
  - `htmlSedePie(sede): Html`.
  - `iniciarMarco(): Promise<null | { estado, inscripcion, comprobante, consultas, colaboradores, recaudacion, comunes }>`. Devuelve `null` si la URL es la vuelta de un login.
  - `esconderBarraMientrasSeVea(elemento: Element|null): void`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/portalMarco.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlBarraAcciones, htmlSedePie } from '../src/ui/portalMarco.js';
import { PAGINAS_PORTAL, paginaDeAncla, paginaActual } from '../src/data/portal.js';

/**
 * Lo común a las cinco páginas del portal: la barra con las dos acciones que
 * más usan las familias, el pie y la navegación. Las acciones se tienen que
 * ver sin scrollear: en el celular la barra va fija abajo (portal.css).
 */

const marco = readFileSync('src/ui/portalMarco.js', 'utf8');
const A = (tipo, url, comprobante = null) => ({ primera: { tipo, url }, comprobante: { url: comprobante } });

test('barra: inscripción abierta → "Inscribir a mi hijo o hija" y "Enviar comprobante", a sus formularios', () => {
  const out = htmlBarraAcciones(A('inscribir', 'https://forms.gle/Ins1', 'https://forms.gle/Com1')).toString();
  assert.match(out, /^<a class="portal-acc-btn principal" href="https:\/\/forms\.gle\/Ins1" target="_blank" rel="noopener">Inscribir a mi hijo o hija<\/a>/);
  assert.match(out, /<a class="portal-acc-btn pago" href="https:\/\/forms\.gle\/Com1" target="_blank" rel="noopener">Enviar comprobante<\/a>$/);
});

test('barra: inscripción cerrada → "Quiero jugar en Newell\'s"; el comprobante sin formulario, apagado con "Pronto"', () => {
  const out = htmlBarraAcciones(A('jugar', 'https://forms.gle/Jug1')).toString();
  assert.match(out, /<a class="portal-acc-btn principal" href="https:\/\/forms\.gle\/Jug1"[^>]*>Quiero jugar en Newell&#39;s<\/a>/);
  assert.match(out, /<span class="portal-acc-btn apagada" aria-disabled="true">Enviar comprobante<small>Pronto<\/small><\/span>/);
});

test('barra: sin ningún formulario abierto, no hay barra', () => {
  assert.equal(htmlBarraAcciones(A('jugar', null)).toString(), '');
});

test('pie: la sede con "Cómo llegar"; un mapa que no es de Google, sin link; sin sede, nada', () => {
  const out = htmlSedePie({ nombre: 'Estadio <Cubierto>', direccion: 'Parque', mapa: 'https://maps.app.goo.gl/abc' }).toString();
  assert.match(out, /<b>Estadio &lt;Cubierto&gt;<\/b>/);
  assert.match(out, /<a href="https:\/\/maps\.app\.goo\.gl\/abc" target="_blank" rel="noopener">Cómo llegar<\/a>/);
  assert.doesNotMatch(htmlSedePie({ nombre: 'X', mapa: 'https://evil.com/maps' }).toString(), /<a /);
  assert.equal(htmlSedePie(null).toString(), '');
});

test('paginaDeAncla: los links viejos de la página única llevan a su página; nada más', () => {
  assert.equal(paginaDeAncla('#ayuda'), '/ayuda');
  assert.equal(paginaDeAncla('#categorias'), '/categorias');
  assert.equal(paginaDeAncla('#calendario'), '/calendario');
  for (const otro of ['', '#', '#colaborar', '#access_token=abc&type=recovery', '#constructor', '#__proto__', undefined, null]) {
    assert.equal(paginaDeAncla(otro), null, String(otro));
  }
});

test('paginaActual: la ruta limpia o el .html de cada página; lo demás, null', () => {
  assert.equal(paginaActual('/'), '/');
  assert.equal(paginaActual('/public/portal.html'), '/');
  assert.equal(paginaActual('/ayuda'), '/ayuda');
  assert.equal(paginaActual('/ayuda/'), '/ayuda');
  assert.equal(paginaActual('/public/noticias.html'), '/noticias');
  assert.equal(paginaActual('/app'), null);
  assert.deepEqual(PAGINAS_PORTAL.map((p) => p.href), ['/', '/noticias', '/categorias', '/calendario', '/ayuda']);
});

test('el marco no lee la base si la URL es la vuelta de un login, y sólo pide datos por el repositorio', () => {
  const guarda = marco.indexOf('destinoDeAuth(window.location.search, window.location.hash)');
  assert.ok(guarda > 0 && guarda < marco.indexOf('resolverFormularios('), 'la guarda va antes de leer la base');
  const imports = [...marco.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(imports.filter((i) => /repos\/|cliente|supabase/.test(i)), []);
  assert.doesNotMatch(marco, /\bfetch\s*\(/);
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `node --test tests/portalMarco.test.js`
Expected: FAIL con `Cannot find module '…/src/ui/portalMarco.js'`.

- [ ] **Step 3: Sumar las páginas a `src/data/portal.js`**

Debajo del objeto `PORTAL`:

```js
/** Las páginas del portal, en el orden de la navegación (encabezado y pie). */
export const PAGINAS_PORTAL = Object.freeze([
  Object.freeze({ href: '/', texto: 'Inicio' }),
  Object.freeze({ href: '/noticias', texto: 'Noticias' }),
  Object.freeze({ href: '/categorias', texto: 'Categorías' }),
  Object.freeze({ href: '/calendario', texto: 'Calendario' }),
  Object.freeze({ href: '/ayuda', texto: 'Ayuda' }),
]);

// Los links de cuando el portal era una sola página siguen dando vueltas por
// WhatsApp (el "Ayuda" de arriba, el atajo a Categorías). Map y no objeto:
// así "#constructor" no encuentra nada heredado.
const PAGINA_DE_ANCLA = new Map([['#ayuda', '/ayuda'], ['#categorias', '/categorias'], ['#calendario', '/calendario']]);

/**
 * A qué página nueva lleva un ancla vieja de "/". Cualquier otra cosa da null,
 * en particular el #access_token de la vuelta de un login (eso lo resuelve
 * portalEntrada.js, que manda a /app).
 */
export function paginaDeAncla(hash) {
  return PAGINA_DE_ANCLA.get(hash) ?? null;
}

const ARCHIVO_DE_PAGINA = /^\/public\/(portal|noticias|categorias|calendario|ayuda)\.html$/;

/** El href de PAGINAS_PORTAL que corresponde a la ruta (limpia o el .html que sirve el rewrite), o null. */
export function paginaActual(ruta) {
  const r = String(ruta ?? '').replace(/(.)\/+$/, '$1');
  const m = r.match(ARCHIVO_DE_PAGINA);
  if (m) return m[1] === 'portal' ? '/' : `/${m[1]}`;
  return PAGINAS_PORTAL.some((p) => p.href === r) ? r : null;
}
```

- [ ] **Step 4: Crear `src/ui/portalMarco.js`**

```js
import { html } from './html.js';
import { $ } from './dom.js';
import { formulariosPublicos } from '../data/repositorio.js';
import { PORTAL, paginaActual, sedeValida } from '../data/portal.js';
import { resolverFormularios, separarFormularios, accionesPrincipales } from '../data/formulariosPortal.js';
import { destinoDeAuth } from '../data/entradaAuth.js';

/*
 * Lo común a las cinco páginas del portal (spec 2026-10-21): la barra con las
 * dos acciones que más usan las familias, el pie con la sede y la página
 * actual marcada en la navegación. El encabezado y el pie están escritos en
 * el HTML de cada página (se ven sin JS): acá sólo se completan.
 *
 * Lee formularios_publicos UNA vez por página y le devuelve lo leído a la
 * página, que lo usa para su propio contenido (el hero, la ayuda).
 */

/**
 * Las dos acciones: la primera (Inscribir o Quiero jugar, la regla de
 * accionesPrincipales) y el comprobante. La que no tiene formulario se ve
 * apagada, con "Pronto". Sin ninguna abierta no hay barra: no hay nada que
 * hacer, y dos botones apagados fijos en la pantalla sólo estorban.
 */
export function htmlBarraAcciones({ primera, comprobante }) {
  if (!primera.url && !comprobante.url) return html``;
  const boton = (clase, texto, url) => (url
    ? html`<a class="portal-acc-btn ${clase}" href="${url}" target="_blank" rel="noopener">${texto}</a>`
    : html`<span class="portal-acc-btn apagada" aria-disabled="true">${texto}<small>Pronto</small></span>`);
  const titulo = primera.tipo === 'inscribir' ? 'Inscribir a mi hijo o hija' : 'Quiero jugar en Newell\'s';
  return html`${boton('principal', titulo, primera.url)}${boton('pago', 'Enviar comprobante', comprobante.url)}`;
}

/** La sede en el pie. Sin una sede válida, nada. */
export function htmlSedePie(sede) {
  const s = sedeValida(sede);
  if (!s) return html``;
  return html`<b>${s.nombre}</b>${s.direccion && html`<br>${s.direccion}`}${s.mapa && html`<br><a href="${s.mapa}" target="_blank" rel="noopener">Cómo llegar</a>`}`;
}

function marcarPaginaActual() {
  const actual = paginaActual(window.location.pathname);
  if (!actual) return;
  document.querySelectorAll('.portal-nav a, .portal-pie-nav a').forEach((a) => {
    if (a.getAttribute('href') === actual) a.setAttribute('aria-current', 'page');
  });
}

/** El botón Copiar del alias (hero del inicio y Ayuda). */
function iniciarCopiar() {
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-copiar]');
    if (!b) return;
    try {
      await navigator.clipboard.writeText(b.dataset.copiar);
      b.textContent = '¡Copiado!';
    } catch {
      // Sin permiso para el portapapeles: el alias queda a la vista para copiarlo a mano.
      b.textContent = 'Copialo a mano';
    }
  });
}

function pintarBarra(acciones) {
  const barra = $('portal-acc-barra');
  const contenido = htmlBarraAcciones(acciones).toString();
  barra.innerHTML = contenido;
  barra.hidden = !contenido;
  $('publico').classList.toggle('con-barra', Boolean(contenido));
}

/**
 * Arranca lo común. Hasta que responde la base, la barra queda oculta: nunca
 * un botón a un formulario que quizá ya cerró. Si la URL es la vuelta de un
 * login, portalEntrada.js ya está mandando a /app y acá no se consulta nada
 * (el cliente de Supabase canjearía el ?code= en esta página).
 */
export async function iniciarMarco() {
  marcarPaginaActual();
  $('portal-pie-sede').innerHTML = htmlSedePie(PORTAL.sede);
  iniciarCopiar();
  if (destinoDeAuth(window.location.search, window.location.hash)) return null;
  const { estado, formularios } = await resolverFormularios(() => formulariosPublicos(PORTAL.clubId), PORTAL.formularios);
  const separados = separarFormularios(formularios);
  pintarBarra(accionesPrincipales(separados));
  return { estado, ...separados };
}

/**
 * En el inicio, las tarjetas del hero ya son esos dos botones: la barra se
 * esconde mientras se ven y flota cuando salen de pantalla. Sin
 * IntersectionObserver, la barra queda siempre a la vista.
 */
export function esconderBarraMientrasSeVea(elemento) {
  const barra = $('portal-acc-barra');
  barra.classList.add('flotante');
  if (!elemento || typeof IntersectionObserver !== 'function') return;
  barra.classList.add('escondida');
  new IntersectionObserver(([e]) => barra.classList.toggle('escondida', e.isIntersecting)).observe(elemento);
}
```

- [ ] **Step 5: Correr el test del marco**

Run: `node --test tests/portalMarco.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 6: Encabezado, barra y pie en `public/portal.html`**

Reemplazar el `<header class="portal-barra">…</header>` entero por este bloque. **Las cinco páginas llevan este bloque idéntico** (lo verifica la Task 9):

```html
  <header class="portal-barra">
    <a class="portal-logo" href="/">
      <img src="/public/escudo.png" alt="" width="36" height="36">
      <div class="portal-marca"><div class="t">Newell&#39;s <span>Básquet</span></div><div class="s">Formativas · Familias</div></div>
    </a>
    <nav class="portal-barra-acc" aria-label="Accesos">
      <!-- Para profes y jugadores: la entrada a Semillero y cómo instalarla, sin buscarla en el portal de padres. -->
      <details class="portal-sem" id="semillero">
        <summary class="portal-barra-btn portal-sem-btn">Soy profe o jugador</summary>
        <div class="portal-sem-panel">
          <b>Semillero</b>
          <p>La aplicación del cuerpo técnico y de los jugadores. Las familias no la necesitan: todo lo suyo está en esta página.</p>
          <a class="btn" href="/app">Entrar a Semillero</a>
          <div class="portal-sem-inst">
            <small>Tenela como una app en el celular</small>
            <p><b>Android:</b> abrila con Chrome, tocá el menú (los tres puntitos) → <b>Instalar app</b>.</p>
            <p><b>iPhone:</b> abrila con Safari, tocá <b>Compartir</b> → <b>Agregar a inicio</b>.</p>
          </div>
        </div>
      </details>
    </nav>
    <nav class="portal-nav" aria-label="Páginas del básquet"><a href="/">Inicio</a><a href="/noticias">Noticias</a><a href="/categorias">Categorías</a><a href="/calendario">Calendario</a><a href="/ayuda">Ayuda</a></nav>
  </header>

  <!-- Las dos acciones que más usan las familias, siempre a la vista: fija
       abajo en el celular, pegada arriba en compu (portal.css). La pinta
       src/ui/portalMarco.js cuando responde la base. -->
  <div class="portal-acc-barra" id="portal-acc-barra" hidden></div>
```

Sacar de `<main>` la línea `<div class="pie-legal">…</div>`. Después de `</main>` (y antes del `<dialog>`, que sigue hasta la Task 5), sumar el pie, también **idéntico en las cinco páginas**:

```html
  <footer class="portal-pie">
    <div class="portal-pie-marca"><img src="/public/escudo.png" alt="" width="40" height="40"><div><b>Newell&#39;s Básquet</b><span>Formativas · Rosario</span></div></div>
    <nav class="portal-pie-nav" aria-label="Páginas del básquet (pie)"><a href="/">Inicio</a><a href="/noticias">Noticias</a><a href="/categorias">Categorías</a><a href="/calendario">Calendario</a><a href="/ayuda">Ayuda</a></nav>
    <div class="portal-pie-sede" id="portal-pie-sede"></div>
    <div class="pie-legal"><a href="/app">Entrar a Semillero</a> · <a href="/public/legal/privacidad.html">Política de privacidad</a> · <a href="/public/legal/terminos.html">Términos y condiciones</a></div>
  </footer>
```

Mientras no existan `/noticias`, `/categorias`, `/calendario` y `/ayuda` (Tasks 5–7 y 13), esos links dan 404 en local. Es esperado: nada se publica.

- [ ] **Step 7: `iniciarPortal` usa el marco (`src/ui/portal.js`)**

- Borrar la función `iniciarCopiar` y su llamada (se mudó al marco).
- Sacar `formulariosPublicos` del import del repositorio y `resolverFormularios, separarFormularios` del de `formulariosPortal.js` si quedan sin uso.
- Importar `{ iniciarMarco, esconderBarraMientrasSeVea } from './portalMarco.js'`.
- El final de `iniciarPortal`, desde `// Si la URL es la vuelta de un login…`, queda así:

```js
  esconderBarraMientrasSeVea($('portal-heroe'));
  const marco = iniciarMarco();

  // Si la URL es la vuelta de un login, portalEntrada.js ya está mandando a la
  // persona a /app: acá no se pide nada más (el marco tampoco lee la base).
  if (destinoDeAuth(window.location.search, window.location.hash)) return;

  if (calendarios.length) iniciarCalendario(calendarios);

  const datos = await marco;
  if (!datos) return;
  // Los que tienen lugar propio (la banda, recaudación, colaborar) no se repiten en "Otros formularios".
  const { estado, inscripcion, comprobante, consultas, colaboradores, recaudacion, comunes } = datos;
  pintarFormularios({ inscripcion, comprobante, consultas, colaboradores, recaudacion });

  const lista = htmlFormularios(comunes);
  mostrar('formularios', lista.toString() ? html`${estado === 'respaldo' && htmlAvisoRespaldo()}${lista}` : lista);
}
```

- [ ] **Step 8: Actualizar los tres tests de `tests/portalPagina.test.js`**

Sumar `import { PAGINAS_PORTAL } from '../src/data/portal.js';` y reemplazar:

1. El test `'el encabezado tiene Ayuda (a las preguntas frecuentes) y Semillero, con cómo instalarla'` por:

```js
test('el encabezado: la marca lleva al inicio, la navegación de las páginas y Semillero, con cómo instalarla', () => {
  const barra = pagina.match(/<header class="portal-barra">[\s\S]*?<\/header>/)[0];
  assert.match(barra, /<a class="portal-logo" href="\/">/);
  const nav = barra.match(/<nav class="portal-nav" aria-label="Páginas del básquet">([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual([...nav.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]), PAGINAS_PORTAL.map((p) => [p.href, p.texto]));
  const sem = barra.match(/<details class="portal-sem" id="semillero">[\s\S]*?<\/details>/)[0];
  assert.match(sem, /<summary[^>]*>Soy profe o jugador<\/summary>/);
  assert.match(sem, /<a class="btn" href="\/app">Entrar a Semillero<\/a>/);
  assert.match(sem, /Instalar app/);
  assert.match(sem, /Agregar a inicio/);
  assert.match(pagina, /<div class="portal-acc-barra" id="portal-acc-barra" hidden><\/div>/, 'la barra arranca oculta');
});
```

2. El test `'el portal no consulta nada si la URL es la vuelta de un login: esos links van a /app'` por:

```js
test('el inicio no pide nada si la URL es la vuelta de un login: esos links van a /app', () => {
  // El cliente de Supabase canjearía el ?code= o el #access_token en esta página.
  // La lectura de formularios la guarda el marco (tests/portalMarco.test.js).
  const guarda = portal.indexOf('destinoDeAuth(window.location.search, window.location.hash)');
  assert.ok(guarda > 0 && guarda < portal.lastIndexOf('iniciarCalendario(calendarios)'), 'la guarda va antes de pedir el calendario');
  assert.ok(portal.indexOf('iniciarMarco()') < guarda, 'el marco arranca antes (completa el pie aunque no lea la base)');
});
```

3. En el test `'el portal aparta los formularios con lugar propio: no aparecen dos veces'`, cambiar la primera aserción por:

```js
  assert.match(portal, /const \{ estado, inscripcion, comprobante, consultas, colaboradores, recaudacion, comunes \} = datos;/);
```

- [ ] **Step 9: Correr la suite**

Run: `npm run test:q`
Expected: PASS.

- [ ] **Step 10: Verificar en el navegador**

Run: `npm run servir` → `http://localhost:5174/`. Mirar en 360×640 y 320×568 (DevTools, modo dispositivo) y en compu.
Expected:
- En el celular, la navegación es una fila debajo de la marca. "Inicio" está subrayado en rojo (`aria-current`).
- Las dos tarjetas del hero se ven sin scrollear, y la barra de abajo está escondida mientras se ven. Al scrollear pasado el hero, la barra aparece abajo (celular) o arriba (compu), siempre que la base tenga algún formulario abierto.
- El pie muestra la sede con "Cómo llegar".
- La consola no tiene errores.
Guardar las capturas en el reporte para el revisor.

- [ ] **Step 11: Commit**

```bash
git add src/data/portal.js src/ui/portalMarco.js src/ui/portal.js public/portal.html tests/portalMarco.test.js tests/portalPagina.test.js
git commit -m "feat(portal): encabezado con navegación, barra de acciones fija y pie" -m "Tests cambiados a propósito en portalPagina: el encabezado (Ayuda pasa a la navegación), la guarda de login (la lectura de formularios se muda a portalMarco) y de dónde salen los formularios separados."
```

---

### Task 5: Página Ayuda

La hoja `<dialog>` de ayuda del inicio pasa a ser la página `/ayuda`, con las mismas seis preguntas y la misma lógica según lo que esté abierto, más una sección de sede y alias. El WhatsApp del coordinador sigue saliendo **sólo** del bloque final de `htmlAyuda`.

**Files:**
- Create: `public/ayuda.html`
- Create: `src/ui/ayudaArranque.js`
- Create: `tests/portalAyuda.test.js`
- Modify: `src/ui/portal.js` (`htmlContacto`, `iniciarPaginaAyuda`, textos y links de `htmlAyuda`/`htmlCategoriaDelAnio`; sale `iniciarAyuda`)
- Modify: `public/portal.html` (sale el `<dialog>`)
- Modify: `public/css/publico.css`, `public/css/layout.css` (salen las reglas `.portal-hoja*`, que quedan sin uso)
- Modify: `vercel.json` (rewrite y `no-store` de `/ayuda`)
- Modify: `tests/portalPagina.test.js`. Cambian **a propósito**: "Ayuda no ocupa lugar en la página: es una hoja…" (ahora es página), "categoría del año: sin ninguna…" (el link pasa de `#ayuda` a `/ayuda`) y "ayuda: ¿cómo inscribo? no manda a un botón apagado" (el texto ya no dice "arriba de todo").

**Interfaces:**
- Consume: `iniciarMarco` (Task 4), `htmlAyuda`, `htmlAlias`, `sedeValida`, `mostrar` (helper interno de `portal.js`).
- Produce: `htmlContacto({ sede?, alias? }): Html` y `iniciarPaginaAyuda(): Promise<void>`. También la **plantilla de página** que copian las Tasks 6, 7 y 13.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/portalAyuda.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlContacto } from '../src/ui/portal.js';
import { PORTAL } from '../src/data/portal.js';

/**
 * /ayuda: las preguntas frecuentes (antes, una hoja encima del inicio) y la
 * sede con el alias. El WhatsApp del coordinador aparece una sola vez en todo
 * el portal: al final de las preguntas.
 */
const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const ayuda = leer('public/ayuda.html');
const seccion = (html, id) => html.match(new RegExp(`<section [^>]*id="${id}"[\\s\\S]*?</section>`))?.[0] ?? '';
const vercel = JSON.parse(leer('vercel.json'));

test('htmlContacto: la sede con "Cómo llegar" y el alias con Copiar; escapado; sin datos, nada', () => {
  const out = htmlContacto({ sede: { nombre: 'Estadio <Cubierto>', direccion: 'Parque', mapa: 'https://maps.app.goo.gl/abc' }, alias: { alias: 'NOB.BASQUET' } }).toString();
  assert.match(out, /<div class="portal-contacto-sede">[\s\S]*<b>Estadio &lt;Cubierto&gt;<\/b>[\s\S]*<p>Parque<\/p>/);
  assert.match(out, /href="https:\/\/maps\.app\.goo\.gl\/abc"[^>]*>Cómo llegar/);
  assert.match(out, /data-copiar="NOB\.BASQUET"/);
  assert.equal(htmlContacto({}).toString(), '');
  assert.equal(htmlContacto({ sede: { nombre: ' ' }, alias: { alias: 'mal alias' } }).toString(), '');
});

test('la página: h1 de preguntas frecuentes, la lista, el contacto oculto hasta tener datos y su arranque', () => {
  assert.match(ayuda, /<h1 id="t-ayuda">Preguntas frecuentes<\/h1>/);
  assert.match(ayuda, /<div class="portal-faqs" id="portal-ayuda-lista"><\/div>/);
  assert.match(seccion(ayuda, 'contacto').split('>')[0], /\bhidden\b/);
  assert.match(ayuda, /<script type="module" src="\/src\/ui\/ayudaArranque\.js"><\/script>/);
  assert.doesNotMatch(ayuda, /portalEntrada/, 'el reenvío de los links de login es sólo de "/"');
});

test('el coordinador aparece una sola vez en el portal: al final de las preguntas frecuentes', () => {
  for (const archivo of ['public/portal.html', 'public/ayuda.html']) {
    assert.doesNotMatch(leer(archivo).replace(/<!--[\s\S]*?-->/g, ''), /wa\.me|coordinador/i, archivo);
  }
  assert.doesNotMatch(leer('src/ui/portalMarco.js'), /enlaceContacto|PORTAL\.contacto/);
  assert.equal((leer('src/ui/portal.js').match(/enlaceContacto\(/g) ?? []).length, 1, 'sólo htmlAyuda arma el enlace');
  assert.doesNotMatch(htmlContacto({ sede: PORTAL.sede, alias: PORTAL.alias }).toString(), /wa\.me/);
});

test('vercel.json: /ayuda sirve su página y no se guarda en caché', () => {
  assert.ok(vercel.rewrites.some((r) => r.source === '/ayuda' && r.destination === '/public/ayuda.html'));
  for (const ruta of ['/ayuda', '/public/ayuda.html']) {
    const cache = vercel.headers.filter((h) => h.source === ruta).flatMap((h) => h.headers).find((h) => h.key === 'Cache-Control')?.value;
    assert.equal(cache, 'no-store', ruta);
  }
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `node --test tests/portalAyuda.test.js`
Expected: FAIL (`htmlContacto` no existe, `public/ayuda.html` no existe).

- [ ] **Step 3: `htmlContacto` e `iniciarPaginaAyuda` en `src/ui/portal.js`**

Subir `abierto` a nivel de módulo (hoy es local de `pintarFormularios`), justo debajo de `botonCerrado`:

```js
const abierto = (f) => Boolean(f && enlaceFormulario(f.enlace));
```

Debajo de `htmlAyuda`:

```js
/**
 * La sede y el alias, abajo de las preguntas frecuentes de /ayuda. El
 * coordinador NO va acá: sale una sola vez, al final de htmlAyuda.
 */
export function htmlContacto({ sede = null, alias = null } = {}) {
  const s = sedeValida(sede);
  const a = htmlAlias(alias);
  if (!s && !a.toString()) return html``;
  return html`${s && html`<div class="portal-contacto-sede">
      <div class="portal-st">Dónde se entrena</div>
      <b>${s.nombre}</b>${s.direccion && html`<p>${s.direccion}</p>`}
      ${s.mapa && botonExterno(s.mapa, 'Cómo llegar', 'btn sec chico')}
    </div>`}${a}`;
}
```

y, en la sección "Armado de la página", antes de `iniciarPortal`:

```js
/** /ayuda: las preguntas (que cambian con lo que esté abierto) y la sede con el alias. */
export async function iniciarPaginaAyuda() {
  const pintar = ({ inscripcion = null, consultas = null } = {}) => {
    $('portal-ayuda-lista').innerHTML = htmlAyuda({
      inscripcionAbierta: abierto(inscripcion), consultasAbierto: abierto(consultas),
      temporada: PORTAL.temporada, alias: PORTAL.alias, sede: PORTAL.sede, contacto: PORTAL.contacto,
    });
  };
  // Hasta que responda la base, las respuestas suponen todo cerrado: nunca mandan a un botón apagado.
  pintar();
  mostrar('contacto', htmlContacto({ sede: PORTAL.sede, alias: PORTAL.alias }));
  const datos = await iniciarMarco();
  if (datos) pintar(datos);
}
```

- [ ] **Step 4: Textos y links que ya no son de una sola página**

En `src/ui/portal.js`:
- `htmlAyuda`, respuesta de "¿Cómo inscribo…?" con la inscripción abierta: `Tocá <b>Inscribir a mi hijo o hija</b>, arriba de todo.` → `Tocá <b>Inscribir a mi hijo o hija</b>: está arriba de todo en el inicio y en la barra de botones de cada página.`
- Misma respuesta, con consultas abierto: `tocá <b>Quiero jugar en Newell's</b>, arriba de todo: dejás…` → `tocá <b>Quiero jugar en Newell's</b> (en el inicio o en la barra de botones): dejás…`
- Misma respuesta, todo cerrado: `Cuando abra, el botón se habilita arriba de todo.` → `Cuando abra, el botón aparece en el inicio y en la barra de botones de cada página.`
- "¿Cómo pago…?": `(con <b>Copiar</b>, arriba de todo, lo pegás en tu banco)` → `(con <b>Copiar</b>, en el inicio o acá abajo, lo pegás en tu banco)`.
- Los dos `<a href="#categorias">` de `htmlAyuda` → `<a href="/categorias">`.
- `htmlCategoriaDelAnio`: `<a href="#ayuda">` → `<a href="/ayuda">`.
- En el armado de los atajos de `iniciarPortal`: `href: '#ayuda'` → `href: '/ayuda'` (los atajos se van en la Task 8).
- Borrar `iniciarAyuda` entera, su llamada en `iniciarPortal` y la línea `$('portal-ayuda-lista').innerHTML = htmlAyuda({...})` de `pintarFormularios`: el inicio ya no tiene la lista.

- [ ] **Step 5: Sacar la hoja del inicio y sus estilos**

- En `public/portal.html`, borrar el `<dialog class="portal-hoja" id="ayuda" …>…</dialog>` entero y su comentario.
- En `public/css/publico.css`, borrar las reglas cuyo selector empieza con `.portal-hoja` (hoy, líneas ~314–331: `.portal-hoja`, `::backdrop`, `:focus-visible`, `-cuerpo`, `-cab`, `-x` y sus variantes). **No** borrar `.portal-faqs` ni `.portal-faq*`: los usa `/ayuda`.
- En `public/css/layout.css`, borrar las dos líneas `.publico .portal-hoja{…}` y `.publico .portal-hoja-cuerpo{…}`.
- Verificar: `grep -rn "portal-hoja" public src` no devuelve nada.

- [ ] **Step 6: Crear `src/ui/ayudaArranque.js`**

```js
import { iniciarPaginaAyuda } from './portal.js';

// Aparte de portal.js, como portalArranque.js: los tests importan los
// armadores de HTML sin que se ejecute nada contra el DOM.
iniciarPaginaAyuda();
```

- [ ] **Step 7: Crear `public/ayuda.html` (la plantilla de página)**

Las Tasks 6, 7 y 13 copian este archivo y cambian sólo lo marcado como **[propio]**. El `<head>` hasta el import map, el `<header>`, la barra y el `<footer>` se copian **tal cual** de `public/portal.html` (el import map, byte por byte).

```html
<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8">
<!-- Se sirve con Cache-Control: no-store (vercel.json), como el inicio: guardado,
     el navegador lo revalida y el 304 no trae la CSP vigente. -->
<link rel="icon" href="/public/escudo.png" type="image/png">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0D0D10">
<title>Ayuda · Básquet Newell&#39;s</title>                                    <!-- [propio] -->
<meta name="description" content="Preguntas frecuentes del básquet formativo de Newell's: cómo inscribir, cómo pagar y mandar el comprobante, categorías y horarios, y dónde se entrena.">  <!-- [propio] -->

<link rel="canonical" href="https://app-semillero.vercel.app/ayuda">          <!-- [propio] -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Básquet Newell's">
<meta property="og:locale" content="es_AR">
<meta property="og:url" content="https://app-semillero.vercel.app/ayuda">     <!-- [propio] -->
<meta property="og:title" content="Ayuda · Básquet Newell's">                 <!-- [propio] -->
<meta property="og:description" content="Preguntas frecuentes del básquet formativo de Newell's: cómo inscribir, cómo pagar y mandar el comprobante, categorías y horarios, y dónde se entrena.">  <!-- [propio] -->
<meta property="og:image" content="https://app-semillero.vercel.app/public/escudo.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta property="og:image:alt" content="Escudo del club">
<meta name="twitter:card" content="summary">

<link rel="preload" href="/public/fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/public/fonts/barlow-condensed-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/public/css/tokens.css">
<link rel="stylesheet" href="/public/css/base.css">
<link rel="stylesheet" href="/public/css/layout.css">
<link rel="stylesheet" href="/public/css/componentes.css">
<link rel="stylesheet" href="/public/css/publico.css">
<link rel="stylesheet" href="/public/css/portal.css">
<!-- El MISMO import map que la app, letra por letra (hash de la CSP). -->
<!-- (copiar aquí el <script type="importmap">…</script> de public/portal.html, sin tocar un espacio) -->
<script src="/public/config.js"></script>
</head>
<body>

<div class="publico portal-d" id="publico">
  <!-- (copiar aquí el <header class="portal-barra">…</header> y el
       <div class="portal-acc-barra" …></div> de public/portal.html) -->

  <main class="portal">                                                        <!-- [propio]: todo el <main> -->
    <section class="portal-sec" id="preguntas" aria-labelledby="t-ayuda">
      <div class="portal-st">Ayuda</div>
      <h1 id="t-ayuda">Preguntas frecuentes</h1>
      <div class="portal-faqs" id="portal-ayuda-lista"></div>
    </section>

    <!-- La sede y el alias (htmlContacto). Oculta hasta tener datos. -->
    <section class="portal-sec" id="contacto" aria-labelledby="t-contacto" hidden>
      <div class="portal-st">Sede y pagos</div>
      <h2 id="t-contacto">Dónde se entrena y a dónde transferir</h2>
      <div class="portal-contacto" id="portal-contacto"></div>
    </section>
  </main>

  <!-- (copiar aquí el <footer class="portal-pie">…</footer> de public/portal.html) -->
</div>

<script type="module" src="/src/ui/ayudaArranque.js"></script>            <!-- [propio] -->
</body>
</html>
```

Al escribir el archivo, **reemplazar los comentarios "(copiar aquí…)" por los bloques reales** y borrar los comentarios `<!-- [propio] -->`: son marcas para este plan, no van en el HTML.

- [ ] **Step 8: Rewrite y caché en `vercel.json`**

En `rewrites`, después de `/consultas`:

```json
    { "source": "/ayuda", "destination": "/public/ayuda.html" },
```

En `headers`, junto a las de `/consultas`:

```json
    { "source": "/ayuda", "headers": [{ "key": "Cache-Control", "value": "no-store" }] },
    { "source": "/public/ayuda.html", "headers": [{ "key": "Cache-Control", "value": "no-store" }] },
```

- [ ] **Step 9: Actualizar los tres tests de `tests/portalPagina.test.js`**

1. Reemplazar el test `'Ayuda no ocupa lugar en la página: es una hoja (<dialog>) con la X, que abre todo link a #ayuda'` por:

```js
test('Ayuda es una página (/ayuda): el inicio no tiene la hoja ni la abre, y nada apunta a #ayuda', () => {
  assert.doesNotMatch(pagina, /<dialog/);
  assert.doesNotMatch(portal, /iniciarAyuda|showModal/);
  assert.doesNotMatch(portal, /href="#ayuda"|'#ayuda'/);
});
```

2. En `'categoría del año: sin ninguna, lo dice y manda a las preguntas frecuentes, no al coordinador'`: `/<a href="#ayuda">/` → `/<a href="\/ayuda">/`.

3. En `'ayuda: "¿cómo inscribo?" no manda a un botón apagado'`: `/Cuando abra, el botón se habilita arriba de todo/` → `/Cuando abra, el botón aparece en el inicio y en la barra de botones/`.

- [ ] **Step 10: Correr la suite**

Run: `npm run test:q`
Expected: PASS.

- [ ] **Step 11: Verificar en el navegador**

Run: `npm run servir` → `http://localhost:5174/ayuda` en 360×640 y en compu.
Expected: las seis preguntas abren y cierran. Al final de ellas está "¿No encontraste tu respuesta?" con el WhatsApp. Abajo, la sede con "Cómo llegar" y el alias con Copiar, que copia. "Ayuda" está marcada en la navegación. Si la base tiene formularios abiertos, la barra de acciones se ve abajo sin scrollear. En `/`, ya no hay hoja.

- [ ] **Step 12: Commit**

```bash
git add public/ayuda.html src/ui/ayudaArranque.js src/ui/portal.js public/portal.html public/css/publico.css public/css/layout.css vercel.json tests/portalAyuda.test.js tests/portalPagina.test.js
git commit -m "feat(portal): página de Ayuda con preguntas frecuentes, sede y alias" -m "Tests cambiados a propósito en portalPagina: la hoja de ayuda pasa a ser /ayuda, el link de la categoría vacía apunta a /ayuda, y el texto de la inscripción cerrada ya no dice 'arriba de todo'."
```

---

### Task 6: Página Categorías

**Files:**
- Modify: `src/data/portal.js` (`slugCategoria`, `categoriasConDetalle`; comentario del campo `detalle`)
- Modify: `src/ui/portal.js` (`htmlIndiceCategorias`, `htmlCategoriaDetalle`, link en `htmlCategoriaDelAnio`, `iniciarBuscador(temporada, hrefDe)`, `iniciarPaginaCategorias`)
- Create: `public/categorias.html`, `src/ui/categoriasArranque.js`
- Create: `tests/portalCategorias.test.js`
- Modify: `vercel.json`

**Interfaces:**
- Consume: `categoriasDelPortal`, `aniosDeCategoria` (`src/data/categorias.js`), `sedeValida`, `iniciarMarco`.
- Produce:
  - `slugCategoria(texto: string): string`.
  - `categoriasConDetalle(lista, temporada): { nombre, rama, anios, horario, rotulo, ancla, detalle }[]`. Mismo orden y mismo filtro que `categoriasDelPortal`. `rotulo` y `ancla` llevan la rama sólo si hay dos categorías con el mismo nombre (las dos Primeras).
  - `htmlIndiceCategorias(categorias): Html`, `htmlCategoriaDetalle(categoria, sede): Html`.
  - `htmlCategoriaDelAnio(anio, categorias)` acepta un `href` opcional por categoría.
  - `iniciarPaginaCategorias(): Promise<void>`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/portalCategorias.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PORTAL, slugCategoria, categoriasConDetalle } from '../src/data/portal.js';
import { htmlCategoriaDetalle, htmlIndiceCategorias, htmlCategoriaDelAnio } from '../src/ui/portal.js';

/**
 * /categorias: el buscador por año arriba y una sección por categoría, con
 * su ancla (/categorias#u13). Sólo lo que está en src/data/portal.js: años,
 * horarios, sede. Nada inventado: sin horario dice "Horario a confirmar".
 */
const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const pagina = leer('public/categorias.html');
const vercel = JSON.parse(leer('vercel.json'));

test('slugCategoria: minúsculas, sin tildes, con guiones', () => {
  assert.equal(slugCategoria('U13'), 'u13');
  assert.equal(slugCategoria('Primera Femenino'), 'primera-femenino');
  assert.equal(slugCategoria('  Categoría  Ñ! '), 'categoria-n');
});

test('categoriasConDetalle: un ancla única por categoría; las dos Primeras se distinguen por la rama', () => {
  const c = categoriasConDetalle(PORTAL.categorias, 2027);
  assert.deepEqual(c.map((x) => x.ancla), ['u9', 'u11', 'u13', 'u15', 'u17', 'u21', 'primera-masculino', 'primera-femenino']);
  assert.deepEqual(c.filter((x) => x.nombre === 'Primera').map((x) => x.rotulo), ['Primera Masculino', 'Primera Femenino']);
  assert.equal(c.find((x) => x.ancla === 'u13').rotulo, 'U13');
  assert.equal(c.find((x) => x.ancla === 'u13').anios, '2014 y 2015');
});

test('categoriasConDetalle: el detalle sólo si el club lo pasó (hoy, ninguno); un grupo que no existe se descarta', () => {
  assert.ok(categoriasConDetalle(PORTAL.categorias, 2027).every((x) => x.detalle === null));
  assert.equal(categoriasConDetalle([{ grupo: 'U9', rama: 'Mixto', detalle: '  Traer pelota  ' }], 2027)[0].detalle, 'Traer pelota');
  assert.deepEqual(categoriasConDetalle([{ grupo: 'U10', rama: 'Mixto' }, null], 2027), []);
});

const U13 = { rotulo: 'U13', rama: 'Mixto', anios: '2014 y 2015', horario: 'Lun <18 h> · Mié 18 h', detalle: null, ancla: 'u13' };

test('detalle: sección con ancla, años, cada horario y la sede con mapa; escapado', () => {
  const out = htmlCategoriaDetalle(U13, { nombre: 'Estadio', mapa: 'https://maps.app.goo.gl/abc' }).toString();
  assert.match(out, /^<section class="portal-cat-sec" id="u13" aria-labelledby="t-u13">/);
  assert.match(out, /<div class="portal-st">Mixto<\/div>\s*<h2 id="t-u13">U13<\/h2>/);
  assert.match(out, /<dt>Nacidos<\/dt><dd>2014 y 2015<\/dd>/);
  assert.match(out, /<li>Lun &lt;18 h&gt;<\/li><li>Mié 18 h<\/li>/);
  assert.match(out, /<dt>Dónde<\/dt><dd>Estadio · <a href="https:\/\/maps\.app\.goo\.gl\/abc" target="_blank" rel="noopener">Cómo llegar<\/a><\/dd>/);
  assert.doesNotMatch(out, /portal-cat-detalle/);
});

test('detalle: sin horario, "Horario a confirmar."; sin sede, sin "Dónde"; con detalle del club, se muestra escapado', () => {
  const out = htmlCategoriaDetalle({ ...U13, horario: null, detalle: 'Traer <pelota>' }, null).toString();
  assert.match(out, /<span class="portal-cat-confirmar">Horario a confirmar\.<\/span>/);
  assert.doesNotMatch(out, /Dónde/);
  assert.match(out, /<p class="portal-cat-detalle">Traer &lt;pelota&gt;<\/p>/);
});

test('índice: un link por categoría a su ancla; con menos de dos, nada', () => {
  const out = htmlIndiceCategorias(categoriasConDetalle(PORTAL.categorias, 2027)).toString();
  assert.match(out, /^<a href="#u9">U9<\/a>/);
  assert.match(out, /<a href="#primera-femenino">Primera Femenino<\/a>$/);
  assert.equal(htmlIndiceCategorias([U13]).toString(), '');
});

test('categoría del año: con href, link a su sección; sin href, como antes', () => {
  const out = htmlCategoriaDelAnio(2014, [{ nombre: 'U13', rama: 'Mixto', anios: '2014 y 2015', horario: null, href: '#u13' }]).toString();
  assert.match(out, /<a class="portal-cat-ir" href="#u13">Ver horarios y sede de U13<\/a>/);
  assert.doesNotMatch(htmlCategoriaDelAnio(2014, [{ nombre: 'U13', rama: 'Mixto', anios: 'x', horario: null }]).toString(), /portal-cat-ir/);
});

test('la página: buscador con h1, índice, detalle oculto hasta tener datos, su arranque y su rewrite sin caché', () => {
  assert.match(pagina, /<h1 id="t-categorias">¿En qué categoría juega\?<\/h1>/);
  assert.match(pagina, /<div class="portal-buscador" id="portal-buscador"><\/div>/);
  assert.match(pagina, /<nav class="portal-cat-indice" id="portal-cat-indice" aria-label="Todas las categorías"><\/nav>/);
  assert.match(pagina.match(/<section [^>]*id="detalle"[^>]*>/)[0], /\bhidden\b/);
  assert.match(pagina, /<script type="module" src="\/src\/ui\/categoriasArranque\.js"><\/script>/);
  assert.ok(vercel.rewrites.some((r) => r.source === '/categorias' && r.destination === '/public/categorias.html'));
  for (const ruta of ['/categorias', '/public/categorias.html']) {
    assert.equal(vercel.headers.filter((h) => h.source === ruta).flatMap((h) => h.headers).find((h) => h.key === 'Cache-Control')?.value, 'no-store', ruta);
  }
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `node --test tests/portalCategorias.test.js`
Expected: FAIL (`slugCategoria` no existe).

- [ ] **Step 3: `slugCategoria` y `categoriasConDetalle` en `src/data/portal.js`**

En el comentario de `categorias` dentro de `PORTAL`, sumar: "`detalle` opcional: un texto que pase el club sobre esa categoría (se muestra en /categorias). Sin él, nada." No agregar `detalle` a ninguna categoría: el club no pasó ninguno.

Debajo de `categoriasDelAnio`:

```js
/** "Primera Femenino" → "primera-femenino": el ancla de una categoría en /categorias. */
export function slugCategoria(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Las categorías de /categorias: lo de categoriasDelPortal (mismo orden, mismo
 * filtro) más el rótulo, el ancla y el detalle que haya pasado el club. La rama
 * va en el rótulo y en el ancla sólo si dos categorías se llaman igual (las
 * dos Primeras): "U13" sola se entiende, "Primera" sola no.
 */
export function categoriasConDetalle(lista, temporada) {
  const crudas = (Array.isArray(lista) ? lista : []).filter((c) => aniosDeCategoria(c?.grupo, temporada));
  const base = categoriasDelPortal(crudas, temporada);
  const veces = new Map();
  for (const c of base) veces.set(c.nombre, (veces.get(c.nombre) ?? 0) + 1);
  return base.map((c, i) => {
    const rotulo = veces.get(c.nombre) > 1 && c.rama ? `${c.nombre} ${c.rama}` : c.nombre;
    return { ...c, rotulo, ancla: slugCategoria(rotulo), detalle: texto(crudas[i].detalle) || null };
  });
}
```

(`categoriasDelPortal` descarta lo mismo que el `filter` de arriba, así que los índices coinciden. `texto` es el helper que ya existe en el archivo.)

- [ ] **Step 4: Armadores en `src/ui/portal.js`**

La UI no necesita `slugCategoria`. Sumar `categoriasConDetalle` al import de `../data/portal.js`. Debajo de `htmlCategoriaDelAnio`:

```js
/** Los atajos a cada categoría de /categorias. Con menos de dos no vale la fila. */
export function htmlIndiceCategorias(categorias) {
  if (categorias.length < 2) return html``;
  return html`${categorias.map((c) => html`<a href="#${c.ancla}">${c.rotulo}</a>`)}`;
}

/**
 * Una categoría entera en /categorias: años, cada horario (día, hora y lugar,
 * como los pasó el club) y la sede. Sin horario, "a confirmar": nunca uno
 * inventado. El detalle, sólo si el club lo pasó.
 */
export function htmlCategoriaDetalle({ rotulo, rama, anios, horario, detalle, ancla }, sede) {
  const s = sedeValida(sede);
  return html`<section class="portal-cat-sec" id="${ancla}" aria-labelledby="t-${ancla}">
    ${rama && html`<div class="portal-st">${rama}</div>`}
    <h2 id="t-${ancla}">${rotulo}</h2>
    <dl class="portal-cat-datos">
      <div><dt>Nacidos</dt><dd>${anios}</dd></div>
      <div><dt>Entrenamientos</dt><dd>${horario
        ? html`<ul>${horario.split(' · ').map((h) => html`<li>${h}</li>`)}</ul>`
        : html`<span class="portal-cat-confirmar">Horario a confirmar.</span>`}</dd></div>
      ${s && html`<div><dt>Dónde</dt><dd>${s.nombre}${s.mapa && html` · <a href="${s.mapa}" target="_blank" rel="noopener">Cómo llegar</a>`}</dd></div>`}
    </dl>
    ${detalle && html`<p class="portal-cat-detalle">${detalle}</p>`}
  </section>`;
}
```

En `htmlCategoriaDelAnio`, el `map` de categorías recibe también `href`, y antes del cierre `</div>` de cada `.portal-cat-res` va:

```js
    ${href && html`<a class="portal-cat-ir" href="${href}">Ver horarios y sede de ${nombre}</a>`}
```

- [ ] **Step 5: `iniciarBuscador` con enlace, e `iniciarPaginaCategorias`**

`iniciarBuscador(temporada)` pasa a `iniciarBuscador(temporada, hrefDe = null)`. Dentro, antes de `pintar`:

```js
  // Para el link "Ver horarios y sede": el ancla sale de la lista completa,
  // así las dos Primeras llevan cada una a la suya.
  const detalle = categoriasConDetalle(PORTAL.categorias, PORTAL.temporada);
  const conEnlace = (cats) => cats.map((c) => {
    const d = detalle.find((x) => x.nombre === c.nombre && x.rama === c.rama);
    return { ...c, href: d && hrefDe ? hrefDe(d) : null };
  });
```

y en `pintar`, `htmlCategoriaDelAnio(anio, categoriasDelAnio(...))` pasa a `htmlCategoriaDelAnio(anio, conEnlace(categoriasDelAnio(PORTAL.categorias, temporada, anio)))`. El inicio sigue llamando `iniciarBuscador(temporada)` hasta la Task 8.

Antes de `iniciarPortal`:

```js
/** /categorias: el buscador, los atajos y una sección por categoría. */
export async function iniciarPaginaCategorias() {
  const temporada = temporadaComoAnio(PORTAL.temporada);
  const categorias = temporada ? categoriasConDetalle(PORTAL.categorias, PORTAL.temporada) : [];
  if (temporada) $('t-categorias-temp').textContent = ` ${temporada}`;
  $('buscar').hidden = !categorias.length;
  if (categorias.length) {
    iniciarBuscador(temporada, (c) => `#${c.ancla}`);
    $('portal-cat-indice').innerHTML = htmlIndiceCategorias(categorias);
    mostrar('detalle', html`${categorias.map((c) => htmlCategoriaDetalle(c, PORTAL.sede))}`, 'portal-cat-detalle');
    // Si se llegó con /categorias#u13, la sección recién existe ahora: el navegador ya no va a bajar solo.
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }
  await iniciarMarco();
}
```

- [ ] **Step 6: Página y arranque**

Crear `src/ui/categoriasArranque.js` como `ayudaArranque.js`, pero con `iniciarPaginaCategorias`.

Crear `public/categorias.html` copiando `public/ayuda.html`. Lo **[propio]**:
- `<title>Categorías · Básquet Newell&#39;s</title>` y `og:title` `Categorías · Básquet Newell's`.
- `description` y `og:description`: `Categorías del básquet formativo de Newell's: en qué categoría juega cada año de nacimiento, días y horarios de entrenamiento, y dónde se entrena.`
- `canonical` y `og:url`: `https://app-semillero.vercel.app/categorias`.
- Script: `<script type="module" src="/src/ui/categoriasArranque.js"></script>`.
- `<main>`:

```html
  <main class="portal">
    <section class="portal-sec portal-cat" id="buscar" aria-labelledby="t-categorias">
      <div class="portal-st">Categorías<span id="t-categorias-temp"></span></div>
      <h1 id="t-categorias">¿En qué categoría juega?</h1>
      <p class="intro">Va por el año de nacimiento, como lo arma la CABB. Elegí el año y te decimos la categoría y los horarios.</p>
      <div class="portal-buscador" id="portal-buscador"></div>
      <nav class="portal-cat-indice" id="portal-cat-indice" aria-label="Todas las categorías"></nav>
    </section>

    <!-- Una sección por categoría (htmlCategoriaDetalle), con su ancla: /categorias#u13. -->
    <section class="portal-papel" id="detalle" aria-label="Horarios y sede de cada categoría" hidden>
      <div id="portal-cat-detalle"></div>
    </section>
  </main>
```

En `vercel.json`, el rewrite `/categorias` → `/public/categorias.html` y las dos cabeceras `no-store` (`/categorias` y `/public/categorias.html`), como en la Task 5.

- [ ] **Step 7: Correr la suite**

Run: `npm run test:q`
Expected: PASS (los tests viejos del buscador y de `htmlCategoriaDelAnio` no cambian).

- [ ] **Step 8: Verificar en el navegador**

Run: `npm run servir` → `http://localhost:5174/categorias` y `http://localhost:5174/categorias#primera-femenino`.
Expected: el buscador cambia de año con − y +, y el resultado tiene "Ver horarios y sede de …", que baja a la sección. El índice lleva a cada sección. Las dos Primeras dicen "Horario a confirmar." El link con `#primera-femenino` abre ya bajado a esa sección. En el celular, el título de la sección no queda tapado.

- [ ] **Step 9: Commit**

```bash
git add src/data/portal.js src/ui/portal.js public/categorias.html src/ui/categoriasArranque.js tests/portalCategorias.test.js vercel.json
git commit -m "feat(portal): página de Categorías con el detalle de cada una"
```

---

### Task 7: Página Calendario

El calendario entero se muda a `/calendario`. En el inicio queda sólo "Lo que viene" (Task 8). Para que las dos páginas compartan la caché de eventos, `iniciarCalendario` se parte en `crearAgenda` (caché), `iniciarCalendario(agenda)` (la grilla), `mostrarProximo(agenda)` y `cablearIcs(seccion, agenda)`.

**Files:**
- Modify: `src/ui/portal.js` (`crearAgenda`, `mostrarProximo`, `cablearIcs`, `iniciarCalendario(agenda)`, `iniciarPaginaCalendario`)
- Create: `public/calendario.html`, `src/ui/calendarioArranque.js`
- Create: `tests/portalCalendario.test.js`
- Modify: `vercel.json`
- Modify: `tests/portalPagina.test.js`. Cambia **a propósito** "el inicio no pide nada si la URL es la vuelta de un login…": la guarda ahora va antes de `crearAgenda(`.

**Interfaces:**
- Consume: `eventosDelMes` (repositorio), `eventosPorDia`, `proximosEventos`, `mesVecino`, `hoyEnRosario`, `htmlCalendario`, `htmlProximo`, `diaInicial`, `claveEvento`, `bajarIcs`.
- Produce:
  - `crearAgenda(calendarios): { calendarios, traer(anio, mes): Promise<{ porDia, fallidos }>, yaTraido(anio, mes): boolean, eventos(): evento[] }`.
  - `mostrarProximo(agenda): Promise<boolean>` (true si hay un próximo evento).
  - `cablearIcs(seccion: Element, agenda): void`.
  - `iniciarCalendario(agenda): Promise<void>`.
  - `iniciarPaginaCalendario(): Promise<void>`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/portalCalendario.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * /calendario: la grilla del mes, "Lo que viene" y suscribirse, movidos del
 * inicio sin cambiar cómo andan (los armadores ya los cubre portalPagina).
 * Acá se ata la página y que la caché de eventos se comparte.
 */
const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const pagina = leer('public/calendario.html');
const portal = leer('src/ui/portal.js');
const vercel = JSON.parse(leer('vercel.json'));
const cuerpoDe = (nombre) => {
  const desde = portal.indexOf(`export async function ${nombre}(`);
  assert.ok(desde >= 0, `falta ${nombre}`);
  return portal.slice(desde, portal.indexOf('\n}\n', desde));
};

test('la página: sección con h1, "Lo que viene" y la grilla, oculta hasta saber si hay calendario; su arranque', () => {
  const seccion = pagina.match(/<section [^>]*id="calendario"[\s\S]*?<\/section>/)[0];
  assert.match(seccion.split('>')[0], /\bhidden\b/);
  assert.match(seccion, /<h1 id="t-calendario">Calendario<\/h1>/);
  assert.match(seccion, /<div id="portal-proximo"><\/div>\s*<div id="portal-calendario"><\/div>/);
  assert.match(pagina, /<script type="module" src="\/src\/ui\/calendarioArranque\.js"><\/script>/);
});

test('la página arma una sola agenda y la comparten la grilla, "Lo que viene" y el botón iPhone', () => {
  const cuerpo = cuerpoDe('iniciarPaginaCalendario');
  assert.equal((cuerpo.match(/crearAgenda\(/g) ?? []).length, 1);
  assert.match(cuerpo, /cablearIcs\(\$\('calendario'\), agenda\)/);
  assert.match(cuerpo, /iniciarCalendario\(agenda\)/);
  assert.match(cuerpo, /mostrarProximo\(agenda\)/);
});

test('vercel.json: /calendario sirve su página y no se guarda en caché', () => {
  assert.ok(vercel.rewrites.some((r) => r.source === '/calendario' && r.destination === '/public/calendario.html'));
  for (const ruta of ['/calendario', '/public/calendario.html']) {
    assert.equal(vercel.headers.filter((h) => h.source === ruta).flatMap((h) => h.headers).find((h) => h.key === 'Cache-Control')?.value, 'no-store', ruta);
  }
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `node --test tests/portalCalendario.test.js`
Expected: FAIL (`public/calendario.html` no existe).

- [ ] **Step 3: Partir el calendario en `src/ui/portal.js`**

Reemplazar la función `iniciarCalendario(calendarios)` entera por:

```js
/** Los eventos de Google por mes, con caché: los comparten la grilla y "Lo que viene". */
export function crearAgenda(calendarios) {
  const cache = new Map();
  async function traer(anio, mes) {
    const clave = `${anio}-${mes}`;
    if (!cache.has(clave)) {
      const { eventos, fallidos } = await eventosDelMes(calendarios, PORTAL.agenda.clave, anio, mes);
      cache.set(clave, { porDia: eventosPorDia(eventos), fallidos });
    }
    return cache.get(clave);
  }
  return {
    calendarios,
    traer,
    yaTraido: (anio, mes) => cache.has(`${anio}-${mes}`),
    // El botón "iPhone" busca su evento en todos los meses ya traídos: "Lo que viene" puede ser de otro mes que la grilla.
    eventos: () => [...cache.values()].flatMap((c) => [...c.porDia.values()].flat()),
  };
}

/**
 * "Lo que viene": el próximo desde hoy. Si en lo que queda del mes no hay
 * nada, lo busca en el mes siguiente (a fin de mes, el próximo partido suele
 * caer ahí). Devuelve si encontró algo, para mostrar u ocultar su sección.
 */
async function mostrarProximo(agenda) {
  const hoy = hoyEnRosario();
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  let [proximo] = proximosEventos((await agenda.traer(anio, mes)).porDia, hoy, 1);
  if (!proximo) {
    const sig = mesVecino(anio, mes, 1);
    [proximo] = proximosEventos((await agenda.traer(sig.anio, sig.mes)).porDia, hoy, 1);
  }
  const contenido = htmlProximo(proximo, hoy).toString();
  $('portal-proximo').innerHTML = contenido;
  return Boolean(contenido);
}

/** El botón "iPhone" de cualquier evento de la sección baja su .ics. */
function cablearIcs(seccion, agenda) {
  seccion.addEventListener('click', (ev) => {
    const ics = ev.target.closest('[data-ics]');
    if (!ics) return;
    const evento = agenda.eventos().find((e) => claveEvento(e) === ics.dataset.ics);
    if (evento) bajarIcs(evento);
  });
}

/** La grilla del mes: elegir un día y pasar de mes. */
function iniciarCalendario(agenda) {
  const hoy = hoyEnRosario();
  const estado = { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)), elegido: hoy, hoy, porDia: new Map(), fallidos: 0, cargando: true };
  const pintar = () => { $('portal-calendario').innerHTML = htmlCalendario(estado, agenda.calendarios); };

  async function cargar(anio, mes) {
    const yaEsta = agenda.yaTraido(anio, mes);
    Object.assign(estado, { anio, mes, cargando: !yaEsta });
    if (!yaEsta) {
      estado.porDia = new Map();
      estado.elegido = diaInicial(anio, mes, hoy, estado.porDia);
      pintar();
    }
    const datos = await agenda.traer(anio, mes);
    // Si mientras tanto la persona pasó a otro mes, este resultado queda guardado y no se pinta.
    if (estado.anio !== anio || estado.mes !== mes) return;
    Object.assign(estado, datos, { cargando: false });
    estado.elegido = diaInicial(anio, mes, hoy, estado.porDia);
    pintar();
  }

  $('portal-calendario').addEventListener('click', (ev) => {
    const dia = ev.target.closest('[data-dia]');
    if (dia) {
      estado.elegido = dia.dataset.dia;
      pintar();
      return;
    }
    const nav = ev.target.closest('[data-mes]');
    if (nav) {
      const { anio, mes } = mesVecino(estado.anio, estado.mes, Number(nav.dataset.mes));
      cargar(anio, mes);
    }
  });
  return cargar(estado.anio, estado.mes);
}

/** /calendario: la grilla, "Lo que viene" y suscribirse. */
export async function iniciarPaginaCalendario() {
  const marco = iniciarMarco();
  const calendarios = calendariosActivos(PORTAL.agenda);
  $('calendario').hidden = !calendarios.length;
  $('calendario-sin').hidden = calendarios.length > 0;
  if (calendarios.length) {
    const agenda = crearAgenda(calendarios);
    cablearIcs($('calendario'), agenda);
    iniciarCalendario(agenda).then(() => mostrarProximo(agenda));
  }
  await marco;
}
```

En `iniciarPortal`, mientras tanto (hasta la Task 8), la línea `if (calendarios.length) iniciarCalendario(calendarios);` pasa a:

```js
  if (calendarios.length) {
    const agenda = crearAgenda(calendarios);
    cablearIcs($('calendario'), agenda);
    iniciarCalendario(agenda).then(() => mostrarProximo(agenda));
  }
```

- [ ] **Step 4: Página y arranque**

Crear `src/ui/calendarioArranque.js` con `iniciarPaginaCalendario`, como los anteriores.

Crear `public/calendario.html` copiando la plantilla de la Task 5. Lo **[propio]**:
- `<title>Calendario · Básquet Newell&#39;s</title>` y `og:title` `Calendario · Básquet Newell's`.
- `description` y `og:description`: `Calendario del básquet formativo de Newell's: partidos, eventos y charlas, para agregar a tu celular.`
- `canonical` y `og:url`: `https://app-semillero.vercel.app/calendario`.
- Script: `/src/ui/calendarioArranque.js`.
- `<main>`:

```html
  <main class="portal">
    <section class="portal-sec" id="calendario" aria-labelledby="t-calendario" hidden>
      <div class="portal-st">Agenda del club</div>
      <h1 id="t-calendario">Calendario</h1>
      <p class="intro">Partidos, eventos y charlas. Tocá un día para ver qué hay.</p>
      <div id="portal-proximo"></div>
      <div id="portal-calendario"></div>
    </section>

    <!-- Sólo si src/data/portal.js no tiene un calendario válido (clave o ID mal pegados). -->
    <section class="portal-sec" id="calendario-sin" aria-labelledby="t-calendario-sin" hidden>
      <h1 id="t-calendario-sin">Calendario</h1>
      <p class="intro">El calendario no está disponible en este momento.</p>
    </section>
  </main>
```

En `vercel.json`, el rewrite `/calendario` → `/public/calendario.html` y las dos cabeceras `no-store`.

- [ ] **Step 5: Actualizar el test de la guarda en `tests/portalPagina.test.js`**

Reemplazar el cuerpo del test `'el inicio no pide nada si la URL es la vuelta de un login: esos links van a /app'` por:

```js
  // El cliente de Supabase canjearía el ?code= o el #access_token en esta página.
  // La lectura de formularios la guarda el marco (tests/portalMarco.test.js).
  const desde = portal.indexOf('export async function iniciarPortal(');
  const cuerpo = portal.slice(desde, portal.indexOf('\n}\n', desde));
  const guarda = cuerpo.indexOf('destinoDeAuth(window.location.search, window.location.hash)');
  assert.ok(guarda > 0 && guarda < cuerpo.indexOf('crearAgenda('), 'la guarda va antes de pedir el calendario');
  assert.ok(cuerpo.indexOf('iniciarMarco()') < guarda, 'el marco arranca antes (completa el pie aunque no lea la base)');
```

- [ ] **Step 6: Correr la suite**

Run: `npm run test:q`
Expected: PASS. Los tests del calendario de `portalPagina` (grilla, día, "Lo que viene", suscripción) no cambian.

- [ ] **Step 7: Verificar en el navegador**

Run: `npm run servir` → `http://localhost:5174/calendario`, y también `/`.
Expected: en las dos se ven la grilla del mes, los puntitos por evento, el día elegido y "Lo que viene". Pasar de mes anda. "iPhone" baja un `.ics` (también el de "Lo que viene" cuando es de otro mes). "Android o compu" abre Google.

- [ ] **Step 8: Commit**

```bash
git add src/ui/portal.js public/calendario.html src/ui/calendarioArranque.js tests/portalCalendario.test.js tests/portalPagina.test.js vercel.json
git commit -m "feat(portal): página de Calendario con la agenda compartida" -m "Test cambiado a propósito en portalPagina: la guarda de login se mide contra crearAgenda, porque iniciarCalendario ahora recibe la agenda."
```

---

### Task 8: Inicio rediseñado

El inicio queda como el resumen de todo (spec, "Páginas → Inicio"): hero → últimas noticias (slot oculto, se completa en la Task 13) → "Lo que viene" → buscador de categorías → recaudación → colaborar → otros formularios → "¿Dudas?" → foto → sponsors. Se van la fila de atajos (la navegación la reemplaza), la grilla del calendario y la lista plegada de categorías (las dos tienen página propia). Las anclas viejas redirigen.

**Files:**
- Modify: `public/portal.html` (`<main>` nuevo)
- Modify: `src/ui/portal.js` (`iniciarPortal`, `pintarFormularios` a nivel de módulo; salen `htmlAtajos`, `htmlCategorias` y los íconos sin uso)
- Modify: `public/css/publico.css`, `public/css/layout.css` (salen las reglas `.portal-atajos*`, `.portal-todas*` y `.portal-cats*`)
- Modify: `tests/portalPagina.test.js`. Cambian **a propósito**: el orden de las secciones, cuáles arrancan ocultas, "sin datos, cada parte no devuelve nada" (sale `htmlCategorias`), y se borran "atajos: …" y "categorías: nombre, rama, años y horario, escapados" (sus funciones ya no existen).

**Interfaces:**
- Consume: `paginaDeAncla` (Task 4), `iniciarMarco`, `esconderBarraMientrasSeVea`, `crearAgenda`, `mostrarProximo`, `cablearIcs` (Task 7), `iniciarBuscador(temporada, hrefDe)` (Task 6).
- Produce: el `<main>` del inicio con `#noticias` (oculta, contenedor `#portal-noticias`), que completa la Task 13.

- [ ] **Step 1: Actualizar los tests primero (van a fallar)**

En `tests/portalPagina.test.js`:

1. Sacar `htmlAtajos` y `htmlCategorias` del import.
2. Reemplazar el test `'arriba de todo, la banda con las dos acciones; después el resto, en orden'` por:

```js
test('el inicio es el resumen de todo: hero, noticias, lo que viene, categorías, recaudación, colaborar, formularios, dudas, club y sponsors', () => {
  const orden = ['heroe', 'noticias', 'proximo', 'categorias', 'recaudacion', 'colaborar', 'formularios', 'dudas', 'club', 'sponsors'];
  const posiciones = orden.map((id) => pagina.search(new RegExp(`<section [^>]*id="${id}"`)));
  assert.ok(posiciones.every((p) => p > 0), `faltan secciones: ${posiciones}`);
  assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, 'las secciones están desordenadas');
  assert.match(seccion('heroe'), /<h1>/, 'el h1 de la página está en la banda');
  assert.doesNotMatch(pagina, /portal-atajos|id="portal-calendario"|portal-todas/, 'atajos, grilla y lista plegada tienen página propia');
});
```

3. Reemplazar `'las secciones que dependen de datos arrancan ocultas; la banda, recaudación y colaborar se ven siempre'` por:

```js
test('las secciones que dependen de datos arrancan ocultas; la banda, recaudación, colaborar y dudas se ven siempre', () => {
  for (const id of ['noticias', 'proximo', 'categorias', 'formularios', 'club', 'sponsors']) {
    assert.match(seccion(id).split('>')[0], /\bhidden\b/, `#${id} tiene que arrancar oculta`);
  }
  for (const id of ['heroe', 'recaudacion', 'colaborar', 'dudas']) {
    assert.doesNotMatch(seccion(id).split('>')[0], /\bhidden\b/, `#${id} se ve siempre`);
  }
});

test('cada resumen lleva a su página', () => {
  assert.match(seccion('noticias'), /<a class="portal-ver" href="\/noticias">Ver todas →<\/a>/);
  assert.match(seccion('proximo'), /<a class="portal-ver" href="\/calendario">Ver el calendario completo →<\/a>/);
  assert.match(seccion('categorias'), /<a class="portal-ver" href="\/categorias">Ver todas las categorías →<\/a>/);
  assert.match(seccion('dudas'), /<a class="btn sec" href="\/ayuda">Ver la ayuda<\/a>/);
});

test('un link viejo (/#ayuda) redirige antes de pintar nada', () => {
  const desde = portal.indexOf('export async function iniciarPortal(');
  const cuerpo = portal.slice(desde, portal.indexOf('\n}\n', desde));
  const redirige = cuerpo.indexOf('paginaDeAncla(window.location.hash)');
  assert.ok(redirige > 0 && redirige < cuerpo.indexOf('mostrar('), 'la redirección va primero');
  assert.match(cuerpo, /window\.location\.replace\(pagina\)/);
});
```

4. En `'sin datos, cada parte no devuelve nada (la sección queda oculta)'`, borrar la línea de `htmlCategorias([])`.
5. Borrar los tests `'atajos: con menos de dos no hay fila; el de ayuda abre afuera'` y `'categorías: nombre, rama, años y horario, escapados'`.

Run: `node --test tests/portalPagina.test.js`
Expected: FAIL (el HTML todavía es el viejo).

- [ ] **Step 2: `<main>` nuevo en `public/portal.html`**

Reemplazar todo lo que hay entre `<main class="portal">` y `</main>` por lo siguiente. Las secciones `recaudacion`, `colaborar`, `formularios`, `club` y `sponsors` se copian **tal cual** del archivo actual, con sus comentarios.

```html
  <main class="portal">
    <!-- El hero: la banda roja y negra (la camiseta) con el título de la
         página y las dos tarjetas protagonistas (src/ui/portal.js, htmlHeroe):
         inscribir (o "Quiero jugar" si la inscripción está cerrada) y enviar
         el comprobante, con el alias. Tiene que entrar entero en el primer
         pantallazo de un celular. Arranca con todo cerrado hasta que responde
         la base. -->
    <section class="portal-heroe" id="heroe" aria-label="Básquet formativo de Newell's">
      <div id="portal-heroe"><div class="portal-heroe-ey">Formativas · Rosario</div><h1>Básquet formativo de Newell&#39;s</h1></div>
    </section>

    <!-- Las últimas 3 noticias (src/ui/portalNoticias.js). Sin noticias, o
         sin la migración 0064 en la base, queda oculta. -->
    <section class="portal-papel" id="noticias" aria-labelledby="t-noticias" hidden>
      <div class="portal-papel-cab"><div><div class="portal-st">Noticias</div><h2 id="t-noticias">Lo último del básquet</h2></div><a class="portal-ver" href="/noticias">Ver todas →</a></div>
      <div id="portal-noticias"></div>
    </section>

    <!-- El próximo evento del calendario; la grilla entera está en /calendario. -->
    <section class="portal-sec" id="proximo" aria-labelledby="t-proximo" hidden>
      <div class="portal-st">Agenda del club</div>
      <h2 id="t-proximo">Calendario</h2>
      <div id="portal-proximo"></div>
      <a class="portal-ver" href="/calendario">Ver el calendario completo →</a>
    </section>

    <!-- Elegís el año de nacimiento y al lado te dice la categoría y el
         horario. El detalle de cada una está en /categorias. -->
    <section class="portal-sec portal-cat" id="categorias" aria-labelledby="t-categorias" hidden>
      <div class="portal-st">Categorías<span id="t-categorias-temp"></span></div>
      <h2 id="t-categorias">¿En qué categoría juega?</h2>
      <div class="portal-buscador" id="portal-buscador"></div>
      <a class="portal-ver" href="/categorias">Ver todas las categorías →</a>
    </section>

    <!-- (sección recaudacion, tal cual) -->
    <!-- (sección colaborar, tal cual) -->
    <!-- (sección formularios, tal cual) -->

    <section class="portal-sec" id="dudas" aria-label="Ayuda">
      <div class="portal-dudas"><div><b>¿Dudas?</b><span>Preguntas frecuentes, la sede y el alias para transferir.</span></div><a class="btn sec" href="/ayuda">Ver la ayuda</a></div>
    </section>

    <!-- (sección club, tal cual) -->
    <!-- (sección sponsors, tal cual) -->
  </main>
```

Actualizar también el comentario grande de arriba del `<div class="publico portal-d">`: el portal ahora tiene cinco páginas, y este archivo es el inicio.

- [ ] **Step 3: `iniciarPortal` final (`src/ui/portal.js`)**

- Sacar `htmlAtajos`, `htmlCategorias` y los íconos que sólo usaban los atajos (`calendario`, `categorias`, `colaborar`, `ayuda`). Quedan `jugar`, `inscribir`, `comprobante`, `empresa` y `mano`. Verificar con `grep -n "ICONO\." src/ui/portal.js`.
- Importar `paginaDeAncla` de `../data/portal.js`.
- `pintarFormularios` pasa a ser una función de módulo:

```js
/** Lo del inicio que depende de los formularios. Sin argumentos, todo cerrado. */
function pintarFormularios({ inscripcion = null, comprobante = null, consultas = null, colaboradores = null, recaudacion = null } = {}) {
  $('portal-heroe').innerHTML = htmlHeroe({ inscripcion, consultas, comprobante, temporada: PORTAL.temporada, alias: PORTAL.alias });
  $('portal-recaudacion').innerHTML = htmlRecaudacion(recaudacion);
  $('portal-colaborar').innerHTML = htmlColaborar(colaboradores);
}
```

- `iniciarPortal` entera:

```js
export async function iniciarPortal() {
  // Un link viejo de cuando todo era una página (/#ayuda, /#categorias, /#calendario) va a su página nueva.
  const pagina = paginaDeAncla(window.location.hash);
  if (pagina) {
    window.location.replace(pagina);
    return;
  }

  const temporada = temporadaComoAnio(PORTAL.temporada);
  const categorias = categoriasDelPortal(PORTAL.categorias, PORTAL.temporada);
  $('categorias').hidden = !(temporada && categorias.length);
  if (temporada) $('t-categorias-temp').textContent = ` ${temporada}`;
  if (temporada && categorias.length) iniciarBuscador(temporada, (c) => `/categorias#${c.ancla}`);
  mostrar('club', htmlFoto(PORTAL.foto), 'portal-foto');
  mostrar('sponsors', htmlLogos(PORTAL.sponsors), 'portal-logos');

  // Hasta que responda la base, todo cerrado: nunca un botón a un formulario que quizá ya no está.
  pintarFormularios();
  esconderBarraMientrasSeVea($('portal-heroe'));
  const marco = iniciarMarco();

  // Si la URL es la vuelta de un login, portalEntrada.js ya está mandando a la
  // persona a /app: acá no se pide nada más (el marco tampoco lee la base).
  if (destinoDeAuth(window.location.search, window.location.hash)) return;

  const calendarios = calendariosActivos(PORTAL.agenda);
  if (calendarios.length) {
    const agenda = crearAgenda(calendarios);
    cablearIcs($('proximo'), agenda);
    mostrarProximo(agenda).then((hay) => { $('proximo').hidden = !hay; }, () => {});
  }

  const datos = await marco;
  if (!datos) return;
  // Los que tienen lugar propio (la banda, recaudación, colaborar) no se repiten en "Otros formularios".
  const { estado, inscripcion, comprobante, consultas, colaboradores, recaudacion, comunes } = datos;
  pintarFormularios({ inscripcion, comprobante, consultas, colaboradores, recaudacion });

  const lista = htmlFormularios(comunes);
  mostrar('formularios', lista.toString() ? html`${estado === 'respaldo' && htmlAvisoRespaldo()}${lista}` : lista);
}
```

`mostrarProximo` puede fallar por red: el segundo argumento de `then` deja la sección oculta y no ensucia la consola.

- [ ] **Step 4: Sacar el CSS que quedó sin uso**

- `public/css/publico.css`: borrar las reglas cuyo selector empieza con `.portal-atajos`, `.portal-todas` o `.portal-cats` (hoy, líneas ~368–379 y ~505–518).
- `public/css/layout.css`: borrar las líneas `.publico .portal-atajos{…}`, `.publico .portal-atajos a{…}` y las cuatro `.publico .portal-cats…`. En la línea `.publico .portal-barra,.publico .portal-atajos,.publico .portal-sec{padding-inline:var(--sp-6)}` sacar **sólo** `.publico .portal-atajos,`.
- Verificar: `grep -rn "portal-atajos\|portal-todas\|portal-cats\b" public src` no devuelve nada (`portal-cat-` con guion sigue existiendo y está bien).

- [ ] **Step 5: Correr la suite**

Run: `npm run test:q`
Expected: PASS.

- [ ] **Step 6: Verificar el primer pantallazo**

Run: `npm run servir` → `http://localhost:5174/` en 360×640, en 320×568 y con zoom de texto al 130 % (DevTools → Rendering, o la configuración del navegador).
Expected: el título y **las dos tarjetas enteras** (con el alias) se ven sin scrollear. Si en 320×568 la segunda tarjeta queda cortada, sumar al final de `public/css/layout.css`:

```css
/* Celulares bajitos: las dos acciones primero; la bajada del hero es lo que sobra. */
@media (max-width:39.99rem) and (max-height:600px){
  .publico .portal-heroe-bajada{display:none}
}
```

y volver a mirar. Después, scrollear: la barra aparece apenas salen las tarjetas. `http://localhost:5174/#ayuda` lleva a `/ayuda`, y `/#categorias` y `/#calendario` a sus páginas. "Lo que viene" se ve si hay eventos; "Ver el calendario completo" lleva a `/calendario`. El buscador de categorías tiene "Ver horarios y sede de …", que lleva a `/categorias#…` ya bajado. La sección de noticias **no** se ve (todavía no hay nada que la complete). Guardar capturas de 320×568 y 360×640 para el revisor.

- [ ] **Step 7: Commit**

```bash
git add public/portal.html src/ui/portal.js public/css/publico.css public/css/layout.css tests/portalPagina.test.js
git commit -m "feat(portal): el inicio como resumen de todo, con redirección de los links viejos" -m "Tests cambiados a propósito en portalPagina: orden y visibilidad de las secciones del inicio; se borran los de atajos y de la lista de categorías porque esas funciones se fueron (la navegación y /categorias las reemplazan)."
```

---

### Task 9: Consistencia de las páginas, sitemap y SEO

Las páginas son HTML escrito a mano con bloques copiados. Este test es el que avisa cuando una copia se separa, o cuando a una página le falta su rewrite, su caché o el import map exacto.

**Files:**
- Create: `tests/paginasPortal.test.js`
- Modify: `public/sitemap.xml`

**Interfaces:**
- Consume: `PAGINAS_PORTAL` (Task 4) y los HTML de las Tasks 4–8.
- Produce: la constante `PAGINAS` del test, a la que la Task 13 le suma `/noticias`.

- [ ] **Step 1: Escribir el test**

Crear `tests/paginasPortal.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PAGINAS_PORTAL } from '../src/data/portal.js';

/**
 * Las páginas del portal son HTML escrito a mano: encabezado, barra y pie
 * están copiados en cada una (así se ven sin JS). Este test avisa si una
 * copia se separa de las otras, o si a una página le falta su rewrite, su
 * Cache-Control o el import map exacto (sin él, en producción queda sin datos
 * y en local anda igual: la CSP la pone Vercel).
 */
const PAGINAS = {
  '/': 'public/portal.html',
  '/categorias': 'public/categorias.html',
  '/calendario': 'public/calendario.html',
  '/ayuda': 'public/ayuda.html',
  // La Task 13 suma '/noticias': 'public/noticias.html'.
};

const leer = (r) => readFileSync(r, 'utf8').replace(/\r\n/g, '\n');
const html = Object.fromEntries(Object.entries(PAGINAS).map(([ruta, archivo]) => [ruta, leer(archivo)]));
const vercel = JSON.parse(leer('vercel.json'));
const sitemap = leer('public/sitemap.xml');
const bloque = (texto, re) => texto.match(re)?.[0] ?? null;
const IMPORT_MAP = /<script type="importmap">[\s\S]*?<\/script>/;
const ENCABEZADO = /<header class="portal-barra">[\s\S]*?<\/header>/;
const BARRA = '<div class="portal-acc-barra" id="portal-acc-barra" hidden></div>';
const PIE = /<footer class="portal-pie">[\s\S]*?<\/footer>/;
const SITIO = 'https://app-semillero.vercel.app';
const cache = (ruta) => vercel.headers.filter((h) => h.source === ruta).flatMap((h) => h.headers).find((h) => h.key === 'Cache-Control')?.value;
const meta = (t, atributo, nombre) => t.match(new RegExp(`<meta ${atributo}="${nombre}" content="([^"]*)">`))?.[1] ?? null;

test('cada página lleva el import map de la app letra por letra, antes de los módulos, y config.js', () => {
  const app = bloque(leer('public/index.html'), IMPORT_MAP);
  for (const [ruta, t] of Object.entries(html)) {
    assert.equal(bloque(t, IMPORT_MAP), app, `${ruta}: import map distinto (cambia el hash de la CSP)`);
    assert.ok(t.indexOf('type="importmap"') < t.indexOf('type="module"'), `${ruta}: el import map va antes`);
    assert.match(t, /<script src="\/public\/config\.js"><\/script>/, ruta);
  }
});

test('ninguna página tiene script inline aparte del import map, ni manifest, ni service worker, ni iframe', () => {
  for (const [ruta, t] of Object.entries(html)) {
    const inline = [...t.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !/type="importmap"/.test(m[1]));
    assert.deepEqual(inline.map((m) => m[0]), [], ruta);
    assert.doesNotMatch(t, /rel="manifest"|serviceWorker|<iframe/, ruta);
  }
});

test('encabezado, barra y pie idénticos en todas las páginas', () => {
  const ref = html['/'];
  for (const [ruta, t] of Object.entries(html)) {
    assert.equal(bloque(t, ENCABEZADO), bloque(ref, ENCABEZADO), `${ruta}: encabezado distinto del de /`);
    assert.ok(t.includes(BARRA), `${ruta}: falta la barra de acciones`);
    assert.equal(bloque(t, PIE), bloque(ref, PIE), `${ruta}: pie distinto del de /`);
  }
});

test('la navegación del encabezado y la del pie son PAGINAS_PORTAL, en orden', () => {
  const links = (t) => [...t.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);
  const esperado = PAGINAS_PORTAL.map((p) => [p.href, p.texto]);
  assert.deepEqual(links(bloque(html['/'], /<nav class="portal-nav"[\s\S]*?<\/nav>/)), esperado);
  assert.deepEqual(links(bloque(html['/'], /<nav class="portal-pie-nav"[\s\S]*?<\/nav>/)), esperado);
});

test('cada página tiene su rewrite y no-store en la ruta y en el .html', () => {
  for (const [ruta, archivo] of Object.entries(PAGINAS)) {
    assert.ok(vercel.rewrites.some((r) => r.source === ruta && r.destination === `/${archivo}`), `${ruta}: falta el rewrite`);
    assert.equal(cache(ruta), 'no-store', ruta);
    assert.equal(cache(`/${archivo}`), 'no-store', `/${archivo}`);
  }
});

test('cada página está en el sitemap', () => {
  for (const ruta of Object.keys(PAGINAS)) assert.ok(sitemap.includes(`<loc>${SITIO}${ruta}</loc>`), ruta);
});

test('cada página tiene title, description, canonical y og:url propios', () => {
  const titulos = new Set();
  for (const [ruta, t] of Object.entries(html)) {
    const titulo = t.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(titulo && !titulos.has(titulo), `${ruta}: title vacío o repetido`);
    titulos.add(titulo);
    assert.ok(meta(t, 'name', 'description'), `${ruta}: falta description`);
    assert.match(t, new RegExp(`<link rel="canonical" href="${SITIO}${ruta}">`), ruta);
    assert.equal(meta(t, 'property', 'og:url'), `${SITIO}${ruta}`, ruta);
  }
});

test('sólo "/" lleva portalEntrada.js (los mails de login apuntan ahí), y es su primer módulo', () => {
  for (const [ruta, t] of Object.entries(html)) {
    const modulos = [...t.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map((m) => m[1]);
    if (ruta === '/') assert.equal(modulos[0], '/src/ui/portalEntrada.js');
    else assert.ok(!modulos.includes('/src/ui/portalEntrada.js'), ruta);
  }
});

test('cada página carga portal.css y un arranque que existe', () => {
  for (const [ruta, t] of Object.entries(html)) {
    assert.match(t, /<link rel="stylesheet" href="\/public\/css\/portal\.css">/, ruta);
    const arranque = [...t.matchAll(/<script type="module" src="\/(src\/ui\/\w+Arranque\.js)"><\/script>/g)].map((m) => m[1]);
    assert.equal(arranque.length, 1, `${ruta}: un arranque`);
    assert.ok(existsSync(arranque[0]), `${ruta}: falta ${arranque[0]}`);
  }
});

test('ninguna página ni el código del portal dice "Próximamente"', () => {
  const codigo = ['src/ui/portal.js', 'src/ui/portalMarco.js'].map(leer);
  for (const t of [...Object.values(html), ...codigo]) assert.doesNotMatch(t, /Próximamente/i);
});

test('los módulos del portal sólo piden datos por el repositorio', () => {
  for (const archivo of ['src/ui/portal.js', 'src/ui/portalMarco.js', ...Object.values(html).flatMap((t) => [...t.matchAll(/src="\/(src\/ui\/\w+\.js)"/g)].map((m) => m[1]))]) {
    const codigo = leer(archivo);
    const imports = [...codigo.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(imports.filter((i) => /repos\/|cliente|supabase/.test(i)), [], archivo);
    assert.doesNotMatch(codigo, /\bfetch\s*\(/, archivo);
  }
});
```

- [ ] **Step 2: Correrlo y ver qué falla**

Run: `node --test tests/paginasPortal.test.js`
Expected: FAIL en "cada página está en el sitemap" (todavía no están). Si falla cualquier otro, es un error de copia de las Tasks 4–8: **corregir el HTML, no el test**.

- [ ] **Step 3: Sitemap**

En `public/sitemap.xml`, después de la `<url>` de `/`:

```xml
  <url>
    <loc>https://app-semillero.vercel.app/categorias</loc>
  </url>
  <url>
    <loc>https://app-semillero.vercel.app/calendario</loc>
  </url>
  <url>
    <loc>https://app-semillero.vercel.app/ayuda</loc>
  </url>
```

y actualizar el comentario de arriba: las páginas públicas son el portal (inicio, categorías, calendario, ayuda y, desde la Task 13, noticias), Semillero en `/app` y las legales.

- [ ] **Step 4: Correr la suite**

Run: `npm run test:q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/paginasPortal.test.js public/sitemap.xml
git commit -m "test(portal): las páginas del portal no se separan (import map, encabezado, pie, rewrites, sitemap)"
```

---

### Task 10: Migración 0064 — noticias (Opus, skill `/nueva-migracion`)

**Usar el modelo Opus para esta task** (CLAUDE.md: migraciones y RLS). La migración **no se aplica** a ninguna base (no hay Supabase local y no hay `db push`): se valida con tests de contrato que leen el SQL. `tests/verificarNoticias.sql` y `tests/rollback0064.sql` quedan escritos para cuando se aplique en la base real.

**Files:**
- Create: `supabase/migrations/0064_noticias.sql`
- Create: `tests/contratoNoticia.test.js`
- Create: `tests/rollback0064.sql`
- Create: `tests/verificarNoticias.sql`
- Modify: `src/data/limites.js` (`tituloNoticia`, `resumenNoticia`, `cuerpoNoticia`, `altFoto`; tres entradas en `LIMITES_POR_COLUMNA`)
- Modify: `tests/contratoLimites.test.js` (sumar `0064_noticias.sql` a `TABLAS_NUEVAS`)
- Modify: `supabase/ESQUEMA.md`

**Interfaces:**
- Produce (SQL, lo consume la Task 12):
  - Tabla `noticia`: `id uuid`, `club_id uuid`, `titulo text`, `resumen text`, `cuerpo text`, `etiqueta text` ∈ {`club`, `partidos`, `eventos`, `inscripcion`}, `fotos jsonb` (array de hasta 6 `{ "ruta": text, "alt": text }`), `autorizacion_imagen boolean`, `publicada boolean`, `publicada_en timestamptz`, `creado_por`, `creado_en`, `actualizado_por`, `actualizado_en`.
  - `noticias_publicas(p_club uuid, p_limite integer default 12, p_antes timestamptz default null)` → `(id, titulo, resumen, etiqueta, foto jsonb, publicada_en)`.
  - `noticia_publica(p_club uuid, p_id uuid)` → `(id, titulo, resumen, cuerpo, etiqueta, fotos jsonb, publicada_en)`.
  - Bucket `noticias`: público, 1 MB por archivo, `image/webp` e `image/jpeg`. Rutas `<club_id>/<noticia_id>/<uuid>.(webp|jpg)`.
- Produce (JS): `LIMITE.tituloNoticia = 120`, `LIMITE.resumenNoticia = 200`, `LIMITE.cuerpoNoticia = 8000`, `LIMITE.altFoto = 150`.

- [ ] **Step 1: Límites en `src/data/limites.js`**

En `LIMITE`, después de `textoFormulario`:

```js
  // Noticias del portal (0064): el título y el resumen van en la tarjeta, el
  // cuerpo es la nota entera. altFoto es la descripción de cada foto (qué se
  // ve, sin nombres de chicos): vive dentro del jsonb `fotos`, así que la
  // compara tests/contratoNoticia.test.js y no contratoLimites.
  tituloNoticia: 120,
  resumenNoticia: 200,
  cuerpoNoticia: 8000,
  altFoto: 150,
```

En `LIMITES_POR_COLUMNA`, al final:

```js
  'noticia.titulo': LIMITE.tituloNoticia,
  'noticia.resumen': LIMITE.resumenNoticia,
  'noticia.cuerpo': LIMITE.cuerpoNoticia,
```

y sumar `0064` a la lista del comentario de `LIMITES_POR_COLUMNA`. En `tests/contratoLimites.test.js`, sumar `'0064_noticias.sql'` al final de `TABLAS_NUEVAS`.

Run: `node --test tests/contratoLimites.test.js`
Expected: FAIL con `ENOENT … 0064_noticias.sql`.

- [ ] **Step 2: Escribir el test de contrato que falla**

Crear `tests/contratoNoticia.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIMITE } from '../src/data/limites.js';

/**
 * 0064 le da al visitante sin sesión las noticias publicadas del club, con
 * fotos en un bucket público. Como 0058, lo mínimo: anon no recibe nada sobre
 * la tabla, sólo `execute` de dos funciones que devuelven filas publicadas.
 * Este test lee la migración y falla si eso se afloja, o si una regla que vive
 * en SQL y en JS (etiquetas, cantidad de fotos, largo del alt, tamaño y tipos
 * de archivo) se separa. Las constantes de JS las suma src/data/noticias.js
 * (Task 11): hasta entonces, sólo corren los tests de seguridad.
 * Spec: docs/superpowers/specs/2026-10-21-portal-multipagina-design.md.
 */
const sql = readFileSync('supabase/migrations/0064_noticias.sql', 'utf8').replace(/\r\n/g, '\n');
const codigo = sql.replace(/--.*$/gm, '');
const plano = (s) => s.replace(/\s+/g, ' ').trim();

function cuerpoDe(nombre) {
  const desde = codigo.indexOf(`create function ${nombre}(`);
  assert.ok(desde >= 0, `no encontré "create function ${nombre}("`);
  return codigo.slice(desde, codigo.indexOf('\n$fn$;', desde));
}

test('los grants sobre noticia son exactamente estos, por columna', () => {
  const grants = [...codigo.matchAll(/grant\s+(select|insert|update|delete|all|truncate|references|trigger)\b[^;]*\bon\s+noticia\b[^;]*;/gi)].map((m) => plano(m[0]));
  assert.deepEqual(grants, [
    'grant select on noticia to authenticated;',
    'grant insert (id, club_id, titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen, publicada) on noticia to authenticated;',
    'grant update (titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen, publicada) on noticia to authenticated;',
    'grant delete on noticia to authenticated;',
  ]);
  assert.match(codigo, /revoke\s+all\s+on\s+noticia\s+from\s+anon,\s*authenticated;/i);
});

test('anon sólo ejecuta las dos funciones públicas', () => {
  const aAnon = [...codigo.matchAll(/grant\s+[^;]*\bto\s+[^;]*\banon\b[^;]*;/gi)].map((m) => plano(m[0]));
  assert.deepEqual(aAnon, [
    'grant execute on function noticias_publicas(uuid, integer, timestamptz) to anon, authenticated;',
    'grant execute on function noticia_publica(uuid, uuid) to anon, authenticated;',
  ]);
  for (const f of ['fotos_de_noticia_validas(jsonb, uuid, uuid)', 'club_de_ruta_noticia(text)']) {
    assert.match(codigo, new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+${f.replace(/[()]/g, '\\$&')}\\s+from\\s+public,\\s*anon;`, 'i'), f);
  }
  assert.match(codigo, /revoke\s+execute\s+on\s+function\s+sellar_noticia\(\)\s+from\s+public,\s*anon,\s*authenticated;/i);
});

test('la tabla la leen, escriben y borran sólo los coordinadores del club', () => {
  const policies = [...codigo.matchAll(/create\s+policy\s+(\w+)\s+on\s+noticia\s+for\s+(\w+)([^;]*);/gi)];
  assert.deepEqual(policies.map((m) => m[2].toLowerCase()).sort(), ['delete', 'insert', 'select', 'update']);
  for (const m of policies) assert.match(m[3], /es_coordinador_de\(noticia\.club_id\)/, m[1]);
  assert.match(codigo, /alter table noticia enable row level security;/);
});

test('las fotos: suben, ven y borran sólo los coordinadores del club de la carpeta; sin update', () => {
  const policies = [...codigo.matchAll(/create\s+policy\s+(\w+)\s+on\s+storage\.objects\s+for\s+(\w+)\s+to\s+authenticated([^;]*);/gi)];
  assert.deepEqual(policies.map((m) => m[2].toLowerCase()).sort(), ['delete', 'insert', 'select']);
  for (const m of policies) {
    assert.match(m[3], /bucket_id = 'noticias'/, m[1]);
    assert.match(m[3], /public\.es_coordinador_de\(public\.club_de_ruta_noticia\(name\)\)/, m[1]);
  }
});

test('las funciones públicas devuelven sólo lo publicado del club pedido, sin autoría ni autorización', () => {
  for (const nombre of ['noticias_publicas', 'noticia_publica']) {
    const cuerpo = cuerpoDe(nombre);
    assert.match(cuerpo, /security definer/, nombre);
    assert.match(cuerpo, /set search_path = ''/, nombre);
    assert.match(cuerpo, /n\.club_id = p_club and/, nombre);
    assert.match(cuerpo, /\bn\.publicada\b/, nombre);
    assert.doesNotMatch(cuerpo, /creado_por|actualizado_por|autorizacion_imagen/, nombre);
  }
  assert.match(cuerpoDe('noticias_publicas'), /limit least\(greatest\(coalesce\(p_limite, 12\), 1\), 24\)/);
  assert.match(cuerpoDe('noticias_publicas'), /order by n\.publicada_en desc, n\.id/);
});

test('con fotos, la autorización de imagen es obligatoria (check de la base)', () => {
  assert.match(codigo, /constraint noticia_fotos_autorizadas check \(fotos = '\[\]'::jsonb or autorizacion_imagen\)/);
  assert.match(codigo, /constraint noticia_fotos_validas check \(fotos_de_noticia_validas\(fotos, club_id, id\)\)/);
});

test('la fecha de una noticia es la de su primera publicación, y la pone la base', () => {
  const cuerpo = cuerpoDe('sellar_noticia');
  assert.match(cuerpo, /if new\.publicada and new\.publicada_en is null then\s+new\.publicada_en := now\(\);/);
  assert.doesNotMatch(codigo, /grant[^;]*publicada_en/i, 'el cliente no la fija');
});

test('el largo de la descripción de cada foto es el de limites.js', () => {
  const m = cuerpoDe('fotos_de_noticia_validas').match(/char_length\(btrim\(coalesce\(f ->> 'alt', ''\)\)\) not between 1 and (\d+)/);
  assert.equal(Number(m?.[1]), LIMITE.altFoto);
});

// ---- Constantes que comparten SQL y JS (src/data/noticias.js, Task 11) ----

test('etiquetas, máximo de fotos, extensiones, tamaño y tipos del bucket: los mismos que src/data/noticias.js', async (t) => {
  let n;
  try {
    n = await import('../src/data/noticias.js');
  } catch {
    t.skip('src/data/noticias.js llega en la Task 11');
    return;
  }
  const etiquetas = codigo.match(/check \(etiqueta in \(([^)]*)\)\)/)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(etiquetas, n.ETIQUETAS_NOTICIA.map((e) => e.clave));
  assert.equal(Number(cuerpoDe('fotos_de_noticia_validas').match(/jsonb_array_length\(p_fotos\) <= (\d+)/)[1]), n.MAX_FOTOS);
  const extensiones = cuerpoDe('fotos_de_noticia_validas').match(/\\\.\(([\w|]+)\)\$/)[1].split('|');
  assert.deepEqual(extensiones.sort(), Object.values(n.TIPOS_FOTO_GUARDADA).sort());
  const bucket = codigo.match(/values \('noticias', 'noticias', true, (\d+), array\[([^\]]*)\]\)/);
  assert.equal(Number(bucket[1]), n.MAX_BYTES_FOTO);
  assert.deepEqual(bucket[2].match(/'([^']+)'/g).map((s) => s.slice(1, -1)).sort(), Object.keys(n.TIPOS_FOTO_GUARDADA).sort());
});
```

Run: `node --test tests/contratoNoticia.test.js`
Expected: FAIL con `ENOENT … 0064_noticias.sql`.

- [ ] **Step 3: Escribir `supabase/migrations/0064_noticias.sql`**

```sql
-- Noticias del portal del básquet, con fotos.
-- Spec: docs/superpowers/specs/2026-10-21-portal-multipagina-design.md (Noticias).
--
-- La coordinación escribe, publica, despublica y borra noticias desde el
-- panel. El portal (/ y /noticias) las lee sin sesión por dos funciones
-- security definer que devuelven sólo las publicadas: anon no recibe nada
-- sobre la tabla (mismo criterio que 0058).
--
-- Las fotos van al bucket público `noticias` de Storage, en
-- <club_id>/<noticia_id>/<uuid>.(webp|jpg). El navegador las achica antes de
-- subirlas (src/data/noticias.js). Suben, ven y borran sólo los coordinadores
-- del club de la carpeta. Una noticia con fotos exige la autorización de
-- imagen: en un club formativo, las fotos son de menores.
--
-- Sí se borra (a diferencia de formulario_portal): una noticia con un error o
-- una foto que no tenía que estar se tiene que poder sacar del todo.

/* ---------- Validación de las fotos (la usa un check) ---------- */

-- `fotos` es un array de hasta 6 objetos con exactamente `ruta` y `alt`. La
-- ruta tiene que ser de la carpeta de ESTA noticia de ESTE club: así una fila
-- no puede apuntar a la foto de otra noticia ni de otro club. El alt es qué se
-- ve en la foto (obligatorio, recortado, hasta 150). CASE y no AND: SQL no
-- garantiza el orden de evaluación, y jsonb_array_length de algo que no es un
-- array tira error en vez de dar false.
create function fotos_de_noticia_validas(p_fotos jsonb, p_club uuid, p_noticia uuid)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select case
    when p_fotos is null or jsonb_typeof(p_fotos) <> 'array' then false
    when jsonb_array_length(p_fotos) <= 6 then not exists (
      select 1 from jsonb_array_elements(p_fotos) as f
      where case
        when jsonb_typeof(f) <> 'object' then true
        else (select count(*) from jsonb_object_keys(f)) <> 2
          or coalesce(f ->> 'ruta', '') !~ ('^' || p_club::text || '/' || p_noticia::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$')
          or char_length(btrim(coalesce(f ->> 'alt', ''))) not between 1 and 150
          or (f ->> 'alt') <> btrim(f ->> 'alt')
      end
    )
    else false
  end;
$fn$;

revoke execute on function fotos_de_noticia_validas(jsonb, uuid, uuid) from public, anon;
grant execute on function fotos_de_noticia_validas(jsonb, uuid, uuid) to authenticated;

/* ---------- Tabla ---------- */

create table noticia (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  titulo text not null check (char_length(titulo) <= 120),
  -- La línea de la tarjeta.
  resumen text not null check (char_length(resumen) <= 200),
  -- Texto plano; los párrafos van separados por una línea en blanco. Sin HTML:
  -- la página lo escapa todo.
  cuerpo text not null check (char_length(cuerpo) <= 8000),
  etiqueta text not null,
  fotos jsonb not null default '[]'::jsonb,
  autorizacion_imagen boolean not null default false,
  publicada boolean not null default false,
  -- La fecha que se muestra: la de la primera publicación (la pone el trigger).
  publicada_en timestamptz,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid not null default auth.uid() references auth.users(id),
  actualizado_en timestamptz not null default now(),
  constraint noticia_titulo_recortado check (titulo = btrim(titulo) and titulo <> ''),
  constraint noticia_resumen_recortado check (resumen = btrim(resumen) and resumen <> ''),
  constraint noticia_cuerpo_recortado check (cuerpo = btrim(cuerpo) and cuerpo <> ''),
  constraint noticia_etiqueta check (etiqueta in ('club', 'partidos', 'eventos', 'inscripcion')),
  constraint noticia_fotos_validas check (fotos_de_noticia_validas(fotos, club_id, id)),
  constraint noticia_fotos_autorizadas check (fotos = '[]'::jsonb or autorizacion_imagen)
);

create index noticia_club_publicada_idx on noticia (club_id, publicada_en desc) where publicada;

-- Autoría del último cambio, como en 0026/0058. Además, la fecha de la
-- noticia es la de su primera publicación: despublicarla para corregir algo y
-- volver a publicarla no la sube arriba de todo.
create function sellar_noticia()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  if new.publicada and new.publicada_en is null then
    new.publicada_en := now();
  end if;
  return new;
end;
$fn$;

create trigger noticia_sellar
  before insert or update on noticia
  for each row execute function sellar_noticia();

revoke execute on function sellar_noticia() from public, anon, authenticated;

/* ---------- RLS ---------- */

alter table noticia enable row level security;

create policy noticia_coordinador_lee on noticia
  for select using (es_coordinador_de(noticia.club_id));

create policy noticia_coordinador_agrega on noticia
  for insert with check (es_coordinador_de(noticia.club_id));

create policy noticia_coordinador_edita on noticia
  for update using (es_coordinador_de(noticia.club_id))
  with check (es_coordinador_de(noticia.club_id));

create policy noticia_coordinador_borra on noticia
  for delete using (es_coordinador_de(noticia.club_id));

-- Supabase concede ALL por defecto (ver 0017 y 0027): se revoca todo y se
-- concede lo mínimo, por columna. El id lo genera el cliente (las fotos se
-- suben a la carpeta de la noticia antes de crear la fila). El cliente no
-- manda autoría ni fechas, y no cambia el club de una fila.
revoke all on noticia from anon, authenticated;
grant select on noticia to authenticated;
grant insert (id, club_id, titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen, publicada) on noticia to authenticated;
grant update (titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen, publicada) on noticia to authenticated;
grant delete on noticia to authenticated;

/* ---------- Lectura pública ---------- */

-- Las tarjetas: publicadas del club, de la más nueva a la más vieja, de a
-- páginas (`p_antes` = la fecha de la última que ya se mostró). Sólo la
-- primera foto. El tope corta un pedido absurdo, no uno real.
create function noticias_publicas(p_club uuid, p_limite integer default 12, p_antes timestamptz default null)
returns table (id uuid, titulo text, resumen text, etiqueta text, foto jsonb, publicada_en timestamptz)
language sql
stable
security definer
set search_path = ''
as $fn$
  select n.id, n.titulo, n.resumen, n.etiqueta, n.fotos -> 0, n.publicada_en
  from public.noticia n
  where n.club_id = p_club and n.publicada
    and (p_antes is null or n.publicada_en < p_antes)
  order by n.publicada_en desc, n.id
  limit least(greatest(coalesce(p_limite, 12), 1), 24);
$fn$;

-- Una noticia entera, sólo si está publicada.
create function noticia_publica(p_club uuid, p_id uuid)
returns table (id uuid, titulo text, resumen text, cuerpo text, etiqueta text, fotos jsonb, publicada_en timestamptz)
language sql
stable
security definer
set search_path = ''
as $fn$
  select n.id, n.titulo, n.resumen, n.cuerpo, n.etiqueta, n.fotos, n.publicada_en
  from public.noticia n
  where n.club_id = p_club and n.id = p_id and n.publicada;
$fn$;

revoke execute on function noticias_publicas(uuid, integer, timestamptz) from public;
grant execute on function noticias_publicas(uuid, integer, timestamptz) to anon, authenticated;
revoke execute on function noticia_publica(uuid, uuid) from public;
grant execute on function noticia_publica(uuid, uuid) to anon, authenticated;

/* ---------- Fotos: bucket público y quién escribe ---------- */

-- Público para leer: el portal las muestra sin sesión, por su URL. El límite y
-- los tipos los hace cumplir Storage aunque el cliente se saltee el achicado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('noticias', 'noticias', true, 1048576, array['image/webp', 'image/jpeg']);

-- El club dueño de una ruta del bucket (su primera carpeta), o null si la
-- ruta no empieza con un uuid. Sin esto, un nombre raro haría fallar el
-- cast dentro de la policy en vez de simplemente no autorizar.
create function club_de_ruta_noticia(p_ruta text)
returns uuid
language sql
immutable
set search_path = ''
as $fn$
  select case
    when p_ruta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then split_part(p_ruta, '/', 1)::uuid
  end;
$fn$;

revoke execute on function club_de_ruta_noticia(text) from public, anon;
grant execute on function club_de_ruta_noticia(text) to authenticated;

-- Sin policy de update: una foto no se reemplaza, se borra y se sube otra.
-- La de select hace falta para borrar por la API de Storage (lee antes de borrar).
create policy noticias_fotos_coordinador_sube on storage.objects for insert to authenticated
  with check (bucket_id = 'noticias' and public.es_coordinador_de(public.club_de_ruta_noticia(name)));

create policy noticias_fotos_coordinador_ve on storage.objects for select to authenticated
  using (bucket_id = 'noticias' and public.es_coordinador_de(public.club_de_ruta_noticia(name)));

create policy noticias_fotos_coordinador_borra on storage.objects for delete to authenticated
  using (bucket_id = 'noticias' and public.es_coordinador_de(public.club_de_ruta_noticia(name)));

comment on table noticia is
  'Noticias del portal público. Escribe y borra coordinación; lo público sale por noticias_publicas() y noticia_publica(). Fotos en el bucket noticias, con autorización de imagen obligatoria. v0064.';
comment on function noticias_publicas(uuid, integer, timestamptz) is
  'Tarjetas de las noticias publicadas de un club, de la más nueva a la más vieja, de a páginas. Ejecutable por anon. v0064.';
comment on function noticia_publica(uuid, uuid) is
  'Una noticia publicada entera, o nada. Ejecutable por anon. v0064.';
```

- [ ] **Step 4: Correr los contratos**

Run: `node --test tests/contratoNoticia.test.js tests/contratoLimites.test.js`
Expected: PASS. El test de constantes compartidas sale como `skip` hasta la Task 11.

- [ ] **Step 5: Escribir `tests/rollback0064.sql`**

```sql
-- Deshace 0064 en una base de PRUEBA. No se corre contra producción sin
-- revisarlo: borra todas las noticias. Las FOTOS no se pueden borrar desde
-- SQL (Storage lo impide): vaciar antes el bucket `noticias` desde el panel
-- de Supabase (Storage → noticias → seleccionar todo → borrar), o este script
-- falla en el delete del bucket.
--
-- El portal sigue andando sin 0064: sin las funciones, la sección de noticias
-- queda oculta. Borra también la fila de schema_migrations para poder volver
-- a aplicar 0064.
begin;

drop policy if exists noticias_fotos_coordinador_sube on storage.objects;
drop policy if exists noticias_fotos_coordinador_ve on storage.objects;
drop policy if exists noticias_fotos_coordinador_borra on storage.objects;
delete from storage.buckets where id = 'noticias';

drop function if exists noticia_publica(uuid, uuid);
drop function if exists noticias_publicas(uuid, integer, timestamptz);
drop table if exists noticia;
drop function if exists sellar_noticia();
drop function if exists fotos_de_noticia_validas(jsonb, uuid, uuid);
drop function if exists club_de_ruta_noticia(text);

delete from supabase_migrations.schema_migrations where version = '0064';
commit;
```

- [ ] **Step 6: Escribir `tests/verificarNoticias.sql`**

Mismo armazón que `tests/verificarFormularioPortal.sql`: tabla temporal `verificacion_0064`, un bloque `do $$`, usuarios y clubes sintéticos `ZZTEST` con dominio `.invalid`, impersonación con `set_config('role', …)` y `request.jwt.claims`, y todo deshecho al final con `raise exception using errcode = 'ZY001'`. Copiar el setup (club de prueba de 0003, otro club, `v_co` coordinador, `v_pr` entrenador, `v_co2` coordinador de otro club, `miembro_club`) y el cierre tal cual. Los casos:

```sql
  nombres text[] := array[
    '1. Coordinación crea, edita, publica y borra; la base sella autoría y fecha de publicación',
    '2. La fecha de publicación no cambia al despublicar y volver a publicar',
    '3. Un entrenador del club y la coordinación de otro club no leen, no escriben ni borran',
    '4. Sin sesión (anon): ningún permiso sobre la tabla; las funciones devuelven sólo publicadas del club',
    '5. Con fotos sin autorización de imagen: rechazado',
    '6. Fotos mal formadas (otra carpeta, sin alt, 7 fotos, clave de más): rechazadas',
    '7. El cliente no fija autoría, fecha de publicación ni club'
  ];
```

Con los ids fijos `v_n1 uuid := gen_random_uuid()` y `v_foto text := v_club || '/' || v_n1 || '/' || gen_random_uuid() || '.webp'`, cada caso se arma así:
- **1:** como `v_co`, `insert into noticia (id, club_id, titulo, resumen, cuerpo, etiqueta) values (v_n1, v_club, 'ZZTEST Título', 'Resumen', 'Cuerpo', 'club')`. Después `update … set publicada = true`. Volviendo al rol previo, comprobar `creado_por = v_co`, `actualizado_por = v_co` y `publicada_en is not null`. Al final, `delete` de una segunda noticia `v_n2` y comprobar `row_count = 1`.
- **2:** guardar `publicada_en`, `update set publicada = false`, `update set publicada = true`, y comprobar que `publicada_en` no cambió.
- **3:** como `v_pr`, y después como `v_co2`: `select count(*)` da 0. `insert` → `insufficient_privilege` (o `new row violates row-level security`, que también es `insufficient_privilege`: capturar `when insufficient_privilege`). `update` y `delete` → `row_count = 0`.
- **4:** `has_table_privilege('anon', 'public.noticia', 'select')` (y `insert`, `update`, `delete`) es false. Con `set_config('role', 'anon', true)`: `select count(*) from noticias_publicas(v_club)` cuenta sólo las publicadas, `noticia_publica(v_club, <id de un borrador>)` no devuelve filas, y `noticias_publicas(v_otro_club)` no trae las de `v_club`.
- **5:** como `v_co`, `update noticia set fotos = jsonb_build_array(jsonb_build_object('ruta', v_foto, 'alt', 'La cancha')) where id = v_n1` con `autorizacion_imagen = false` → `check_violation` con `noticia_fotos_autorizadas`. Con `autorizacion_imagen = true`, pasa.
- **6:** cada una tiene que dar `check_violation` con `noticia_fotos_validas`: una ruta de otra noticia (`v_club || '/' || gen_random_uuid() || '/…webp'`), `alt` vacío, 7 fotos válidas, y un objeto con una tercera clave.
- **7:** `insert` con `creado_por`, `update set publicada_en = now()`, `update set club_id = v_otro_club` y `update set actualizado_por = v_pr`: cada uno da `insufficient_privilege`.

Este archivo **no se corre** en esta rama (no hay base local). Se corre después del `db push`, en el SQL Editor (ver Task 15).

- [ ] **Step 7: Documentar en `supabase/ESQUEMA.md`**

Después de la sección de `formulario_portal`:

```markdown
### Noticias del portal: `noticia`, `noticias_publicas`, `noticia_publica` y el bucket `noticias` (0064)
Las noticias que publica la coordinación en el portal (`/` y `/noticias`): título, resumen (la tarjeta), cuerpo (texto plano, párrafos separados por una línea en blanco), etiqueta (`club`, `partidos`, `eventos`, `inscripcion`), hasta 6 fotos `{ruta, alt}` y `publicada` (spec `docs/superpowers/specs/2026-10-21-portal-multipagina-design.md`).

- **anon no recibe nada sobre la tabla**, como en 0058: sólo `execute` de `noticias_publicas(club, limite, antes)` (tarjetas, de a páginas, tope 24) y `noticia_publica(club, id)`, las dos `security definer` y sólo con filas **publicadas**.
- **Escribe, publica y borra sólo la coordinación del club.** El id lo genera el cliente (las fotos se suben a la carpeta de la noticia antes de crear la fila). `sellar_noticia` pone `actualizado_por/en` y, la primera vez que se publica, `publicada_en`, que ya no cambia.
- **Fotos:** bucket público `noticias` (1 MB, webp/jpeg), en `<club>/<noticia>/<uuid>.(webp|jpg)`. Suben, ven y borran sólo los coordinadores del club de la carpeta (`club_de_ruta_noticia`). El check `fotos_de_noticia_validas` exige rutas de la carpeta de esa noticia, alt de 1 a 150, sin claves de más. **Con fotos, `autorizacion_imagen` tiene que ser true** (`noticia_fotos_autorizadas`).
- **Verificación:** `tests/verificarNoticias.sql` (7 casos). Contrato: `tests/contratoNoticia.test.js`. Deshacer: `tests/rollback0064.sql` (vaciar antes el bucket).
```

- [ ] **Step 8: Correr la suite**

Run: `npm run test:q`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0064_noticias.sql tests/contratoNoticia.test.js tests/rollback0064.sql tests/verificarNoticias.sql src/data/limites.js tests/contratoLimites.test.js supabase/ESQUEMA.md
git commit -m "feat(noticias): migración 0064 con tabla, RLS de coordinación, lectura pública y bucket de fotos"
```

---

### Task 11: Lógica pura de noticias

Todo lo de noticias que no es red ni DOM: validar lo que escribe el coordinador, validar y medir las fotos, armar rutas, partir el texto en párrafos, las fechas y los mappers. La usan el repo (Task 12), el portal (Task 13) y el panel (Task 14).

**Files:**
- Create: `src/data/noticias.js`
- Create: `tests/noticias.test.js`

**Interfaces:**
- Consume: `LIMITE` (`limites.js`, Task 10), `hoyEnRosario` y `partesDeFecha` (`agenda.js`).
- Produce (todas exportadas):
  - Constantes: `ETIQUETAS_NOTICIA: readonly { clave, rotulo }[]` (club/Club, partidos/Partidos, eventos/Eventos, inscripcion/Inscripción); `MAX_FOTOS = 6`; `MAX_BYTES_FOTO = 1048576`; `MAX_BYTES_ORIGINAL = 15728640`; `LADO_MAX_FOTO = 1600`; `CALIDADES_FOTO = [0.82, 0.7, 0.55]`; `TIPOS_FOTO_ORIGINAL = ['image/jpeg', 'image/png', 'image/webp']`; `TIPOS_FOTO_GUARDADA = { 'image/webp': 'webp', 'image/jpeg': 'jpg' }`; `NOTICIAS_POR_PAGINA = 12`; `BUCKET_NOTICIAS = 'noticias'`.
  - `validarNoticia({ titulo, resumen, cuerpo, etiqueta, fotos: {alt}[], autorizacionImagen }) → { error: string|null, campo: 'titulo'|'resumen'|'cuerpo'|'etiqueta'|'fotos'|'autorizacion'|null, foto: number|null, noticia: { titulo, resumen, cuerpo, etiqueta, alts: string[], autorizacionImagen: boolean }|null }`.
  - `validarArchivoFoto({ type, size }) → string|null`.
  - `medidasAchicadas(ancho, alto) → { ancho, alto }`.
  - `rutaFoto(clubId, noticiaId, nombre, tipo) → string|null`.
  - `parrafos(texto) → string[]`.
  - `esIdNoticia(valor) → boolean`.
  - `rotuloDeEtiqueta(clave) → string|null`.
  - `fechaDeNoticia(iso) → 'YYYY-MM-DD'|null` (día en Rosario).
  - `textoFechaCorta(fecha) → 'mié, 21 oct'`.
  - `urlFotoValida(url, base, { previa = false } = {}) → string|null`.
  - `noticiaDesdeFila(fila)`, `noticiaResumenDesdeFila(fila, urlDe)`, `noticiaPublicaDesdeFila(fila, urlDe)`. Las formas, en el Step 3.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/noticias.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITE } from '../src/data/limites.js';
import {
  ETIQUETAS_NOTICIA, MAX_FOTOS, MAX_BYTES_ORIGINAL, TIPOS_FOTO_ORIGINAL,
  validarNoticia, validarArchivoFoto, medidasAchicadas, rutaFoto, parrafos, esIdNoticia, rotuloDeEtiqueta,
  fechaDeNoticia, textoFechaCorta, urlFotoValida, noticiaDesdeFila, noticiaResumenDesdeFila, noticiaPublicaDesdeFila,
} from '../src/data/noticias.js';

/**
 * Lo que escribe la coordinación en una noticia termina en una página que ve
 * cualquiera, con fotos de un club formativo. Se valida acá y otra vez en la
 * base (los checks de 0064, comparados en contratoNoticia). Sin red ni DOM.
 */

const BASE = { titulo: ' Ganó la U13 ', resumen: ' Resumen ', cuerpo: ' Texto ', etiqueta: 'partidos', fotos: [], autorizacionImagen: false };
const C = '11111111-1111-4111-8111-111111111111';
const N = '22222222-2222-4222-8222-222222222222';
const F = '33333333-3333-4333-8333-333333333333';

test('validarNoticia: una noticia sin fotos pasa, recortada', () => {
  assert.deepEqual(validarNoticia(BASE), {
    error: null, campo: null, foto: null,
    noticia: { titulo: 'Ganó la U13', resumen: 'Resumen', cuerpo: 'Texto', etiqueta: 'partidos', alts: [], autorizacionImagen: false },
  });
});

test('validarNoticia: título, resumen y cuerpo son obligatorios y tienen el largo de la base', () => {
  for (const [campo, limite] of [['titulo', LIMITE.tituloNoticia], ['resumen', LIMITE.resumenNoticia], ['cuerpo', LIMITE.cuerpoNoticia]]) {
    for (const vacio of ['', '   ', undefined]) {
      const r = validarNoticia({ ...BASE, [campo]: vacio });
      assert.equal(r.campo, campo, `${campo} vacío`);
      assert.equal(r.noticia, null);
    }
    assert.equal(validarNoticia({ ...BASE, [campo]: 'x'.repeat(limite + 1) }).campo, campo, `${campo} largo`);
    assert.equal(validarNoticia({ ...BASE, [campo]: 'x'.repeat(limite) }).error, null, `${campo} justo`);
  }
});

test('validarNoticia: la etiqueta tiene que ser de la lista', () => {
  for (const { clave } of ETIQUETAS_NOTICIA) assert.equal(validarNoticia({ ...BASE, etiqueta: clave }).error, null, clave);
  for (const otra of ['otra', '', null, 'Club']) assert.equal(validarNoticia({ ...BASE, etiqueta: otra }).campo, 'etiqueta', String(otra));
});

test('validarNoticia: con fotos y sin la autorización de imagen, no pasa (sólo true cuenta)', () => {
  const sin = validarNoticia({ ...BASE, fotos: [{ alt: 'La cancha' }] });
  assert.equal(sin.campo, 'autorizacion');
  assert.match(sin.error, /autorización de imagen/);
  assert.equal(validarNoticia({ ...BASE, fotos: [{ alt: 'La cancha' }], autorizacionImagen: 'true' }).campo, 'autorizacion');
  assert.equal(validarNoticia({ ...BASE, fotos: [{ alt: 'La cancha' }], autorizacionImagen: true }).error, null);
});

test('validarNoticia: cada foto con su descripción, del largo de la base; hasta 6', () => {
  const sinAlt = validarNoticia({ ...BASE, fotos: [{ alt: 'Una' }, { alt: '  ' }], autorizacionImagen: true });
  assert.deepEqual([sinAlt.campo, sinAlt.foto], ['fotos', 1]);
  assert.match(sinAlt.error, /foto 2/);
  assert.match(sinAlt.error, /sin nombres/);
  assert.equal(validarNoticia({ ...BASE, fotos: [{ alt: 'x'.repeat(LIMITE.altFoto + 1) }], autorizacionImagen: true }).foto, 0);
  const siete = validarNoticia({ ...BASE, fotos: Array.from({ length: MAX_FOTOS + 1 }, () => ({ alt: 'x' })), autorizacionImagen: true });
  assert.deepEqual([siete.campo, siete.foto], ['fotos', null]);
  assert.deepEqual(validarNoticia({ ...BASE, fotos: [{ alt: ' La cancha ' }], autorizacionImagen: true }).noticia.alts, ['La cancha']);
});

test('validarArchivoFoto: jpg, png o webp de hasta 15 MB; HEIC, PDF, sin tipo o de 20 MB, con un mensaje claro', () => {
  for (const type of TIPOS_FOTO_ORIGINAL) assert.equal(validarArchivoFoto({ type, size: 1000 }), null, type);
  for (const type of ['image/heic', 'application/pdf', '', undefined]) assert.match(validarArchivoFoto({ type, size: 1000 }), /JPG, PNG o WEBP/, String(type));
  assert.match(validarArchivoFoto({ type: 'image/jpeg', size: 20 * 1048576 }), /15 MB/);
  assert.equal(validarArchivoFoto({ type: 'image/jpeg', size: MAX_BYTES_ORIGINAL }), null);
  assert.match(validarArchivoFoto(null), /JPG, PNG o WEBP/);
});

test('medidasAchicadas: el lado largo a 1600, proporcional; una foto chica no se agranda', () => {
  assert.deepEqual(medidasAchicadas(4000, 3000), { ancho: 1600, alto: 1200 });
  assert.deepEqual(medidasAchicadas(3000, 4000), { ancho: 1200, alto: 1600 });
  assert.deepEqual(medidasAchicadas(800, 600), { ancho: 800, alto: 600 });
  assert.deepEqual(medidasAchicadas(4000, 1), { ancho: 1600, alto: 1 }, 'nunca 0 px');
});

test('rutaFoto: <club>/<noticia>/<nombre>.<ext> según el tipo guardado; lo demás, null', () => {
  assert.equal(rutaFoto(C, N, F, 'image/webp'), `${C}/${N}/${F}.webp`);
  assert.equal(rutaFoto(C, N, F, 'image/jpeg'), `${C}/${N}/${F}.jpg`);
  assert.equal(rutaFoto(C, N, F, 'image/png'), null, 'png no se guarda: se pasa a webp o jpeg');
  assert.equal(rutaFoto('../x', N, F, 'image/webp'), null);
});

test('parrafos: separados por línea en blanco, recortados y sin vacíos; un salto simple queda adentro', () => {
  assert.deepEqual(parrafos('Uno\nsigue\n\n\n  Dos  \n \nTres'), ['Uno\nsigue', 'Dos', 'Tres']);
  assert.deepEqual(parrafos('Uno\r\n\r\nDos'), ['Uno', 'Dos']);
  assert.deepEqual(parrafos(''), []);
  assert.deepEqual(parrafos(null), []);
});

test('esIdNoticia: sólo un uuid (el ?n= de la URL no llega a la base si no lo es)', () => {
  assert.equal(esIdNoticia(N), true);
  for (const malo of ['abc', '', null, `${N}x`, "1' or '1'='1", N.toUpperCase().replace(/-/g, '')]) assert.equal(esIdNoticia(malo), false, String(malo));
});

test('rotuloDeEtiqueta: el texto de la etiqueta, o null', () => {
  assert.deepEqual(ETIQUETAS_NOTICIA.map((e) => e.clave), ['club', 'partidos', 'eventos', 'inscripcion']);
  assert.equal(rotuloDeEtiqueta('inscripcion'), 'Inscripción');
  assert.equal(rotuloDeEtiqueta('otra'), null);
});

test('fechas: el día de la publicación en Rosario y el texto corto de la tarjeta', () => {
  assert.equal(fechaDeNoticia('2026-10-21T02:30:00Z'), '2026-10-20', 'las 23:30 del 20 en Rosario');
  assert.equal(fechaDeNoticia('2026-10-21T15:00:00+00:00'), '2026-10-21');
  assert.equal(fechaDeNoticia('nada'), null);
  assert.equal(fechaDeNoticia(null), null);
  assert.equal(textoFechaCorta('2026-10-21'), 'mié, 21 oct');
  assert.equal(textoFechaCorta(null), '');
});

test('urlFotoValida: sólo del bucket de noticias del proyecto; blob: sólo en la vista previa', () => {
  const base = 'https://x.supabase.co';
  const ok = `${base}/storage/v1/object/public/noticias/${C}/${N}/${F}.webp`;
  assert.equal(urlFotoValida(ok, base), ok);
  assert.equal(urlFotoValida(`https://evil.com/storage/v1/object/public/noticias/${F}.webp`, base), null);
  assert.equal(urlFotoValida(`${base}/storage/v1/object/public/otro/${F}.webp`, base), null);
  assert.equal(urlFotoValida(`${ok}" onerror="alert(1)`, base), null);
  assert.equal(urlFotoValida(ok, undefined), null);
  assert.equal(urlFotoValida('blob:http://localhost:5174/abc', base), null);
  assert.equal(urlFotoValida('blob:http://localhost:5174/abc', base, { previa: true }), 'blob:http://localhost:5174/abc');
});

test('mappers: de la fila al dominio en camelCase, con la URL de cada foto', () => {
  const urlDe = (ruta) => `https://x/${ruta}`;
  assert.deepEqual(noticiaDesdeFila({
    id: N, titulo: 't', resumen: 'r', cuerpo: 'c', etiqueta: 'club', fotos: [{ ruta: 'a.webp', alt: 'A' }],
    autorizacion_imagen: true, publicada: false, publicada_en: null, actualizado_en: '2026-10-21T10:00:00Z',
  }), {
    id: N, titulo: 't', resumen: 'r', cuerpo: 'c', etiqueta: 'club', fotos: [{ ruta: 'a.webp', alt: 'A' }],
    autorizacionImagen: true, publicada: false, publicadaEn: null, actualizadoEn: '2026-10-21T10:00:00Z',
  });
  assert.deepEqual(noticiaResumenDesdeFila({ id: N, titulo: 't', resumen: 'r', etiqueta: 'club', foto: { ruta: 'a.webp', alt: 'A' }, publicada_en: '2026-10-21T15:00:00Z' }, urlDe), {
    id: N, titulo: 't', resumen: 'r', etiqueta: 'club', foto: { url: 'https://x/a.webp', alt: 'A' }, publicadaEn: '2026-10-21T15:00:00Z', fecha: '2026-10-21',
  });
  assert.equal(noticiaResumenDesdeFila({ id: N, titulo: 't', resumen: 'r', etiqueta: 'club', foto: null, publicada_en: null }, urlDe).foto, null);
  assert.deepEqual(noticiaPublicaDesdeFila({ id: N, titulo: 't', resumen: 'r', cuerpo: 'c', etiqueta: 'club', fotos: [{ ruta: 'a.webp', alt: 'A' }], publicada_en: '2026-10-21T15:00:00Z' }, urlDe), {
    id: N, titulo: 't', resumen: 'r', cuerpo: 'c', etiqueta: 'club', fotos: [{ url: 'https://x/a.webp', alt: 'A' }], publicadaEn: '2026-10-21T15:00:00Z', fecha: '2026-10-21',
  });
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `node --test tests/noticias.test.js`
Expected: FAIL con `Cannot find module '…/src/data/noticias.js'`.

- [ ] **Step 3: Implementar `src/data/noticias.js`**

```js
import { LIMITE } from './limites.js';
import { hoyEnRosario, partesDeFecha } from './agenda.js';

/*
 * Lógica pura de las noticias del portal (0064, spec 2026-10-21): validar lo
 * que escribe la coordinación, las fotos (qué se acepta, a cuánto se achican,
 * dónde se guardan), los párrafos y las fechas, y los mappers. Sin red ni DOM.
 *
 * Las etiquetas, el máximo de fotos, el largo del alt y los tipos y el tamaño
 * de lo que se guarda viven también en la migración, que es la que los hace
 * cumplir: tests/contratoNoticia.test.js compara las dos.
 */

export const ETIQUETAS_NOTICIA = Object.freeze([
  Object.freeze({ clave: 'club', rotulo: 'Club' }),
  Object.freeze({ clave: 'partidos', rotulo: 'Partidos' }),
  Object.freeze({ clave: 'eventos', rotulo: 'Eventos' }),
  Object.freeze({ clave: 'inscripcion', rotulo: 'Inscripción' }),
]);

export const MAX_FOTOS = 6;
/** Lo que acepta el bucket por archivo (0064). */
export const MAX_BYTES_FOTO = 1048576;
/** Lo que se acepta elegir antes de achicar: una foto de celular grande entra, un video no. */
export const MAX_BYTES_ORIGINAL = 15 * 1048576;
export const LADO_MAX_FOTO = 1600;
/** Calidades que se prueban, en orden, hasta que la foto achicada pesa menos que MAX_BYTES_FOTO. */
export const CALIDADES_FOTO = Object.freeze([0.82, 0.7, 0.55]);
export const TIPOS_FOTO_ORIGINAL = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
/** Lo que se guarda (tipo → extensión). png no: se pasa a webp, o a jpeg si el navegador no sabe hacer webp. */
export const TIPOS_FOTO_GUARDADA = Object.freeze({ 'image/webp': 'webp', 'image/jpeg': 'jpg' });
export const NOTICIAS_POR_PAGINA = 12;
export const BUCKET_NOTICIAS = 'noticias';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const recortar = (v) => (typeof v === 'string' ? v.trim() : '');
const falla = (error, campo, foto = null) => ({ error, campo, foto, noticia: null });

export const esIdNoticia = (valor) => typeof valor === 'string' && UUID.test(valor);

export const rotuloDeEtiqueta = (clave) => ETIQUETAS_NOTICIA.find((e) => e.clave === clave)?.rotulo ?? null;

/**
 * Lo que escribió la coordinación → la noticia a guardar, o el primer error
 * con el campo (y la foto) donde está, para marcarlo en el formulario. Las
 * rutas de las fotos no se validan acá: las arma rutaFoto y las vuelve a
 * exigir la base.
 */
export function validarNoticia({ titulo, resumen, cuerpo, etiqueta, fotos = [], autorizacionImagen = false } = {}) {
  const t = recortar(titulo);
  if (!t) return falla('Escribí el título de la noticia.', 'titulo');
  if (t.length > LIMITE.tituloNoticia) return falla(`El título es muy largo: hasta ${LIMITE.tituloNoticia} letras.`, 'titulo');

  const r = recortar(resumen);
  if (!r) return falla('Escribí el resumen: es la línea que se ve en la tarjeta.', 'resumen');
  if (r.length > LIMITE.resumenNoticia) return falla(`El resumen es muy largo: hasta ${LIMITE.resumenNoticia} letras.`, 'resumen');

  const c = recortar(cuerpo);
  if (!c) return falla('Escribí el texto de la noticia.', 'cuerpo');
  if (c.length > LIMITE.cuerpoNoticia) return falla(`El texto es muy largo: hasta ${LIMITE.cuerpoNoticia} letras.`, 'cuerpo');

  if (!rotuloDeEtiqueta(etiqueta)) return falla('Elegí de qué es la noticia.', 'etiqueta');

  const lista = Array.isArray(fotos) ? fotos : [];
  if (lista.length > MAX_FOTOS) return falla(`Hasta ${MAX_FOTOS} fotos por noticia.`, 'fotos');
  const alts = lista.map((f) => recortar(f?.alt));
  const sinAlt = alts.findIndex((a) => !a);
  if (sinAlt !== -1) return falla(`Contá qué se ve en la foto ${sinAlt + 1}, sin nombres de chicos.`, 'fotos', sinAlt);
  const largo = alts.findIndex((a) => a.length > LIMITE.altFoto);
  if (largo !== -1) return falla(`La descripción de la foto ${largo + 1} es muy larga: hasta ${LIMITE.altFoto} letras.`, 'fotos', largo);
  // Sólo true: un "true" escrito o un 1 no es el gesto de la persona tildando la casilla.
  if (lista.length && autorizacionImagen !== true) {
    return falla('Para publicar fotos tenés que confirmar que tenés la autorización de imagen de las familias.', 'autorizacion');
  }

  return { error: null, campo: null, foto: null, noticia: { titulo: t, resumen: r, cuerpo: c, etiqueta, alts, autorizacionImagen: autorizacionImagen === true } };
}

/** El archivo elegido, antes de achicarlo. null si se puede usar; si no, qué decirle a la persona. */
export function validarArchivoFoto(archivo) {
  if (!TIPOS_FOTO_ORIGINAL.includes(archivo?.type)) return 'Esa foto no se puede usar: tiene que ser JPG, PNG o WEBP.';
  if (archivo.size > MAX_BYTES_ORIGINAL) return 'La foto pesa más de 15 MB. Elegí otra o mandá una captura.';
  return null;
}

/** Las medidas a las que se achica: el lado largo a LADO_MAX_FOTO, proporcional. Una foto chica no se agranda. */
export function medidasAchicadas(ancho, alto) {
  const largo = Math.max(ancho, alto);
  if (largo <= LADO_MAX_FOTO) return { ancho, alto };
  const escala = LADO_MAX_FOTO / largo;
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

/** Dónde se guarda una foto en el bucket (la carpeta de su noticia, como exige 0064), o null. */
export function rutaFoto(clubId, noticiaId, nombre, tipo) {
  const ext = TIPOS_FOTO_GUARDADA[tipo];
  if (!ext || ![clubId, noticiaId, nombre].every(esIdNoticia)) return null;
  return `${clubId}/${noticiaId}/${nombre}.${ext}`;
}

/** El cuerpo en párrafos: se separan con una línea en blanco. Un salto simple queda dentro (lo muestra pre-line). */
export function parrafos(texto) {
  return String(texto ?? '').replace(/\r\n/g, '\n').split(/\n[ \t]*\n/).map((p) => p.trim()).filter(Boolean);
}

/** El día de la publicación en Rosario ('YYYY-MM-DD'), o null. */
export function fechaDeNoticia(iso) {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? hoyEnRosario(new Date(t)) : null;
}

/** '2026-10-21' → 'mié, 21 oct': la fecha de la tarjeta, como en el sitio del club. */
export function textoFechaCorta(fecha) {
  if (!fecha) return '';
  const { semana, dia, mes } = partesDeFecha(fecha);
  return `${semana}, ${dia} ${mes}`;
}

/**
 * La URL de una foto si es del bucket de noticias del proyecto (`base` =
 * SUPABASE_URL), sin comillas ni espacios. En la vista previa del panel, una
 * foto recién elegida todavía es un blob: del propio navegador.
 */
export function urlFotoValida(url, base, { previa = false } = {}) {
  if (typeof url !== 'string' || /[\s"'<>]/.test(url)) return null;
  if (previa && url.startsWith('blob:')) return url;
  if (typeof base !== 'string' || !base) return null;
  return url.startsWith(`${base}/storage/v1/object/public/${BUCKET_NOTICIAS}/`) ? url : null;
}

/** Fila de `noticia` (panel de coordinación) → noticia de dominio. */
export function noticiaDesdeFila(f) {
  return {
    id: f.id,
    titulo: f.titulo,
    resumen: f.resumen,
    cuerpo: f.cuerpo,
    etiqueta: f.etiqueta,
    fotos: (f.fotos ?? []).map(({ ruta, alt }) => ({ ruta, alt })),
    autorizacionImagen: f.autorizacion_imagen === true,
    publicada: f.publicada === true,
    publicadaEn: f.publicada_en ?? null,
    actualizadoEn: f.actualizado_en ?? null,
  };
}

/** Fila de noticias_publicas() → tarjeta. `urlDe(ruta)` arma la URL pública de una foto. */
export function noticiaResumenDesdeFila(f, urlDe) {
  return {
    id: f.id,
    titulo: f.titulo,
    resumen: f.resumen,
    etiqueta: f.etiqueta,
    foto: f.foto?.ruta ? { url: urlDe(f.foto.ruta), alt: f.foto.alt } : null,
    publicadaEn: f.publicada_en ?? null,
    fecha: fechaDeNoticia(f.publicada_en),
  };
}

/** Fila de noticia_publica() → noticia entera para la página. */
export function noticiaPublicaDesdeFila(f, urlDe) {
  return {
    id: f.id,
    titulo: f.titulo,
    resumen: f.resumen,
    cuerpo: f.cuerpo,
    etiqueta: f.etiqueta,
    fotos: (f.fotos ?? []).map(({ ruta, alt }) => ({ url: urlDe(ruta), alt })),
    publicadaEn: f.publicada_en ?? null,
    fecha: fechaDeNoticia(f.publicada_en),
  };
}
```

- [ ] **Step 4: Correr los tests**

Run: `node --test tests/noticias.test.js tests/contratoNoticia.test.js tests/arquitectura.test.js`
Expected: PASS. El test de constantes compartidas de `contratoNoticia` ya no sale como `skip`.

- [ ] **Step 5: Commit**

```bash
git add src/data/noticias.js tests/noticias.test.js
git commit -m "feat(noticias): validación, fotos, párrafos, fechas y mappers (lógica pura)"
```

---

### Task 12: Repo de noticias

**Files:**
- Create: `src/data/repos/noticias.js`
- Modify: `src/data/repositorio.js` (una línea)
- Create: `tests/repoNoticias.test.js`

**Interfaces:**
- Consume: `obtenerCliente` (`cliente.js`), los mappers y constantes de la Task 11.
- Produce (re-exportado por la fachada):
  - `noticiasPublicas(clubId, { limite = NOTICIAS_POR_PAGINA, antesDe = null } = {}): Promise<Resumen[]>`.
  - `noticiaPublica(clubId, id): Promise<NoticiaPublica|null>`.
  - `listarNoticias(clubId): Promise<Noticia[]>`, de la más nueva a la más vieja (por `creado_en`).
  - `crearNoticia({ id, clubId, titulo, resumen, cuerpo, etiqueta, fotos, autorizacionImagen, publicada }): Promise<Noticia>`.
  - `actualizarNoticia(id, { titulo, resumen, cuerpo, etiqueta, fotos, autorizacionImagen, publicada }): Promise<Noticia>`.
  - `borrarNoticia(noticia: Noticia): Promise<void>`. Borra la fila y después sus fotos.
  - `subirFotoNoticia(ruta: string, blob: Blob): Promise<void>`.
  - `borrarFotosNoticia(rutas: string[]): Promise<void>`.
  - `urlFotoNoticia(ruta: string): string`, sin red.
  - `fotos` en `crearNoticia`/`actualizarNoticia` es `{ ruta, alt }[]`.

- [ ] **Step 1: Escribir el test que falla**

No hay base local: el test lee el repo como texto y ata los nombres a la migración.

Crear `tests/repoNoticias.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Sin base local, el repo se ata por texto a 0064: los nombres de las
 * funciones y de sus parámetros, las columnas que se mandan (sólo las que
 * tienen grant) y que las fotos nunca se pisan.
 */
const repo = readFileSync('src/data/repos/noticias.js', 'utf8');
const sql = readFileSync('supabase/migrations/0064_noticias.sql', 'utf8');

test('llama a las funciones públicas con los parámetros de la migración', () => {
  assert.match(repo, /rpc\('noticias_publicas', \{ p_club: clubId, p_limite: limite, p_antes: antesDe \}\)/);
  assert.match(repo, /rpc\('noticia_publica', \{ p_club: clubId, p_id: id \}\)/);
  assert.match(sql, /create function noticias_publicas\(p_club uuid, p_limite integer default 12, p_antes timestamptz default null\)/);
  assert.match(sql, /create function noticia_publica\(p_club uuid, p_id uuid\)/);
});

test('crea y edita sólo con las columnas que la migración deja escribir', () => {
  const insert = repo.match(/\.insert\(\{([^}]*)\}\)/)[1];
  assert.deepEqual(insert.split(',').map((s) => s.trim().split(':')[0]).filter(Boolean).sort(),
    ['autorizacion_imagen', 'club_id', 'cuerpo', 'etiqueta', 'fotos', 'id', 'publicada', 'resumen', 'titulo']);
  const update = repo.match(/\.update\(\{([^}]*)\}\)/)[1];
  assert.deepEqual(update.split(',').map((s) => s.trim().split(':')[0]).filter(Boolean).sort(),
    ['autorizacion_imagen', 'cuerpo', 'etiqueta', 'fotos', 'publicada', 'resumen', 'titulo']);
});

test('las fotos van al bucket de noticias, sin pisar ninguna; borrar la noticia borra sus fotos después de la fila', () => {
  assert.match(repo, /upload\(ruta, blob, \{ contentType: blob\.type, upsert: false, cacheControl: '31536000' \}\)/);
  const cuerpo = repo.slice(repo.indexOf('export async function borrarNoticia('));
  assert.ok(cuerpo.indexOf(".from('noticia').delete()") < cuerpo.indexOf('borrarFotosNoticia('), 'primero la fila: si falla, las fotos siguen');
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `node --test tests/repoNoticias.test.js`
Expected: FAIL con `ENOENT … src/data/repos/noticias.js`.

- [ ] **Step 3: Implementar `src/data/repos/noticias.js`**

```js
// Noticias del portal del básquet (0064).
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente } from '../cliente.js';
import {
  noticiaDesdeFila, noticiaResumenDesdeFila, noticiaPublicaDesdeFila, BUCKET_NOTICIAS, NOTICIAS_POR_PAGINA,
} from '../noticias.js';

const COLUMNAS = 'id, titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen, publicada, publicada_en, actualizado_en';

/** La URL pública de una foto del bucket. No va a la red: la arma supabase-js. */
export function urlFotoNoticia(ruta) {
  return obtenerCliente().storage.from(BUCKET_NOTICIAS).getPublicUrl(ruta).data.publicUrl;
}

/**
 * Las tarjetas que ve el portal sin sesión: publicadas del club, de la más
 * nueva a la más vieja, de a páginas (`antesDe` = publicadaEn de la última
 * mostrada). Es la puerta de anon (0064): la tabla no se lee directo.
 */
export async function noticiasPublicas(clubId, { limite = NOTICIAS_POR_PAGINA, antesDe = null } = {}) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('noticias_publicas', { p_club: clubId, p_limite: limite, p_antes: antesDe });
  if (error) throw error;
  return data.map((f) => noticiaResumenDesdeFila(f, urlFotoNoticia));
}

/** Una noticia publicada entera, o null si no existe o no está publicada. */
export async function noticiaPublica(clubId, id) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('noticia_publica', { p_club: clubId, p_id: id });
  if (error) throw error;
  return data[0] ? noticiaPublicaDesdeFila(data[0], urlFotoNoticia) : null;
}

/** Todas las del club, con los borradores. Sólo la coordinación del club (RLS de 0064). */
export async function listarNoticias(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('noticia')
    .select(COLUMNAS)
    .eq('club_id', clubId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data.map(noticiaDesdeFila);
}

/** Alta. El id lo trae quien llama: las fotos ya se subieron a la carpeta de ese id. */
export async function crearNoticia({ id, clubId, titulo, resumen, cuerpo, etiqueta, fotos, autorizacionImagen, publicada }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('noticia')
    .insert({ id, club_id: clubId, titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen: autorizacionImagen, publicada })
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return noticiaDesdeFila(data);
}

export async function actualizarNoticia(id, { titulo, resumen, cuerpo, etiqueta, fotos, autorizacionImagen, publicada }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('noticia')
    .update({ titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen: autorizacionImagen, publicada })
    .eq('id', id)
    .select(COLUMNAS)
    .single();
  if (error) throw error;
  return noticiaDesdeFila(data);
}

/** Sube una foto ya achicada. upsert: false, así nunca pisa otra (el nombre es un uuid nuevo). */
export async function subirFotoNoticia(ruta, blob) {
  const supabase = obtenerCliente();
  const { error } = await supabase.storage.from(BUCKET_NOTICIAS).upload(ruta, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' });
  if (error) throw error;
}

export async function borrarFotosNoticia(rutas) {
  if (!rutas.length) return;
  const supabase = obtenerCliente();
  const { error } = await supabase.storage.from(BUCKET_NOTICIAS).remove(rutas);
  if (error) throw error;
}

/**
 * Borra la noticia y después sus fotos. En ese orden: si falla la fila, la
 * noticia sigue entera; si falla borrar las fotos, quedan en el bucket sin
 * que ninguna página las muestre (la fila ya no existe).
 */
export async function borrarNoticia(noticia) {
  const supabase = obtenerCliente();
  const { error } = await supabase.from('noticia').delete().eq('id', noticia.id);
  if (error) throw error;
  await borrarFotosNoticia(noticia.fotos.map((f) => f.ruta)).catch(() => {});
}
```

- [ ] **Step 4: Fachada**

En `src/data/repositorio.js`, al final de la lista:

```js
export * from './repos/noticias.js';
```

- [ ] **Step 5: Correr la suite**

Run: `npm run test:q`
Expected: PASS, incluido `arquitectura` ("repositorio.js re-exporta todos los repos", "los repos sólo dependen del cliente y de lógica pura") e `importsResueltos`.

- [ ] **Step 6: Commit**

```bash
git add src/data/repos/noticias.js src/data/repositorio.js tests/repoNoticias.test.js
git commit -m "feat(noticias): repo con lectura pública, ABM de coordinación y fotos en Storage"
```

---

### Task 13: Noticias en el portal (página, inicio y CSP)

**Files:**
- Create: `src/ui/portalNoticias.js`
- Create: `src/ui/noticiasArranque.js`
- Create: `public/noticias.html`
- Create: `tests/portalNoticias.test.js`
- Modify: `src/ui/portal.js` (el inicio llama a `iniciarUltimasNoticias`)
- Modify: `vercel.json` (rewrite y `no-store` de `/noticias`; `img-src` suma Supabase)
- Modify: `tests/csp.test.js` (test de `img-src`)
- Modify: `tests/paginasPortal.test.js` (sumar `/noticias` a `PAGINAS`)
- Modify: `public/sitemap.xml` (sumar `/noticias`)

**Interfaces:**
- Consume: `noticiasPublicas`, `noticiaPublica` (Task 12); `rotuloDeEtiqueta`, `textoFechaCorta`, `parrafos`, `esIdNoticia`, `urlFotoValida`, `NOTICIAS_POR_PAGINA` (Task 11); `fechaLarga` (`agenda.js`); `iniciarMarco` (Task 4).
- Produce:
  - `htmlTarjetaNoticia(resumen, base): Html`, `htmlListaNoticias(resumenes, base): Html`.
  - `htmlDetalleNoticia(noticia, base, { previa = false } = {}): Html`. La usa también el panel (Task 14): `noticia` = `{ titulo, resumen, cuerpo, etiqueta, fecha, fotos: {url, alt}[] }`.
  - `htmlNoticiaNoEsta(): Html`, `htmlSinNoticias(): Html`, `htmlErrorNoticias(): Html`.
  - `iniciarUltimasNoticias(): Promise<void>` (inicio) e `iniciarPaginaNoticias(): Promise<void>`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/portalNoticias.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  htmlTarjetaNoticia, htmlListaNoticias, htmlDetalleNoticia, htmlNoticiaNoEsta, htmlSinNoticias,
} from '../src/ui/portalNoticias.js';

/**
 * Lo que escribe la coordinación en una noticia lo ve cualquiera: todo sale
 * escapado, las fotos sólo del bucket de noticias del proyecto, y un ?n= que
 * no es un uuid no llega a la base. Sin noticias (o sin 0064 en la base), la
 * sección del inicio queda oculta y el resto anda.
 */
const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const modulo = leer('src/ui/portalNoticias.js');
const pagina = leer('public/noticias.html');
const BASE = 'https://x.supabase.co';
const ID = '22222222-2222-4222-8222-222222222222';
const FOTO = `${BASE}/storage/v1/object/public/noticias/c/n/f.webp`;
const R = { id: ID, titulo: 'Ganó la <U13>', resumen: 'Resumen "con" comillas', etiqueta: 'partidos', foto: { url: FOTO, alt: 'La <cancha>' }, fecha: '2026-10-21' };

test('tarjeta: link a su noticia, foto con su alt, etiqueta, título, resumen, fecha y "Leer"; todo escapado', () => {
  const out = htmlTarjetaNoticia(R, BASE).toString();
  assert.match(out, /^<article class="portal-not"><a href="\/noticias\?n=22222222-2222-4222-8222-222222222222">/);
  assert.match(out, /<img src="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/noticias\/c\/n\/f\.webp" alt="La &lt;cancha&gt;" loading="lazy">/);
  assert.match(out, /<span class="portal-not-et">Partidos<\/span>/);
  assert.match(out, /<h3>Ganó la &lt;U13&gt;<\/h3>/);
  assert.match(out, /<p>Resumen &quot;con&quot; comillas<\/p>/);
  assert.match(out, /<time datetime="2026-10-21">mié, 21 oct<\/time>/);
  assert.match(out, /Leer →/);
});

test('tarjeta: una foto que no es del bucket del proyecto no se muestra; sin foto, sin <img>', () => {
  assert.doesNotMatch(htmlTarjetaNoticia({ ...R, foto: { url: 'https://evil.com/x.webp', alt: 'x' } }, BASE).toString(), /<img/);
  assert.doesNotMatch(htmlTarjetaNoticia({ ...R, foto: null }, BASE).toString(), /<img/);
});

test('lista: sin noticias, nada (la sección queda oculta); una con id que no es uuid, afuera', () => {
  assert.equal(htmlListaNoticias([], BASE).toString(), '');
  const out = htmlListaNoticias([R, { ...R, id: 'abc' }], BASE).toString();
  assert.match(out, /^<div class="portal-nots">/);
  assert.equal((out.match(/<article /g) ?? []).length, 1);
});

const N = { titulo: '<script>alert(1)</script>', resumen: 'La bajada', cuerpo: `Primer párrafo\nsigue\n\nSegundo con ${'x'.repeat(300)}\n\n<b>tercero</b>`, etiqueta: 'club', fecha: '2026-10-21', fotos: [{ url: FOTO, alt: 'La cancha' }, { url: 'https://evil.com/y.webp', alt: 'mala' }] };

test('detalle: escapa todo, la fecha larga, las fotos válidas con su alt y el cuerpo en párrafos', () => {
  const out = htmlDetalleNoticia(N, BASE).toString();
  assert.match(out, /<a class="portal-art-volver" href="\/noticias">← Todas las noticias<\/a>/);
  assert.match(out, /<h1>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/h1>/);
  assert.doesNotMatch(out, /<script>|<b>/);
  assert.match(out, /<time datetime="2026-10-21">Miércoles 21 de octubre<\/time>/);
  assert.match(out, /<p class="portal-art-bajada">La bajada<\/p>/);
  assert.equal((out.match(/<figure><img /g) ?? []).length, 1, 'la foto de otro sitio no va');
  assert.match(out, /alt="La cancha"/);
  const parrafos = out.match(/<div class="portal-art-cuerpo">([\s\S]*?)<\/div>/)[1];
  assert.equal((parrafos.match(/<p>/g) ?? []).length, 3);
  assert.match(parrafos, /<p>Primer párrafo\nsigue<\/p>/);
  assert.match(parrafos, /<p>&lt;b&gt;tercero&lt;\/b&gt;<\/p>/);
});

test('detalle en la vista previa del panel: fotos blob: recién elegidas y sin "volver"', () => {
  const out = htmlDetalleNoticia({ ...N, fotos: [{ url: 'blob:http://localhost:5174/abc', alt: 'Nueva' }] }, BASE, { previa: true }).toString();
  assert.match(out, /<img src="blob:http:\/\/localhost:5174\/abc" alt="Nueva"/);
  assert.doesNotMatch(out, /portal-art-volver/);
  assert.doesNotMatch(htmlDetalleNoticia({ ...N, fotos: [{ url: 'blob:http://x/abc', alt: 'x' }] }, BASE).toString(), /blob:/, 'fuera de la vista previa, blob: no');
});

test('una noticia que no está: lo dice y vuelve a la lista; sin noticias: lo dice', () => {
  const out = htmlNoticiaNoEsta().toString();
  assert.match(out, /<h1>Esta noticia ya no está<\/h1>/);
  assert.match(out, /<a class="btn" href="\/noticias">Ver todas las noticias<\/a>/);
  assert.match(htmlSinNoticias().toString(), /Todavía no hay noticias publicadas\./);
});

test('un ?n= que no es un uuid no consulta la base', () => {
  const desde = modulo.indexOf('async function mostrarDetalle(');
  const cuerpo = modulo.slice(desde, modulo.indexOf('\n}\n', desde));
  assert.ok(cuerpo.indexOf('esIdNoticia(id)') > 0 && cuerpo.indexOf('esIdNoticia(id)') < cuerpo.indexOf('noticiaPublica('));
});

test('en el inicio, si la base falla (o no tiene 0064), la sección queda oculta y no se rompe nada', () => {
  const desde = modulo.indexOf('export async function iniciarUltimasNoticias(');
  const cuerpo = modulo.slice(desde, modulo.indexOf('\n}\n', desde));
  assert.match(cuerpo, /try \{[\s\S]*noticiasPublicas\(PORTAL\.clubId, \{ limite: 3 \}\)[\s\S]*\$\('noticias'\)\.hidden = !contenido;[\s\S]*\} catch \{/);
  const portal = leer('src/ui/portal.js');
  const inicio = portal.slice(portal.indexOf('export async function iniciarPortal('));
  assert.ok(inicio.indexOf('iniciarUltimasNoticias()') > inicio.indexOf('destinoDeAuth('), 'después de la guarda de login');
});

test('la página: la sección de papel con su h1, la lista, "Ver más" oculto y su arranque', () => {
  assert.match(pagina, /<h1 id="t-noticias">Lo último del básquet<\/h1>/);
  assert.match(pagina, /<div id="portal-noticias" aria-live="polite">/);
  assert.match(pagina, /<div class="portal-mas" id="noticias-mas" hidden><button type="button" class="btn sec" id="btn-noticias-mas">Ver más noticias<\/button><\/div>/);
  assert.match(pagina, /<script type="module" src="\/src\/ui\/noticiasArranque\.js"><\/script>/);
});

test('las tarjetas y las noticias no anulan el corte de palabras largas del body', () => {
  const reglas = leer('public/css/portal.css').split('\n').filter((l) => /\.portal-(not|art)/.test(l));
  for (const r of reglas) assert.doesNotMatch(r, /white-space\s*:\s*nowrap|overflow-wrap\s*:\s*normal|word-break\s*:\s*keep-all/, r);
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `node --test tests/portalNoticias.test.js`
Expected: FAIL con `Cannot find module '…/src/ui/portalNoticias.js'`.

- [ ] **Step 3: Crear `src/ui/portalNoticias.js`**

```js
import { html } from './html.js';
import { $ } from './dom.js';
import { noticiasPublicas, noticiaPublica } from '../data/repositorio.js';
import { PORTAL } from '../data/portal.js';
import { fechaLarga } from '../data/agenda.js';
import {
  rotuloDeEtiqueta, textoFechaCorta, parrafos, esIdNoticia, urlFotoValida, NOTICIAS_POR_PAGINA,
} from '../data/noticias.js';
import { destinoDeAuth } from '../data/entradaAuth.js';
import { iniciarMarco } from './portalMarco.js';

/*
 * Noticias en el portal (0064, spec 2026-10-21): las últimas 3 en el inicio,
 * todas en /noticias y una entera en /noticias?n=<id>. Lo que escribió la
 * coordinación sale escapado (html``), y una foto sólo se muestra si es del
 * bucket de noticias del proyecto (`base` = window.SUPABASE_URL).
 */

/** Una tarjeta, como las del sitio del club: foto, etiqueta, título, resumen, fecha y "Leer". */
export function htmlTarjetaNoticia(n, base) {
  const foto = n.foto ? urlFotoValida(n.foto.url, base) : null;
  const etiqueta = rotuloDeEtiqueta(n.etiqueta);
  return html`<article class="portal-not"><a href="/noticias?n=${n.id}">
    ${foto && html`<img src="${foto}" alt="${n.foto.alt}" loading="lazy">`}
    <div class="portal-not-cuerpo">
      ${etiqueta && html`<span class="portal-not-et">${etiqueta}</span>`}
      <h3>${n.titulo}</h3>
      <p>${n.resumen}</p>
      <div class="portal-not-pie">${n.fecha && html`<time datetime="${n.fecha}">${textoFechaCorta(n.fecha)}</time>`}<span aria-hidden="true">Leer →</span></div>
    </div>
  </a></article>`;
}

/** La grilla de tarjetas. Sin ninguna, nada: quien la usa oculta la sección. */
export function htmlListaNoticias(lista, base) {
  const validas = (lista ?? []).filter((n) => esIdNoticia(n?.id));
  if (!validas.length) return html``;
  return html`<div class="portal-nots">${validas.map((n) => htmlTarjetaNoticia(n, base))}</div>`;
}

/**
 * Una noticia entera. `previa`: la vista previa del panel, donde una foto
 * recién elegida todavía es un blob: y no hay lista a la que volver.
 */
export function htmlDetalleNoticia(n, base, { previa = false } = {}) {
  const fotos = (n.fotos ?? []).map((f) => ({ url: urlFotoValida(f.url, base, { previa }), alt: f.alt })).filter((f) => f.url);
  const etiqueta = rotuloDeEtiqueta(n.etiqueta);
  return html`<article class="portal-art">
    ${!previa && html`<a class="portal-art-volver" href="/noticias">← Todas las noticias</a>`}
    ${etiqueta && html`<span class="portal-not-et">${etiqueta}</span>`}
    <h1>${n.titulo}</h1>
    ${n.fecha && html`<time datetime="${n.fecha}">${fechaLarga(n.fecha)}</time>`}
    <p class="portal-art-bajada">${n.resumen}</p>
    ${fotos.length > 0 && html`<div class="portal-art-fotos">${fotos.map((f) => html`<figure><img src="${f.url}" alt="${f.alt}" loading="lazy"></figure>`)}</div>`}
    <div class="portal-art-cuerpo">${parrafos(n.cuerpo).map((p) => html`<p>${p}</p>`)}</div>
  </article>`;
}

export function htmlNoticiaNoEsta() {
  return html`<div class="portal-art">
    <h1>Esta noticia ya no está</h1>
    <p class="portal-not-nada">Puede que la hayan sacado, o que el link haya llegado cortado.</p>
    <p><a class="btn" href="/noticias">Ver todas las noticias</a></p>
  </div>`;
}

export const htmlSinNoticias = () => html`<p class="portal-not-nada">Todavía no hay noticias publicadas.</p>`;

export const htmlErrorNoticias = () => html`<p class="portal-not-nada">No pudimos traer las noticias. Probá de nuevo en un rato.</p>`;

/** Inicio: las últimas 3. Sin noticias, sin red o sin 0064 en la base, la sección queda oculta. */
export async function iniciarUltimasNoticias() {
  try {
    const lista = await noticiasPublicas(PORTAL.clubId, { limite: 3 });
    const contenido = htmlListaNoticias(lista, window.SUPABASE_URL).toString();
    $('portal-noticias').innerHTML = contenido;
    $('noticias').hidden = !contenido;
  } catch {
    // La función todavía no existe (0064 sin aplicar) o no hay red: el resto del inicio sigue igual.
  }
}

async function mostrarDetalle(id) {
  $('noticias-cab').hidden = true;
  $('noticias').removeAttribute('aria-labelledby');
  const lugar = $('portal-noticias');
  if (!esIdNoticia(id)) {
    lugar.innerHTML = htmlNoticiaNoEsta();
    return;
  }
  let noticia;
  try {
    noticia = await noticiaPublica(PORTAL.clubId, id);
  } catch {
    lugar.innerHTML = htmlErrorNoticias();
    return;
  }
  if (!noticia) {
    lugar.innerHTML = htmlNoticiaNoEsta();
    return;
  }
  document.title = `${noticia.titulo} · Básquet Newell's`;
  lugar.innerHTML = htmlDetalleNoticia(noticia, window.SUPABASE_URL);
}

async function mostrarLista() {
  const base = window.SUPABASE_URL;
  let mostradas = [];
  const traer = async (antesDe) => {
    const nuevas = await noticiasPublicas(PORTAL.clubId, { limite: NOTICIAS_POR_PAGINA, antesDe });
    mostradas = [...mostradas, ...nuevas];
    $('portal-noticias').innerHTML = mostradas.length ? htmlListaNoticias(mostradas, base) : htmlSinNoticias();
    $('noticias-mas').hidden = nuevas.length < NOTICIAS_POR_PAGINA;
  };
  $('btn-noticias-mas').addEventListener('click', async (ev) => {
    const boton = ev.currentTarget;
    if (boton.disabled) return;
    boton.disabled = true;
    try {
      await traer(mostradas.at(-1)?.publicadaEn ?? null);
      boton.textContent = 'Ver más noticias';
    } catch {
      boton.textContent = 'No se pudo. Tocá para probar de nuevo';
    } finally {
      boton.disabled = false;
    }
  });
  try {
    await traer(null);
  } catch {
    $('portal-noticias').innerHTML = htmlErrorNoticias();
  }
}

/** /noticias: la lista de a páginas, o una entera con ?n=<id>. */
export async function iniciarPaginaNoticias() {
  const marco = iniciarMarco();
  if (destinoDeAuth(window.location.search, window.location.hash)) return;
  const id = new URLSearchParams(window.location.search).get('n');
  await (id !== null ? mostrarDetalle(id) : mostrarLista());
  await marco;
}
```

- [ ] **Step 4: Página, arranque e inicio**

Crear `src/ui/noticiasArranque.js` con `iniciarPaginaNoticias`, como los otros arranques.

Crear `public/noticias.html` copiando la plantilla de la Task 5. Lo **[propio]**:
- `<title>Noticias · Básquet Newell&#39;s</title>` y `og:title` `Noticias · Básquet Newell's`.
- `description` y `og:description`: `Noticias del básquet formativo de Newell's.`
- `canonical` y `og:url`: `https://app-semillero.vercel.app/noticias`.
- Script: `/src/ui/noticiasArranque.js`.
- `<main>`:

```html
  <main class="portal">
    <!-- La lista de a 12 (src/ui/portalNoticias.js) o, con ?n=<id>, una noticia entera. -->
    <section class="portal-papel" id="noticias" aria-labelledby="t-noticias">
      <div class="portal-papel-cab" id="noticias-cab"><div><div class="portal-st">Noticias</div><h1 id="t-noticias">Lo último del básquet</h1></div></div>
      <div id="portal-noticias" aria-live="polite"><p class="portal-not-nada">Cargando…</p></div>
      <div class="portal-mas" id="noticias-mas" hidden><button type="button" class="btn sec" id="btn-noticias-mas">Ver más noticias</button></div>
    </section>
  </main>
```

En `src/ui/portal.js`, importar `{ iniciarUltimasNoticias } from './portalNoticias.js'` y, en `iniciarPortal`, justo después del bloque del calendario (después de la guarda de login):

```js
  iniciarUltimasNoticias();
```

- [ ] **Step 5: Ruteo, CSP, sitemap y el test de páginas**

- `vercel.json`: rewrite `/noticias` → `/public/noticias.html`, y `no-store` para `/noticias` y `/public/noticias.html`.
- `vercel.json`, en la CSP: `img-src 'self' blob: https://i.ytimg.com` → `img-src 'self' blob: https://i.ytimg.com https://lseqvbtdzebomxwtqhwu.supabase.co`. No tocar nada más de la cadena (el hash del import map está ahí).
- `public/sitemap.xml`: sumar la `<url>` de `https://app-semillero.vercel.app/noticias`.
- `tests/paginasPortal.test.js`: en `PAGINAS`, reemplazar el comentario de la Task 13 por `'/noticias': 'public/noticias.html',`.
- `tests/csp.test.js`, al final:

```js
// Las fotos de las noticias (0064) se sirven desde el bucket público del
// proyecto de Supabase. blob: es la vista previa del panel y del marcador.
test('img-src: el sitio, blob, las miniaturas de YouTube y el Storage de Supabase, nada más', () => {
  const url = readFileSync(path.join(raiz, 'public', 'config.js'), 'utf8').match(/SUPABASE_URL = '([^']+)'/)[1];
  assert.deepEqual(directiva('img-src'), ["'self'", 'blob:', 'https://i.ytimg.com', url]);
});
```

- [ ] **Step 6: Correr la suite**

Run: `npm run test:q`
Expected: PASS, con `paginasPortal` cubriendo ahora las cinco páginas.

- [ ] **Step 7: Verificar en el navegador (sin 0064 en la base)**

Run: `npm run servir` → `http://localhost:5174/` y `http://localhost:5174/noticias`.
Expected:
- En `/`, la sección de noticias **no** aparece. La consola muestra a lo sumo el 404 de la llamada a `noticias_publicas` (la función no existe en la base real), y nada más se rompe.
- En `/noticias`, se ve "No pudimos traer las noticias. Probá de nuevo en un rato." (la función no existe).
- `/noticias?n=abc` dice "Esta noticia ya no está" **sin** pedir nada a la base (Network: ningún request a `noticia_publica`).
- En la pestaña Network, la CSP de la respuesta de `/noticias` trae el host de Supabase en `img-src`.
Anotar todo esto en el reporte: el revisor no puede verlo con datos reales.

- [ ] **Step 8: Commit**

```bash
git add src/ui/portalNoticias.js src/ui/noticiasArranque.js public/noticias.html src/ui/portal.js vercel.json public/sitemap.xml tests/portalNoticias.test.js tests/paginasPortal.test.js tests/csp.test.js
git commit -m "feat(noticias): página de noticias, las últimas en el inicio y fotos de Storage en la CSP"
```

---

### Task 14: Panel del coordinador

Pantalla secundaria del modo coordinar, como Formularios: se llega desde FAMILIAS y no suma pestaña.

**Files:**
- Create: `src/ui/pantallas/coordNoticias.js`
- Create: `tests/coordNoticias.test.js`
- Modify: `public/index.html` (la sección de la pantalla; enlazar `portal.css` para la vista previa)
- Modify: `src/ui/pantallas/registro.js` (import y `registrarPantalla`)
- Modify: `src/ui/pantallas/coordFamilias.js` (botón "Noticias de la página del básquet" dentro del mismo fragmento `accesoFormularios`)
- Modify: `public/css/componentes.css` (`.not-foto` y la vista previa)

**Interfaces:**
- Consume: todo el repo de la Task 12; `validarNoticia`, `validarArchivoFoto`, `medidasAchicadas`, `rutaFoto`, `rotuloDeEtiqueta`, `fechaDeNoticia`, `textoFechaCorta`, `ETIQUETAS_NOTICIA`, `MAX_FOTOS`, `MAX_BYTES_FOTO`, `CALIDADES_FOTO`, `TIPOS_FOTO_ORIGINAL` (Task 11); `htmlDetalleNoticia` (Task 13); `hoyEnRosario`; `LIMITE`; `obtenerClubActual`; `toast`; `abrirHoja`/`cerrarHoja`; `confirmarEnHoja`; `avisoDeError`/`mensajeAlGuardar`/`mostrarAviso`.
- Produce: `renderNoticias(): Promise<void>`, registrada como `p-coord-noticias`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/coordNoticias.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Coordinación → Noticias: escribir, publicar, despublicar y borrar las
 * noticias del portal, con fotos. Como Formularios, es una pantalla secundaria
 * que se abre desde Familias. Sin navegador en los tests: se atan por el texto
 * las promesas que se rompen sin avisar (sobre todo las de privacidad).
 */
const fuente = (ruta) => readFileSync(ruta, 'utf8');
const pantalla = fuente('src/ui/pantallas/coordNoticias.js');
const cuerpoDe = (nombre) => {
  const desde = pantalla.search(new RegExp(`(async )?function ${nombre}\\(`));
  assert.ok(desde >= 0, `falta ${nombre}`);
  return pantalla.slice(desde, pantalla.indexOf('\n}\n', desde));
};

test('es una pantalla secundaria: tiene su sección, está registrada y no suma pestaña', async () => {
  assert.match(fuente('public/index.html'), /<section class="pant" id="p-coord-noticias"><div id="coord-noticias-contenido"><\/div><\/section>/);
  assert.match(fuente('src/ui/pantallas/registro.js'), /registrarPantalla\('p-coord-noticias', \{ titulo: 'Noticias', render: renderNoticias \}\)/);
  const { TABS_COORDINACION } = await import('../src/ui/chrome.js');
  assert.ok(!TABS_COORDINACION.some((t) => t.id === 'p-coord-noticias'));
});

test('se llega desde Familias, al lado de Formularios', () => {
  const familias = fuente('src/ui/pantallas/coordFamilias.js');
  assert.equal((familias.match(/id="fam-ir-noticias"/g) ?? []).length, 1);
  assert.match(familias, /ir\('p-coord-noticias', \{ push: true \}\)/);
});

test('avisa que lo publicado lo ve cualquiera, sin nombres de chicos, y que las fotos van con autorización', () => {
  assert.match(pantalla, /lo ve cualquiera/i);
  assert.match(pantalla, /nombres de chicos/i);
  assert.match(pantalla, /autorización de imagen/i);
});

test('los campos usan los límites de la base y la validación pura', () => {
  for (const limite of ['tituloNoticia', 'resumenNoticia', 'cuerpoNoticia', 'altFoto']) {
    assert.match(pantalla, new RegExp(`maxlength="\\$\\{LIMITE\\.${limite}\\}"`), limite);
  }
  assert.match(pantalla, /validarNoticia\(/);
  assert.match(pantalla, /validarArchivoFoto\(/);
  assert.match(pantalla, /accept="\$\{TIPOS_FOTO_ORIGINAL\.join\(','\)\}"/);
});

test('la casilla de la autorización arranca como estaba guardada (nueva: destildada)', () => {
  assert.match(pantalla, /<input id="not-autorizacion" type="checkbox"\$\{v\.autorizacionImagen && html` checked`\}>/);
  assert.match(pantalla, /autorizacionImagen: \$\('not-autorizacion'\)\.checked/);
});

test('el id de una noticia nueva lo pone el navegador, y las fotos se suben a su carpeta antes de crear la fila', () => {
  const g = cuerpoDe('guardar');
  assert.match(g, /const id = noticia\?\.id \?\? crypto\.randomUUID\(\);/);
  assert.ok(g.indexOf('subirFotoNoticia(') < g.indexOf('crearNoticia('));
  assert.match(g, /rutaFoto\(club\.id, id, crypto\.randomUUID\(\), f\.blob\.type\)/);
});

test('si falla el guardado, borra las fotos que alcanzó a subir; las quitadas, recién después de guardar', () => {
  const g = cuerpoDe('guardar');
  const captura = g.indexOf('} catch (e) {');
  assert.ok(captura > 0 && g.indexOf('borrarFotosNoticia(subidas)') > captura);
  assert.ok(g.indexOf('borrarFotosNoticia(quitadas)') > g.indexOf('crearNoticia('), 'las quitadas, cuando la noticia ya no las nombra');
});

test('cada foto se achica en el navegador antes de subirla', () => {
  const a = cuerpoDe('achicarFoto');
  assert.match(a, /validarArchivoFoto\(archivo\)/);
  assert.match(a, /medidasAchicadas\(/);
  assert.match(a, /for \(const calidad of CALIDADES_FOTO\)/);
  assert.match(a, /'image\/webp'/);
  assert.match(a, /'image\/jpeg'/);
  assert.match(a, /MAX_BYTES_FOTO/);
});

test('borrar pide confirmación con el verbo, y la vista previa usa la misma plantilla que el portal', () => {
  assert.match(cuerpoDe('borrar'), /confirmarEnHoja\(\{[\s\S]*verbo: 'Borrar'/);
  assert.match(pantalla, /htmlDetalleNoticia\([\s\S]*\{ previa: true \}\)/);
  assert.match(fuente('public/index.html'), /<link rel="stylesheet" href="\/public\/css\/portal\.css">/);
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `node --test tests/coordNoticias.test.js`
Expected: FAIL con `ENOENT … coordNoticias.js`.

- [ ] **Step 3: Crear `src/ui/pantallas/coordNoticias.js`**

```js
import {
  listarNoticias, crearNoticia, actualizarNoticia, borrarNoticia, subirFotoNoticia, borrarFotosNoticia, urlFotoNoticia,
} from '../../data/repositorio.js';
import {
  validarNoticia, validarArchivoFoto, medidasAchicadas, rutaFoto, rotuloDeEtiqueta, fechaDeNoticia, textoFechaCorta,
  ETIQUETAS_NOTICIA, MAX_FOTOS, MAX_BYTES_FOTO, CALIDADES_FOTO, TIPOS_FOTO_ORIGINAL,
} from '../../data/noticias.js';
import { hoyEnRosario } from '../../data/agenda.js';
import { LIMITE } from '../../data/limites.js';
import { obtenerClubActual } from '../sesion.js';
import { toast } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { confirmarEnHoja } from '../componentes/confirmar.js';
import { $ } from '../dom.js';
import { html } from '../html.js';
import { avisoDeError, mensajeAlGuardar, mostrarAviso } from '../errores.js';
import { htmlDetalleNoticia } from '../portalNoticias.js';

/*
 * Noticias del portal del básquet (0064, spec 2026-10-21): la coordinación
 * escribe, publica, despublica y borra las noticias que las familias ven en
 * la página pública, con fotos. Se llega desde la pestaña FAMILIAS, como
 * Formularios.
 *
 * Lo publicado lo ve cualquiera, sin cuenta, y en un club formativo las fotos
 * son de menores: por eso el aviso de arriba, la descripción obligatoria de
 * cada foto (sin nombres) y la casilla de la autorización de imagen, que la
 * base también exige (check de 0064).
 */

let noticias = [];
// Del editor abierto: las fotos que quedan ({ ruta } ya guardadas o { blob }
// recién elegidas, con su url y su alt) y las rutas de las que se sacaron.
let fotos = [];
let quitadas = [];

const contenedor = () => $('coord-noticias-contenido');

const mensajeDeError = (e) => mensajeAlGuardar(e, {
  reglas: [
    [/noticia_fotos_autorizadas/, 'Falta confirmar la autorización de imagen de las familias.'],
    [/noticia_fotos_validas/, 'Una de las fotos no se guardó bien. Sacala y volvé a subirla.'],
    [/exceeded the maximum allowed size|Payload too large/i, 'Una de las fotos pesa más de 1 MB. Sacala y volvé a subirla.'],
  ],
  permiso: /NO_SE_PUDO|row-level security|permission denied|Unauthorized/i,
});

const CAMPO = { titulo: 'not-titulo', resumen: 'not-resumen', cuerpo: 'not-cuerpo', etiqueta: 'not-etiqueta', autorizacion: 'not-autorizacion' };
const campoDelError = (r) => (r.campo === 'fotos' ? (r.foto != null ? `not-alt-${r.foto}` : 'not-archivos') : CAMPO[r.campo]);

function filaHtml(n) {
  const fecha = n.publicadaEn ? ` · ${textoFechaCorta(fechaDeNoticia(n.publicadaEn))}` : '';
  return html`
    <div class="jug-fila form-fila">
      <button type="button" class="form-fila-texto" data-noticia="${n.id}">
        <span class="nom">${n.titulo}</span>
        <span class="det">${rotuloDeEtiqueta(n.etiqueta)}${fecha}</span>
      </button>
      ${n.publicada ? html`<span class="chip">Publicada</span>` : html`<span class="chip sin">Borrador</span>`}
    </div>`;
}

export async function renderNoticias() {
  const club = obtenerClubActual();
  if (!club) return;
  contenedor().innerHTML = html`<div class="pad"><div class="p" role="status">Cargando…</div></div>`;
  try {
    noticias = await listarNoticias(club.id);
  } catch (e) {
    contenedor().innerHTML = html`${avisoDeError(e, 'No se pudieron cargar las noticias.')}
      <div class="pad"><button class="btn sec" id="btn-reintentar-noticias">Reintentar</button></div>`;
    $('btn-reintentar-noticias').addEventListener('click', () => renderNoticias());
    return;
  }

  const cuerpo = noticias.length
    ? html`<div class="eyebrow">Noticias <span class="der">${noticias.filter((n) => n.publicada).length} publicadas</span></div>
      ${noticias.map(filaHtml)}`
    : html`<div class="estado-vacio"><h2>Noticias</h2>
        <div class="p">Todavía no hay noticias. Las que publiques aparecen en la página del básquet, en el inicio y en Noticias.</div>
      </div>`;

  contenedor().innerHTML = html`
    <div class="pad">
      <div class="p det">Lo que publicás acá lo ve cualquiera que abra la página del básquet, sin entrar con ninguna cuenta: no pongas nombres de chicos ni datos personales, ni en el texto ni en la descripción de las fotos. Las fotos van sólo con la autorización de imagen firmada por las familias.</div>
      <p class="p det"><a href="/noticias" target="_blank" rel="noopener">Ver cómo lo ven las familias</a></p>
      ${cuerpo}
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-nueva-noticia">Nueva noticia</button></div>`;

  $('btn-nueva-noticia').addEventListener('click', () => abrirEditor(null));
  contenedor().querySelectorAll('[data-noticia]').forEach((b) => b.addEventListener('click', () => {
    abrirEditor(noticias.find((n) => n.id === b.dataset.noticia));
  }));
}

const aBlob = (lienzo, tipo, calidad) => new Promise((listo) => lienzo.toBlob(listo, tipo, calidad));

/**
 * Achica la foto a LADO_MAX_FOTO y la pasa a webp. Safari no sabe codificar
 * webp desde un canvas (devuelve png): ahí va jpeg. Prueba calidades hasta que
 * pesa menos que lo que acepta el bucket. Tira un Error con el mensaje para la
 * persona si la foto no sirve.
 */
async function achicarFoto(archivo) {
  const problema = validarArchivoFoto(archivo);
  if (problema) throw new Error(problema);
  let imagen;
  try {
    imagen = await createImageBitmap(archivo);
  } catch {
    throw new Error('No pudimos abrir esa foto. Probá con otra o mandá una captura.');
  }
  const { ancho, alto } = medidasAchicadas(imagen.width, imagen.height);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext('2d').drawImage(imagen, 0, 0, ancho, alto);
  imagen.close();
  for (const calidad of CALIDADES_FOTO) {
    let blob = await aBlob(lienzo, 'image/webp', calidad);
    if (blob?.type !== 'image/webp') blob = await aBlob(lienzo, 'image/jpeg', calidad);
    if (blob && blob.size <= MAX_BYTES_FOTO) return blob;
  }
  throw new Error('La foto sigue pesando más de 1 MB después de achicarla. Probá con otra.');
}

function liberarPrevias() {
  for (const f of fotos) if (f.blob) URL.revokeObjectURL(f.url);
}

function pintarFotos() {
  $('not-fotos').innerHTML = html`${fotos.map((f, i) => html`<div class="not-foto">
    <img src="${f.url}" alt="" width="72" height="72">
    <div class="campo">
      <label for="not-alt-${i}">Qué se ve en la foto ${i + 1}</label>
      <input id="not-alt-${i}" type="text" maxlength="${LIMITE.altFoto}" value="${f.alt}" data-alt="${i}" placeholder="Ej.: La U13 en el Microestadio (sin nombres)">
    </div>
    <button type="button" class="btn sec chico" data-quitar="${i}">Quitar</button>
  </div>`)}`;
  $('not-archivos').disabled = fotos.length >= MAX_FOTOS;
}

async function agregarFotos(input) {
  const elegidos = [...input.files].slice(0, MAX_FOTOS - fotos.length);
  input.value = '';
  $('not-aviso').innerHTML = '';
  for (const archivo of elegidos) {
    try {
      const blob = await achicarFoto(archivo);
      fotos.push({ blob, url: URL.createObjectURL(blob), alt: '' });
    } catch (e) {
      mostrarAviso($('not-aviso'), e.message);
    }
  }
  pintarFotos();
}

function pintarPrevia() {
  $('not-previa-cuerpo').innerHTML = htmlDetalleNoticia({
    titulo: $('not-titulo').value, resumen: $('not-resumen').value, cuerpo: $('not-cuerpo').value,
    etiqueta: $('not-etiqueta').value, fecha: hoyEnRosario(), fotos: fotos.map((f) => ({ url: f.url, alt: f.alt })),
  }, window.SUPABASE_URL, { previa: true });
}

/** Alta (noticia nula) o edición. */
function abrirEditor(noticia) {
  liberarPrevias();
  fotos = (noticia?.fotos ?? []).map((f) => ({ ruta: f.ruta, url: urlFotoNoticia(f.ruta), alt: f.alt }));
  quitadas = [];
  const v = noticia ?? { titulo: '', resumen: '', cuerpo: '', etiqueta: 'club', autorizacionImagen: false, publicada: false };
  abrirHoja({
    titulo: noticia ? 'Editar noticia' : 'Nueva noticia',
    alCerrar: liberarPrevias,
    cuerpo: html`
      <div class="campo">
        <label for="not-titulo">Título</label>
        <input id="not-titulo" type="text" maxlength="${LIMITE.tituloNoticia}" autocomplete="off" value="${v.titulo}" placeholder="Ej.: Arrancó la temporada de la U13">
      </div>
      <div class="campo">
        <label for="not-resumen">Resumen (es lo que se ve en la tarjeta)</label>
        <textarea id="not-resumen" rows="2" maxlength="${LIMITE.resumenNoticia}">${v.resumen}</textarea>
      </div>
      <div class="campo">
        <label for="not-cuerpo">Texto</label>
        <textarea id="not-cuerpo" rows="8" maxlength="${LIMITE.cuerpoNoticia}">${v.cuerpo}</textarea>
      </div>
      <div class="p det">Para separar párrafos, dejá una línea en blanco.</div>
      <div class="campo">
        <label for="not-etiqueta">De qué es</label>
        <span class="env"><select id="not-etiqueta">
          ${ETIQUETAS_NOTICIA.map((e) => html`<option value="${e.clave}"${v.etiqueta === e.clave && html` selected`}>${e.rotulo}</option>`)}
        </select></span>
      </div>
      <div class="campo">
        <label for="not-archivos">Fotos (hasta ${MAX_FOTOS})</label>
        <div id="not-fotos"></div>
        <input id="not-archivos" type="file" accept="${TIPOS_FOTO_ORIGINAL.join(',')}" multiple>
      </div>
      <label class="acepto" for="not-autorizacion">
        <input id="not-autorizacion" type="checkbox"${v.autorizacionImagen && html` checked`}>
        <span>Tengo la autorización de imagen firmada por las familias de los chicos que se ven en las fotos.</span>
      </label>
      <details id="not-previa"><summary>Vista previa</summary><div class="portal-papel" id="not-previa-cuerpo"></div></details>
      <div id="not-aviso"></div>
      <div class="acciones-hoja">
        <button type="button" class="btn sec" id="not-borrador">${v.publicada ? 'Despublicar' : 'Guardar borrador'}</button>
        <button type="button" class="btn" id="not-publicar">${v.publicada ? 'Guardar' : 'Publicar'}</button>
      </div>
      ${noticia && html`<div class="acciones-hoja"><button type="button" class="btn sec" id="not-borrar">Borrar noticia</button></div>`}`.toString(),
  });
  pintarFotos();
  $('not-fotos').addEventListener('input', (ev) => {
    const i = ev.target.dataset.alt;
    if (i !== undefined) fotos[Number(i)].alt = ev.target.value;
  });
  $('not-fotos').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-quitar]');
    if (!b) return;
    const [f] = fotos.splice(Number(b.dataset.quitar), 1);
    if (f.ruta) quitadas.push(f.ruta);
    if (f.blob) URL.revokeObjectURL(f.url);
    pintarFotos();
  });
  $('not-archivos').addEventListener('change', (ev) => agregarFotos(ev.target));
  $('not-previa').addEventListener('toggle', () => { if ($('not-previa').open) pintarPrevia(); });
  $('not-borrador').addEventListener('click', () => guardar(noticia, false, $('not-borrador')));
  $('not-publicar').addEventListener('click', () => guardar(noticia, true, $('not-publicar')));
  $('not-borrar')?.addEventListener('click', () => borrar(noticia));
}

async function guardar(noticia, publicada, boton) {
  if (boton.disabled) return;
  $('not-aviso').innerHTML = '';
  const r = validarNoticia({
    titulo: $('not-titulo').value, resumen: $('not-resumen').value, cuerpo: $('not-cuerpo').value,
    etiqueta: $('not-etiqueta').value, fotos, autorizacionImagen: $('not-autorizacion').checked,
  });
  if (r.error) {
    mostrarAviso($('not-aviso'), r.error, { campo: $(campoDelError(r)) });
    return;
  }
  const club = obtenerClubActual();
  // El id de una noticia nueva lo pone el navegador: las fotos se suben a la carpeta de la noticia antes de crear la fila.
  const id = noticia?.id ?? crypto.randomUUID();
  const texto = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  const subidas = [];
  try {
    const guardadas = [];
    for (const [i, f] of fotos.entries()) {
      let { ruta } = f;
      if (!ruta) {
        ruta = rutaFoto(club.id, id, crypto.randomUUID(), f.blob.type);
        await subirFotoNoticia(ruta, f.blob);
        subidas.push(ruta);
      }
      guardadas.push({ ruta, alt: r.noticia.alts[i] });
    }
    const { titulo, resumen, cuerpo, etiqueta, autorizacionImagen } = r.noticia;
    const datos = { titulo, resumen, cuerpo, etiqueta, fotos: guardadas, autorizacionImagen, publicada };
    await (noticia ? actualizarNoticia(id, datos) : crearNoticia({ id, clubId: club.id, ...datos }));
  } catch (e) {
    // Si no se guardó, las fotos que alcanzaron a subir no quedan sueltas en el bucket.
    await borrarFotosNoticia(subidas).catch(() => {});
    mostrarAviso($('not-aviso'), mensajeDeError(e));
    boton.disabled = false;
    boton.textContent = texto;
    return;
  }
  // Las que se sacaron, recién ahora que la noticia ya no las nombra. Si esto
  // falla, quedan en el bucket sin que ninguna página las muestre.
  await borrarFotosNoticia(quitadas).catch(() => {});
  cerrarHoja();
  toast(publicada ? 'Noticia publicada.' : 'Guardada. Las familias no la ven.');
  await renderNoticias();
}

function borrar(noticia) {
  confirmarEnHoja({
    titulo: 'Borrar noticia',
    texto: `Se borra «${noticia.titulo}» con sus fotos y deja de verse en la página. No se puede deshacer.`,
    verbo: 'Borrar',
    alConfirmar: async () => {
      try {
        await borrarNoticia(noticia);
      } catch (e) {
        toast(mensajeDeError(e));
        throw e;
      }
      toast('Noticia borrada.');
      await renderNoticias();
    },
  });
}
```

- [ ] **Step 4: Conectar la pantalla**

- `public/index.html`: debajo de `<section class="pant" id="p-coord-formularios">…</section>`:

```html
    <section class="pant" id="p-coord-noticias"><div id="coord-noticias-contenido"></div></section>
```

y, debajo del `<link rel="stylesheet" href="/public/css/publico.css">` del `<head>`, `<link rel="stylesheet" href="/public/css/portal.css">` (para la vista previa).
- `src/ui/pantallas/registro.js`: `import { renderNoticias } from './coordNoticias.js';` con los demás imports, y debajo del registro de Formularios:

```js
  registrarPantalla('p-coord-noticias', { titulo: 'Noticias', render: renderNoticias });
```

- `src/ui/pantallas/coordFamilias.js`: el fragmento y su cableado quedan así (mismo nombre, así siguen pasando los tests de `coordFormularios`):

```js
const accesoFormularios = html`
  <div class="acciones"><button class="btn sec" id="fam-ir-formularios">Formularios de la página del básquet</button>
    <button class="btn sec" id="fam-ir-noticias">Noticias de la página del básquet</button></div>`;
const cablearFormularios = () => {
  $('fam-ir-formularios').addEventListener('click', () => ir('p-coord-formularios', { push: true }));
  $('fam-ir-noticias').addEventListener('click', () => ir('p-coord-noticias', { push: true }));
};
```

Actualizar el comentario de arriba del fragmento: ahora lleva a Formularios y a Noticias.
- `public/css/componentes.css`, al final:

```css
/* ---- Noticias del portal (coordNoticias.js): cada foto con su descripción, y la vista previa ---- */
.not-foto{display:grid;grid-template-columns:4.5rem 1fr;gap:var(--sp-3);align-items:start;margin-bottom:var(--sp-3)}
.not-foto img{width:4.5rem;height:4.5rem;object-fit:cover;border-radius:var(--r-s);background:var(--fondo-chip)}
.not-foto .campo{margin-bottom:var(--sp-2)}
.not-foto .btn{grid-column:2;justify-self:start}
#not-previa{margin:var(--sp-4) 0}
#not-previa .portal-papel{margin-top:var(--sp-3);padding:var(--sp-4);border-radius:var(--r)}
```

- [ ] **Step 5: Correr la suite**

Run: `npm run test:q`
Expected: PASS, incluidos `coordFormularios` (el fragmento sigue apareciendo dos veces y cableado dos veces), `arquitectura`, `importsResueltos`, `csp` y `estilosTokens`.

- [ ] **Step 6: Verificar lo que se puede sin la base**

Run: `npm run servir` → `http://localhost:5174/app`, entrando como coordinador (o con la sesión que ya tenga el navegador; **no** crear cuentas ni escribir contraseñas).
Expected: en FAMILIAS está "Noticias de la página del básquet" y abre la pantalla. Como 0064 no está aplicada, la lista muestra "No se pudieron cargar las noticias." con Reintentar, sin romper el resto de la app. Si no hay sesión de coordinador a mano, **no** forzarla: anotarlo en el reporte. La prueba completa queda para después del `db push` (Task 15).

- [ ] **Step 7: Commit**

```bash
git add src/ui/pantallas/coordNoticias.js tests/coordNoticias.test.js public/index.html src/ui/pantallas/registro.js src/ui/pantallas/coordFamilias.js public/css/componentes.css
git commit -m "feat(noticias): panel de coordinación para escribir, publicar y borrar noticias con fotos"
```

---

### Task 15: Documentación y cierre

**Files:**
- Modify: `docs/COORDINACION.md`
- Modify: `docs/legal/cambios-portal.md`
- Modify: `docs/SEO.md`

- [ ] **Step 1: `docs/COORDINACION.md`**

Debajo de la sección "Formularios: se cargan desde la app, sin tocar código", sumar:

```markdown
### Noticias: se publican desde la app

En Semillero, modo coordinar → **FAMILIAS** → **Noticias de la página del básquet**.

1. **Nueva noticia:** título, resumen (la línea de la tarjeta), texto (párrafos separados por una línea en blanco) y de qué es (Club, Partidos, Eventos, Inscripción).
2. **Fotos (hasta 6):** el celular las achica solo antes de subirlas. Cada una lleva una descripción de qué se ve, **sin nombres de chicos**. Para guardarla con fotos hay que tildar la autorización de imagen: tildala sólo si las familias de los chicos que se ven la firmaron.
3. **Guardar borrador** la deja sin publicar; **Publicar** la muestra en el inicio (las 3 últimas) y en `/noticias`. La fecha que se ve es la de la primera vez que se publicó.
4. **Despublicar** la saca de la página sin borrarla. **Borrar noticia** la borra con sus fotos, y no se puede deshacer.

Lo publicado lo ve cualquiera, sin cuenta.
```

En la sección de `src/data/portal.js`, sumar una línea sobre el campo opcional `detalle` de cada categoría (se muestra en `/categorias`; sin él, no aparece nada).

- [ ] **Step 2: `docs/legal/cambios-portal.md`**

Al final:

```markdown
## Noticias con fotos (0064, 2026-10-21) — PENDIENTE de aprobación del club

El portal suma noticias que publica la coordinación, con fotos guardadas en el Storage de Supabase (bucket público: cualquiera con el link de una foto la ve). En la base y en la interfaz, una noticia con fotos exige que la coordinación confirme la autorización de imagen de las familias. Cada foto lleva una descripción sin nombres de chicos.

**Falta decidir con el club** si `public/legal/privacidad.html` tiene que mencionarlo (qué fotos se publican, con qué autorización, dónde se guardan y cómo pedir que se saque una). Si se cambia el texto, sube `VERSION_LEGAL` y todos los usuarios aceptan de nuevo, como en `2026-10-19`. **Esta rama no toca `privacidad.html`.**
```

- [ ] **Step 3: `docs/SEO.md`**

En "Qué hay en el repo", sumar que el portal tiene cinco páginas con su `title`, `description`, `canonical` y Open Graph propios, todas en `sitemap.xml`. El detalle de una noticia (`/noticias?n=…`) comparte el Open Graph genérico de `/noticias`: un sitio estático no puede armar uno por noticia.

- [ ] **Step 4: Commit**

```bash
git add docs/COORDINACION.md docs/legal/cambios-portal.md docs/SEO.md
git commit -m "docs(portal): publicar noticias, el pendiente legal de las fotos y el SEO de las páginas nuevas"
```

---

## Verificación final

Antes del review de la rama. Cada casilla necesita el comando corrido y su salida leída, no supuesta.

- [ ] `npm run test:q`: todo verde.
- [ ] `git log --oneline main..HEAD`: un commit por task (1 a 15), en español, y ninguno mezcla refactor con feature.
- [ ] `git diff main --stat -- supabase/migrations`: sólo `0064_noticias.sql` (ninguna migración vieja tocada).
- [ ] `grep -rn "Próximamente" public src`: nada.
- [ ] `grep -rln "wa\.me" public src`: sólo `src/data/portal.js` (la configuración) y nada más que la arme fuera de `htmlAyuda`.
- [ ] `grep -rn "portal-hoja\|portal-atajos\|portal-todas" public src`: nada.
- [ ] Con `npm run servir`, recorrer `/`, `/noticias`, `/categorias`, `/calendario` y `/ayuda` en **320×568**, **360×640**, **768×1024** y **1440×900**:
  - En celular, las dos acciones se ven sin scrollear (tarjetas del hero en `/`, barra fija en las demás, si la base tiene algún formulario abierto).
  - No hay scroll horizontal.
  - La navegación marca la página actual.
  - La consola no muestra errores de CSP. El único error esperado es el 404 de `noticias_publicas` (0064 sin aplicar).
- [ ] Con zoom de texto al 130 % en 360×640: las acciones siguen sin scroll.
- [ ] Con `prefers-reduced-motion: reduce` (DevTools → Rendering), la barra aparece sin animación.
- [ ] `http://localhost:5174/#ayuda`, `/#categorias` y `/#calendario` llevan a su página. `http://localhost:5174/?code=abc` manda a `/app?code=abc` (igual que antes).
- [ ] `http://localhost:5174/consultas` sigue redirigiendo al formulario "Quiero jugar" (o diciendo que no hay, como antes).
- [ ] Teclado solo en `/` y `/ayuda`: Tab recorre el encabezado, la barra y el contenido con el foco visible. Las preguntas abren con Enter.
- [ ] Review final de la rama (subagente revisor, modelo Opus), con el spec, este plan y las capturas de las Tasks 4, 8 y 13.

## Notas para quien ejecuta

- **Lo que queda para el usuario, fuera de esta rama, en este orden:** (1) `npm run backup`; (2) `npx supabase db push` para aplicar 0064 (CLAUDE.md: pedir confirmación antes y preguntar por el backup); (3) correr `tests/verificarNoticias.sql` en el SQL Editor y ver los 7 casos en OK; (4) publicar el código; (5) publicar una noticia de prueba con una foto y mirarla en `/`, `/noticias` y `/noticias?n=…`; (6) despublicarla y borrarla. Si el código se publica antes que 0064, las noticias quedan ocultas y todo lo demás anda (Task 13, Step 7).
- **El orden de las tasks importa.** De la 4 a la 7, los links de la navegación a páginas que todavía no existen dan 404 en local: es esperado. De la 10 a la 12 no hay nada visible: son base, lógica y repo. La 13 es la primera que muestra noticias (ocultas, sin 0064).
- **Si un test viejo de `portalPagina.test.js` falla y la task no lo nombra como "cambia a propósito"**, es una regresión: arreglar el código, no el test.
- **El HTML copiado (encabezado, barra, pie, import map) se copia, no se reescribe.** `tests/paginasPortal.test.js` compara byte por byte con `/`. Si hace falta cambiar el encabezado, se cambia en las cinco páginas en el mismo commit.
- **`htmlAyuda` es el único lugar que arma el WhatsApp del coordinador.** No sumar el contacto a `htmlContacto`, al pie ni a la barra, aunque parezca cómodo: lo prohíbe un test, y fue un pedido explícito del diseño anterior.
- **No inventar contenido para que una sección "se vea llena".** Sin noticias, sin detalle de categoría o sin foto del club, esa parte queda oculta.
- **Sin cuentas de prueba ni contraseñas.** La verificación del panel (Task 14) se hace con una sesión que ya exista o se deja anotada. Nada de crear usuarios en la base real.
