# Etapa 2B: Orquestación y pantalla de import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar funcionando el flujo completo de import de un partido, de punta a punta, en el navegador — el entrenador entra, elige un `.xlsx`, confirma equipo/fecha/plantel/jugadores, y los datos quedan guardados en Supabase en una sola transacción, o no se guarda nada.

**Architecture:** Una función RPC de Postgres (`importar_partido`) hace transaccional lo que hoy son 5 llamadas separadas de `repositorio.js`. Una pieza pura nueva (`prepararPayloadImportacion`) reconcilia las decisiones del entrenador contra la clasificación de `mapearImportacion` y arma el payload exacto que espera el RPC. La UI son 4 pantallas vanilla-JS (login, inicio, confirmación, resultado) servidas como módulos ES nativos desde la raíz del repo, con un import map resolviendo `xlsx` (CDN propio de SheetJS) y `@supabase/supabase-js` (esm.sh) en el navegador.

**Tech Stack:** HTML/CSS/JS vanilla, ES modules nativos, sin build step, sin frameworks. `@supabase/supabase-js` (ya instalado). Google Fonts (Barlow Condensed/Inter/IBM Plex Mono, mismo stack que la raíz). `node:test`/`node:assert` para lo puro. `npx serve` para servir estático en dev.

**Spec:** `docs/superpowers/specs/2026-09-02-etapa-2b-import-ui-design.md` — leerlo completo antes de este plan. También `PARSER.md` y `supabase/ESQUEMA.md` (contratos que este plan consume, no modifica).

## Global Constraints

- Stack: HTML/CSS/JS vanilla, ES modules, sin build step, sin frameworks/bundlers. Cualquier cosa que parezca necesitar uno: parar y preguntar.
- **No modificar `src/parser/parserCabb.js`.** Si hiciera falta tocarlo, parar y preguntar.
- **No modificar las migraciones `0001_esquema_inicial.sql`, `0002_rls.sql`, `0003_seed_dev.sql`.** Cambios de esquema van en migraciones nuevas (`0004`, `0005`).
- No construir vistas de estadísticas, gráficos, comparativas, tests antropométricos, ni configurar deploy en Vercel.
- Ninguna dependencia nueva sin preguntar primero. `npx serve`/`npx supabase` son herramientas efímeras vía `npx`, no dependencias del proyecto — no van a `package.json`.
- Nunca commitear la contraseña de la base, la secret key, ni datos reales de jugadores. La URL y la publishable key de Supabase SÍ son públicas por diseño y van hardcodeadas en `public/index.html`.
- `condicionPropia` nunca se preselecciona comparando nombres de club — el entrenador siempre elige explícitamente.
- Ningún jugador del bloque rival se persiste — solo `rival_nombre`/`puntos_rival` del `partido`.
- Una `sugerencia` de `mapearImportacion` nunca se resuelve sola — siempre requiere una decisión explícita del entrenador ("es el mismo" / "es otro").
- Targets táctiles ≥44px, contraste alto, contenido importante en la mitad inferior de la pantalla, sin hover como única señal de estado (pantalla táctil).
- Restricción de UX dura: el usuario está con el celular, en la cancha (bajo techo, no al sol), con una mano, apurado. Toda pantalla se diseña contra ese escenario.

---

## Task 1: Cerrar deuda de tests + renombrar variable de entorno

**Files:**
- Modify: `tests/mapearImportacion.test.js:101-106`
- Modify: `.env.example`
- Modify: `src/data/cliente.js`

**Interfaces:**
- No cambia ninguna firma exportada. Solo cambia el nombre de la variable de entorno que `crearClienteSupabase()` busca.

- [ ] **Step 1: Arreglar el test que hoy no prueba lo que dice**

En `tests/mapearImportacion.test.js`, el test `'resultadoParser con errores no se mapea'` (líneas 101-106) tiene un `contexto` incompleto (`{ condicionPropia: 'local' }`) que hoy corta en la validación de campos faltantes agregada en la Etapa 2A, antes de llegar a la rama de `resultadoParser.errores.length > 0` que el test dice ejercitar. Reemplazar:

```js
test('resultadoParser con errores no se mapea', () => {
  const resultado = resultadoParserFicticio({ localJugadores: [], visitanteJugadores: [] });
  resultado.errores = [{ fila: null, campo: null, mensaje: '[TITULO_INVALIDO] x' }];
  const r = mapearImportacion(
    resultado,
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    [],
  );
  assert.ok(r.error);
});
```

- [ ] **Step 2: Correr los tests, confirmar que el que se tocó sigue pasando por la razón correcta**

Run: `npm test`
Expected: mismo conteo de tests que antes de este cambio, 0 failures. (Antes del fix, el test ya pasaba — pero por el motivo equivocado. El cambio no debe alterar el conteo de pass/fail, solo qué rama ejercita.)

- [ ] **Step 3: Renombrar la variable de entorno en `.env.example`**

Reemplazar el contenido completo de `.env.example`:

