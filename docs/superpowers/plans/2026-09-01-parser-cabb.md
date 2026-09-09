# Parser CABB Aislado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, dependency-free (except `xlsx`) parser that turns a CABB-exported `.xlsx` match stat sheet into a verified, deterministic data object, plus the empty folder skeleton for the next two stages.

**Architecture:** A single module (`src/parser/parserCabb.js`) reads the workbook with SheetJS, locates the title cell and the two "Num." header rows by text search (never by fixed row number), resolves the 22 data columns positionally against an expected header sequence (cross-checked against the shot-type grouping row), walks each block's player rows until a `TOTALES` row, and returns one big contract object. It never throws — every failure path degrades to an `errores`/`advertencias` entry.

**Tech Stack:** Node.js (ES modules, `"type": "module"`), `xlsx` (SheetJS) 0.18.5 from npm, `node:test` / `node:assert` for tests. No bundler, no framework, no build step — matches the project's vanilla-JS/Vercel-deploy trajectory.

**Spec:** The full original prompt (pasted by the user at the start of this conversation — Etapa 1: Parser CABB aislado). This plan is self-contained and embeds every fact needed from it plus everything verified against the real fixtures.

## Global Constraints

- Stack: HTML/CSS/JS vanilla, ES modules, no build step. `package.json` has `"type": "module"`.
- The parser is **club-agnostic**: no club name (Newell's or otherwise) may appear anywhere in `src/parser/parserCabb.js`. Blocks are labeled purely `local`/`visitante` by position.
- Jersey number (`numero`) is never used to match players across matches — matching is always by `nombreClave`. `numero` is stored only as a per-match fact.
- The file never carries the match date. The parser must not invent or request one.
- 100% deterministic: no AI, no heuristics beyond documented string/cell rules.
- Only dependency allowed: `xlsx`. Anything else requires stopping and asking the user first.
- `parsearPartidoCabb` must **never throw**, for any input, including empty buffers and non-CABB `.xlsx` files.
- No hardcoded row numbers anywhere in the block/player-location logic — only text-anchored search (title text, `"Num."` header text, `"TOTALES"` marker) and relative offsets computed from those anchors.
- Scope for this task: `src/parser/`, `tests/`, `package.json`, `PARSER.md`, and empty skeleton folders (`src/data/`, `src/ui/`, `public/`, `supabase/`) with `.gitkeep`. Do **not** write code in `src/data/`, `src/ui/`, `public/`, `supabase/`, and do not touch the existing prototype files at the repo root (`index.html`, `css/`, `js/`, `manifest.webmanifest`, `CAMBIOS.md`).

## Verified facts about the 4 real fixtures (gathered by inspecting them directly — use these, don't re-derive)

All 4 files in `tests/fixtures/`: `estadisticaPartido_2026105023.xlsx`, `estadisticaPartido_2026105329.xlsx`, `DOC-20260901-WA0002.xlsx`, `estadisticaPartido_2026105541sub17.xlsx`.

- Sheet name in all 4: exactly `Estadísticas-`.
- Header row (22 cells, always identical text/order in all 4 files, in both blocks): `Num.`, `Nombre`, `MIN`, `PTS`, `A/I`, `%`, `A/I`, `%`, `A/I`, `%`, `DEF`, `OF`, `Tot.`, `AST`, `REC`, `PER`, `TC`, `TR`, `FC`, `FR`, `VAL`, `+/-`.
- Grouping row immediately above the header row contains (among other non-adjacent cells) `TC 2P`, `TC 3P`, `TL` in that left-to-right order in all 4 files.
- Team name is always exactly 2 rows above the header row (team name → grouping row → header row, contiguous, no gap) in all 4 files.
- Block 1 (topmost header row) is always the title's first/local team; block 2 is always the title's second/visitante team — confirmed in all 4 files.
- The `TOTALES` row of a block has an empty `Num.` cell and `"TOTALES"` in the `Nombre` cell.
- Real titles found:
  - `estadisticaPartido_2026105023.xlsx` → `"Estadísticas - MUNICIPALIDAD DE PUERTO SAN MARTIN vs NEWELLS OLD BOYS - U21M - ARBB FORMATIVAS MASCULINO 2026 - CABB - 2026"`
  - `estadisticaPartido_2026105329.xlsx` → `"Estadísticas - NEWELLS OLD BOYS vs UNION Y PROGRESO - U21M - ARBB FORMATIVAS MASCULINO 2026 - CABB - 2026"`
  - `DOC-20260901-WA0002.xlsx` → `"Estadísticas - NEWELLS OLD BOYS vs ATLANTIC SPORTSMEN CLUB 'B' - U21M - ARBB FORMATIVAS MASCULINO 2026 - CABB - 2026"`
  - `estadisticaPartido_2026105541sub17.xlsx` → `"Estadísticas - TALLERES ARROYO SECO vs NEWELLS OLD BOYS - U17M - ARBB FORMATIVAS MASCULINO 2026 - CABB - 2026"`
- Real jersey-number change for `PALUMBO, BAUTISTA` (nombreClave `PALUMBO BAUTISTA`): `16` in `DOC-20260901-WA0002.xlsx`, `15` in `estadisticaPartido_2026105023.xlsx`, `10` in `estadisticaPartido_2026105329.xlsx`.
- **Verified correction to the original spec's expectation:** the union of `nombreClave` for the Newell's block across the 3 U21M files (`estadisticaPartido_2026105023.xlsx`, `estadisticaPartido_2026105329.xlsx`, `DOC-20260901-WA0002.xlsx`) is **13 distinct players**, not 15 (max per single file is 12, which does match the original spec). The user confirmed to use 13, the verified number, in the test. The 13: `ROMEO SCHIAVETTI MIQUEAS`, `ARROYO THIAGO AGUSTIN`, `TORREDEMERT DAVID`, `BARBA ELIAS DANIEL`, `LANGELLOTTI LUCIO`, `BARRERA FACUNDO`, `SAGRA HASSEN JUAN IGNACIO`, `BENITEZ THIAGO MIGUEL`, `GUERRERO TOMAS`, `BLANCO AGUSTIN`, `PALUMBO BAUTISTA`, `ANDINO TOMAS`, `ALMIRON JERONIMO`.
- `npm install xlsx` (0.18.5, the latest npm-published version) succeeds but `npm audit` reports 2 known high-severity advisories (prototype pollution, ReDoS) with no npm-published fix — SheetJS ships the actual fix only via their own CDN, not npm. This is disclosed in `PARSER.md`; no action needed since `xlsx` is the only dependency the spec allows and the files being parsed are club-controlled exports, not arbitrary internet uploads.

## Task 1: Project scaffold

**Files:**
- Modify: `package.json` (already created with `xlsx` dependency during investigation — verify/finalize it)
- Create: `.gitignore` (does not exist yet — `node_modules/` must not be committed)
- Create: `src/data/.gitkeep`, `src/ui/.gitkeep`, `public/.gitkeep`, `supabase/.gitkeep`

**Interfaces:**
- Produces: a working `npm test` command (`node --test tests/parserCabb.test.js`) that later tasks rely on.

- [ ] **Step 1: Confirm/write `package.json`**

```json
{
  "name": "app-formativa",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/parserCabb.test.js"
  },
  "dependencies": {
    "xlsx": "^0.18.5"
  }
}
```

Use `"node --test tests/parserCabb.test.js"` (the explicit file), **not** `"node --test tests/"` — Node's test runner treats every `.js` file inside any folder literally named `test`/`tests` as a test file by default, which would make it try (and fail) to execute `tests/inspect.js` as a test.

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 3: Create the empty skeleton folders**

```bash
mkdir -p src/data src/ui public supabase
touch src/data/.gitkeep src/ui/.gitkeep public/.gitkeep supabase/.gitkeep
```

- [ ] **Step 4: Verify**

Run: `ls src/data src/ui public supabase && cat package.json && cat .gitignore`
Expected: each folder listed with a `.gitkeep` file, `package.json` and `.gitignore` match above.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore src/data/.gitkeep src/ui/.gitkeep public/.gitkeep supabase/.gitkeep
git commit -m "chore: scaffold parser project skeleton and xlsx dependency"
```

## Task 2: Pure parsing helpers

**Files:**
- Create: `src/parser/parserCabb.js` (helpers only in this task — no `parsearPartidoCabb` yet)
- Create: `tests/parserCabb.test.js` (helper tests only in this task)

**Interfaces:**
- Produces (named exports used by Task 3): `limpiarNombre(nombreCrudo: string): string`, `clavearNombre(nombreLimpio: string): string`, `parsearFraccion(texto: string): {anotados:number, intentados:number} | null`, `parsearEntero(texto: string): number | null`, `parsearMinutos(texto: string): number | null` (seconds), `parsearTitulo(tituloCrudo: string): {local, visitante, categoria, competencia, anio, error}`.

- [ ] **Step 1: Write the failing tests for the helpers**

Create `tests/parserCabb.test.js` with this content:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  limpiarNombre,
  clavearNombre,
  parsearFraccion,
  parsearEntero,
  parsearMinutos,
  parsearTitulo,
} from '../src/parser/parserCabb.js';

test('limpiarNombre limpia los casos sucios reales', () => {
  const casos = [
    ['SAGRA HASSEN,  JUAN IGNACIO', 'SAGRA HASSEN, JUAN IGNACIO', 'SAGRA HASSEN JUAN IGNACIO'],
    ['MUSSA,  RAMIRO', 'MUSSA, RAMIRO', 'MUSSA RAMIRO'],
    ['GIMÉNEZ , DAVID', 'GIMÉNEZ, DAVID', 'GIMENEZ DAVID'],
    ['NUÑEZ , IGNACIO', 'NUÑEZ, IGNACIO', 'NUNEZ IGNACIO'],
    ['DEMARCHI , MÁXIMO ANDRES', 'DEMARCHI, MÁXIMO ANDRES', 'DEMARCHI MAXIMO ANDRES'],
    ['TODESCHINI, , BAUTISTA', 'TODESCHINI, BAUTISTA', 'TODESCHINI BAUTISTA'],
    ['GUERRERO, TOMAS ', 'GUERRERO, TOMAS', 'GUERRERO TOMAS'],
    ['MILONE DELMENICO, VALENTINO ', 'MILONE DELMENICO, VALENTINO', 'MILONE DELMENICO VALENTINO'],
  ];
  for (const [crudo, limpioEsperado, claveEsperada] of casos) {
    const limpio = limpiarNombre(crudo);
    assert.strictEqual(limpio, limpioEsperado, crudo);
    assert.strictEqual(clavearNombre(limpio), claveEsperada, crudo);
  }
});

test('parsearFraccion parsea fracciones y rechaza vacíos', () => {
  assert.deepStrictEqual(parsearFraccion('7/14'), { anotados: 7, intentados: 14 });
  assert.deepStrictEqual(parsearFraccion('0/0'), { anotados: 0, intentados: 0 });
  assert.strictEqual(parsearFraccion(''), null);
});

test('parsearEntero conserva negativos y rechaza vacíos', () => {
  assert.strictEqual(parsearEntero('-3'), -3);
  assert.strictEqual(parsearEntero('5'), 5);
  assert.strictEqual(parsearEntero(''), null);
});

test('parsearMinutos convierte mm:ss a segundos', () => {
  assert.strictEqual(parsearMinutos('24:23'), 1463);
  assert.strictEqual(parsearMinutos('00:00'), 0);
});

test('parsearTitulo descompone los 4 títulos reales', () => {
  const casos = [
    {
      titulo: "Estadísticas - MUNICIPALIDAD DE PUERTO SAN MARTIN vs NEWELLS OLD BOYS - U21M - ARBB FORMATIVAS MASCULINO 2026 - CABB - 2026",
      local: 'MUNICIPALIDAD DE PUERTO SAN MARTIN',
      visitante: 'NEWELLS OLD BOYS',
      categoria: 'U21M',
    },
    {
      titulo: "Estadísticas - NEWELLS OLD BOYS vs ATLANTIC SPORTSMEN CLUB 'B' - U21M - ARBB FORMATIVAS MASCULINO 2026 - CABB - 2026",
      local: 'NEWELLS OLD BOYS',
      visitante: "ATLANTIC SPORTSMEN CLUB 'B'",
      categoria: 'U21M',
    },
    {
      titulo: "Estadísticas - TALLERES ARROYO SECO vs NEWELLS OLD BOYS - U17M - ARBB FORMATIVAS MASCULINO 2026 - CABB - 2026",
      local: 'TALLERES ARROYO SECO',
      visitante: 'NEWELLS OLD BOYS',
      categoria: 'U17M',
    },
  ];
  for (const caso of casos) {
    const resultado = parsearTitulo(caso.titulo);
    assert.strictEqual(resultado.error, null, caso.titulo);
    assert.strictEqual(resultado.local, caso.local, caso.titulo);
    assert.strictEqual(resultado.visitante, caso.visitante, caso.titulo);
    assert.strictEqual(resultado.categoria, caso.categoria, caso.titulo);
    assert.strictEqual(resultado.competencia, 'ARBB FORMATIVAS MASCULINO 2026', caso.titulo);
    assert.strictEqual(resultado.anio, 2026, caso.titulo);
  }
});

test('parsearTitulo devuelve error en un título no reconocible', () => {
  const resultado = parsearTitulo('esto no es un título de la CABB');
  assert.ok(resultado.error);
  assert.strictEqual(resultado.local, null);
  assert.strictEqual(resultado.visitante, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/parser/parserCabb.js'` (file doesn't exist yet).

- [ ] **Step 3: Write `src/parser/parserCabb.js` with the helper implementations**

```js
export function limpiarNombre(nombreCrudo) {
  if (typeof nombreCrudo !== 'string') return '';
  let limpio = nombreCrudo.trim();
  limpio = limpio.replace(/\s+/g, ' ');
  limpio = limpio.replace(/\s+,/g, ',');
  limpio = limpio.replace(/,+/g, ',');
  limpio = limpio.replace(/,\s*/g, ', ');
  return limpio.trim();
}

export function clavearNombre(nombreLimpio) {
  if (typeof nombreLimpio !== 'string') return '';
  return nombreLimpio
    .toUpperCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsearFraccion(texto) {
  if (typeof texto !== 'string') return null;
  const m = texto.trim().match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  return { anotados: parseInt(m[1], 10), intentados: parseInt(m[2], 10) };
}

export function parsearEntero(texto) {
  if (typeof texto !== 'string') return null;
  const t = texto.trim();
  if (!/^-?\d+$/.test(t)) return null;
  return parseInt(t, 10);
}

export function parsearMinutos(texto) {
  if (typeof texto !== 'string') return null;
  const m = texto.trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function parsearTitulo(tituloCrudo) {
  const resultado = { local: null, visitante: null, categoria: null, competencia: null, anio: null, error: null };
  if (typeof tituloCrudo !== 'string') {
    resultado.error = 'el título no es un string';
    return resultado;
  }
  const prefijo = 'Estadísticas - ';
  if (!tituloCrudo.startsWith(prefijo)) {
    resultado.error = 'el título no empieza con "Estadísticas - "';
    return resultado;
  }
  const partes = tituloCrudo.slice(prefijo.length).split(' - ').map((p) => p.trim());
  const [equipos, categoria, competencia, , anioTexto] = partes;
  if (!equipos || !equipos.includes(' vs ')) {
    resultado.error = 'no se encontró " vs " para separar local de visitante';
    return resultado;
  }
  const idx = equipos.indexOf(' vs ');
  resultado.local = equipos.slice(0, idx).trim();
  resultado.visitante = equipos.slice(idx + 4).trim();
  resultado.categoria = categoria || null;
  resultado.competencia = competencia || null;
  const anio = anioTexto ? parseInt(anioTexto, 10) : NaN;
  resultado.anio = Number.isFinite(anio) ? anio : null;
  return resultado;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/parser/parserCabb.js tests/parserCabb.test.js
git commit -m "feat: add pure CABB name/number/title parsing helpers"
```

## Task 3: Full `parsearPartidoCabb` implementation against the real fixtures

**Files:**
- Modify: `src/parser/parserCabb.js` (add workbook reading, block/player extraction, integrity checks, and the exported `parsearPartidoCabb`)
- Modify: `tests/parserCabb.test.js` (add the remaining required tests)

**Interfaces:**
- Consumes: the 6 helpers from Task 2 (same names/signatures).
- Produces: `export function parsearPartidoCabb(datos: ArrayBuffer | Uint8Array, nombreArchivo: string): ContratoSalida` per the contract below. Never throws.

Full contract shape (for reference while implementing):

```js
{
  contrato: "1.0",
  origen: { archivo, idPartidoCabb, hoja },
  partido: { tituloCrudo, local, visitante, categoria, competencia, anio },
  equipos: [
    { condicion: "local"|"visitante", nombre, filaNombre, jugadores: [Jugador], totales: Metricas|null }
  ],
  advertencias: [{ fila, campo, mensaje }],
  errores: [{ fila, campo, mensaje }],
}
```

Jugador = `{ fila, numero, nombreCrudo, nombreLimpio, apellido, nombre, nombreClave, ...Metricas }`.
Metricas = `{ min: {texto,segundos}|null, pts, dos: {anotados,intentados,porcentaje}, tres: {...}, libres: {...}, reb: {def,of,tot}, ast, rec, per, tap: {cometidos,recibidos}, fal: {cometidas,recibidas}, val, masMenos }`.

- [ ] **Step 1: Write the failing integration tests**

Append to `tests/parserCabb.test.js` (add these imports to the existing import block from `'../src/parser/parserCabb.js'`: `parsearPartidoCabb`; also add a new top-of-file import for `XLSX`, `readFileSync`, `path`, `fileURLToPath`):

```js
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { parsearPartidoCabb } from '../src/parser/parserCabb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (nombre) => readFileSync(path.join(__dirname, 'fixtures', nombre));

const ARCHIVOS = [
  'estadisticaPartido_2026105023.xlsx',
  'estadisticaPartido_2026105329.xlsx',
  'DOC-20260901-WA0002.xlsx',
  'estadisticaPartido_2026105541sub17.xlsx',
];

test('los 4 archivos reales parsean sin errores', () => {
  for (const archivo of ARCHIVOS) {
    const resultado = parsearPartidoCabb(fixture(archivo), archivo);
    assert.deepStrictEqual(resultado.errores, [], `${archivo}: ${JSON.stringify(resultado.errores)}`);
  }
});

test('cada archivo detecta exactamente 2 equipos', () => {
  for (const archivo of ARCHIVOS) {
    const resultado = parsearPartidoCabb(fixture(archivo), archivo);
    assert.strictEqual(resultado.equipos.length, 2, archivo);
  }
});

test('el título del partido se propaga igual que parsearTitulo en los 4 archivos', () => {
  const esperado = {
    'estadisticaPartido_2026105023.xlsx': { local: 'MUNICIPALIDAD DE PUERTO SAN MARTIN', visitante: 'NEWELLS OLD BOYS', categoria: 'U21M' },
    'estadisticaPartido_2026105329.xlsx': { local: 'NEWELLS OLD BOYS', visitante: 'UNION Y PROGRESO', categoria: 'U21M' },
    'DOC-20260901-WA0002.xlsx': { local: 'NEWELLS OLD BOYS', visitante: "ATLANTIC SPORTSMEN CLUB 'B'", categoria: 'U21M' },
    'estadisticaPartido_2026105541sub17.xlsx': { local: 'TALLERES ARROYO SECO', visitante: 'NEWELLS OLD BOYS', categoria: 'U17M' },
  };
  for (const archivo of ARCHIVOS) {
    const resultado = parsearPartidoCabb(fixture(archivo), archivo);
    assert.strictEqual(resultado.partido.local, esperado[archivo].local, archivo);
    assert.strictEqual(resultado.partido.visitante, esperado[archivo].visitante, archivo);
    assert.strictEqual(resultado.partido.categoria, esperado[archivo].categoria, archivo);
    assert.strictEqual(resultado.partido.competencia, 'ARBB FORMATIVAS MASCULINO 2026', archivo);
    assert.strictEqual(resultado.partido.anio, 2026, archivo);
  }
});

test('el matcheo por nombre une el plantel de Newells a través de 3 partidos U21M', () => {
  const archivosU21M = [
    'estadisticaPartido_2026105023.xlsx',
    'estadisticaPartido_2026105329.xlsx',
    'DOC-20260901-WA0002.xlsx',
  ];
  const clavesPorPartido = archivosU21M.map((archivo) => {
    const resultado = parsearPartidoCabb(fixture(archivo), archivo);
    const equipoNewells = resultado.equipos.find((e) => e.nombre === 'NEWELLS OLD BOYS');
    assert.ok(equipoNewells, archivo);
    return equipoNewells.jugadores.map((j) => j.nombreClave);
  });
  for (const claves of clavesPorPartido) {
    assert.ok(claves.length <= 12, `no debería haber más de 12 jugadores por partido (hay ${claves.length})`);
  }
  const union = new Set(clavesPorPartido.flat());
  assert.strictEqual(union.size, 13);
});

test('un jugador que cambió de número de camiseta mantiene el mismo nombreClave', () => {
  const casos = [
    { archivo: 'DOC-20260901-WA0002.xlsx', numeroEsperado: '16' },
    { archivo: 'estadisticaPartido_2026105023.xlsx', numeroEsperado: '15' },
    { archivo: 'estadisticaPartido_2026105329.xlsx', numeroEsperado: '10' },
  ];
  for (const { archivo, numeroEsperado } of casos) {
    const resultado = parsearPartidoCabb(fixture(archivo), archivo);
    const equipoNewells = resultado.equipos.find((e) => e.nombre === 'NEWELLS OLD BOYS');
    const jugador = equipoNewells.jugadores.find((j) => j.nombreClave === 'PALUMBO BAUTISTA');
    assert.ok(jugador, archivo);
    assert.strictEqual(jugador.numero, numeroEsperado, archivo);
  }
});

test('idPartidoCabb sólo matchea el patrón real de la CABB, nunca basura de WhatsApp', () => {
  const cabb = parsearPartidoCabb(fixture('estadisticaPartido_2026105023.xlsx'), 'estadisticaPartido_2026105023.xlsx');
  assert.strictEqual(cabb.origen.idPartidoCabb, '2026105023');

  const whatsapp = parsearPartidoCabb(fixture('DOC-20260901-WA0002.xlsx'), 'DOC-20260901-WA0002.xlsx');
  assert.strictEqual(whatsapp.origen.idPartidoCabb, null);
  assert.notStrictEqual(whatsapp.origen.idPartidoCabb, cabb.origen.idPartidoCabb);

  const sub17 = parsearPartidoCabb(fixture('estadisticaPartido_2026105541sub17.xlsx'), 'estadisticaPartido_2026105541sub17.xlsx');
  assert.strictEqual(sub17.origen.idPartidoCabb, '2026105541');
});

test('nunca lanza excepción con un archivo vacío', () => {
  assert.doesNotThrow(() => {
    const resultado = parsearPartidoCabb(new ArrayBuffer(0), 'vacio.xlsx');
    assert.ok(resultado.errores.length > 0);
  });
});

test('nunca lanza excepción con un xlsx que no es de la CABB', () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['hola', 'mundo']]);
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  assert.doesNotThrow(() => {
    const resultado = parsearPartidoCabb(buffer, 'otro.xlsx');
    assert.strictEqual(resultado.equipos.length, 0);
    assert.ok(resultado.errores.length > 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `parsearPartidoCabb is not a function` / not exported yet.

- [ ] **Step 3: Add the rest of `src/parser/parserCabb.js`**

Add `import * as XLSX from 'xlsx';` at the very top of `src/parser/parserCabb.js` (above the existing helper functions), then append everything below at the end of the file:

```js
const TEXTOS_ESPERADOS = [
  'Num.', 'Nombre', 'MIN', 'PTS',
  'A/I', '%', 'A/I', '%', 'A/I', '%',
  'DEF', 'OF', 'Tot.', 'AST', 'REC', 'PER', 'TC', 'TR', 'FC', 'FR', 'VAL', '+/-',
];

const CAMPOS_ESPERADOS = [
  'numero', 'nombre', 'minTexto', 'pts',
  'dosAI', 'dosPct', 'tresAI', 'tresPct', 'libresAI', 'libresPct',
  'def', 'of', 'tot', 'ast', 'rec', 'per', 'tc', 'tr', 'fc', 'fr', 'val', 'masMenos',
];

function extraerIdPartidoCabb(nombreArchivo) {
  if (typeof nombreArchivo !== 'string') return null;
  const m = nombreArchivo.match(/estadisticaPartido_(\d+)/i);
  return m ? m[1] : null;
}

function leerCelda(filaDatos, col) {
  if (col === undefined || !filaDatos) return '';
  return String(filaDatos[col] ?? '').trim();
}

function resolverColumnas(filaHeaders, filaAgrupadores) {
  const celdas = (filaHeaders ?? [])
    .map((texto, col) => ({ texto: String(texto ?? '').trim(), col }))
    .filter((c) => c.texto !== '');

  if (celdas.length !== TEXTOS_ESPERADOS.length) {
    return { error: `[HEADERS_INVALIDOS] se esperaban ${TEXTOS_ESPERADOS.length} columnas de datos, se encontraron ${celdas.length}` };
  }
  for (let i = 0; i < TEXTOS_ESPERADOS.length; i++) {
    if (celdas[i].texto !== TEXTOS_ESPERADOS[i]) {
      return { error: `[HEADERS_INVALIDOS] columna ${i + 1}: se esperaba "${TEXTOS_ESPERADOS[i]}", se encontró "${celdas[i].texto}"` };
    }
  }

  const agrupadores = (filaAgrupadores ?? [])
    .map((texto) => String(texto ?? '').trim())
    .filter((texto) => ['TC 2P', 'TC 3P', 'TL'].includes(texto));
  const ordenEsperado = ['TC 2P', 'TC 3P', 'TL'];
  const ordenValido = agrupadores.length === 3 && ordenEsperado.every((t, i) => agrupadores[i] === t);
  if (!ordenValido) {
    return { error: `[ORDEN_AGRUPADORES_INVALIDO] el orden esperado es "TC 2P, TC 3P, TL", se encontró "${agrupadores.join(', ')}"` };
  }

  const columnas = {};
  CAMPOS_ESPERADOS.forEach((campo, i) => { columnas[campo] = celdas[i].col; });
  return { columnas };
}

function encontrarNombreEquipo(grilla, filaHeaderIdx) {
  for (let f = filaHeaderIdx - 2; f >= 0; f--) {
    const texto = leerCelda(grilla[f], 0);
    if (texto === '') continue;
    if (texto === 'TOTALES') continue;
    if (texto === 'CONFEDERACIÓN ARGENTINA DE BASQUETBOL') continue;
    if (texto.startsWith('Estadísticas - ')) continue;
    return { nombre: texto, fila: f + 1 };
  }
  return { nombre: null, fila: null };
}

function parsearCampoEntero(filaDatos, columnas, campo, fila, nombreCampo, advertencias) {
  const texto = leerCelda(filaDatos, columnas[campo]);
  const valor = parsearEntero(texto);
  if (valor === null && texto !== '') {
    advertencias.push({ fila, campo: nombreCampo, mensaje: `[CAMPO_INVALIDO] "${texto}" no es un entero válido` });
  }
  return valor;
}

function parsearCampoFraccion(filaDatos, columnas, campoAI, campoPct, fila, nombreGrupo, advertencias) {
  const textoAI = leerCelda(filaDatos, columnas[campoAI]);
  const fraccion = parsearFraccion(textoAI);
  if (fraccion === null && textoAI !== '') {
    advertencias.push({ fila, campo: nombreGrupo, mensaje: `[CAMPO_INVALIDO] "${textoAI}" no es una fracción válida` });
  }
  const textoPct = leerCelda(filaDatos, columnas[campoPct]);
  const porcentaje = parsearEntero(textoPct);
  if (porcentaje === null && textoPct !== '') {
    advertencias.push({ fila, campo: `${nombreGrupo}.porcentaje`, mensaje: `[CAMPO_INVALIDO] "${textoPct}" no es un porcentaje válido` });
  }
  if (fraccion && porcentaje !== null) {
    const calculado = fraccion.intentados > 0 ? Math.round((fraccion.anotados / fraccion.intentados) * 100) : 0;
    if (Math.abs(calculado - porcentaje) > 1) {
      advertencias.push({
        fila, campo: `${nombreGrupo}.porcentaje`,
        mensaje: `[PORCENTAJE_INCONSISTENTE] ${fraccion.anotados}/${fraccion.intentados} da ${calculado}%, la planilla dice ${porcentaje}%`,
      });
    }
  }
  return {
    anotados: fraccion ? fraccion.anotados : null,
    intentados: fraccion ? fraccion.intentados : null,
    porcentaje,
  };
}

function parsearFilaMetricas(filaDatos, columnas, fila, advertencias) {
  const minTexto = leerCelda(filaDatos, columnas.minTexto);
  const segundos = parsearMinutos(minTexto);
  if (segundos === null && minTexto !== '') {
    advertencias.push({ fila, campo: 'min', mensaje: `[CAMPO_INVALIDO] "${minTexto}" no tiene formato mm:ss` });
  }

  const def = parsearCampoEntero(filaDatos, columnas, 'def', fila, 'reb.def', advertencias);
  const of = parsearCampoEntero(filaDatos, columnas, 'of', fila, 'reb.of', advertencias);
  const tot = parsearCampoEntero(filaDatos, columnas, 'tot', fila, 'reb.tot', advertencias);
  if (def !== null && of !== null && tot !== null && tot !== def + of) {
    advertencias.push({ fila, campo: 'reb.tot', mensaje: `[REBOTES_INCONSISTENTES] tot=${tot} pero def+of=${def + of}` });
  }

  return {
    min: segundos === null ? null : { texto: minTexto, segundos },
    pts: parsearCampoEntero(filaDatos, columnas, 'pts', fila, 'pts', advertencias),
    dos: parsearCampoFraccion(filaDatos, columnas, 'dosAI', 'dosPct', fila, 'dos', advertencias),
    tres: parsearCampoFraccion(filaDatos, columnas, 'tresAI', 'tresPct', fila, 'tres', advertencias),
    libres: parsearCampoFraccion(filaDatos, columnas, 'libresAI', 'libresPct', fila, 'libres', advertencias),
    reb: { def, of, tot },
    ast: parsearCampoEntero(filaDatos, columnas, 'ast', fila, 'ast', advertencias),
    rec: parsearCampoEntero(filaDatos, columnas, 'rec', fila, 'rec', advertencias),
    per: parsearCampoEntero(filaDatos, columnas, 'per', fila, 'per', advertencias),
    tap: {
      cometidos: parsearCampoEntero(filaDatos, columnas, 'tc', fila, 'tap.cometidos', advertencias),
      recibidos: parsearCampoEntero(filaDatos, columnas, 'tr', fila, 'tap.recibidos', advertencias),
    },
    fal: {
      cometidas: parsearCampoEntero(filaDatos, columnas, 'fc', fila, 'fal.cometidas', advertencias),
      recibidas: parsearCampoEntero(filaDatos, columnas, 'fr', fila, 'fal.recibidas', advertencias),
    },
    val: parsearCampoEntero(filaDatos, columnas, 'val', fila, 'val', advertencias),
    masMenos: parsearCampoEntero(filaDatos, columnas, 'masMenos', fila, 'masMenos', advertencias),
  };
}

function parsearJugador(filaDatos, columnas, fila, advertencias) {
  const numeroTexto = leerCelda(filaDatos, columnas.numero);
  if (numeroTexto === '') {
    advertencias.push({ fila, campo: 'numero', mensaje: '[SIN_NUMERO] falta el número de camiseta' });
  }
  const nombreCrudo = leerCelda(filaDatos, columnas.nombre);
  const nombreLimpio = limpiarNombre(nombreCrudo);
  const idxComa = nombreLimpio.indexOf(',');
  let apellido, nombre;
  if (idxComa === -1) {
    apellido = nombreLimpio;
    nombre = '';
    advertencias.push({ fila, campo: 'nombre', mensaje: `[NOMBRE_SIN_COMA] "${nombreLimpio}" no tiene coma` });
  } else {
    apellido = nombreLimpio.slice(0, idxComa).trim();
    nombre = nombreLimpio.slice(idxComa + 1).trim();
  }

  return {
    fila,
    numero: numeroTexto === '' ? null : numeroTexto,
    nombreCrudo,
    nombreLimpio,
    apellido,
    nombre,
    nombreClave: clavearNombre(nombreLimpio),
    ...parsearFilaMetricas(filaDatos, columnas, fila, advertencias),
  };
}

function extraerFilasDelBloque(grilla, filaHeaderIdx, columnas, advertencias, limite) {
  const jugadores = [];
  let totales = null;
  let f = filaHeaderIdx + 1;
  while (f < limite) {
    const filaDatos = grilla[f] ?? [];
    const nombreTexto = leerCelda(filaDatos, columnas.nombre);
    if (nombreTexto === '') { f++; continue; }
    if (nombreTexto === 'TOTALES') {
      totales = { fila: f + 1, ...parsearFilaMetricas(filaDatos, columnas, f + 1, advertencias) };
      break;
    }
    jugadores.push(parsearJugador(filaDatos, columnas, f + 1, advertencias));
    f++;
  }
  return { jugadores, totales };
}

function verificarSumas(jugadores, totales, advertencias) {
  if (!totales) return;
  const campos = [
    ['pts', (j) => j.pts],
    ['reb.def', (j) => j.reb.def],
    ['reb.of', (j) => j.reb.of],
    ['reb.tot', (j) => j.reb.tot],
    ['ast', (j) => j.ast],
    ['rec', (j) => j.rec],
    ['per', (j) => j.per],
    ['fal.cometidas', (j) => j.fal.cometidas],
    ['fal.recibidas', (j) => j.fal.recibidas],
  ];
  for (const [nombreCampo, obtener] of campos) {
    const valores = jugadores.map(obtener);
    if (valores.some((v) => v === null)) continue;
    const valorTotales = obtener(totales);
    if (valorTotales === null) continue;
    const suma = valores.reduce((a, b) => a + b, 0);
    if (suma !== valorTotales) {
      advertencias.push({
        fila: totales.fila, campo: nombreCampo,
        mensaje: `[SUMA_INCONSISTENTE] la suma de los jugadores (${suma}) no coincide con TOTALES (${valorTotales})`,
      });
    }
  }
}

export function parsearPartidoCabb(datos, nombreArchivo) {
  const salida = {
    contrato: '1.0',
    origen: {
      archivo: typeof nombreArchivo === 'string' ? nombreArchivo : null,
      idPartidoCabb: extraerIdPartidoCabb(nombreArchivo),
      hoja: null,
    },
    partido: { tituloCrudo: null, local: null, visitante: null, categoria: null, competencia: null, anio: null },
    equipos: [],
    advertencias: [],
    errores: [],
  };

  try {
    let workbook;
    try {
      const bytes = datos instanceof ArrayBuffer ? new Uint8Array(datos) : datos;
      workbook = XLSX.read(bytes, { type: 'array' });
    } catch (e) {
      salida.errores.push({ fila: null, campo: null, mensaje: `[LECTURA_FALLIDA] no se pudo leer el archivo: ${e.message}` });
      return salida;
    }

    const nombreHoja = workbook.SheetNames.find((n) => n.startsWith('Estadísticas'));
    if (!nombreHoja) {
      salida.errores.push({ fila: null, campo: null, mensaje: '[SIN_HOJA_ESTADISTICAS] no se encontró un worksheet que empiece con "Estadísticas"' });
      return salida;
    }
    salida.origen.hoja = nombreHoja;

    const grilla = XLSX.utils.sheet_to_json(workbook.Sheets[nombreHoja], { header: 1, defval: '', raw: false });

    let tituloCrudo = null;
    for (const fila of grilla) {
      const encontrado = (fila ?? []).map((c) => String(c ?? '').trim()).find((t) => t.startsWith('Estadísticas - '));
      if (encontrado) { tituloCrudo = encontrado; break; }
    }
    if (tituloCrudo === null) {
      salida.errores.push({ fila: null, campo: 'titulo', mensaje: '[TITULO_INVALIDO] no se encontró una celda que empiece con "Estadísticas - "' });
    } else {
      salida.partido.tituloCrudo = tituloCrudo;
      const titulo = parsearTitulo(tituloCrudo);
      if (titulo.error) {
        salida.errores.push({ fila: null, campo: 'titulo', mensaje: `[TITULO_INVALIDO] ${titulo.error}` });
      }
      salida.partido.local = titulo.local;
      salida.partido.visitante = titulo.visitante;
      salida.partido.categoria = titulo.categoria;
      salida.partido.competencia = titulo.competencia;
      salida.partido.anio = titulo.anio;
    }

    const filasHeader = [];
    grilla.forEach((fila, idx) => {
      const colNum = (fila ?? []).findIndex((c) => String(c ?? '').trim() === 'Num.');
      if (colNum !== -1) filasHeader.push(idx);
    });

    if (filasHeader.length !== 2) {
      salida.errores.push({ fila: null, campo: null, mensaje: `[HEADERS_INVALIDOS] se esperaban 2 filas de headers ("Num."), se encontraron ${filasHeader.length}` });
      return salida;
    }

    const condiciones = ['local', 'visitante'];
    filasHeader.forEach((filaHeaderIdx, i) => {
      const filaHeaders = grilla[filaHeaderIdx] ?? [];
      const filaAgrupadores = grilla[filaHeaderIdx - 1] ?? [];
      const resuelto = resolverColumnas(filaHeaders, filaAgrupadores);
      if (resuelto.error) {
        salida.errores.push({ fila: filaHeaderIdx + 1, campo: null, mensaje: resuelto.error });
        return;
      }
      const limite = filasHeader[i + 1] ?? grilla.length;
      const { nombre, fila: filaNombre } = encontrarNombreEquipo(grilla, filaHeaderIdx);
      const { jugadores, totales } = extraerFilasDelBloque(grilla, filaHeaderIdx, resuelto.columnas, salida.advertencias, limite);
      if (!totales) {
        salida.advertencias.push({ fila: filaHeaderIdx + 1, campo: null, mensaje: '[SIN_TOTALES] no se encontró la fila TOTALES para este bloque' });
      }
      verificarSumas(jugadores, totales, salida.advertencias);
      salida.equipos.push({ condicion: condiciones[i], nombre, filaNombre, jugadores, totales });
    });
  } catch (e) {
    salida.errores.push({ fila: null, campo: null, mensaje: `[LECTURA_FALLIDA] error inesperado: ${e.message}` });
  }

  return salida;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests green (helpers + integration, 13 test blocks total).

If the 13-vs-15 union test or the jersey-number test fails, do not tweak the expected numbers to make it pass blindly — re-run `node tests/inspect.js tests/fixtures/<file>.xlsx` (built in Task 4) or a throwaway dump script first and compare against the "Verified facts" section above; these numbers were derived directly from the real fixtures, not guessed.

- [ ] **Step 5: Commit**

```bash
git add src/parser/parserCabb.js tests/parserCabb.test.js
git commit -m "feat: implement full CABB match parser against real fixtures"
```

## Task 4: `tests/inspect.js` CLI + `PARSER.md` + final verification

**Files:**
- Create: `tests/inspect.js`
- Create: `PARSER.md`

**Interfaces:**
- Consumes: `parsearPartidoCabb` from `src/parser/parserCabb.js`.

- [ ] **Step 1: Write `tests/inspect.js`**

```js
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parsearPartidoCabb } from '../src/parser/parserCabb.js';

const rutaArchivo = process.argv[2];
if (!rutaArchivo) {
  console.error('Uso: node tests/inspect.js <ruta-al-archivo.xlsx>');
  process.exit(1);
}

const datos = readFileSync(rutaArchivo);
const resultado = parsearPartidoCabb(datos, path.basename(rutaArchivo));

console.log('='.repeat(70));
console.log(`ARCHIVO: ${resultado.origen.archivo}`);
console.log(`ID PARTIDO CABB: ${resultado.origen.idPartidoCabb ?? '(sin detectar)'}`);
console.log(`HOJA: ${resultado.origen.hoja ?? '(sin detectar)'}`);
console.log('='.repeat(70));
console.log(`TÍTULO: ${resultado.partido.tituloCrudo ?? '(sin detectar)'}`);
console.log(`  Local:       ${resultado.partido.local}`);
console.log(`  Visitante:   ${resultado.partido.visitante}`);
console.log(`  Categoría:   ${resultado.partido.categoria}`);
console.log(`  Competencia: ${resultado.partido.competencia}`);
console.log(`  Año:         ${resultado.partido.anio}`);

for (const equipo of resultado.equipos) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`[${equipo.condicion.toUpperCase()}] ${equipo.nombre} (fila ${equipo.filaNombre})`);
  console.log('-'.repeat(70));
  for (const j of equipo.jugadores) {
    const min = j.min ? j.min.texto : '--:--';
    const numero = (j.numero ?? '?').padStart(2, ' ');
    console.log(
      `  #${numero} ${j.nombreLimpio.padEnd(35, ' ')} ` +
      `MIN ${min}  PTS ${String(j.pts ?? '-').padStart(3, ' ')}  ` +
      `2P ${j.dos.anotados ?? '-'}/${j.dos.intentados ?? '-'} (${j.dos.porcentaje ?? '-'}%)  ` +
      `3P ${j.tres.anotados ?? '-'}/${j.tres.intentados ?? '-'} (${j.tres.porcentaje ?? '-'}%)  ` +
      `TL ${j.libres.anotados ?? '-'}/${j.libres.intentados ?? '-'} (${j.libres.porcentaje ?? '-'}%)  ` +
      `REB ${j.reb.tot ?? '-'} (D${j.reb.def ?? '-'}/O${j.reb.of ?? '-'})  ` +
      `AST ${j.ast ?? '-'}  REC ${j.rec ?? '-'}  PER ${j.per ?? '-'}  ` +
      `VAL ${j.val ?? '-'}  +/- ${j.masMenos ?? '-'}  ` +
      `[clave: ${j.nombreClave}]`
    );
  }
  if (equipo.totales) {
    console.log(`  TOTALES: PTS ${equipo.totales.pts}  REB ${equipo.totales.reb.tot}  AST ${equipo.totales.ast}`);
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`ADVERTENCIAS (${resultado.advertencias.length}):`);
for (const a of resultado.advertencias) {
  console.log(`  fila ${a.fila ?? '-'} · ${a.campo ?? '-'} · ${a.mensaje}`);
}
console.log(`\nERRORES (${resultado.errores.length}):`);
for (const e of resultado.errores) {
  console.log(`  fila ${e.fila ?? '-'} · ${e.campo ?? '-'} · ${e.mensaje}`);
}
```

- [ ] **Step 2: Run it manually against one real fixture**

Run: `node tests/inspect.js tests/fixtures/DOC-20260901-WA0002.xlsx`
Expected: prints title breakdown, both teams' rosters with stats, 0 errores. Manually eyeball that Newell's 12 players and Atlantic Sportsmen's 13 players look right and no `[HEADERS_INVALIDOS]`/`[ORDEN_AGRUPADORES_INVALIDO]`/`[TITULO_INVALIDO]` lines appear.

- [ ] **Step 3: Write `PARSER.md`**

```markdown
# PARSER.md — Contrato del parser CABB

## Qué hace

`src/parser/parserCabb.js` recibe un `.xlsx` exportado por la app de la CABB (vía
`parsearPartidoCabb(datos, nombreArchivo)`) y devuelve un objeto de datos verificado.
Es club-agnóstico: no filtra ni conoce ningún club, y nunca lanza excepciones.

## API

```js
import { parsearPartidoCabb } from './src/parser/parserCabb.js';

const resultado = parsearPartidoCabb(datos, nombreArchivo);
```

- `datos`: `ArrayBuffer` o `Uint8Array` del archivo `.xlsx`. Funciona igual en navegador y en Node.
- `nombreArchivo`: string, usado sólo para extraer `idPartidoCabb`. El parser no lee del disco.

También se exportan, para poder testearlas sueltas: `limpiarNombre`, `clavearNombre`,
`parsearFraccion`, `parsearMinutos`, `parsearEntero`, `parsearTitulo`.

## Contrato de salida (versión "1.0")

```js
{
  contrato: "1.0",
  origen: {
    archivo: "estadisticaPartido_2026105023.xlsx",
    idPartidoCabb: "2026105023", // string o null si el nombre de archivo no matchea /estadisticaPartido_(\d+)/i
    hoja: "Estadísticas-",       // nombre real del worksheet encontrado
  },
  partido: {
    tituloCrudo: "Estadísticas - LOCAL vs VISITANTE - CATEGORIA - COMPETENCIA - CABB - AÑO",
    local: "...",       // string o null
    visitante: "...",   // string o null
    categoria: "U21M",  // string o null
    competencia: "ARBB FORMATIVAS MASCULINO 2026", // string o null
    anio: 2026,          // number o null
    // Sin fecha de partido: la carga el entrenador en la etapa de import (Etapa 2).
  },
  equipos: [
    {
      condicion: "local" | "visitante", // por posición: el primer bloque de arriba a abajo es local
      nombre: "...",         // string o null
      filaNombre: 13,        // número de fila del archivo (para debug), 1-indexado
      jugadores: [ Jugador ],
      totales: Metricas | null, // mismas métricas que un jugador, sin numero/nombre
    },
    // ... exactamente 2 entradas si no hubo errores
  ],
  advertencias: [ { fila: 22, campo: "val", mensaje: "[CODIGO] ..." } ],
  errores: [ { fila: null, campo: null, mensaje: "[CODIGO] ..." } ],
}
```

`Jugador`:

```js
{
  fila: 16,               // número de fila del archivo, 1-indexado
  numero: "10",           // string o null si la celda estaba vacía
  nombreCrudo: "GIMÉNEZ , DAVID",   // string exacto del archivo, sin tocar
  nombreLimpio: "GIMÉNEZ, DAVID",   // trim + espacios/comas normalizados
  apellido: "GIMÉNEZ",
  nombre: "DAVID",
  nombreClave: "GIMENEZ DAVID",     // único campo usado para matchear jugadores entre partidos
  min: { texto: "24:23", segundos: 1463 } | null,
  pts: 12,          // number o null
  dos:    { anotados, intentados, porcentaje },   // cada subcampo number o null independientemente
  tres:   { anotados, intentados, porcentaje },
  libres: { anotados, intentados, porcentaje },
  reb: { def, of, tot },
  ast, rec, per,     // number o null
  tap: { cometidos, recibidos },
  fal: { cometidas, recibidas },
  val,          // number o null, puede ser negativo
  masMenos,     // number o null, puede ser negativo
}
```

Reglas clave:
- `porcentaje` se guarda tal como viene del archivo, nunca recalculado.
- Cualquier campo numérico ilegible queda en `null` (nunca `0`, nunca `NaN`) y genera una advertencia `CAMPO_INVALIDO`.
- Jugadores con `00:00` de minutos sí se incluyen (lista completa de convocados).
- El número de camiseta (`numero`) no es identificador estable entre partidos — el matcheo de jugadores es siempre por `nombreClave`.

## Catálogo de advertencias (nunca detienen el parseo)

| Código | Cuándo aparece |
|---|---|
| `SIN_NUMERO` | La celda `Num.` de un jugador está vacía. |
| `NOMBRE_SIN_COMA` | El nombre limpio no tiene una coma para separar apellido/nombre. |
| `CAMPO_INVALIDO` | Una celda numérica, de fracción (`A/I`) o de tiempo (`MIN`) no se pudo parsear. |
| `PORCENTAJE_INCONSISTENTE` | El `%` de la planilla difiere en más de 1 punto del calculado desde `anotados/intentados`. |
| `REBOTES_INCONSISTENTES` | `reb.tot` no es igual a `reb.def + reb.of`. |
| `SUMA_INCONSISTENTE` | La suma de una columna de jugadores no coincide con la fila `TOTALES` del bloque (se chequea en `pts`, `reb.def`, `reb.of`, `reb.tot`, `ast`, `rec`, `per`, `fal.cometidas`, `fal.recibidas`). |
| `SIN_TOTALES` | No se encontró la fila `TOTALES` de un bloque antes de llegar al siguiente bloque (o al final de la hoja). `equipos[].totales` queda `null` en ese caso; los jugadores ya encontrados se conservan. |

Estas discrepancias nunca son errores: los planilleros de inferiores anotan bien los datos
esenciales pero las estadísticas secundarias tienen errores de conteo habituales. El dato
se carga igual — la advertencia sirve para saber qué tan confiable es una planilla.

## Catálogo de errores (el parseo puede quedar incompleto, pero la función nunca lanza excepción)

| Código | Cuándo aparece |
|---|---|
| `LECTURA_FALLIDA` | El buffer no es un `.xlsx` válido, o algo inesperado rompió el parseo. |
| `SIN_HOJA_ESTADISTICAS` | Ningún worksheet del libro empieza con "Estadísticas". |
| `TITULO_INVALIDO` | No se encontró una celda que empiece con `"Estadísticas - "`, o no tiene `" vs "` para separar local/visitante. |
| `HEADERS_INVALIDOS` | No se encontraron exactamente 2 filas con la celda `"Num."`, o una fila de headers no tiene las 22 columnas esperadas en el orden esperado. |
| `ORDEN_AGRUPADORES_INVALIDO` | La fila de agrupadores de tiro no tiene `"TC 2P", "TC 3P", "TL"` en ese orden — la CABB cambió el formato de exportación. |

## Si la CABB cambia el formato de exportación

1. Correr `node tests/inspect.js <archivo-nuevo>.xlsx` y mirar la sección `ERRORES`.
2. Si aparece `HEADERS_INVALIDOS` u `ORDEN_AGRUPADORES_INVALIDO`: **no adaptar el parser a ciegas**.
   Abrir el archivo a mano (o volcar la grilla cruda con SheetJS) y comparar contra las
   posiciones documentadas en el prompt original de la Etapa 1 antes de tocar código.
3. Si el test de "15 (ahora 13) jugadores distintos de Newell's" u otro test con números
   concretos falla al agregar un archivo nuevo: verificar primero si los datos realmente
   cambiaron (nuevo jugador, jugador dado de baja) antes de asumir que el parser está mal.

## Nota de seguridad sobre la dependencia

`xlsx` (SheetJS) 0.18.5, la última versión publicada en npm, tiene 2 advisories conocidos
sin fix publicado en npm (prototype pollution, ReDoS — `npm audit`). SheetJS publica el
fix real sólo en su propio CDN, no en npm. Es la única dependencia que autoriza el spec de
esta etapa; no se agregó ninguna alternativa sin preguntar primero.
```

- [ ] **Step 4: Full acceptance run**

Run: `npm test`
Expected: PASS, all tests green.

Run: `node tests/inspect.js tests/fixtures/estadisticaPartido_2026105023.xlsx` and repeat for the other 3 fixtures.
Expected: readable output, 0 errores each time.

Run: `grep -ril "newell" src/parser/` (case-insensitive)
Expected: no matches (club-agnostic requirement).

Run: `grep -n "grilla\[1[0-9]\]\|grilla\[[0-9]\]" src/parser/parserCabb.js` (sanity check for stray hardcoded row indices)
Expected: no matches — only relative offsets (`filaHeaderIdx - 1`, `filaHeaderIdx - 2`, `filaHeaderIdx + 1`, `f + 1`, `f++`) should appear.

- [ ] **Step 5: Commit**

```bash
git add tests/inspect.js PARSER.md
git commit -m "docs: add PARSER.md contract reference and tests/inspect.js CLI"
```

## Final Acceptance Checklist

- [ ] `npm test` passes all test blocks (helper tests + the 10 required cases + the 2 never-throws tests) on the 4 real files.
- [ ] `parsearPartidoCabb` never throws (verified for empty buffer and non-CABB xlsx).
- [ ] No club name anywhere in `src/parser/parserCabb.js` (`grep -ri newell src/parser/` is empty).
- [ ] No hardcoded row numbers used to locate blocks — only text anchors (`"Num."`, `"Estadísticas - "`, `"TOTALES"`) and relative offsets from them.
- [ ] `node tests/inspect.js <file>` prints a readable parse of any of the 4 fixtures.
- [ ] `PARSER.md` documents the full output contract, the advertencia/error code catalog, and what to do if CABB changes format.
- [ ] `src/data/`, `src/ui/`, `public/`, `supabase/` exist and are empty (only `.gitkeep`).