```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

- [ ] **Step 4: Renombrar la variable en `src/data/cliente.js`**

En `src/data/cliente.js`, reemplazar:

```js
export function crearClienteSupabase() {
  const url = leerVariableEntorno('SUPABASE_URL');
  const anonKey = leerVariableEntorno('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    throw new Error('Faltan las variables de entorno SUPABASE_URL / SUPABASE_ANON_KEY');
  }
  return createClient(url, anonKey);
}
```

por:

```js
export function crearClienteSupabase() {
  const url = leerVariableEntorno('SUPABASE_URL');
  const publishableKey = leerVariableEntorno('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !publishableKey) {
    throw new Error('Faltan las variables de entorno SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY');
  }
  return createClient(url, publishableKey);
}
```

- [ ] **Step 5: Correr los tests una vez más**

Run: `npm test`
Expected: mismo resultado que el Step 2 — `cliente.js` no tiene tests automáticos (no hay DB en este entorno), pero el renombre no debe romper nada que sí se testea.

- [ ] **Step 6: Commit**

```bash
git add tests/mapearImportacion.test.js .env.example src/data/cliente.js
git commit -m "fix: exercise the intended branch in the errores test, rename to SUPABASE_PUBLISHABLE_KEY"
```

---

## Task 2: `prepararPayloadImportacion.js` — reconciliación pura

**Files:**
- Create: `src/data/prepararPayloadImportacion.js`
- Create: `tests/prepararPayloadImportacion.test.js`
- Modify: `package.json` (agregar el archivo de test al script `test`)

**Interfaces:**
- Consumes: nada de otros módulos — recibe como parámetros la salida de `mapearImportacion` (ver `src/data/mapearImportacion.js`) y del `jugadoresExistentes` que ya se le pasó a esa función.
- Produces: `export function prepararPayloadImportacion(resultadoMapeo, jugadoresExistentes, decisiones, contexto): { error: string, payload: null } | { error: null, payload: object }`. Consumida por la UI (Task 10) para armar el argumento de `repositorio.importarPartido`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/prepararPayloadImportacion.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararPayloadImportacion } from '../src/data/prepararPayloadImportacion.js';

function metricasFicticias() {
  return {
    numero: '10', nombreCrudo: 'X, Y', nombreLimpio: 'X, Y',
    minSegundos: 600, pts: 10,
    dosAnotados: 1, dosIntentados: 2, dosPorcentaje: 50,
    tresAnotados: 0, tresIntentados: 1, tresPorcentaje: 0,
    libresAnotados: 2, libresIntentados: 2, libresPorcentaje: 100,
    rebDef: 1, rebOf: 1, rebTot: 2,
    ast: 1, rec: 1, per: 1,
    tapCometidos: 0, tapRecibidos: 0, falCometidas: 1, falRecibidas: 1,
    val: 5, masMenos: 2,
  };
}

function resultadoMapeoBase() {
  return {
    error: null,
    partido: {
      clubId: 'club-1', plantelId: 'plantel-u21', fecha: '2026-05-01',
      condicionPropia: 'local', rivalNombre: 'RIVAL FC', puntosPropios: 50, puntosRival: 40,
    },
    estadisticas: [],
    jugadoresNuevos: [],
    jugadoresCoincidentes: [],
    sugerencias: [],
  };
}

const CONTEXTO = {
  temporadaId: 'temporada-1',
  hashArchivo: 'hash-abc',
  idPartidoCabb: '2026105023',
  nombreArchivo: 'archivo.xlsx',
  advertencias: [],
};

test('mapeo con error no se puede preparar', () => {
  const r = prepararPayloadImportacion({ error: 'algo falló' }, [], { sugerencias: {}, nuevosExcluidos: [] }, CONTEXTO);
  assert.ok(r.error);
  assert.strictEqual(r.payload, null);
});

test('sugerencia sin decisión: error, no arma payload', () => {
  const resultadoMapeo = resultadoMapeoBase();
  resultadoMapeo.sugerencias = [{
    nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN',
    candidato: { jugadorId: 'j-existente', nombreClave: 'PEREZ JUAN M', nombreLimpio: 'PEREZ, JUAN M' },
    razon: 'nombre_similar',
  }];
  const r = prepararPayloadImportacion(resultadoMapeo, [], { sugerencias: {}, nuevosExcluidos: [] }, CONTEXTO);
  assert.ok(r.error);
  assert.match(r.error, /PEREZ JUAN/);
  assert.strictEqual(r.payload, null);
});

test('sugerencia decidida "otro": pasa a jugadoresNuevos con pertenenciaPropuesta, estadisticas.jugadorId sigue null', () => {
  const resultadoMapeo = resultadoMapeoBase();
  resultadoMapeo.sugerencias = [{
    nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN',
    candidato: { jugadorId: 'j-existente', nombreClave: 'PEREZ JUAN M', nombreLimpio: 'PEREZ, JUAN M' },
    razon: 'nombre_similar',
  }];
  resultadoMapeo.estadisticas = [{ ...metricasFicticias(), nombreClave: 'PEREZ JUAN', jugadorId: null }];
  const decisiones = { sugerencias: { 'PEREZ JUAN': 'otro' }, nuevosExcluidos: [] };
  const r = prepararPayloadImportacion(resultadoMapeo, [], decisiones, CONTEXTO);
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.payload.jugadoresNuevos.length, 1);
  assert.strictEqual(r.payload.jugadoresNuevos[0].nombreClave, 'PEREZ JUAN');
  assert.deepStrictEqual(r.payload.jugadoresNuevos[0].pertenenciaPropuesta, {
    plantelId: 'plantel-u21', temporadaId: 'temporada-1', desde: '2026-05-01',
  });
  assert.strictEqual(r.payload.estadisticas[0].jugadorId, null);
});

test('sugerencia decidida "mismo", candidato ya en el plantel destino: sin pertenencia nueva, estadisticas resuelto', () => {
  const resultadoMapeo = resultadoMapeoBase();
  resultadoMapeo.sugerencias = [{
    nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN',
    candidato: { jugadorId: 'j-existente', nombreClave: 'PEREZ JUAN M', nombreLimpio: 'PEREZ, JUAN M' },
    razon: 'nombre_similar',
  }];
  resultadoMapeo.estadisticas = [{ ...metricasFicticias(), nombreClave: 'PEREZ JUAN', jugadorId: null }];
  const jugadoresExistentes = [{ id: 'j-existente', nombreClave: 'PEREZ JUAN M', nombreLimpio: 'PEREZ, JUAN M', plantelesActuales: ['plantel-u21'] }];
  const decisiones = { sugerencias: { 'PEREZ JUAN': 'mismo' }, nuevosExcluidos: [] };
  const r = prepararPayloadImportacion(resultadoMapeo, jugadoresExistentes, decisiones, CONTEXTO);
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.payload.pertenenciasNuevas.length, 0);
  assert.strictEqual(r.payload.estadisticas[0].jugadorId, 'j-existente');
  assert.strictEqual(r.payload.jugadoresNuevos.length, 0);
});

test('sugerencia decidida "mismo", candidato en otro plantel: pertenencia nueva propuesta', () => {
  const resultadoMapeo = resultadoMapeoBase();
  resultadoMapeo.sugerencias = [{
    nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN',
    candidato: { jugadorId: 'j-existente', nombreClave: 'PEREZ JUAN M', nombreLimpio: 'PEREZ, JUAN M' },
    razon: 'nombre_similar',
  }];
  resultadoMapeo.estadisticas = [{ ...metricasFicticias(), nombreClave: 'PEREZ JUAN', jugadorId: null }];
  const jugadoresExistentes = [{ id: 'j-existente', nombreClave: 'PEREZ JUAN M', nombreLimpio: 'PEREZ, JUAN M', plantelesActuales: ['plantel-u17'] }];
  const decisiones = { sugerencias: { 'PEREZ JUAN': 'mismo' }, nuevosExcluidos: [] };
  const r = prepararPayloadImportacion(resultadoMapeo, jugadoresExistentes, decisiones, CONTEXTO);
  assert.strictEqual(r.error, null);
  assert.deepStrictEqual(r.payload.pertenenciasNuevas, [
    { jugadorId: 'j-existente', plantelId: 'plantel-u21', temporadaId: 'temporada-1', desde: '2026-05-01' },
  ]);
  assert.strictEqual(r.payload.estadisticas[0].jugadorId, 'j-existente');
});

test('nuevosExcluidos saca al jugador de jugadoresNuevos y de estadisticas', () => {
  const resultadoMapeo = resultadoMapeoBase();
  resultadoMapeo.jugadoresNuevos = [{
    nombreClave: 'GOMEZ LUIS', nombreLimpio: 'GOMEZ, LUIS', nombreCrudo: 'GOMEZ, LUIS',
    pertenenciaPropuesta: { plantelId: 'plantel-u21', temporadaId: 'temporada-1', desde: '2026-05-01' },
  }];
  resultadoMapeo.estadisticas = [{ ...metricasFicticias(), nombreClave: 'GOMEZ LUIS', jugadorId: null }];
  const decisiones = { sugerencias: {}, nuevosExcluidos: ['GOMEZ LUIS'] };
  const r = prepararPayloadImportacion(resultadoMapeo, [], decisiones, CONTEXTO);
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.payload.jugadoresNuevos.length, 0);
  assert.strictEqual(r.payload.estadisticas.length, 0);
});

test('coincidente con requierePertenenciaNueva pasa a pertenenciasNuevas', () => {
  const resultadoMapeo = resultadoMapeoBase();
  resultadoMapeo.jugadoresCoincidentes = [{
    jugadorId: 'j-1', nombreClave: 'PEREZ JUAN', requierePertenenciaNueva: true,
    pertenenciaPropuesta: { plantelId: 'plantel-u21', temporadaId: 'temporada-1', desde: '2026-05-01' },
  }];
  resultadoMapeo.estadisticas = [{ ...metricasFicticias(), nombreClave: 'PEREZ JUAN', jugadorId: 'j-1' }];
  const r = prepararPayloadImportacion(resultadoMapeo, [], { sugerencias: {}, nuevosExcluidos: [] }, CONTEXTO);
  assert.strictEqual(r.error, null);
  assert.deepStrictEqual(r.payload.pertenenciasNuevas, [
    { jugadorId: 'j-1', plantelId: 'plantel-u21', temporadaId: 'temporada-1', desde: '2026-05-01' },
  ]);
});

test('caso feliz: arma el payload completo con los metadatos del archivo', () => {
  const resultadoMapeo = resultadoMapeoBase();
  const r = prepararPayloadImportacion(resultadoMapeo, [], { sugerencias: {}, nuevosExcluidos: [] }, CONTEXTO);
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.payload.clubId, 'club-1');
  assert.strictEqual(r.payload.hashArchivo, 'hash-abc');
  assert.strictEqual(r.payload.idPartidoCabb, '2026105023');
  assert.strictEqual(r.payload.nombreArchivo, 'archivo.xlsx');
  assert.deepStrictEqual(r.payload.partido, resultadoMapeo.partido);
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `node --test tests/prepararPayloadImportacion.test.js`
Expected: FAIL — `Cannot find module '../src/data/prepararPayloadImportacion.js'`.

- [ ] **Step 3: Escribir `src/data/prepararPayloadImportacion.js`**

```js
/**
 * Puro: sin red, sin cliente de base de datos, sin generar IDs. Reconcilia
 * las decisiones del entrenador (qué sugerencia es "el mismo" jugador o "otro",
 * qué jugadores nuevos se excluyen) contra la clasificación de
 * mapearImportacion, y arma el payload exacto que espera el RPC
 * importar_partido (ver 0005_rpc_importar_partido.sql).
 */
export function prepararPayloadImportacion(resultadoMapeo, jugadoresExistentes, decisiones, contexto) {
  if (!resultadoMapeo || resultadoMapeo.error) {
    return { error: 'no se puede preparar el payload de un mapeo con error', payload: null };
  }

  const nuevosExcluidos = new Set(decisiones.nuevosExcluidos ?? []);
  const decisionesSugerencias = decisiones.sugerencias ?? {};

  for (const s of resultadoMapeo.sugerencias) {
    const decision = decisionesSugerencias[s.nombreClave];
    if (decision !== 'mismo' && decision !== 'otro') {
      return { error: `falta decisión para la sugerencia "${s.nombreClave}" (es el mismo / es otro)`, payload: null };
    }
  }

  const plantelId = resultadoMapeo.partido.plantelId;
  const fecha = resultadoMapeo.partido.fecha;
  const pertenenciaPropuestaBase = { plantelId, temporadaId: contexto.temporadaId, desde: fecha };

  const jugadoresPorId = new Map(jugadoresExistentes.map((j) => [j.id, j]));
  const jugadorIdResueltoPorNombreClave = new Map();

  const jugadoresNuevos = resultadoMapeo.jugadoresNuevos.filter((j) => !nuevosExcluidos.has(j.nombreClave));
  const pertenenciasNuevas = resultadoMapeo.jugadoresCoincidentes
    .filter((c) => c.requierePertenenciaNueva)
    .map((c) => ({ jugadorId: c.jugadorId, ...c.pertenenciaPropuesta }));

  for (const s of resultadoMapeo.sugerencias) {
    const decision = decisionesSugerencias[s.nombreClave];
    if (decision === 'otro') {
      if (nuevosExcluidos.has(s.nombreClave)) continue;
      jugadoresNuevos.push({
        nombreClave: s.nombreClave,
        nombreLimpio: s.nombreLimpio,
        nombreCrudo: s.nombreLimpio,
        pertenenciaPropuesta: pertenenciaPropuestaBase,
      });
      continue;
    }
    const candidatoId = s.candidato.jugadorId;
    const existente = jugadoresPorId.get(candidatoId);
    const requierePertenenciaNueva = !existente || !existente.plantelesActuales.includes(plantelId);
    jugadorIdResueltoPorNombreClave.set(s.nombreClave, candidatoId);
    if (requierePertenenciaNueva) {
      pertenenciasNuevas.push({ jugadorId: candidatoId, ...pertenenciaPropuestaBase });
    }
  }

  const estadisticas = resultadoMapeo.estadisticas
    .filter((e) => !nuevosExcluidos.has(e.nombreClave))
    .map((e) => {
      if (e.jugadorId !== null) return e;
      const jugadorId = jugadorIdResueltoPorNombreClave.get(e.nombreClave);
      return jugadorId === undefined ? e : { ...e, jugadorId };
    });

  return {
    error: null,
    payload: {
      clubId: resultadoMapeo.partido.clubId,
      hashArchivo: contexto.hashArchivo,
      idPartidoCabb: contexto.idPartidoCabb,
      nombreArchivo: contexto.nombreArchivo,
      advertencias: contexto.advertencias,
      partido: resultadoMapeo.partido,
      jugadoresNuevos,
      pertenenciasNuevas,
      estadisticas,
    },
  };
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `node --test tests/prepararPayloadImportacion.test.js`
Expected: PASS — los 8 tests en verde.

- [ ] **Step 5: Agregar el archivo al script `test` de `package.json`**

En `package.json`, cambiar:
```json
"test": "node --test tests/parserCabb.test.js tests/mapearImportacion.test.js"
```
por:
```json
"test": "node --test tests/parserCabb.test.js tests/mapearImportacion.test.js tests/prepararPayloadImportacion.test.js"
```

- [ ] **Step 6: Correr la suite completa**

Run: `npm test`
Expected: PASS, incluye los 8 tests nuevos.

- [ ] **Step 7: Verificar pureza**

Run: `grep -inE "supabase|fetch|http" src/data/prepararPayloadImportacion.js`
Expected: sin matches.

- [ ] **Step 8: Commit**

```bash
git add src/data/prepararPayloadImportacion.js tests/prepararPayloadImportacion.test.js package.json
git commit -m "feat: add prepararPayloadImportacion to reconcile coach decisions into the RPC payload"
```

---

## Task 3: `repositorio.js` — funciones nuevas (auth, club, planteles, importar)

**Files:**
- Modify: `src/data/repositorio.js`

**Interfaces:**
- Produces: `iniciarSesion(email, password): Promise<Session>`, `cerrarSesion(): Promise<void>`, `obtenerSesionActual(): Promise<Session|null>`, `obtenerClubesDelEntrenador(): Promise<{id,nombre}[]>`, `obtenerPlantelesDelClub(clubId): Promise<{id,categoria,codigoCabb,temporadaId}[]>`, `importarPartido(payload): Promise<{partidoId,importacionId}>`.
- No automated tests para este archivo — igual que el resto de `repositorio.js`, no hay DB en este entorno de desarrollo. Se verifica por lectura cuidadosa acá y con uso real contra el proyecto en Task 6-10.

- [ ] **Step 1: Agregar las funciones al final de `src/data/repositorio.js`**

```js
export async function iniciarSesion(email, password) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function cerrarSesion() {
  const supabase = obtenerCliente();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function obtenerSesionActual() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * RLS filtra `club` a únicamente los clubes donde el usuario autenticado
 * tiene una fila en miembro_club (ver 0002_rls.sql) — no hace falta joinear
 * contra miembro_club acá, Postgres ya lo hizo.
 */
export async function obtenerClubesDelEntrenador() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.from('club').select('id, nombre');
  if (error) throw error;
  return data.map((fila) => ({ id: fila.id, nombre: fila.nombre }));
}

export async function obtenerPlantelesDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('plantel')
    .select('id, categoria, codigo_cabb, temporada_id')
    .eq('club_id', clubId);
  if (error) throw error;
  return data.map((fila) => ({
    id: fila.id,
    categoria: fila.categoria,
    codigoCabb: fila.codigo_cabb,
    temporadaId: fila.temporada_id,
  }));
}

/**
 * Única llamada transaccional: importar_partido (0005_rpc_importar_partido.sql)
 * hace todos los inserts de una importación en una sola transacción de
 * Postgres — o se guarda todo, o no se guarda nada. Ver ESQUEMA.md.
 */
export async function importarPartido(payload) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('importar_partido', { payload });
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Verificar que no rompió nada existente**

Run: `npm test`
Expected: mismo resultado que al final de Task 2 (este archivo no tiene tests propios, pero no debe afectar a los que sí corren).

- [ ] **Step 3: Commit**

```bash
git add src/data/repositorio.js
git commit -m "feat: add auth, club/plantel lookup, and importarPartido to repositorio.js"
```

---

## Task 4: Migración `0004_seed_piloto.sql`

**Files:**
- Create: `supabase/migrations/0004_seed_piloto.sql`

**Interfaces:**
- No expone función/interfaz — son filas de configuración que Task 3's `obtenerClubesDelEntrenador`/`obtenerPlantelesDelClub` van a leer en producción.

- [ ] **Step 1: Escribir la migración**

UUIDs con un prefijo distinto al de `0003_seed_dev.sql` (que usa `00000000-...`), para que ambas convivan sin colisión en la misma base:

```sql
-- Etapa 2B: datos mínimos reales de configuración para el piloto en
-- Newell's Old Boys. NO incluye jugadores (esos se cargan importando
-- partidos reales) ni la fila de miembro_club del entrenador (acto
-- administrativo manual, ver ESQUEMA.md "Cómo probar localmente").

insert into club (id, nombre) values
  ('20000000-0000-0000-0000-000000000001', 'Newell''s Old Boys');

insert into temporada (id, club_id, nombre) values
  ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '2026');

insert into plantel (id, club_id, temporada_id, categoria, codigo_cabb) values
  ('20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'U21M', 'U21M'),
  ('20000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'U17M', 'U17M');
```

Nota sobre `Newell's` con comilla simple: en SQL una comilla simple literal dentro de un string se escapa duplicándola (`''`) — `'Newell''s Old Boys'` es el string `Newell's Old Boys`.

- [ ] **Step 2: Revisar a mano (no hay Postgres local en este entorno)**

Confirmar leyendo el archivo: los 2 `plantel` referencian el mismo `temporada_id` y `club_id` insertados arriba (sin filas colgantes), `codigo_cabb` coincide exactamente con las categorías reales del parser (`U21M`, `U17M` — ver `PARSER.md`/fixtures reales), y ningún UUID colisiona con los de `0003_seed_dev.sql` (prefijo `10000000`... perdón, `20000000` vs `00000000`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_seed_piloto.sql
git commit -m "feat: add pilot seed migration (club, temporada, planteles)"
```

**No aplicar todavía contra la base real** — se aplica junto con la migración del Task 5 en un solo `db push` que corre el usuario, después de que ambas estén escritas y revisadas.

---

## Task 5: Migración `0005_rpc_importar_partido.sql` + verificación manual

**Files:**
- Create: `supabase/migrations/0005_rpc_importar_partido.sql`
- Create: `tests/verificarRpc.js`

**Interfaces:**
- Produces: función Postgres `importar_partido(payload jsonb) returns jsonb` — `{ partidoId, importacionId }`. Consumida por `repositorio.importarPartido` (Task 3, ya escrito).
- Payload esperado (lo arma `prepararPayloadImportacion`, Task 2): `{ clubId, hashArchivo, idPartidoCabb, nombreArchivo, advertencias, partido: {clubId,plantelId,fecha,condicionPropia,rivalNombre,puntosPropios,puntosRival}, jugadoresNuevos: [{nombreClave,nombreLimpio,nombreCrudo,pertenenciaPropuesta:{plantelId,temporadaId,desde}}], pertenenciasNuevas: [{jugadorId,plantelId,temporadaId,desde}], estadisticas: [{jugadorId,nombreClave,numero,nombreCrudo,minSegundos,pts,dosAnotados,dosIntentados,dosPorcentaje,tresAnotados,tresIntentados,tresPorcentaje,libresAnotados,libresIntentados,libresPorcentaje,rebDef,rebOf,rebTot,ast,rec,per,tapCometidos,tapRecibidos,falCometidas,falRecibidas,val,masMenos}] }`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Etapa 2B: cierra la deuda de atomicidad de la Etapa 2A (ver ESQUEMA.md
-- "Orden de persistencia de una importación" / "Gap de atomicidad conocido").
-- Una llamada RPC vía PostgREST es una única transacción: cualquier
-- excepción no capturada aborta todo el bloque, sin datos parciales.
--
-- security invoker: corre con los permisos del usuario que llama, sujeto
-- a las mismas políticas RLS que si insertara cada fila por separado
-- (ver 0002_rls.sql) — no hay elevación de privilegios acá.
create or replace function importar_partido(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_importacion_id uuid;
  v_partido_id uuid;
  v_jugador_id uuid;
  j jsonb;
  e jsonb;
begin
  begin
    insert into importacion (club_id, hash_archivo, id_partido_cabb, nombre_archivo, advertencias)
    values (
      (payload->>'clubId')::uuid,
      payload->>'hashArchivo',
      payload->>'idPartidoCabb',
      payload->>'nombreArchivo',
      coalesce(payload->'advertencias', '[]'::jsonb)
    )
    returning id into v_importacion_id;
  exception when unique_violation then
    raise exception 'IMPORTACION_DUPLICADA' using errcode = 'P0001';
  end;

  insert into partido (club_id, plantel_id, importacion_id, fecha, condicion_propia, rival_nombre, puntos_propios, puntos_rival)
  values (
    (payload->>'clubId')::uuid,
    (payload->'partido'->>'plantelId')::uuid,
    v_importacion_id,
    (payload->'partido'->>'fecha')::date,
    payload->'partido'->>'condicionPropia',
    payload->'partido'->>'rivalNombre',
    (payload->'partido'->>'puntosPropios')::int,
    (payload->'partido'->>'puntosRival')::int
  )
  returning id into v_partido_id;

  create temporary table jugadores_resueltos (
    nombre_clave text primary key,
    jugador_id uuid not null
  ) on commit drop;

  for j in select * from jsonb_array_elements(coalesce(payload->'jugadoresNuevos', '[]'::jsonb))
  loop
    insert into jugador (club_id, nombre_clave, nombre_limpio, desambiguador)
    values (
      (payload->>'clubId')::uuid,
      j->>'nombreClave',
      j->>'nombreLimpio',
      coalesce(j->>'desambiguador', '')
    )
    returning id into v_jugador_id;

    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
    values (
      (payload->>'clubId')::uuid,
      v_jugador_id,
      (j->'pertenenciaPropuesta'->>'plantelId')::uuid,
      (j->'pertenenciaPropuesta'->>'temporadaId')::uuid,
      (j->'pertenenciaPropuesta'->>'desde')::date
    );

    insert into jugadores_resueltos (nombre_clave, jugador_id) values (j->>'nombreClave', v_jugador_id);
  end loop;

  for j in select * from jsonb_array_elements(coalesce(payload->'pertenenciasNuevas', '[]'::jsonb))
  loop
    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
    values (
      (payload->>'clubId')::uuid,
      (j->>'jugadorId')::uuid,
      (j->>'plantelId')::uuid,
      (j->>'temporadaId')::uuid,
      (j->>'desde')::date
    );
  end loop;

  for e in select * from jsonb_array_elements(payload->'estadisticas')
  loop
    insert into estadistica_jugador_partido (
      club_id, partido_id, jugador_id, numero, nombre_crudo, min_segundos, pts,
      dos_anotados, dos_intentados, dos_porcentaje,
      tres_anotados, tres_intentados, tres_porcentaje,
      libres_anotados, libres_intentados, libres_porcentaje,
      reb_def, reb_of, reb_tot, ast, rec, per,
      tap_cometidos, tap_recibidos, fal_cometidas, fal_recibidas, val, mas_menos
    )
    values (
      (payload->>'clubId')::uuid,
      v_partido_id,
      coalesce(
        (e->>'jugadorId')::uuid,
        (select jugador_id from jugadores_resueltos where nombre_clave = e->>'nombreClave')
      ),
      e->>'numero', e->>'nombreCrudo', (e->>'minSegundos')::int, (e->>'pts')::int,
      (e->>'dosAnotados')::int, (e->>'dosIntentados')::int, (e->>'dosPorcentaje')::int,
      (e->>'tresAnotados')::int, (e->>'tresIntentados')::int, (e->>'tresPorcentaje')::int,
      (e->>'libresAnotados')::int, (e->>'libresIntentados')::int, (e->>'libresPorcentaje')::int,
      (e->>'rebDef')::int, (e->>'rebOf')::int, (e->>'rebTot')::int,
      (e->>'ast')::int, (e->>'rec')::int, (e->>'per')::int,
      (e->>'tapCometidos')::int, (e->>'tapRecibidos')::int,
      (e->>'falCometidas')::int, (e->>'falRecibidas')::int,
      (e->>'val')::int, (e->>'masMenos')::int
    );
  end loop;

  return jsonb_build_object('partidoId', v_partido_id, 'importacionId', v_importacion_id);
end;
$$;
```

- [ ] **Step 2: Revisar a mano — checklist explícito (no hay Postgres local en este entorno)**

Confirmar leyendo el archivo, uno por uno:
1. Cada `insert` referencia solo columnas que existen en `0001_esquema_inicial.sql` (cruzar contra ese archivo campo por campo: `estadistica_jugador_partido` tiene 22 columnas numéricas — contarlas contra las 22 líneas de `values` de la última sección).
2. La tabla temporal `jugadores_resueltos` se crea DESPUÉS de que `v_partido_id` ya esté resuelto y ANTES del loop que la llena — no hay uso antes de creación.
3. El `coalesce` de `estadisticas.jugador_id` cubre los dos casos: `jugadorId` no nulo (coincidente o sugerencia confirmada como "mismo", ya resuelto por `prepararPayloadImportacion`) y `jugadorId` nulo (nuevo, se resuelve酸 por `nombreClave` contra la tabla temporal).
4. El bloque `begin/exception` de `importacion` es el único punto capturado — cualquier excepción posterior (violación de FK, `not null`, etc.) se propaga sin capturar y aborta toda la transacción, que es el comportamiento pedido (todo o nada).
5. `security invoker` está presente — sin esto, el RPC ignoraría RLS.

- [ ] **Step 3: Escribir el script de verificación manual del rollback**

Crear `tests/verificarRpc.js` — se corre a mano contra el proyecto real, no forma parte de `npm test` (mismo criterio que `tests/inspect.js`):

```js
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.VERIFICAR_RPC_EMAIL;
const password = process.env.VERIFICAR_RPC_PASSWORD;

if (!url || !publishableKey || !email || !password) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/verificarRpc.js');
  process.exit(1);
}

const supabase = createClient(url, publishableKey);

async function main() {
  const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errorLogin) { console.error('No se pudo iniciar sesión:', errorLogin.message); process.exit(1); }

  const { data: clubes, error: errorClubes } = await supabase.from('club').select('id');
  if (errorClubes || !clubes?.length) { console.error('No se encontró ningún club para este usuario:', errorClubes?.message); process.exit(1); }
  const clubId = clubes[0].id;

  const { data: planteles, error: errorPlanteles } = await supabase.from('plantel').select('id, temporada_id').eq('club_id', clubId).limit(1);
  if (errorPlanteles || !planteles?.length) { console.error('No se encontró ningún plantel:', errorPlanteles?.message); process.exit(1); }
  const { id: plantelId, temporada_id: temporadaId } = planteles[0];

  const hashUnico = 'verificar-rpc-' + Date.now();
  const payloadRoto = {
    clubId,
    hashArchivo: hashUnico,
    idPartidoCabb: null,
    nombreArchivo: 'verificarRpc.xlsx',
    advertencias: [],
    partido: { clubId, plantelId, fecha: '2026-01-01', condicionPropia: 'local', rivalNombre: 'RIVAL DE PRUEBA', puntosPropios: 10, puntosRival: 5 },
    jugadoresNuevos: [],
    pertenenciasNuevas: [],
    // jugadorId inexistente a propósito: esto debe romper la FK de
    // estadistica_jugador_partido y abortar TODA la transacción.
    estadisticas: [{
      jugadorId: '00000000-0000-0000-0000-000000000000',
      nombreClave: 'INEXISTENTE', numero: '99', nombreCrudo: 'INEXISTENTE',
      minSegundos: 0, pts: 0, dosAnotados: 0, dosIntentados: 0, dosPorcentaje: 0,
      tresAnotados: 0, tresIntentados: 0, tresPorcentaje: 0,
      libresAnotados: 0, libresIntentados: 0, libresPorcentaje: 0,
      rebDef: 0, rebOf: 0, rebTot: 0, ast: 0, rec: 0, per: 0,
      tapCometidos: 0, tapRecibidos: 0, falCometidas: 0, falRecibidas: 0, val: 0, masMenos: 0,
    }],
  };

  const { error: errorRpc } = await supabase.rpc('importar_partido', { payload: payloadRoto });
  if (!errorRpc) { console.error('FALLO: el RPC no tiró error con un jugadorId inexistente — el rollback no se está probando.'); process.exit(1); }
  console.log('OK: el RPC rechazó el payload roto:', errorRpc.message);

  const { data: importacionHuerfana } = await supabase.from('importacion').select('id').eq('hash_archivo', hashUnico).maybeSingle();
  if (importacionHuerfana) { console.error('FALLO: quedó una fila de importacion sin partido — el rollback no funcionó.'); process.exit(1); }
  console.log('OK: no quedó ninguna fila de importacion — el rollback fue completo.');

  console.log('\nVerificación de rollback: PASS');
}

main();
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_rpc_importar_partido.sql tests/verificarRpc.js
git commit -m "feat: add transactional importar_partido RPC and manual rollback verification script"
```

**No aplicar todavía contra la base real ni correr `verificarRpc.js` todavía** — requiere que el usuario corra `npx supabase db push` de nuevo (para `0004` + `0005`) y comparta una cuenta de entrenador de prueba (email + contraseña descartable, ya con fila en `miembro_club` para el club sembrado en `0004`). Esto es un checkpoint con el usuario, no un paso que el implementador resuelva solo.

---

## Task 6: Scaffold del navegador — `public/index.html` + import map + `public/css/import.css` + `src/ui/nav.js`

**Files:**
- Create: `public/index.html`
- Create: `public/css/import.css`
- Create: `src/ui/nav.js`
- Create: `src/ui/main.js` (versión mínima — solo confirma que los módulos cargan; se completa en Task 7)

**Interfaces:**
- Produces: `mostrarPantalla(id: string): void`, `toast(mensaje: string): void`, `esErrorDeRed(e: Error): boolean`, `escaparHtml(s: string): string` desde `src/ui/nav.js` — usados por todas las pantallas (Tasks 7-10).

- [ ] **Step 1: Escribir `public/index.html`**

```html
<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#131316">
<title>Cargar partido · Inferiores</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/public/css/import.css">
<script type="importmap">
{
  "imports": {
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs",
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.112.4"
  }
}
</script>
<script>
  // Públicas por diseño (publishable key, no la secret key) — ver
  // docs/superpowers/specs/2026-09-02-etapa-2b-import-ui-design.md.
  window.SUPABASE_URL = 'https://lseqvbtdzebomxwtqhwu.supabase.co';
  window.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nuPVo5yqsAFzY1uf6qcWBA_quRRgUFF';
</script>
</head>
<body>
<div class="marco">
  <div class="cuerpo" id="cuerpo">

    <div class="pant" id="p-login">
      <div class="pad">
        <div class="h2">Ingresar</div>
        <div class="campo"><label for="in-email">Email</label><input id="in-email" type="email" autocomplete="username" inputmode="email"></div>
        <div class="campo"><label for="in-pass">Contraseña</label><input id="in-pass" type="password" autocomplete="current-password"></div>
        <div class="al" id="login-error" style="display:none"><div class="tx"></div></div>
        <button class="btn" id="btn-login">Ingresar</button>
      </div>
    </div>

    <div class="pant" id="p-inicio">
      <div class="pad inicio-pad">
        <button class="btn" id="btn-cargar-partido">Cargar partido</button>
        <input type="file" id="input-archivo" accept=".xlsx" style="display:none">
      </div>
    </div>

    <div class="pant" id="p-confirmacion">
      <div class="pad" id="confirmacion-contenido"></div>
    </div>

    <div class="pant" id="p-resultado">
      <div class="pad" id="resultado-contenido"></div>
    </div>

  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"><span id="toast-tx"></span></div>
</div>
<script type="module" src="/src/ui/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Escribir `public/css/import.css`**

Estilos propios de estas 4 pantallas, sobre las variables de `css/tokens.css` (sin copiar ese archivo). Sigue los mismos patrones visuales que `css/app.css` (`.pant`, `.btn`, `.opt`, `.campo`, `.tarj`, `.eyebrow`, `.al`, `.toast`) sin copiarlo entero — solo lo que estas pantallas necesitan, más las clases nuevas (`.equipos`, `.grupo`, `.jug-fila`, `.chk`).

```css
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;padding:0}
body{background:var(--negro);font-family:'Inter',system-ui,sans-serif;color:var(--tinta);min-height:100dvh;overscroll-behavior:none}
button{font-family:inherit;border:0;background:none;cursor:pointer;color:inherit;padding:0;user-select:none}
input{font-family:inherit}

.marco{width:100%;height:100dvh;background:var(--papel);overflow:hidden;position:relative;display:flex;flex-direction:column}
@media(min-width:520px){
  body{background:#0B0B0D;display:flex;align-items:center;justify-content:center;padding:24px 12px}
  .marco{width:390px;height:min(820px,calc(100vh - 48px));border-radius:26px;box-shadow:0 0 0 8px #1B1B1F,0 30px 70px rgba(0,0,0,.6)}
}

.cuerpo{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.pant{display:none;padding-bottom:20px;min-height:100%}
.pant.on{display:block}
.pad{padding:14px}
.inicio-pad{min-height:100%;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:40px}

.h2{font-family:'Barlow Condensed';font-size:var(--fs-260);font-weight:700;text-transform:uppercase;letter-spacing:.3px;line-height:1;margin:16px 0 12px}
.p{font-size:var(--fs-135);color:var(--gris);line-height:1.45}
.eyebrow{font-family:'Barlow Condensed';font-size:var(--fs-125);font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:var(--gris);display:flex;align-items:center;gap:7px;margin:18px 0 8px}
.eyebrow::before{content:"";width:7px;height:7px;background:var(--rojo);flex:0 0 auto}

.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:var(--rojo);color:#fff;padding:16px;border-radius:var(--r);font-family:'Barlow Condensed';font-size:var(--fs-190);font-weight:600;letter-spacing:.1em;text-transform:uppercase;transition:transform 120ms ease-out}
.btn:active{background:var(--rojo-osc);transform:scale(.97)}
.btn:disabled{background:#C9C5BE;color:#fff}
.btn.sec{background:transparent;color:var(--tinta);border:1.5px solid var(--negro);font-size:var(--fs-145)}

.campo{margin-bottom:14px}
.campo label{font-family:'Barlow Condensed';font-size:var(--fs-115);letter-spacing:.11em;text-transform:uppercase;color:var(--gris);font-weight:500;display:block;margin-bottom:6px}
.campo input{width:100%;padding:13px;border-radius:9px;border:1px solid var(--linea);font-size:var(--fs-160);font-family:'IBM Plex Mono';background:#fff;min-height:44px}

.tarj{background:var(--blanco);border-radius:var(--r);padding:14px;margin-bottom:10px;box-shadow:var(--sombra)}
.marcador{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.marcador .lado{flex:1;text-align:center}
.marcador .n{font-family:'IBM Plex Mono';font-size:var(--fs-260);font-weight:600}
.marcador .nom{font-size:var(--fs-115);color:var(--gris);text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
.marcador .vs{font-family:'Barlow Condensed';font-size:var(--fs-135);color:var(--gris-cl);padding:0 6px}

.opt{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:var(--blanco);padding:16px 10px;border-radius:var(--r);width:100%;text-align:center;box-shadow:var(--sombra);border:2px solid transparent;min-height:64px;transition:transform 120ms ease-out}
.opt:active{transform:scale(.97)}
.opt.on{border-color:var(--rojo);background:var(--rojo-cl)}
.opt .t{font-weight:600;font-size:var(--fs-145);line-height:1.2}
.opt .d{font-size:var(--fs-115);color:var(--gris);margin-top:2px}
.equipos{display:grid;grid-template-columns:1fr 1fr;gap:10px}

.al{background:var(--blanco);border-left:3px solid var(--rojo);border-radius:0 var(--r) var(--r) 0;padding:12px 13px;margin-bottom:10px;display:flex;gap:10px;box-shadow:var(--sombra-alta)}
.al .tx{font-size:var(--fs-135);line-height:1.4}
.al.ok{border-left-color:var(--sube)}

.grupo{margin-bottom:6px}
.grupo-h{display:flex;align-items:center;justify-content:space-between;padding:9px 0;cursor:pointer}
.grupo-h .t{font-family:'Barlow Condensed';font-size:var(--fs-145);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.grupo-h .n{font-family:'IBM Plex Mono';font-size:var(--fs-125);color:var(--gris)}
.grupo-cuerpo{display:none}
.grupo.abierto .grupo-cuerpo{display:block}

.jug-fila{display:flex;align-items:center;gap:10px;background:var(--blanco);padding:11px 12px;border-radius:var(--r);margin-bottom:7px;box-shadow:var(--sombra)}
.jug-fila .nom{font-weight:600;font-size:var(--fs-145);flex:1}
.jug-fila .det{font-size:var(--fs-115);color:var(--gris);margin-top:2px}
.jug-fila .chk{width:26px;height:26px;flex:0 0 auto;border-radius:6px;border:2px solid var(--linea);display:flex;align-items:center;justify-content:center}
.jug-fila .chk.on{background:var(--rojo);border-color:var(--rojo);color:#fff;font-weight:700}
.jug-sugerencia{background:var(--blanco);border-radius:var(--r);padding:11px 12px;margin-bottom:7px;box-shadow:var(--sombra)}
.jug-sugerencia .decision{display:flex;gap:8px;margin-top:8px}
.jug-sugerencia .decision button{flex:1;padding:10px 0;border-radius:8px;background:#EFECE6;font-family:'Barlow Condensed';font-size:var(--fs-135);font-weight:600;text-transform:uppercase;min-height:44px}
.jug-sugerencia .decision button.on{background:var(--negro);color:#fff}

.pie-fijo{position:sticky;bottom:0;background:linear-gradient(transparent,var(--papel) 22%);padding:16px 14px 12px}

.toast{position:absolute;left:14px;right:14px;bottom:20px;background:var(--negro);color:#fff;padding:13px 14px;border-radius:var(--r);font-size:var(--fs-135);z-index:60;transform:translateY(150%);transition:transform 150ms ease}
.toast.on{transform:translateY(0);transition:transform 250ms ease}
.toast:not(.on){visibility:hidden}

*:focus-visible{outline:2px solid var(--rojo);outline-offset:2px}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
```

- [ ] **Step 3: Escribir `src/ui/nav.js`**

```js
export function mostrarPantalla(id) {
  document.querySelectorAll('.pant').forEach((p) => p.classList.toggle('on', p.id === id));
  const cuerpo = document.getElementById('cuerpo');
  if (cuerpo) cuerpo.scrollTop = 0;
}

let temporizadorToast = null;
export function toast(mensaje) {
  const el = document.getElementById('toast');
  document.getElementById('toast-tx').textContent = mensaje;
  el.classList.add('on');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => el.classList.remove('on'), 2800);
}

export function esErrorDeRed(e) {
  return e instanceof TypeError || /fetch|network|conexi[oó]n/i.test(e?.message ?? '');
}

export function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
```

- [ ] **Step 4: Escribir una versión mínima de `src/ui/main.js`** (se reemplaza en Task 7 con el bootstrap real de sesión)

```js
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { toast } from './nav.js';

console.log('xlsx cargado:', typeof XLSX.read === 'function');
console.log('supabase-js cargado:', typeof createClient === 'function');
toast('Scaffold cargado — ver consola');
```

- [ ] **Step 5: Verificación manual en el navegador**

Run: `npx serve .` (desde la raíz del repo), abrir `http://localhost:3000/public/` (o el puerto que imprima `serve`).
Expected: la pantalla de login se ve (aunque sin funcionar todavía), un toast aparece abajo diciendo "Scaffold cargado — ver consola", y la consola del navegador muestra `xlsx cargado: true` y `supabase-js cargado: true`. Si cualquiera da `false` o hay un error de import map en la consola, no seguir — revisar las URLs del import map antes de continuar a la Task 7.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/css/import.css src/ui/nav.js src/ui/main.js
git commit -m "feat: scaffold browser entry point with import map for xlsx and supabase-js"
```

---

## Task 7: Auth — login y bootstrap de sesión

**Files:**
- Create: `src/ui/sesion.js`
- Create: `src/ui/auth.js`
- Modify: `src/ui/main.js` (reemplaza la versión mínima de Task 6)

**Interfaces:**
- Consumes: `iniciarSesion`, `obtenerSesionActual`, `cerrarSesion`, `obtenerClubesDelEntrenador` de `src/data/repositorio.js` (Task 3). `mostrarPantalla`, `toast`, `esErrorDeRed` de `src/ui/nav.js` (Task 6).
- Produces: `setClubActual(club)`/`obtenerClubActual()` desde `src/ui/sesion.js` — usado por `pantallaConfirmacion.js` (Tasks 9-10). `mostrarLogin()`/`iniciarAuth()` desde `src/ui/auth.js`.

- [ ] **Step 1: Escribir `src/ui/sesion.js`**

```js
let clubActual = null;

export function setClubActual(club) {
  clubActual = club;
}

export function obtenerClubActual() {
  return clubActual;
}
```

- [ ] **Step 2: Escribir `src/ui/auth.js`**

```js
import { iniciarSesion } from '../data/repositorio.js';
import { mostrarPantalla, esErrorDeRed } from './nav.js';

const $ = (id) => document.getElementById(id);

export function mostrarLogin() {
  mostrarPantalla('p-login');
  ocultarError();
}

export function iniciarAuth(alIniciarSesion) {
  $('btn-login').addEventListener('click', () => manejarLogin(alIniciarSesion));
  $('in-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') manejarLogin(alIniciarSesion);
  });
}

function ocultarError() {
  $('login-error').style.display = 'none';
}

function mostrarError(mensaje) {
  $('login-error').querySelector('.tx').textContent = mensaje;
  $('login-error').style.display = 'flex';
}

async function manejarLogin(alIniciarSesion) {
  const email = $('in-email').value.trim();
  const password = $('in-pass').value;
  ocultarError();
  if (!email || !password) {
    mostrarError('Completá email y contraseña.');
    return;
  }
  const boton = $('btn-login');
  boton.disabled = true;
  boton.textContent = 'Ingresando...';
  try {
    await iniciarSesion(email, password);
    await alIniciarSesion();
  } catch (e) {
    mostrarError(esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'Email o contraseña incorrectos.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Ingresar';
  }
}
```

- [ ] **Step 3: Reescribir `src/ui/main.js`**

```js
import { obtenerSesionActual, obtenerClubesDelEntrenador } from '../data/repositorio.js';
import { mostrarLogin, iniciarAuth } from './auth.js';
import { mostrarInicio, iniciarPantallaInicio } from './pantallaInicio.js';
import { setClubActual } from './sesion.js';
import { toast } from './nav.js';

async function entrarConSesion() {
  let clubes;
  try {
    clubes = await obtenerClubesDelEntrenador();
  } catch {
    toast('No se pudo cargar tu club. Revisá tu conexión.');
    mostrarLogin();
    return;
  }
  if (!clubes.length) {
    toast('Tu usuario no está asociado a ningún club todavía.');
    mostrarLogin();
    return;
  }
  setClubActual(clubes[0]);
  mostrarInicio();
}

async function iniciar() {
  iniciarAuth(entrarConSesion);
  iniciarPantallaInicio();

  let sesion;
  try {
    sesion = await obtenerSesionActual();
  } catch {
    sesion = null;
  }

  if (sesion) {
    await entrarConSesion();
  } else {
    mostrarLogin();
  }
}

iniciar();
```

- [ ] **Step 4: Crear un stub temporal de `pantallaInicio.js`** (se reemplaza completo en Task 8 — necesario acá solo para que `main.js` importe algo que existe)

```js
import { mostrarPantalla } from './nav.js';

export function mostrarInicio() {
  mostrarPantalla('p-inicio');
}

export function iniciarPantallaInicio() {}
```

- [ ] **Step 5: Verificación manual**

Run: `npx serve .`, abrir `http://localhost:3000/public/`.
Expected: aparece la pantalla de login. Escribir un email/contraseña inválidos y tocar "Ingresar" → aparece "Email o contraseña incorrectos." sin romper nada, el botón vuelve a decir "Ingresar" y queda habilitado. Este paso no requiere todavía la cuenta de prueba real (se prueba el camino de error).

- [ ] **Step 6: Commit**

```bash
git add src/ui/sesion.js src/ui/auth.js src/ui/main.js src/ui/pantallaInicio.js
git commit -m "feat: add login screen and session bootstrap"
```

**Verificación con cuenta real** (requiere que el usuario haya creado la cuenta de entrenador de prueba y le haya dado de alta su `miembro_club` para el club de `0004_seed_piloto.sql` — checkpoint con el usuario, no bloquea seguir escribiendo código): loguearse con esa cuenta real debe llevar a la Pantalla 1 sin error.

---

## Task 8: Pantalla 1 — Inicio

**Files:**
- Modify: `src/ui/pantallaInicio.js` (reemplaza el stub de Task 7)

**Interfaces:**
- Consumes: `mostrarPantalla` de `nav.js`. `iniciarConfirmacion` de `pantallaConfirmacion.js` (Task 9 — este task crea un stub temporal, igual que Task 7 hizo con `pantallaInicio.js`).
- Produces: `mostrarInicio()`, `iniciarPantallaInicio()` (misma firma que el stub, ahora con comportamiento real).

- [ ] **Step 1: Crear un stub temporal de `src/ui/pantallaConfirmacion.js`** (se completa en Tasks 9-10)

```js
import { mostrarPantalla } from './nav.js';

export function iniciarConfirmacion(archivo) {
  mostrarPantalla('p-confirmacion');
  document.getElementById('confirmacion-contenido').textContent = `Archivo elegido: ${archivo.name}`;
}
```

- [ ] **Step 2: Escribir `src/ui/pantallaInicio.js`**

```js
import { mostrarPantalla } from './nav.js';
import { iniciarConfirmacion } from './pantallaConfirmacion.js';

const $ = (id) => document.getElementById(id);

export function mostrarInicio() {
  mostrarPantalla('p-inicio');
}

export function iniciarPantallaInicio() {
  $('btn-cargar-partido').addEventListener('click', () => $('input-archivo').click());
  $('input-archivo').addEventListener('change', (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (archivo) iniciarConfirmacion(archivo);
  });
}
```

- [ ] **Step 3: Verificación manual**

Run: `npx serve .`, loguearse (con credenciales inválidas ya alcanza para probar el camino de error de Task 7 — para llegar a Pantalla 1 hace falta la cuenta real, ver nota de Task 7). Una vez en Pantalla 1: tocar "Cargar partido" abre el selector de archivos del sistema operativo; elegir cualquier `.xlsx` (puede ser uno de `tests/fixtures/`) navega a Pantalla 2 y muestra "Archivo elegido: <nombre>" (el stub de Task 1).
Expected: el botón ocupa la mitad inferior de la pantalla, es grande, un solo toque lo activa.

- [ ] **Step 4: Commit**

```bash
git add src/ui/pantallaInicio.js src/ui/pantallaConfirmacion.js
git commit -m "feat: wire Pantalla 1 (inicio) to file picker"
```

---

## Task 9: Pantalla 2, parte A — parseo, duplicados, equipo, fecha, plantel, resultado

**Files:**
- Modify: `src/ui/pantallaConfirmacion.js` (reemplaza el stub de Task 8)

**Interfaces:**
- Consumes: `parsearPartidoCabb` de `../parser/parserCabb.js`; `calcularHashArchivo`, `mapearImportacion` de `../data/mapearImportacion.js`; `buscarImportacionPorHash`, `obtenerPlantelesDelClub`, `obtenerJugadoresDelClub` de `../data/repositorio.js`; `obtenerClubActual` de `./sesion.js`; `mostrarPantalla`, `toast`, `esErrorDeRed`, `escaparHtml` de `./nav.js`.
- Produces (usado en Task 10, mismo archivo): variable de módulo `estado` con la forma descrita abajo, y la función interna `mostrarGrupos()` que Task 10 completa.

- [ ] **Step 1: Escribir `src/ui/pantallaConfirmacion.js` (parte A)**

```js
import { parsearPartidoCabb } from '../parser/parserCabb.js';
import { calcularHashArchivo, mapearImportacion } from '../data/mapearImportacion.js';
import { obtenerPlantelesDelClub, obtenerJugadoresDelClub, buscarImportacionPorHash } from '../data/repositorio.js';
import { obtenerClubActual } from './sesion.js';
import { mostrarPantalla, toast, esErrorDeRed, escaparHtml } from './nav.js';
import { mostrarInicio } from './pantallaInicio.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('confirmacion-contenido');

let estado = null;

export async function iniciarConfirmacion(archivo) {
  mostrarPantalla('p-confirmacion');
  estado = {
    archivo,
    resultadoParser: null,
    hashArchivo: null,
    condicionPropia: null,
    fecha: new Date().toISOString().slice(0, 10),
    planteles: [],
    plantelId: null,
    jugadoresExistentes: null,
    resultadoMapeo: null,
    decisionesSugerencias: {},
    nuevosExcluidos: new Set(),
  };
  contenedor().innerHTML = `<div class="p">Leyendo archivo...</div>`;

  const club = obtenerClubActual();
  let datos;
  try {
    datos = await archivo.arrayBuffer();
  } catch {
    contenedor().innerHTML = `<div class="al"><div class="tx">No se pudo leer el archivo. Probá de nuevo.</div></div>` + botonVolver();
    ligarBotonVolver();
    return;
  }

  const resultadoParser = parsearPartidoCabb(datos, archivo.name);
  if (resultadoParser.errores.length > 0) {
    contenedor().innerHTML = `
      <div class="eyebrow">No se pudo leer el partido</div>
      ${resultadoParser.errores.map((e) => `<div class="al"><div class="tx">${escaparHtml(e.mensaje)}</div></div>`).join('')}
    ` + botonVolver();
    ligarBotonVolver();
    return;
  }
  estado.resultadoParser = resultadoParser;

  let hashArchivo, planteles;
  try {
    hashArchivo = await calcularHashArchivo(datos);
    planteles = await obtenerPlantelesDelClub(club.id);
  } catch (e) {
    contenedor().innerHTML = `<div class="al"><div class="tx">${esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'Ocurrió un error inesperado.'}</div></div>` + botonVolver();
    ligarBotonVolver();
    return;
  }
  estado.hashArchivo = hashArchivo;
  estado.planteles = planteles;

  let importacionExistente;
  try {
    importacionExistente = await buscarImportacionPorHash(club.id, hashArchivo);
  } catch (e) {
    contenedor().innerHTML = `<div class="al"><div class="tx">${esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'Ocurrió un error inesperado.'}</div></div>` + botonVolver();
    ligarBotonVolver();
    return;
  }
  if (importacionExistente) {
    // buscarImportacionPorHash (Etapa 2A, sin cambios) devuelve la fila cruda
    // de Supabase sin remapear a camelCase — a diferencia del resto de
    // repositorio.js, acá es nombre_archivo, no nombreArchivo.
    contenedor().innerHTML = `<div class="al ok"><div class="tx">Este partido ya fue importado (${escaparHtml(importacionExistente.nombre_archivo ?? '')}).</div></div>` + botonVolver();
    ligarBotonVolver();
    return;
  }

  renderPasoEquipoYPlantel();
}

function botonVolver() {
  return `<div class="pie-fijo"><button class="btn sec" id="btn-volver-inicio">Volver</button></div>`;
}
function ligarBotonVolver() {
  $('btn-volver-inicio')?.addEventListener('click', mostrarInicio);
}

function renderPasoEquipoYPlantel() {
  const { resultadoParser, planteles } = estado;
  const [equipoA, equipoB] = resultadoParser.equipos;
  const categoriaSugerida = resultadoParser.partido.categoria;
  const plantelSugeridoId = planteles.find((p) => p.codigoCabb === categoriaSugerida)?.id ?? null;
  if (estado.plantelId === null) estado.plantelId = plantelSugeridoId;

  contenedor().innerHTML = `
    <div class="eyebrow">¿Cuál es tu equipo?</div>
    <div class="equipos">
      <button class="opt" data-condicion="local" data-nombre="${escaparHtml(equipoA.nombre ?? '')}"><div class="t">${escaparHtml(equipoA.nombre ?? '(sin nombre)')}</div></button>
      <button class="opt" data-condicion="visitante" data-nombre="${escaparHtml(equipoB.nombre ?? '')}"><div class="t">${escaparHtml(equipoB.nombre ?? '(sin nombre)')}</div></button>
    </div>

    <div class="eyebrow">Fecha del partido</div>
    <div class="campo"><input type="date" id="in-fecha" value="${estado.fecha}"></div>

    <div class="eyebrow">Plantel</div>
    <div id="planteles"></div>

    <div id="resultado-marcador"></div>

    <div class="pie-fijo">
      <button class="btn" id="btn-confirmar-equipo-plantel" disabled>Elegí tu equipo y el plantel</button>
    </div>
  `;

  document.querySelectorAll('.equipos .opt').forEach((boton) => {
    boton.addEventListener('click', () => {
      document.querySelectorAll('.equipos .opt').forEach((b) => b.classList.remove('on'));
      boton.classList.add('on');
      estado.condicionPropia = boton.dataset.condicion;
      actualizarMarcador();
      actualizarBotonConfirmar();
    });
  });

  $('in-fecha').addEventListener('change', (e) => { estado.fecha = e.target.value; });

  renderPlanteles(plantelSugeridoId);

  $('btn-confirmar-equipo-plantel').addEventListener('click', avanzarAJugadores);
}

function renderPlanteles(plantelSugeridoId) {
  const cont = $('planteles');
  cont.innerHTML = estado.planteles.map((p) => `
    <button class="opt plantel-opt ${p.id === estado.plantelId ? 'on' : ''}" data-id="${p.id}">
      <div class="t">${escaparHtml(p.categoria)}</div>
      ${p.id === plantelSugeridoId ? '<div class="d">Sugerido</div>' : ''}
    </button>
  `).join('');
  cont.querySelectorAll('.plantel-opt').forEach((boton) => {
    boton.addEventListener('click', () => {
      cont.querySelectorAll('.plantel-opt').forEach((b) => b.classList.remove('on'));
      boton.classList.add('on');
      estado.plantelId = boton.dataset.id;
      actualizarBotonConfirmar();
    });
  });
}

function actualizarMarcador() {
  if (!estado.condicionPropia) { $('resultado-marcador').innerHTML = ''; return; }
  const { resultadoParser, condicionPropia } = estado;
  const propio = resultadoParser.equipos.find((e) => e.condicion === condicionPropia);
  const rival = resultadoParser.equipos.find((e) => e.condicion !== condicionPropia);
  const ptsPropios = propio.totales ? propio.totales.pts : null;
  const ptsRival = rival.totales ? rival.totales.pts : null;
  $('resultado-marcador').innerHTML = `
    <div class="tarj">
      <div class="marcador">
        <div class="lado"><div class="n">${ptsPropios ?? '-'}</div><div class="nom">Nosotros</div></div>
        <div class="vs">VS</div>
        <div class="lado"><div class="n">${ptsRival ?? '-'}</div><div class="nom">${escaparHtml(rival.nombre ?? 'Rival')}</div></div>
      </div>
    </div>
  `;
}

function actualizarBotonConfirmar() {
  const boton = $('btn-confirmar-equipo-plantel');
  const listo = estado.condicionPropia && estado.plantelId && estado.fecha;
  boton.disabled = !listo;
  boton.textContent = listo ? 'Ver jugadores' : 'Elegí tu equipo y el plantel';
}

async function avanzarAJugadores() {
  const club = obtenerClubActual();
  contenedor().insertAdjacentHTML('beforeend', `<div class="p" id="cargando-jugadores">Cargando plantel...</div>`);
  $('btn-confirmar-equipo-plantel').disabled = true;

  const plantel = estado.planteles.find((p) => p.id === estado.plantelId);

  let jugadoresExistentes;
  try {
    jugadoresExistentes = await obtenerJugadoresDelClub(club.id);
  } catch (e) {
    $('cargando-jugadores').textContent = esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'Ocurrió un error inesperado.';
    $('btn-confirmar-equipo-plantel').disabled = false;
    return;
  }
  estado.jugadoresExistentes = jugadoresExistentes;

  const resultadoMapeo = mapearImportacion(
    estado.resultadoParser,
    { condicionPropia: estado.condicionPropia, clubId: club.id, plantelId: estado.plantelId, temporadaId: plantel.temporadaId, fecha: estado.fecha },
    jugadoresExistentes,
  );
  if (resultadoMapeo.error) {
    $('cargando-jugadores').textContent = 'Ocurrió un error inesperado: ' + resultadoMapeo.error;
    $('btn-confirmar-equipo-plantel').disabled = false;
    return;
  }
  estado.resultadoMapeo = resultadoMapeo;

  mostrarGrupos();
}

// Implementación real en Task 10 — acá solo un marcador visible para poder
// verificar manualmente el Step 2 de este task antes de que exista Task 10.
function mostrarGrupos() {
  contenedor().innerHTML = `<div class="p">(grupos de jugadores — Task 10)</div>`;
}
```

- [ ] **Step 2: Verificación manual**

Con la cuenta de prueba real ya funcionando (Task 7): loguearse, tocar "Cargar partido", elegir un `.xlsx` real de `tests/fixtures/`.
Expected: se ven los dos nombres de equipo lado a lado sin ninguno preseleccionado; tocar uno lo resalta y hace aparecer el marcador con el resultado correcto (cruzar contra `node tests/inspect.js tests/fixtures/<mismo-archivo>.xlsx`); el plantel sugerido según la categoría del título aparece marcado pero se puede cambiar tocando el otro; el botón de abajo dice "Elegí tu equipo y el plantel" mientras falte algo y pasa a "Ver jugadores" cuando los tres campos (equipo, plantel, fecha) están completos; tocarlo muestra "Cargando plantel..." y después el placeholder de Task 10.

Probar también: elegir el mismo archivo dos veces seguidas → la segunda vez debe mostrar "Este partido ya fue importado" (una vez que Task 5 ya esté aplicado contra la base real y se haya guardado al menos una vez vía Task 10 — si Task 10 todavía no existe, este caso se reverifica al final de Task 10).

- [ ] **Step 3: Commit**

```bash
git add src/ui/pantallaConfirmacion.js
git commit -m "feat: Pantalla 2 parte A — parseo, duplicados, equipo, fecha, plantel, resultado"
```

---

## Task 10: Pantalla 2, parte B — los 4 grupos de jugadores + guardar; Pantalla 3

**Files:**
- Modify: `src/ui/pantallaConfirmacion.js` (reemplaza `mostrarGrupos()`, agrega el resto)
- Create: `src/ui/pantallaResultado.js`

**Interfaces:**
- Consumes: `prepararPayloadImportacion` de `../data/prepararPayloadImportacion.js`; `importarPartido` de `../data/repositorio.js`; `mostrarResultado` de `./pantallaResultado.js` (nuevo en este task).
- Produces: `mostrarResultado({ resumen, advertencias }): void` desde `pantallaResultado.js`.

- [ ] **Step 1: Agregar los imports que faltan al principio de `pantallaConfirmacion.js`**

```js
import { prepararPayloadImportacion } from '../data/prepararPayloadImportacion.js';
import { importarPartido } from '../data/repositorio.js';
import { mostrarResultado } from './pantallaResultado.js';
```

- [ ] **Step 2: Reemplazar `mostrarGrupos()` y agregar las funciones de guardado**

```js
function mostrarGrupos() {
  const { resultadoMapeo } = estado;
  const yaCargados = resultadoMapeo.jugadoresCoincidentes.filter((c) => !c.requierePertenenciaNueva);
  const otraCategoria = resultadoMapeo.jugadoresCoincidentes.filter((c) => c.requierePertenenciaNueva);
  const sugerencias = resultadoMapeo.sugerencias;
  const nuevos = resultadoMapeo.jugadoresNuevos;

  contenedor().innerHTML = `
    ${grupoHtml('ya-cargados', 'Ya cargados', yaCargados.length, false, yaCargados.map((c) => filaSimpleHtml(c.nombreClave)).join(''))}
    ${grupoHtml('otra-categoria', 'Ya está en otra categoría', otraCategoria.length, true, otraCategoria.map((c) => filaOtraCategoriaHtml(c)).join(''))}
    ${grupoHtml('sugerencias', 'Posible coincidencia', sugerencias.length, true, sugerencias.map((s) => filaSugerenciaHtml(s)).join(''))}
    ${grupoHtml('nuevos', 'Nuevos', nuevos.length, true, nuevos.map((n) => filaNuevoHtml(n)).join(''))}
    <div class="pie-fijo">
      <button class="btn" id="btn-guardar" disabled>Guardar</button>
    </div>
  `;

  document.querySelectorAll('.grupo-h').forEach((h) => {
    h.addEventListener('click', () => h.closest('.grupo').classList.toggle('abierto'));
  });

  sugerencias.forEach((s) => {
    const fila = document.querySelector(`[data-sugerencia="${cssEscape(s.nombreClave)}"]`);
    fila.querySelectorAll('.decision button').forEach((boton) => {
      boton.addEventListener('click', () => {
        fila.querySelectorAll('.decision button').forEach((b) => b.classList.remove('on'));
        boton.classList.add('on');
        estado.decisionesSugerencias[s.nombreClave] = boton.dataset.decision;
        actualizarBotonGuardar();
      });
    });
  });

  nuevos.forEach((n) => {
    const chk = document.querySelector(`[data-nuevo-chk="${cssEscape(n.nombreClave)}"]`);
    chk.addEventListener('click', () => {
      if (estado.nuevosExcluidos.has(n.nombreClave)) {
        estado.nuevosExcluidos.delete(n.nombreClave);
        chk.classList.add('on');
        chk.textContent = '✓';
      } else {
        estado.nuevosExcluidos.add(n.nombreClave);
        chk.classList.remove('on');
        chk.textContent = '';
      }
      actualizarBotonGuardar();
    });
  });

  actualizarBotonGuardar();
  $('btn-guardar').addEventListener('click', guardar);
}

function grupoHtml(id, titulo, cantidad, abiertoPorDefecto, filasHtml) {
  return `
    <div class="grupo ${abiertoPorDefecto && cantidad > 0 ? 'abierto' : ''}" id="grupo-${id}">
      <div class="grupo-h"><div class="t">${escaparHtml(titulo)}</div><div class="n">${cantidad}</div></div>
      <div class="grupo-cuerpo">${cantidad > 0 ? filasHtml : '<div class="p">Ninguno.</div>'}</div>
    </div>
  `;
}
function filaSimpleHtml(nombreClave) {
  return `<div class="jug-fila"><div class="nom">${escaparHtml(nombreClave)}</div></div>`;
}
function filaOtraCategoriaHtml(c) {
  const plantelDestino = estado.planteles.find((p) => p.id === estado.plantelId);
  return `<div class="jug-fila"><div><div class="nom">${escaparHtml(c.nombreClave)}</div><div class="det">Ya está cargado en otra categoría, se lo suma también a ${escaparHtml(plantelDestino?.categoria ?? '')}</div></div></div>`;
}
function filaSugerenciaHtml(s) {
  return `
    <div class="jug-sugerencia" data-sugerencia="${escaparHtml(s.nombreClave)}">
      <div class="nom">${escaparHtml(s.nombreLimpio)}</div>
      <div class="det">¿Es ${escaparHtml(s.candidato.nombreLimpio)}, ya cargado?</div>
      <div class="decision">
        <button data-decision="mismo">Es el mismo</button>
        <button data-decision="otro">Es otro</button>
      </div>
    </div>
  `;
}
function filaNuevoHtml(n) {
  return `
    <div class="jug-fila">
      <div style="flex:1"><div class="nom">${escaparHtml(n.nombreLimpio)}</div></div>
      <button class="chk on" data-nuevo-chk="${escaparHtml(n.nombreClave)}">✓</button>
    </div>
  `;
}
function cssEscape(s) {
  return s.replace(/"/g, '\\"');
}

function contarACrear() {
  const { resultadoMapeo, decisionesSugerencias, nuevosExcluidos } = estado;
  let n = resultadoMapeo.jugadoresNuevos.filter((j) => !nuevosExcluidos.has(j.nombreClave)).length;
  for (const s of resultadoMapeo.sugerencias) {
    if (decisionesSugerencias[s.nombreClave] === 'otro' && !nuevosExcluidos.has(s.nombreClave)) n++;
  }
  return n;
}

function actualizarBotonGuardar() {
  const boton = $('btn-guardar');
  const { resultadoMapeo, decisionesSugerencias } = estado;
  const faltaAlgunaDecision = resultadoMapeo.sugerencias.some((s) => !decisionesSugerencias[s.nombreClave]);
  boton.disabled = faltaAlgunaDecision;
  const nuevosACrear = contarACrear();
  boton.textContent = faltaAlgunaDecision
    ? 'Confirmá las coincidencias'
    : `Guardar (${nuevosACrear} jugador${nuevosACrear === 1 ? '' : 'es'} nuevo${nuevosACrear === 1 ? '' : 's'})`;
}

async function guardar() {
  const boton = $('btn-guardar');
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Guardando...';

  const club = obtenerClubActual();
  const plantel = estado.planteles.find((p) => p.id === estado.plantelId);
  const { payload, error: errorPayload } = prepararPayloadImportacion(
    estado.resultadoMapeo,
    estado.jugadoresExistentes,
    { sugerencias: estado.decisionesSugerencias, nuevosExcluidos: [...estado.nuevosExcluidos] },
    {
      temporadaId: plantel.temporadaId,
      hashArchivo: estado.hashArchivo,
      idPartidoCabb: estado.resultadoParser.origen.idPartidoCabb,
      nombreArchivo: estado.archivo.name,
      advertencias: estado.resultadoParser.advertencias,
    },
  );
  if (errorPayload) {
    toast('Ocurrió un error inesperado: ' + errorPayload);
    boton.disabled = false;
    boton.textContent = textoOriginal;
    return;
  }

  try {
    await importarPartido(payload);
  } catch (e) {
    if (e?.message === 'IMPORTACION_DUPLICADA') {
      toast('Este partido ya fue importado.');
    } else if (esErrorDeRed(e)) {
      toast('Sin conexión. Revisá tu wifi/datos e intentá de nuevo.');
    } else {
      toast('No se pudo guardar. Intentá de nuevo.');
    }
    boton.disabled = false;
    boton.textContent = textoOriginal;
    return;
  }

  mostrarResultado({
    resumen: `Partido vs. ${estado.resultadoParser.equipos.find((e) => e.condicion !== estado.condicionPropia).nombre} guardado — ${contarACrear()} jugador${contarACrear() === 1 ? '' : 'es'} nuevo${contarACrear() === 1 ? '' : 's'}.`,
    advertencias: estado.resultadoParser.advertencias,
  });
}
```

- [ ] **Step 3: Escribir `src/ui/pantallaResultado.js`**

```js
import { mostrarPantalla, escaparHtml } from './nav.js';
import { mostrarInicio } from './pantallaInicio.js';

const $ = (id) => document.getElementById(id);

export function mostrarResultado({ resumen, advertencias }) {
  mostrarPantalla('p-resultado');
  const detalleAdvertencias = advertencias.length
    ? `
      <details style="margin-top:14px">
        <summary class="p">${advertencias.length} advertencia${advertencias.length === 1 ? '' : 's'} del archivo</summary>
        ${advertencias.map((a) => `<div class="al"><div class="tx">${escaparHtml(a.mensaje)}</div></div>`).join('')}
      </details>
    `
    : '';
  $('resultado-contenido').innerHTML = `
    <div class="al ok"><div class="tx">${escaparHtml(resumen)}</div></div>
    ${detalleAdvertencias}
    <div class="pie-fijo"><button class="btn" id="btn-volver-resultado">Cargar otro partido</button></div>
  `;
  $('btn-volver-resultado').addEventListener('click', mostrarInicio);
}
```

- [ ] **Step 4: Verificación manual — flujo completo**

Requiere que Task 5's migraciones ya estén aplicadas (`0004` + `0005`, vía `npx supabase db push` corrido por el usuario) y la cuenta de prueba con `miembro_club` para el club de `0004_seed_piloto.sql`.

Run: `npx serve .`, loguearse, cargar un `.xlsx` real de `tests/fixtures/`, elegir equipo/fecha/plantel, revisar los 4 grupos (con datos reales todos los jugadores van a caer en "Nuevos" la primera vez, porque `0004_seed_piloto.sql` no siembra jugadores), guardar.
Expected: Pantalla 3 muestra el resumen correcto, botón "Cargar otro partido" vuelve a Pantalla 1.

Repetir con el MISMO archivo: debe mostrar "Este partido ya fue importado" en Pantalla 2 (mismo chequeo que Task 9's Step 3, ahora con datos reales).

Repetir con OTRO archivo real que comparta algún jugador con el primero (por ejemplo, dos de los 3 fixtures U21M reales que comparten plantel de Newell's): ese jugador debe aparecer en "Ya cargados", no en "Nuevos".

- [ ] **Step 5: Commit**

```bash
git add src/ui/pantallaConfirmacion.js src/ui/pantallaResultado.js
git commit -m "feat: Pantalla 2 parte B (grupos de jugadores + guardar) and Pantalla 3"
```

---

## Task 11: Verificación manual de punta a punta contra criterios de aceptación

**Files:** ninguno nuevo — este task es una checklist de verificación, no código.

- [ ] **Step 1: Correr `npm test` una vez más, completo**

Run: `npm test`
Expected: PASS completo (parser + mapearImportacion + prepararPayloadImportacion), sin necesidad de conexión a ninguna base.

- [ ] **Step 2: Correr `tests/verificarRpc.js` contra el proyecto real**

Requiere `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, y el email/contraseña de la cuenta de prueba (nunca hardcodeados, pasados por variable de entorno en el momento):

```bash
SUPABASE_URL=https://lseqvbtdzebomxwtqhwu.supabase.co \
SUPABASE_PUBLISHABLE_KEY=sb_publishable_nuPVo5yqsAFzY1uf6qcWBA_quRRgUFF \
VERIFICAR_RPC_EMAIL=<email de la cuenta de prueba> \
VERIFICAR_RPC_PASSWORD=<contraseña de la cuenta de prueba> \
node tests/verificarRpc.js
```

Expected: `Verificación de rollback: PASS`.

- [ ] **Step 3: Chequear cada criterio de aceptación del prompt original, uno por uno**

- Las 3 migraciones existentes corrieron limpias — confirmado al inicio de esta sesión (Paso 0, antes de Task 1).
- El RPC transaccional existe y el rollback está probado — Step 2 de este task.
- La app abre sirviendo `public/` estático sin build step — `npx serve .` + `http://localhost:3000/public/`.
- Un `.xlsx` real se importa de punta a punta y aparece en las tablas de Supabase — verificar a mano en el Table Editor del dashboard después del Step 4 de Task 10 (`partido`, `estadistica_jugador_partido`, `jugador`, `pertenencia`, `importacion`).
- Importar el mismo archivo dos veces con nombres distintos es detectado como duplicado — probar: copiar un fixture con otro nombre de archivo, importarlo después del original, confirmar que igual se detecta (el hash es de los BYTES, no del nombre).
- Un jugador de otra categoría genera pertenencia nueva, no jugador nuevo — verificado en Task 10 Step 4, confirmar además con una consulta SQL directa (`select count(*) from jugador where nombre_clave = '...'` debe dar 1, no 2).
- Ningún jugador rival llega a la base — confirmar que `mapearImportacion` (ya testeado, Etapa 2A) es la única fuente de `estadisticas`/`jugadoresNuevos`, y que solo contiene `equipoPropio.jugadores`.
- `npm test` pasa completo — Step 1.
- Ninguna credencial privada en el repo — `git grep -i "password\|secret" -- . ':!node_modules'` no debe mostrar ningún valor real (solo nombres de variables/comentarios).
- La pantalla de confirmación es usable con una mano en 375px — probar en el navegador con las devtools en modo responsive, 375×667 (iPhone SE) — cada `.opt`/`.btn`/`.chk` debe tener al menos 44px de alto.

- [ ] **Step 4: Si algo de este checklist falla, no marcar el task como terminado** — volver al task correspondiente, corregir, y repetir la verificación de ese task antes de continuar acá.

---

## Final Acceptance Checklist

- [ ] Las 3 migraciones existentes (`0001`-`0003`) corrieron limpias contra `lseqvbtdzebomxwtqhwu` (Paso 0, corrido por el usuario antes de Task 1).
- [ ] `0004_seed_piloto.sql` y `0005_rpc_importar_partido.sql` corrieron limpias contra la misma base (después de Task 5, corrido por el usuario).
- [ ] `tests/verificarRpc.js` da `PASS` contra el proyecto real (Task 11).
- [ ] `npm test` pasa completo sin conexión a ninguna base.
- [ ] `npx serve .` + `http://localhost:3000/public/` funciona sin ningún paso de build.
- [ ] Un `.xlsx` real de `tests/fixtures/` se importa de punta a punta y las filas aparecen en Supabase.
- [ ] El mismo archivo con otro nombre es detectado como duplicado.
- [ ] Un jugador citado a otra categoría genera pertenencia nueva, nunca un jugador duplicado.
- [ ] Ningún jugador del bloque rival llega nunca a la base.
- [ ] Ninguna credencial privada en el repositorio.
- [ ] La pantalla de confirmación es usable con una mano a 375px de ancho.
- [ ] `src/parser/parserCabb.js` y las migraciones `0001`-`0003` quedaron sin tocar (`git diff` contra el inicio de esta etapa).
