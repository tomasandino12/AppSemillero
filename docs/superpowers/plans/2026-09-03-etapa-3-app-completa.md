# Etapa 3: Primera versión completa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sola aplicación web mobile-first y genuinamente responsive que reemplace al prototipo y a la pantalla suelta de import, con datos reales en PLANTEL y DATOS, y el flujo completo de un entrenador que arranca sin ningún jugador cargado.

**Architecture:** La cáscara del prototipo se reconstruye como ES modules con separación estricta de capas (`src/ui/` nunca importa Supabase, `src/data/` nunca toca el DOM). El CSS se reorganiza en 4 archivos con todos los breakpoints en `layout.css`. La lógica del import de la Etapa 2B se mueve de directorio pero su interior queda byte-idéntico: solo cambian su punto de entrada (botón en DATOS) y su retorno (vuelve a DATOS y refresca). El alta manual de jugador usa una RPC transaccional nueva.

**Tech Stack:** HTML/CSS/JS vanilla, ES modules nativos, sin build step, sin frameworks. Supabase (`@supabase/supabase-js` 2.112.4 vía esm.sh), `xlsx` 0.20.3 vía CDN de SheetJS, ambos por import map. `node:test`/`node:assert` para lo puro. `npx serve` para servir en dev.

**Spec:** `docs/superpowers/specs/2026-09-03-etapa-3-app-completa-design.md` — leerlo completo antes de este plan. También `PARSER.md` y `supabase/ESQUEMA.md`.

## Global Constraints

- Stack: HTML/CSS/JS vanilla, ES modules, sin build step, sin frameworks/bundlers. Ninguna dependencia nueva.
- **No modificar `src/parser/parserCabb.js`.**
- **No modificar las migraciones `0001`–`0006`.** Cambios de esquema en migraciones nuevas.
- **No modificar la lógica de import de la Etapa 2B** (parser, mapeo, payload, RPC `importar_partido`). Solo su punto de entrada y su retorno.
- **No borrar los archivos del prototipo en la raíz** (`index.html`, `js/app.js`, `css/app.css`, `css/tokens.css`) hasta que todos los criterios de aceptación pasen (Task 14).
- Áreas táctiles ≥44×44px en el layout base. `rem` para tipografía y espaciado. `100dvh`, nunca `100vh`. `hover` solo dentro de `@media (hover: hover)`. `env(safe-area-inset-bottom)` en la navegación inferior. `clamp()` para títulos.
- **Todos los breakpoints viven en `public/css/layout.css`.** Ningún otro archivo CSS tiene media queries de ancho.
- `grep -rl "@supabase/supabase-js" src/ui/` → vacío. `grep -rlE "document\.|window\." src/data/` → vacío.
- Toda RPC nueva: `security invoker` + script de verificación de rollback.
- `NULL` en talla/peso significa "no medido", nunca cero.
- No commitear credenciales privadas ni datos reales de jugadores.
- Breakpoints: base (hasta 639px), ≥640px (`40rem`), ≥1024px (`64rem`).

---

## Task 1: Migraciones nuevas (mediciones + RPC de alta manual) y script de rollback

**Files:**
- Create: `supabase/migrations/0007_mediciones_jugador.sql`
- Create: `supabase/migrations/0008_rpc_alta_jugador.sql`
- Create: `tests/verificarAltaJugador.js`

**Interfaces:**
- Produces: columnas `jugador.talla_cm` (integer, nullable), `jugador.peso_kg` (numeric(5,2), nullable), `jugador.fecha_medicion` (date, nullable). Función Postgres `alta_jugador_manual(payload jsonb) returns jsonb` → `{ jugadorId }`, que lanza `JUGADOR_YA_EXISTE` si el `nombre_clave` ya existe en el club.
- Consumidas por Task 2 (`repositorio.js`).

- [ ] **Step 1: Escribir `supabase/migrations/0007_mediciones_jugador.sql`**

```sql
-- Etapa 3: columnas de medición antropométrica en jugador.
--
-- NULL significa "no medido", nunca cero — mismo principio que rige todas
-- las estadísticas del proyecto (ver ESQUEMA.md y PARSER.md): un jugador que
-- no fue medido y un jugador que pesa cero no son lo mismo.
--
-- Los datos salen de estudios médicos de principio de año y se cargan
-- aparte. Esta etapa sólo define dónde viven y los muestra como "sin medir".
alter table jugador
  add column talla_cm integer,
  add column peso_kg numeric(5,2),
  add column fecha_medicion date;
```

- [ ] **Step 2: Escribir `supabase/migrations/0008_rpc_alta_jugador.sql`**

```sql
-- Etapa 3: alta manual de jugador, transaccional.
--
-- Regla del proyecto: cualquier operación que inserte más de una fila va en
-- una única transacción. Acá son dos (jugador + su pertenencia): si la
-- segunda falla, la primera no puede quedar. El entrenador está en el
-- gimnasio con wifi inestable y no puede arreglar una fila huérfana desde
-- el celular.
--
-- security invoker: sigue sujeta a las mismas políticas RLS que un insert
-- directo del cliente (ver 0002_rls.sql). Sin elevación de privilegios.
create or replace function alta_jugador_manual(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_jugador_id uuid;
begin
  begin
    insert into jugador (club_id, nombre_clave, nombre_limpio, desambiguador)
    values (
      (payload->>'clubId')::uuid,
      payload->>'nombreClave',
      payload->>'nombreLimpio',
      coalesce(payload->>'desambiguador', '')
    )
    returning id into v_jugador_id;
  exception when unique_violation then
    -- unique (club_id, nombre_clave, desambiguador) en 0001_esquema_inicial.sql.
    -- Se relanza con un código propio para que la UI ofrezca "sumarlo a esta
    -- categoría" en vez de mostrar un error de Postgres crudo.
    raise exception 'JUGADOR_YA_EXISTE' using errcode = 'P0001';
  end;

  insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
  values (
    (payload->>'clubId')::uuid,
    v_jugador_id,
    (payload->>'plantelId')::uuid,
    (payload->>'temporadaId')::uuid,
    (payload->>'desde')::date
  );

  return jsonb_build_object('jugadorId', v_jugador_id);
end;
$$;
```

- [ ] **Step 3: Revisión manual explícita (no hay Postgres local en este entorno)**

Confirmar leyendo, item por item, y escribir el resultado de cada uno en el reporte:
1. Cada columna de `0007` es nullable (sin `not null`, sin `default`) — `NULL` es el estado inicial de todo jugador existente.
2. Cada columna que inserta `0008` existe en `create table jugador` / `create table pertenencia` de `0001_esquema_inicial.sql` (cruzar campo por campo).
3. El bloque `begin/exception` cubre **solo** el insert de `jugador`; el insert de `pertenencia` queda sin capturar, así que cualquier fallo suyo (FK compuesta, `not null`, unicidad parcial) aborta toda la transacción — que es el comportamiento pedido.
4. `security invoker` está presente.
5. Ninguna migración anterior (`0001`–`0006`) aparece modificada en el diff.

- [ ] **Step 4: Escribir `tests/verificarAltaJugador.js`**

Script de verificación manual del rollback, en el mismo espíritu que `tests/verificarRpc.js`. **No forma parte de `npm test`** (necesita base y credenciales).

```js
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.VERIFICAR_RPC_EMAIL;
const password = process.env.VERIFICAR_RPC_PASSWORD;

if (!url || !publishableKey || !email || !password) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... VERIFICAR_RPC_EMAIL=... VERIFICAR_RPC_PASSWORD=... node tests/verificarAltaJugador.js');
  process.exit(1);
}

const supabase = createClient(url, publishableKey);

async function main() {
  const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errorLogin) { console.error('No se pudo iniciar sesión:', errorLogin.message); process.exit(1); }

  const { data: clubes, error: errorClubes } = await supabase.from('club').select('id');
  if (errorClubes || !clubes?.length) { console.error('No se encontró ningún club:', errorClubes?.message); process.exit(1); }
  const clubId = clubes[0].id;

  const { data: planteles, error: errorPlanteles } = await supabase.from('plantel').select('id, temporada_id').eq('club_id', clubId).limit(1);
  if (errorPlanteles || !planteles?.length) { console.error('No se encontró ningún plantel:', errorPlanteles?.message); process.exit(1); }
  const plantelId = planteles[0].id;

  const nombreClave = 'VERIFICAR ALTA ' + Date.now();

  // temporadaId inexistente a propósito: el insert de jugador va a andar y el
  // de pertenencia va a violar la FK compuesta (club_id, temporada_id).
  // Toda la transacción debe abortar y no dejar el jugador huérfano.
  const payloadRoto = {
    clubId,
    nombreClave,
    nombreLimpio: nombreClave,
    plantelId,
    temporadaId: '00000000-0000-0000-0000-000000000000',
    desde: '2026-01-01',
  };

  const { error: errorRpc } = await supabase.rpc('alta_jugador_manual', { payload: payloadRoto });
  if (!errorRpc) { console.error('FALLO: el RPC no tiró error con una temporada inexistente — el rollback no se está probando.'); process.exit(1); }
  console.log('OK: el RPC rechazó el payload roto:', errorRpc.message);

  const { data: huerfano, error: errorHuerfano } = await supabase
    .from('jugador').select('id').eq('club_id', clubId).eq('nombre_clave', nombreClave).maybeSingle();
  if (errorHuerfano) { console.error('No se pudo verificar si quedó un jugador huérfano:', errorHuerfano.message); process.exit(1); }
  if (huerfano) { console.error('FALLO: quedó un jugador sin pertenencia — el rollback no funcionó.'); process.exit(1); }
  console.log('OK: no quedó ningún jugador — el rollback fue completo.');

  console.log('\nVerificación de rollback del alta manual: PASS');
}

main();
```

- [ ] **Step 5: Confirmar que `npm test` no lo levanta**

Run: `npm test`
Expected: mismo conteo que antes de esta task (41 tests). El script nuevo no está en la lista explícita del script `test` de `package.json`, igual que `tests/verificarRpc.js` y `tests/inspect.js`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0007_mediciones_jugador.sql supabase/migrations/0008_rpc_alta_jugador.sql tests/verificarAltaJugador.js
git commit -m "feat: add medicion columns and transactional alta_jugador_manual RPC"
```

**No aplicar contra la base real todavía** — se aplica en un checkpoint con el usuario (`npx supabase db push`), igual que `0004`/`0005`/`0006`.

---

## Task 2: `repositorio.js` — funciones nuevas

**Files:**
- Modify: `src/data/repositorio.js` (agregar al final; no tocar nada existente)

**Interfaces:**
- Consumes: la función Postgres `alta_jugador_manual` de Task 1 y las columnas de medición de `0007`.
- Produces:
  - `obtenerJugadoresDelPlantel(clubId, plantelId)` → `[{ id, nombreClave, nombreLimpio, tallaCm, pesoKg, fechaMedicion }]`
  - `obtenerPartidosDelPlantel(clubId, plantelId)` → `[{ id, fecha, rivalNombre, puntosPropios, puntosRival, condicionPropia }]`
  - `obtenerPertenenciasDeJugador(clubId, jugadorId)` → `[{ plantelId, categoria, desde }]`
  - `altaJugadorManual({ clubId, nombreClave, nombreLimpio, plantelId, temporadaId, desde })` → `{ jugadorId }`

**`obtenerJugadoresDelClub` NO se toca**: de ella depende `mapearImportacion` en el flujo de import verificado de la Etapa 2B.

- [ ] **Step 1: Agregar las funciones al final de `src/data/repositorio.js`**

```js
/**
 * Jugadores con pertenencia VIGENTE (hasta is null) al plantel dado, con sus
 * columnas de medición (0007). Distinta de obtenerJugadoresDelClub, que es la
 * que consume el flujo de import y no se toca.
 */
export async function obtenerJugadoresDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('jugador')
    .select('id, nombre_clave, nombre_limpio, talla_cm, peso_kg, fecha_medicion, pertenencia!inner(plantel_id, hasta)')
    .eq('club_id', clubId)
    .eq('pertenencia.plantel_id', plantelId)
    .is('pertenencia.hasta', null);
  if (error) throw error;
  return data.map((fila) => ({
    id: fila.id,
    nombreClave: fila.nombre_clave,
    nombreLimpio: fila.nombre_limpio,
    tallaCm: fila.talla_cm,
    pesoKg: fila.peso_kg,
    fechaMedicion: fila.fecha_medicion,
  }));
}

export async function obtenerPartidosDelPlantel(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('partido')
    .select('id, fecha, rival_nombre, puntos_propios, puntos_rival, condicion_propia')
    .eq('club_id', clubId)
    .eq('plantel_id', plantelId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data.map((fila) => ({
    id: fila.id,
    fecha: fila.fecha,
    rivalNombre: fila.rival_nombre,
    puntosPropios: fila.puntos_propios,
    puntosRival: fila.puntos_rival,
    condicionPropia: fila.condicion_propia,
  }));
}

/** Pertenencias vigentes de un jugador, para mostrar en su ficha en qué categorías está. */
export async function obtenerPertenenciasDeJugador(clubId, jugadorId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('pertenencia')
    .select('plantel_id, desde, plantel(categoria)')
    .eq('club_id', clubId)
    .eq('jugador_id', jugadorId)
    .is('hasta', null);
  if (error) throw error;
  return data.map((fila) => ({
    plantelId: fila.plantel_id,
    categoria: fila.plantel?.categoria ?? null,
    desde: fila.desde,
  }));
}

/**
 * Alta manual: crea el jugador y su pertenencia en una sola transacción
 * (0008_rpc_alta_jugador.sql). Lanza un Error con message
 * 'JUGADOR_YA_EXISTE' si el nombreClave ya existe en el club.
 */
export async function altaJugadorManual({ clubId, nombreClave, nombreLimpio, plantelId, temporadaId, desde }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('alta_jugador_manual', {
    payload: { clubId, nombreClave, nombreLimpio, plantelId, temporadaId, desde },
  });
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Verificar que no rompió nada y que la capa sigue limpia**

Run: `npm test`
Expected: 41 tests, 0 fallando (este archivo no tiene tests automáticos — no hay base en el entorno de desarrollo — pero no debe afectar a los que sí corren).

Run: `grep -nE "document\.|window\." src/data/repositorio.js`
Expected: sin matches (la capa de datos no toca el DOM).

- [ ] **Step 3: Commit**

```bash
git add src/data/repositorio.js
git commit -m "feat: add plantel-scoped queries and altaJugadorManual to repositorio.js"
```

---

## Task 3: `tokens.css` y `base.css`

**Files:**
- Create: `public/css/tokens.css`
- Create: `public/css/base.css`

**Interfaces:**
- Produces: las variables CSS que consumen `layout.css` (Task 4) y `componentes.css` (Task 5). Nombres de la escala tipográfica (`--fs-100`…`--fs-300`) **idénticos a los del prototipo**, para que el CSS portado siga funcionando; los valores pasan de `px` a `rem`.

- [ ] **Step 1: Escribir `public/css/tokens.css`**

```css
/* =====================================================================
   TOKENS — única fuente de verdad de color, tipografía y espaciado.
   Destilado de css/tokens.css y css/app.css del prototipo (Etapa 3,
   Decisión 2): la identidad gráfica no se rediseña.
   Cambio respecto del prototipo: la escala tipográfica pasa de px a rem
   (los NOMBRES se conservan para que el CSS portado siga funcionando).
   ===================================================================== */
:root{
  /* ---- marca ---- */
  --rojo:#D9122E;
  --rojo-osc:#A00D22;
  --rojo-cl:#FFEBEE;

  /* ---- neutros ---- */
  --negro:#131316;
  --papel:#F3F1ED;
  --blanco:#fff;
  --linea:#DFDBD3;
  --tinta:#131316;
  --gris:#6E6B66;
  --gris-cl:#726E65;      /* 4.50:1 sobre --papel */
  --gris-osc:#A9A5A0;     /* sobre fondo oscuro */

  /* ---- superficies sobre fondo oscuro ---- */
  --sup-1:#22222A;
  --sup-2:#2C2C34;

  /* ---- semántico ---- */
  --sube:#15794F;
  --baja:#985E0C;
  --aviso:#7A4E00;        /* franja de "datos de ejemplo" */
  --aviso-fondo:#FFE9A8;  /* 8.4:1 con --aviso */

  /* ---- sombra / radio ---- */
  --sombra:0 1px 2px rgba(19,19,22,.05),0 6px 18px rgba(19,19,22,.05);
  --sombra-alta:0 2px 4px rgba(19,19,22,.10),0 10px 26px rgba(19,19,22,.14);
  --r:0.6875rem;

  /* ---- tipografías ---- */
  --ff-titulo:'Barlow Condensed',system-ui,sans-serif;
  --ff-cuerpo:'Inter',system-ui,sans-serif;
  --ff-mono:'IBM Plex Mono',ui-monospace,monospace;

  /* ---- escala tipográfica (mismos nombres que el prototipo, en rem) ---- */
  --fs-100:0.625rem;
  --fs-115:0.719rem;
  --fs-125:0.781rem;
  --fs-135:0.844rem;
  --fs-145:0.906rem;
  --fs-160:1rem;
  --fs-170:1.0625rem;
  --fs-190:1.1875rem;
  --fs-200:1.25rem;
  --fs-220:1.375rem;
  --fs-230:1.4375rem;
  --fs-250:1.5625rem;
  --fs-260:1.625rem;
  --fs-300:1.875rem;

  /* ---- títulos fluidos ---- */
  --fs-titulo:clamp(1.5rem,1.25rem + 1.2vw,2rem);
  --fs-titulo-chico:clamp(1.1875rem,1.05rem + .6vw,1.5rem);

  /* ---- espaciado ---- */
  --sp-1:0.25rem;
  --sp-2:0.5rem;
  --sp-3:0.75rem;
  --sp-4:1rem;
  --sp-5:1.25rem;
  --sp-6:1.5rem;
  --sp-8:2rem;

  /* ---- layout ---- */
  --tap:2.75rem;          /* 44px: mínimo táctil del layout base */
  --max-ancho:68.75rem;   /* 1100px de contenido legible en escritorio */
  --lateral-w:14rem;      /* navegación lateral a partir de 1024px */
}
```

- [ ] **Step 2: Escribir `public/css/base.css`**

```css
/* =====================================================================
   BASE — reset, tipografía y comportamiento de documento.
   Sin media queries: todos los breakpoints viven en layout.css.
   ===================================================================== */
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{-webkit-text-size-adjust:100%}
html,body{margin:0;padding:0}

body{
  background:var(--papel);
  font-family:var(--ff-cuerpo);
  color:var(--tinta);
  font-size:var(--fs-160);
  line-height:1.45;
  min-height:100dvh;
  overscroll-behavior-y:none;
}

button{font-family:inherit;font-size:inherit;border:0;background:none;cursor:pointer;color:inherit;padding:0;user-select:none}
input,select,textarea{font-family:inherit;font-size:inherit}
img,svg{max-width:100%}
ul,ol{margin:0;padding:0;list-style:none}

h1,h2,h3{font-family:var(--ff-titulo);font-weight:700;text-transform:uppercase;letter-spacing:.02em;line-height:1.05;margin:0}
h1{font-size:var(--fs-titulo)}
h2{font-size:var(--fs-titulo-chico)}

/* Título de sección, portado del prototipo */
.h2{font-family:var(--ff-titulo);font-size:var(--fs-titulo-chico);font-weight:700;text-transform:uppercase;letter-spacing:.02em;line-height:1;margin:var(--sp-4) 0 var(--sp-3)}
.p{font-size:var(--fs-135);color:var(--gris);line-height:1.45}

.eyebrow{
  font-family:var(--ff-titulo);font-size:var(--fs-125);font-weight:600;
  letter-spacing:.13em;text-transform:uppercase;color:var(--gris);
  display:flex;align-items:center;gap:var(--sp-2);margin:var(--sp-5) 0 var(--sp-2);
}
.eyebrow::before{content:"";width:.4375rem;height:.4375rem;background:var(--rojo);flex:0 0 auto}
.eyebrow .der{margin-left:auto;color:var(--rojo);letter-spacing:.05em}

.mono{font-family:var(--ff-mono)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

*:focus-visible{outline:2px solid var(--rojo);outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
```

- [ ] **Step 3: Verificar que no hay media queries de ancho**

Run: `grep -nE "@media[^{]*(min|max)-width" public/css/tokens.css public/css/base.css`
Expected: sin matches. (El `prefers-reduced-motion` de `base.css` no es de ancho — es correcto que esté ahí.)

Run: `grep -n "100vh" public/css/tokens.css public/css/base.css`
Expected: sin matches.

- [ ] **Step 4: Commit**

```bash
git add public/css/tokens.css public/css/base.css
git commit -m "feat: add rem-based design tokens and base stylesheet"
```

---

## Task 4: `layout.css` — grid, navegación y TODOS los breakpoints

**Files:**
- Create: `public/css/layout.css`

**Interfaces:**
- Consumes: tokens de Task 3 (`--tap`, `--max-ancho`, `--lateral-w`, `--sp-*`, colores).
- Produces: las clases estructurales que consume `index.html` (Task 6): `.app`, `.cabecera`, `.cats`, `.cuerpo`, `.pant`, `.pant.on`, `.pad`, `.nav`, `.pie-fijo`, `.velo`, `.hoja`, `.toast`. Las áreas de grid se llaman `cabecera`, `cats`, `cuerpo`, `nav`.

- [ ] **Step 1: Escribir `public/css/layout.css`**

```css
/* =====================================================================
   LAYOUT — estructura, navegación y EL ÚNICO lugar del proyecto con
   media queries de ancho (Etapa 3, Decisión 3).
   Mobile-first literal: lo de abajo es el celular; los tamaños grandes
   se agregan con min-width, nunca al revés.
   ===================================================================== */

.app{
  min-height:100dvh;
  display:grid;
  grid-template-rows:auto auto minmax(0,1fr) auto;
  grid-template-areas:"cabecera" "cats" "cuerpo" "nav";
}

/* ---- cabecera ---- */
.cabecera{
  grid-area:cabecera;
  background:var(--negro);color:#fff;
  padding:calc(var(--sp-3) + env(safe-area-inset-top)) var(--sp-4) var(--sp-2);
  display:flex;align-items:center;gap:var(--sp-3);
}
.cabecera .escudo{
  width:1.75rem;height:2rem;flex:0 0 auto;background:var(--rojo);
  clip-path:polygon(0 0,100% 0,100% 62%,50% 100%,0 62%);
  display:flex;align-items:center;justify-content:center;
  font-family:var(--ff-titulo);font-weight:700;font-size:var(--fs-115);padding-bottom:.375rem;
}
.cabecera h1{font-size:var(--fs-190)}
.cabecera .sub{
  font-size:var(--fs-100);color:var(--gris-osc);letter-spacing:.07em;
  text-transform:uppercase;margin-top:.1875rem;font-weight:500;
}
.cabecera .atras{
  font-family:var(--ff-titulo);font-size:var(--fs-230);font-weight:600;color:#fff;
  min-width:var(--tap);min-height:var(--tap);display:flex;align-items:center;
  margin-left:calc(var(--sp-2) * -1);
}

/* ---- barra de categorías ---- */
.cats{
  grid-area:cats;
  background:var(--negro);padding:0 var(--sp-3) var(--sp-3);
  display:flex;gap:var(--sp-2);overflow-x:auto;
  border-bottom:3px solid var(--rojo);
  scrollbar-width:none;
}
.cats::-webkit-scrollbar{display:none}
.cats:empty{display:none}
.cat{
  flex:0 0 auto;background:var(--sup-1);border-radius:.5625rem;
  padding:var(--sp-2) var(--sp-3);min-height:var(--tap);
  display:flex;align-items:center;
}
.cat.on{background:var(--rojo)}
.cat .sig{font-family:var(--ff-titulo);font-weight:700;font-size:var(--fs-145);color:#fff;line-height:1}
.cat .mini{
  font-family:var(--ff-titulo);font-size:var(--fs-100);color:var(--gris-osc);
  letter-spacing:.05em;text-transform:uppercase;margin-top:.125rem;font-weight:600;
}
.cat.on .mini{color:var(--rojo-cl)}

/* ---- cuerpo y pantallas ---- */
.cuerpo{
  grid-area:cuerpo;min-height:0;overflow-y:auto;
  overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
}
.pant{display:none}
.pant.on{display:block;padding-bottom:var(--sp-5)}
.pad{padding:var(--sp-4)}

/* Franja inferior pegajosa para la acción principal de una pantalla.
   Una sola por pantalla: ver la invariante de navegación del spec. */
.pie-fijo{
  position:sticky;bottom:0;z-index:2;
  background:linear-gradient(transparent,var(--papel) 22%);
  padding:var(--sp-4) var(--sp-4) var(--sp-3);
  display:flex;flex-direction:column;gap:var(--sp-2);
}

/* ---- navegación ---- */
.nav{
  grid-area:nav;
  display:flex;background:var(--negro);border-top:3px solid var(--rojo);
  padding-bottom:env(safe-area-inset-bottom);user-select:none;
}
.nav:empty{display:none}
.nav button{
  flex:1;min-height:var(--tap);
  padding:var(--sp-2) 0 var(--sp-3);
  display:flex;flex-direction:column;align-items:center;gap:.1875rem;
  color:#817D77;
}
.nav button.on{color:#fff}
.nav button.on svg{stroke:var(--rojo)}
.nav svg{width:1.125rem;height:1.125rem;stroke:#817D77;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.nav span{
  font-family:var(--ff-titulo);font-size:var(--fs-100);letter-spacing:.06em;
  text-transform:uppercase;font-weight:600;
}

/* ---- velo, hoja y toast ---- */
.velo{
  position:fixed;inset:0;background:rgba(19,19,22,.5);
  opacity:0;pointer-events:none;transition:opacity .2s;z-index:40;
}
.velo.on{opacity:1;pointer-events:auto}
.hoja{
  position:fixed;left:0;right:0;bottom:0;z-index:50;
  background:var(--papel);border-radius:1rem 1rem 0 0;
  transform:translateY(103%);transition:transform .25s cubic-bezier(.3,.9,.3,1);
  max-height:88dvh;overflow-y:auto;
  padding-bottom:calc(var(--sp-4) + env(safe-area-inset-bottom));
}
.hoja.on{transform:translateY(0)}
.hoja:not(.on){visibility:hidden}
.hoja .asa{width:2.375rem;height:.25rem;background:var(--linea);border-radius:.1875rem;margin:var(--sp-2) auto var(--sp-1)}
.hoja h2{margin:var(--sp-2) var(--sp-4)}
.toast{
  position:fixed;left:var(--sp-4);right:var(--sp-4);
  bottom:calc(var(--sp-5) + env(safe-area-inset-bottom));
  background:var(--negro);color:#fff;padding:var(--sp-3) var(--sp-4);
  border-radius:var(--r);font-size:var(--fs-135);z-index:60;
  transform:translateY(150%);transition:transform 150ms ease;
}
.toast.on{transform:translateY(0);transition:transform 250ms ease}
.toast:not(.on){visibility:hidden}

/* =====================================================================
   ≥640px — más aire y listas en dos columnas donde tenga sentido.
   La navegación sigue abajo.
   ===================================================================== */
@media (min-width:40rem){
  .pad{padding:var(--sp-5) var(--sp-6)}
  .lista-2col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-3)}
  .lista-2col > *{margin-bottom:0}
  .pie-fijo{padding-inline:var(--sp-6)}
}

/* =====================================================================
   ≥1024px — la navegación pasa a lateral fija, el contenido toma un
   ancho máximo legible y se centra. No es un celular estirado.
   ===================================================================== */
@media (min-width:64rem){
  .app{
    grid-template-columns:var(--lateral-w) minmax(0,1fr);
    grid-template-rows:auto auto minmax(0,1fr);
    grid-template-areas:
      "nav cabecera"
      "nav cats"
      "nav cuerpo";
  }
  .nav{
    flex-direction:column;justify-content:flex-start;gap:var(--sp-1);
    border-top:0;border-right:3px solid var(--rojo);
    padding:var(--sp-4) var(--sp-2);
  }
  .nav button{
    flex:0 0 auto;flex-direction:row;justify-content:flex-start;gap:var(--sp-3);
    padding:var(--sp-3);border-radius:var(--r);min-height:2.5rem;
  }
  .nav button.on{background:var(--sup-1)}
  .nav svg{width:1.25rem;height:1.25rem}
  .nav span{font-size:var(--fs-135);letter-spacing:.08em}
  .cabecera{padding-top:var(--sp-4)}
  .cuerpo > .pant.on,.cabecera > *,.cats{margin-inline:auto;width:100%;max-width:var(--max-ancho)}
  .cabecera{justify-content:flex-start}
  .pie-fijo{
    position:static;background:none;padding-inline:0;
    max-width:var(--max-ancho);margin-inline:auto;
    flex-direction:row;justify-content:flex-end;
  }
  .pie-fijo .btn{width:auto;min-width:14rem}
  .hoja{
    left:50%;right:auto;bottom:auto;top:50%;
    transform:translate(-50%,-50%) scale(.96);
    width:min(32rem,calc(100vw - 4rem));
    border-radius:var(--r);max-height:80dvh;
  }
  .hoja.on{transform:translate(-50%,-50%) scale(1)}
  .toast{left:auto;right:var(--sp-6);bottom:var(--sp-6);max-width:24rem}
}

/* Hover solo donde hay puntero fino: en táctil no debe ser señal de nada. */
@media (hover:hover){
  .nav button:hover{color:#fff}
  .cat:hover{background:var(--sup-2)}
  .cat.on:hover{background:var(--rojo-osc)}
}
```

- [ ] **Step 2: Verificar las reglas técnicas**

Run: `grep -c "@media" public/css/layout.css`
Expected: 4 (dos breakpoints de ancho, uno de `hover`, y ninguno más).

Run: `grep -n "100vh" public/css/layout.css`
Expected: sin matches (`100dvh` y `88dvh`/`80dvh` sí; `100vw` en el ancho de la hoja es correcto y no es lo prohibido).

Run: `grep -nE "@media[^{]*(min|max)-width" public/css/*.css`
Expected: **solo** líneas de `layout.css`.

- [ ] **Step 3: Commit**

```bash
git add public/css/layout.css
git commit -m "feat: add responsive layout with bottom nav to sidebar at 1024px"
```

---

## Task 5: `componentes.css` — absorbe `import.css` y agrega los componentes nuevos

**Files:**
- Create: `public/css/componentes.css`
- Delete: `public/css/import.css`

**Interfaces:**
- Consumes: tokens de Task 3.
- Produces: **todos** los nombres de clase que hoy define `public/css/import.css`, sin renombrar ninguno, porque `confirmacionImport.js` (Task 8) genera markup con ellos y su lógica no se toca: `.btn` (`.sec`, `:disabled`), `.campo`, `.tarj`, `.marcador` (`.lado`, `.n`, `.nom`, `.vs`), `.opt` (`.on`, `.t`, `.d`), `.equipos`, `.al` (`.ok`, `.tx`), `.grupo` (`.abierto`, `.grupo-h`, `.grupo-cuerpo`), `.jug-fila` (`.nom`, `.det`, `.chk`, `.chk.on`), `.jug-sugerencia` (`.decision`). Más los nuevos: `.banner-ejemplo`, `.estado-vacio`, `.jug`, `.av`, `.chip`, `.flecha`, `.test-fila`, `.rec`, `.tag`, `.dato`, `svg.g`, `.leyenda`.

- [ ] **Step 1: Escribir `public/css/componentes.css`**

```css
/* =====================================================================
   COMPONENTES — absorbe public/css/import.css (Etapa 2B) conservando
   exactamente sus nombres de clase, porque confirmacionImport.js genera
   markup con ellos y su lógica no se toca (Etapa 3, Decisión 2).
   Sin media queries de ancho: viven todas en layout.css.
   ===================================================================== */

/* ---- botones ---- */
.btn{
  display:flex;align-items:center;justify-content:center;gap:var(--sp-2);
  width:100%;min-height:var(--tap);
  background:var(--rojo);color:#fff;padding:var(--sp-4);
  border-radius:var(--r);font-family:var(--ff-titulo);font-size:var(--fs-190);
  font-weight:600;letter-spacing:.1em;text-transform:uppercase;
  transition:transform 120ms ease-out,background 120ms ease-out;
}
.btn:active{background:var(--rojo-osc);transform:scale(.97)}
.btn:disabled{background:#C9C5BE;color:#fff;transform:none}
.btn.sec{background:transparent;color:var(--tinta);border:1.5px solid var(--negro);font-size:var(--fs-145)}
.btn.osc{background:var(--negro)}
@media (hover:hover){
  .btn:not(:disabled):hover{background:var(--rojo-osc)}
  .btn.sec:not(:disabled):hover{background:rgba(19,19,22,.06)}
}

/* ---- campos ---- */
.campo{margin-bottom:var(--sp-4)}
.campo label{
  font-family:var(--ff-titulo);font-size:var(--fs-115);letter-spacing:.11em;
  text-transform:uppercase;color:var(--gris);font-weight:500;
  display:block;margin-bottom:var(--sp-2);
}
.campo input{
  width:100%;min-height:var(--tap);padding:var(--sp-3);
  border-radius:.5625rem;border:1px solid var(--linea);
  font-size:var(--fs-160);font-family:var(--ff-mono);background:#fff;
}
.campo .ayuda{font-size:var(--fs-115);color:var(--gris);margin-top:var(--sp-1)}

/* ---- tarjetas ---- */
.tarj{background:var(--blanco);border-radius:var(--r);padding:var(--sp-4);margin-bottom:var(--sp-3);box-shadow:var(--sombra)}
.tarj-h{display:flex;align-items:baseline;gap:var(--sp-2)}
.tarj-h .t{font-family:var(--ff-titulo);font-size:var(--fs-160);font-weight:600;letter-spacing:.03em;text-transform:uppercase}
.tarj-h .n{margin-left:auto;font-family:var(--ff-mono);font-size:var(--fs-190);font-weight:600}
.tarj-h .n small{font-size:var(--fs-115);color:var(--gris)}

/* ---- marcador (resultado de un partido) ---- */
.marcador{display:flex;align-items:baseline;justify-content:space-between;gap:var(--sp-3)}
.marcador .lado{flex:1;text-align:center}
.marcador .n{font-family:var(--ff-mono);font-size:var(--fs-260);font-weight:600}
.marcador .nom{font-size:var(--fs-115);color:var(--gris);text-transform:uppercase;letter-spacing:.05em;margin-top:.125rem}
.marcador .vs{font-family:var(--ff-titulo);font-size:var(--fs-135);color:var(--gris-cl);padding:0 var(--sp-2)}

/* ---- opciones seleccionables (elegir equipo, elegir plantel) ---- */
.opt{
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--sp-1);
  background:var(--blanco);padding:var(--sp-4) var(--sp-3);border-radius:var(--r);
  width:100%;text-align:center;box-shadow:var(--sombra);
  border:2px solid transparent;min-height:4rem;transition:transform 120ms ease-out;
}
.opt:active{transform:scale(.97)}
.opt.on{border-color:var(--rojo);background:var(--rojo-cl)}
.opt .t{font-weight:600;font-size:var(--fs-145);line-height:1.2}
.opt .d{font-size:var(--fs-115);color:var(--gris);margin-top:.125rem}
.equipos{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3)}

/* ---- avisos ---- */
.al{
  background:var(--blanco);border-left:3px solid var(--rojo);
  border-radius:0 var(--r) var(--r) 0;padding:var(--sp-3);
  margin-bottom:var(--sp-3);display:flex;gap:var(--sp-3);box-shadow:var(--sombra-alta);
}
.al .ico{font-family:var(--ff-titulo);font-weight:700;font-size:var(--fs-145);color:var(--rojo)}
.al .tx{font-size:var(--fs-135);line-height:1.4}
.al .mt{font-size:var(--fs-115);color:var(--gris);margin-top:.125rem}
.al.ok{border-left-color:var(--sube)}
.al.ok .ico{color:var(--sube)}

/* ---- franja de datos de ejemplo (Etapa 3, Decisión 7) ----
   Alto contraste y ancho completo: tiene que ser imposible confundirla
   con una alerta del negocio y verse sin scrollear. */
.banner-ejemplo{
  display:flex;align-items:center;gap:var(--sp-2);
  background:var(--aviso-fondo);color:var(--aviso);
  border-bottom:2px solid var(--aviso);
  padding:var(--sp-3) var(--sp-4);
  font-family:var(--ff-titulo);font-size:var(--fs-135);font-weight:600;
  letter-spacing:.04em;text-transform:uppercase;
}
.banner-ejemplo .ico{font-size:var(--fs-160)}

/* ---- estado vacío ---- */
.estado-vacio{
  background:var(--blanco);border-radius:var(--r);box-shadow:var(--sombra);
  padding:var(--sp-6) var(--sp-4);text-align:center;margin-bottom:var(--sp-3);
}
.estado-vacio h2{margin-bottom:var(--sp-2)}
.estado-vacio .p{margin:0 auto var(--sp-5);max-width:26rem}
.estado-vacio .acciones{display:flex;flex-direction:column;gap:var(--sp-2)}

/* ---- grupos colapsables (revisión de jugadores del import) ---- */
.grupo{margin-bottom:var(--sp-1)}
.grupo-h{
  display:flex;align-items:center;justify-content:space-between;
  padding:var(--sp-3) 0;min-height:var(--tap);width:100%;cursor:pointer;
}
.grupo-h .t{font-family:var(--ff-titulo);font-size:var(--fs-145);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.grupo-h .n{font-family:var(--ff-mono);font-size:var(--fs-125);color:var(--gris)}
.grupo-cuerpo{display:none}
.grupo.abierto .grupo-cuerpo{display:block}

/* ---- filas de jugador ---- */
.jug-fila{
  display:flex;align-items:center;gap:var(--sp-3);background:var(--blanco);
  padding:var(--sp-3);border-radius:var(--r);margin-bottom:var(--sp-2);box-shadow:var(--sombra);
}
.jug-fila .nom{font-weight:600;font-size:var(--fs-145);flex:1}
.jug-fila .det{font-size:var(--fs-115);color:var(--gris);margin-top:.125rem}
.jug-fila .chk{
  min-width:var(--tap);min-height:var(--tap);flex:0 0 auto;
  border-radius:.375rem;border:2px solid var(--linea);
  display:flex;align-items:center;justify-content:center;
}
.jug-fila .chk.on{background:var(--rojo);border-color:var(--rojo);color:#fff;font-weight:700}

.jug-sugerencia{background:var(--blanco);border-radius:var(--r);padding:var(--sp-3);margin-bottom:var(--sp-2);box-shadow:var(--sombra)}
.jug-sugerencia .decision{display:flex;gap:var(--sp-2);margin-top:var(--sp-2)}
.jug-sugerencia .decision button{
  flex:1;min-height:var(--tap);padding:var(--sp-2) 0;border-radius:.5rem;background:#EFECE6;
  font-family:var(--ff-titulo);font-size:var(--fs-135);font-weight:600;text-transform:uppercase;
}
.jug-sugerencia .decision button.on{background:var(--negro);color:#fff}

/* ---- fila de jugador clicable (PLANTEL) ---- */
.jug{
  display:flex;align-items:center;gap:var(--sp-3);background:var(--blanco);
  padding:var(--sp-3);border-radius:var(--r);margin-bottom:var(--sp-2);
  box-shadow:var(--sombra);width:100%;text-align:left;min-height:var(--tap);
  transition:transform 120ms ease-out;
}
.jug:active{transform:scale(.985)}
.jug .nom{font-weight:600;font-size:var(--fs-145);line-height:1.15}
.jug .det{font-size:var(--fs-115);color:var(--gris);margin-top:.125rem;font-family:var(--ff-mono)}
.jug .der{margin-left:auto;display:flex;align-items:center;gap:var(--sp-2)}
.av{
  width:2.125rem;height:2.125rem;flex:0 0 auto;border-radius:50%;
  background:var(--negro);color:#fff;display:flex;align-items:center;justify-content:center;
  font-family:var(--ff-mono);font-weight:600;font-size:var(--fs-125);
}
.chip{
  font-family:var(--ff-mono);font-size:var(--fs-115);font-weight:600;
  padding:.1875rem .375rem;border-radius:.3125rem;background:#EFECE6;color:var(--gris);white-space:nowrap;
}
.chip.sube{background:#E1F0E9;color:var(--sube)}
.chip.baja{background:#F6ECD9;color:var(--baja)}
.chip.sin{background:#EFECE6;color:var(--gris-cl);font-style:italic}
.flecha{color:var(--gris-cl);font-size:var(--fs-170);line-height:1}

/* ---- datos de la ficha ---- */
.datos-ficha{display:flex;gap:var(--sp-2);flex-wrap:wrap;margin-top:var(--sp-3)}
.dato{flex:1 1 7rem;background:var(--sup-1);border-radius:.5625rem;padding:var(--sp-2) var(--sp-3)}
.dato .k{
  font-family:var(--ff-titulo);font-size:var(--fs-100);letter-spacing:.11em;
  text-transform:uppercase;color:var(--gris-osc);font-weight:400;
}
.dato .v{font-family:var(--ff-mono);font-size:var(--fs-160);font-weight:600;margin-top:.125rem;color:#fff}
.dato .v.sin{color:var(--gris-osc);font-style:italic;font-size:var(--fs-135)}
.ficha-top{background:var(--negro);color:#fff;padding:var(--sp-4)}
.ficha-top .nom{font-family:var(--ff-titulo);font-size:var(--fs-titulo);font-weight:700;line-height:1;text-transform:uppercase}
.ficha-top .sub{font-size:var(--fs-115);color:var(--gris-osc);margin-top:var(--sp-2);font-family:var(--ff-mono)}

/* ---- filas de test y recursos (pantallas de ejemplo) ---- */
.test-fila{
  display:flex;align-items:center;gap:var(--sp-3);background:var(--blanco);
  padding:var(--sp-3);border-radius:var(--r);margin-bottom:var(--sp-2);
  box-shadow:var(--sombra);width:100%;text-align:left;min-height:var(--tap);
}
.test-fila .ic{
  width:1.875rem;height:1.875rem;border-radius:.5rem;background:#EFECE6;
  display:flex;align-items:center;justify-content:center;flex:0 0 auto;
  font-family:var(--ff-titulo);font-weight:700;font-size:var(--fs-125);color:var(--gris);
}
.test-fila.hecho .ic{background:var(--sube);color:#fff}
.test-fila .t{font-weight:600;font-size:var(--fs-145)}
.test-fila .d{font-size:var(--fs-115);color:var(--gris);margin-top:.125rem;font-family:var(--ff-mono)}
.rec{background:var(--blanco);border-radius:var(--r);padding:var(--sp-4);margin-bottom:var(--sp-2);box-shadow:var(--sombra)}
.rec .t{font-weight:600;font-size:var(--fs-145)}
.rec .d{font-size:var(--fs-125);color:var(--gris);margin-top:.1875rem;line-height:1.4}
.rec .m{display:flex;gap:var(--sp-2);margin-top:var(--sp-2);flex-wrap:wrap}
.tag{font-family:var(--ff-mono);font-size:var(--fs-100);color:var(--gris);background:#EFECE6;padding:.1875rem .4375rem;border-radius:.3125rem}
.tag.rojo{background:#FBE4E8;color:var(--rojo-osc)}

/* ---- gráficos portados del prototipo ---- */
svg.g{width:100%;display:block;overflow:visible}
.leyenda{
  display:flex;gap:var(--sp-4);font-size:var(--fs-115);font-weight:400;color:var(--gris);
  margin-top:var(--sp-2);font-family:var(--ff-mono);flex-wrap:wrap;
}
.leyenda i{display:inline-block;width:.875rem;height:.15625rem;background:var(--rojo);vertical-align:middle;margin-right:.3125rem}
.leyenda i.pt{background:none;border-top:.15625rem dashed var(--gris-cl)}

/* Feedback de presión (auditoría de accesibilidad del prototipo, punto 8) */
.al,.opt,.test-fila,.jug,.btn{transition:transform 120ms ease-out}
.al:active,.opt:active,.test-fila:active{transform:scale(.97)}
```

- [ ] **Step 2: Borrar `public/css/import.css`**

```bash
git rm public/css/import.css
```

- [ ] **Step 3: Verificar que no se perdió ninguna clase que use el import**

Run:
```bash
for c in btn campo tarj marcador opt equipos al grupo grupo-h grupo-cuerpo jug-fila chk jug-sugerencia decision; do
  grep -q "\.$c" public/css/componentes.css && echo "OK $c" || echo "FALTA $c";
done
```
Expected: `OK` en las 14. (`.pie-fijo` y `.toast` viven en `layout.css`, es correcto que no estén acá.)

Run: `grep -nE "@media[^{]*(min|max)-width" public/css/componentes.css`
Expected: sin matches (el `@media (hover:hover)` sí está y es correcto).

- [ ] **Step 4: Commit**

```bash
git add public/css/componentes.css
git commit -m "feat: consolidate component styles, absorbing import.css"
```

---

## Task 6: `public/index.html` — único punto de entrada

**Files:**
- Modify: `public/index.html` (reemplazo completo del contenido de la Etapa 2B)

**Interfaces:**
- Consumes: los 4 CSS de Tasks 3-5.
- Produces: los ids que consumen el router y las pantallas: `cabecera`, `cats`, `cuerpo`, `nav`, `velo`, `hoja`, `toast`, `toast-tx`; y los contenedores de pantalla `p-login` (con `in-email`, `in-pass`, `login-error`, `btn-login`), `p-plantel` (`plantel-contenido`), `p-ficha` (`ficha-contenido`), `p-datos` (`datos-contenido`), `p-hoy` (`hoy-contenido`), `p-medir` (`medir-contenido`), `p-recursos` (`recursos-contenido`), `p-confirmacion` (`confirmacion-contenido`), `p-resultado` (`resultado-contenido`).

**Los ids `confirmacion-contenido` y `resultado-contenido` son obligatorios y no se pueden renombrar**: los usa la lógica del import de la Etapa 2B, que no se toca.

- [ ] **Step 1: Reemplazar `public/index.html` por completo**

```html
<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#131316">
<title>Inferiores · Seguimiento de jugadores</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/public/css/tokens.css">
<link rel="stylesheet" href="/public/css/base.css">
<link rel="stylesheet" href="/public/css/layout.css">
<link rel="stylesheet" href="/public/css/componentes.css">
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
<div class="app" id="app">

  <header class="cabecera" id="cabecera"></header>
  <div class="cats" id="cats"></div>

  <main class="cuerpo" id="cuerpo">

    <section class="pant" id="p-login">
      <div class="pad">
        <h2 class="h2">Ingresar</h2>
        <div class="campo"><label for="in-email">Email</label><input id="in-email" type="email" autocomplete="username" inputmode="email"></div>
        <div class="campo"><label for="in-pass">Contraseña</label><input id="in-pass" type="password" autocomplete="current-password"></div>
        <div class="al" id="login-error" style="display:none"><div class="tx"></div></div>
        <button class="btn" id="btn-login">Ingresar</button>
      </div>
    </section>

    <section class="pant" id="p-plantel"><div id="plantel-contenido"></div></section>
    <section class="pant" id="p-ficha"><div id="ficha-contenido"></div></section>
    <section class="pant" id="p-datos"><div id="datos-contenido"></div></section>
    <section class="pant" id="p-hoy"><div id="hoy-contenido"></div></section>
    <section class="pant" id="p-medir"><div id="medir-contenido"></div></section>
    <section class="pant" id="p-recursos"><div id="recursos-contenido"></div></section>

    <!-- Pantallas del flujo de import de la Etapa 2B. Los ids de contenido
         los usa su lógica, que no se toca. -->
    <section class="pant" id="p-confirmacion"><div class="pad" id="confirmacion-contenido"></div></section>
    <section class="pant" id="p-resultado"><div class="pad" id="resultado-contenido"></div></section>

  </main>

  <nav class="nav" id="nav" aria-label="Navegación principal"></nav>
</div>

<div class="velo" id="velo"></div>
<div class="hoja" id="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo"></div>
<div class="toast" id="toast" role="status" aria-live="polite"><span id="toast-tx"></span></div>

<input type="file" id="input-archivo" accept=".xlsx" class="sr" tabindex="-1" aria-hidden="true">

<script type="module" src="/src/ui/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verificar que sirve y que están todos los ids**

Run: `npx serve . -l 4180` en background, después:
```bash
curl -s -L http://localhost:4180/public/ -o /tmp/idx.html
for id in cabecera cats cuerpo nav velo hoja toast toast-tx p-login p-plantel p-ficha p-datos p-hoy p-medir p-recursos p-confirmacion p-resultado plantel-contenido ficha-contenido datos-contenido confirmacion-contenido resultado-contenido input-archivo; do
  grep -q "id=\"$id\"" /tmp/idx.html && echo "OK $id" || echo "FALTA $id";
done
curl -s -o /dev/null -w "%{http_code} " http://localhost:4180/public/css/tokens.css
curl -s -o /dev/null -w "%{http_code} " http://localhost:4180/public/css/base.css
curl -s -o /dev/null -w "%{http_code} " http://localhost:4180/public/css/layout.css
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4180/public/css/componentes.css
```
Expected: `OK` en los 23 ids, y `200 200 200 200` para los 4 CSS. Frenar el server al terminar.

No hay herramienta de automatización de navegador en este entorno: **no** se puede verificar el aspecto visual ni la interacción. Decirlo explícitamente en el reporte.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: rebuild index.html as the single responsive entry point"
```

---

## Task 7: `main.js` (bootstrap + router), `chrome.js`, `sesion.js`, `pantallas/login.js`

**Files:**
- Modify: `src/ui/main.js` (reemplazo completo)
- Modify: `src/ui/sesion.js` (agregar planteles y plantel activo; **conservar** `setClubActual`/`obtenerClubActual`)
- Create: `src/ui/chrome.js`
- Create: `src/ui/pantallas/login.js` (movido desde `src/ui/auth.js`)
- Delete: `src/ui/auth.js`

**Interfaces:**
- Consumes: `obtenerSesionActual`, `iniciarSesion`, `obtenerClubesDelEntrenador`, `obtenerPlantelesDelClub` de `repositorio.js`; `mostrarPantalla`, `toast`, `esErrorDeRed` de `nav.js`.
- Produces:
  - `main.js`: `registrarPantalla(id, def)` donde `def = { titulo, tab?, render? }`; `ir(id, { push = false })`; `volver()`; `pantallaActualId()`; `sincronizarChrome()`.
  - `sesion.js`: `setClubActual(club)`, `obtenerClubActual()`, `setPlanteles(ps)`, `obtenerPlanteles()`, `setPlantelActivoId(id)`, `obtenerPlantelActivo()`, `limpiarSesion()`.
  - `chrome.js`: `renderChrome()`.
  - `login.js`: `iniciarLogin(alIniciarSesion)`, `mostrarLogin()`.

**`pantallaActualId()` se deriva del DOM** (`.pant.on`), no de una variable cacheada: así cualquier llamada directa a `mostrarPantalla` desde la lógica del import (que no se toca) mantiene al router consistente. La pila sólo registra navegaciones con `push`.

- [ ] **Step 1: Reescribir `src/ui/sesion.js`**

```js
// Estado de sesión de la UI. Los nombres setClubActual/obtenerClubActual se
// conservan porque los usa la lógica del import de la Etapa 2B, que no se toca.
let clubActual = null;
let planteles = [];
let plantelActivoId = null;

export function setClubActual(club) {
  clubActual = club;
}

export function obtenerClubActual() {
  return clubActual;
}

export function setPlanteles(lista) {
  planteles = lista;
  if (!plantelActivoId || !lista.some((p) => p.id === plantelActivoId)) {
    plantelActivoId = lista.length ? lista[0].id : null;
  }
}

export function obtenerPlanteles() {
  return planteles;
}

export function setPlantelActivoId(id) {
  plantelActivoId = id;
}

export function obtenerPlantelActivo() {
  return planteles.find((p) => p.id === plantelActivoId) ?? null;
}

export function limpiarSesion() {
  clubActual = null;
  planteles = [];
  plantelActivoId = null;
}
```

- [ ] **Step 2: Escribir `src/ui/chrome.js`**

```js
import { obtenerClubActual, obtenerPlanteles, obtenerPlantelActivo, setPlantelActivoId } from './sesion.js';
import { escaparHtml } from './nav.js';

const $ = (id) => document.getElementById(id);

const ICONOS = {
  hoy: '<path d="M4 13h5v7H4zM10 8h5v12h-5zM16 4h4v16h-4z"/>',
  plantel: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 8.5a3 3 0 100-5"/><path d="M17.5 14.5c2 .7 3.5 2.6 3.5 5.5"/>',
  medir: '<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="18" cy="17" r="2.5"/>',
  recursos: '<path d="M4 5h16v14H4z"/><path d="M10 9l5 3-5 3z"/>',
  datos: '<path d="M3 17l5-6 4 4 4-7 5 5"/><path d="M3 21h18"/>',
};

// Orden de la navegación. PLANTEL primero después de HOY, igual que el
// prototipo; el landing por defecto es PLANTEL (ver main.js).
export const TABS = [
  { id: 'p-hoy', texto: 'Hoy', icono: ICONOS.hoy },
  { id: 'p-plantel', texto: 'Plantel', icono: ICONOS.plantel },
  { id: 'p-medir', texto: 'Medir', icono: ICONOS.medir },
  { id: 'p-recursos', texto: 'Recursos', icono: ICONOS.recursos },
  { id: 'p-datos', texto: 'Datos', icono: ICONOS.datos },
];

let alTocarTab = () => {};
let alElegirPlantel = () => {};
let alVolver = () => {};

export function iniciarChrome({ onTab, onPlantel, onVolver }) {
  alTocarTab = onTab;
  alElegirPlantel = onPlantel;
  alVolver = onVolver;
}

/**
 * Dibuja cabecera, selector de categoría y navegación.
 * El botón de volver vive SOLO acá, en el chrome — el router nunca inyecta
 * botones de volver dentro del contenido de una pantalla (invariante de
 * navegación del spec, Decisión 8).
 */
export function renderChrome({ pantallaId, titulo, mostrarAtras, autenticado }) {
  const cabecera = $('cabecera');
  const cats = $('cats');
  const nav = $('nav');

  if (!autenticado) {
    cabecera.innerHTML = `<div class="escudo">NOB</div><div><h1>Inferiores</h1><div class="sub">Seguimiento de jugadores</div></div>`;
    cats.innerHTML = '';
    nav.innerHTML = '';
    return;
  }

  const club = obtenerClubActual();
  const izquierda = mostrarAtras
    ? `<button class="atras" id="btn-atras" aria-label="Volver">‹</button>`
    : `<div class="escudo">NOB</div>`;
  cabecera.innerHTML = `
    ${izquierda}
    <div>
      <h1>${escaparHtml(titulo ?? '')}</h1>
      <div class="sub">${escaparHtml(club?.nombre ?? '')}</div>
    </div>
  `;
  $('btn-atras')?.addEventListener('click', () => alVolver());

  const activo = obtenerPlantelActivo();
  cats.innerHTML = obtenerPlanteles().map((p) => `
    <button class="cat ${p.id === activo?.id ? 'on' : ''}" data-plantel="${p.id}">
      <div><div class="sig">${escaparHtml(p.categoria)}</div></div>
    </button>
  `).join('');
  cats.querySelectorAll('.cat').forEach((boton) => {
    boton.addEventListener('click', () => {
      setPlantelActivoId(boton.dataset.plantel);
      alElegirPlantel();
    });
  });

  nav.innerHTML = TABS.map((t) => `
    <button class="${pantallaId === t.id ? 'on' : ''}" data-ir="${t.id}">
      <svg viewBox="0 0 24 24">${t.icono}</svg><span>${t.texto}</span>
    </button>
  `).join('');
  nav.querySelectorAll('button').forEach((boton) => {
    boton.addEventListener('click', () => alTocarTab(boton.dataset.ir));
  });
}
```

- [ ] **Step 3: Escribir `src/ui/pantallas/login.js`** (movido desde `src/ui/auth.js`, mismas funciones, rutas de import actualizadas)

```js
import { iniciarSesion } from '../../data/repositorio.js';
import { mostrarPantalla, esErrorDeRed } from '../nav.js';

const $ = (id) => document.getElementById(id);

export function mostrarLogin() {
  mostrarPantalla('p-login');
  ocultarError();
}

export function iniciarLogin(alIniciarSesion) {
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

- [ ] **Step 4: Borrar `src/ui/auth.js`**

```bash
git rm src/ui/auth.js
```

- [ ] **Step 5: Reescribir `src/ui/main.js`** (bootstrap + router)

```js
import { obtenerSesionActual, obtenerClubesDelEntrenador, obtenerPlantelesDelClub } from '../data/repositorio.js';
import { mostrarPantalla, toast } from './nav.js';
import { setClubActual, setPlanteles, limpiarSesion } from './sesion.js';
import { iniciarChrome, renderChrome, TABS } from './chrome.js';
import { iniciarLogin, mostrarLogin } from './pantallas/login.js';

const pantallas = new Map();
const pila = [];
let autenticado = false;

/**
 * Registra una pantalla. `render` puede ser async; se llama cada vez que se
 * navega a la pantalla, así los datos se releen y no hace falta invalidar
 * cachés a mano después de un import.
 */
export function registrarPantalla(id, { titulo, render } = {}) {
  pantallas.set(id, { titulo, render });
}

/** Id de la pantalla visible, derivado del DOM (ver nota de diseño en el spec). */
export function pantallaActualId() {
  return document.querySelector('.pant.on')?.id ?? null;
}

export function sincronizarChrome() {
  const id = pantallaActualId();
  renderChrome({
    pantallaId: id,
    titulo: pantallas.get(id)?.titulo ?? '',
    mostrarAtras: pila.length > 0,
    autenticado,
  });
}

export async function ir(id, { push = false } = {}) {
  const def = pantallas.get(id);
  if (!def) return;
  const desde = pantallaActualId();
  if (push && desde && desde !== id) pila.push(desde);
  if (!push) pila.length = 0;
  mostrarPantalla(id);
  sincronizarChrome();
  if (def.render) await def.render();
}

export async function volver() {
  const destino = pila.pop() ?? TABS[1].id;
  mostrarPantalla(destino);
  sincronizarChrome();
  const def = pantallas.get(destino);
  if (def?.render) await def.render();
}

async function entrarConSesion() {
  let clubes;
  try {
    clubes = await obtenerClubesDelEntrenador();
  } catch {
    toast('No se pudo cargar tu club. Revisá tu conexión.');
    limpiarSesion();
    autenticado = false;
    mostrarLogin();
    sincronizarChrome();
    return;
  }
  if (!clubes.length) {
    toast('Tu usuario no está asociado a ningún club todavía.');
    limpiarSesion();
    autenticado = false;
    mostrarLogin();
    sincronizarChrome();
    return;
  }
  setClubActual(clubes[0]);

  let planteles = [];
  try {
    planteles = await obtenerPlantelesDelClub(clubes[0].id);
  } catch {
    toast('No se pudieron cargar las categorías. Revisá tu conexión.');
  }
  setPlanteles(planteles);

  autenticado = true;
  // Landing en PLANTEL: es donde arranca el flujo del entrenador que empieza
  // de cero, y es real — HOY son datos de ejemplo.
  await ir('p-plantel');
}

async function iniciar() {
  iniciarLogin(entrarConSesion);
  iniciarChrome({
    onTab: (id) => ir(id),
    onPlantel: () => ir(pantallaActualId()),
    onVolver: () => volver(),
  });

  const { registrarPantallas } = await import('./pantallas/registro.js');
  registrarPantallas();

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
    sincronizarChrome();
  }
}

iniciar();
```

- [ ] **Step 6: Crear `src/ui/pantallas/registro.js`** con solo las pantallas que ya existen (las demás se suman en sus tasks)

```js
import { registrarPantalla } from '../main.js';

/**
 * Punto único donde se registran las pantallas. Existe para que main.js no
 * tenga que importar cada pantalla (y con eso, evitar ciclos de import entre
 * el router y las pantallas que lo usan para navegar).
 */
export function registrarPantallas() {
  registrarPantalla('p-login', { titulo: 'Ingresar' });
}
```

- [ ] **Step 7: Verificar**

Run: `node --check src/ui/main.js && node --check src/ui/chrome.js && node --check src/ui/sesion.js && node --check src/ui/pantallas/login.js && node --check src/ui/pantallas/registro.js`
Expected: sin salida (todos válidos).

Run: `grep -rl "@supabase/supabase-js" src/ui/`
Expected: sin matches.

Run: `npm test`
Expected: 41 tests, 0 fallando.

- [ ] **Step 8: Commit**

```bash
git add src/ui/main.js src/ui/sesion.js src/ui/chrome.js src/ui/pantallas/login.js src/ui/pantallas/registro.js
git commit -m "feat: add router, chrome and session gate as ES modules"
```

---

## Task 8: Mover las pantallas del import y agregar la guarda estática de navegación

**Files:**
- Create: `src/ui/pantallas/confirmacionImport.js` (movido desde `src/ui/pantallaConfirmacion.js`)
- Create: `src/ui/pantallas/resultadoImport.js` (movido desde `src/ui/pantallaResultado.js`)
- Create: `src/ui/pantallas/retornoImport.js`
- Delete: `src/ui/pantallaConfirmacion.js`, `src/ui/pantallaResultado.js`, `src/ui/pantallaInicio.js`
- Create: `tests/navegacionInvariante.test.js`
- Modify: `package.json` (agregar el test nuevo al script `test`)

**Interfaces:**
- Produces: `iniciarConfirmacion(archivo)` desde `confirmacionImport.js` (misma firma que antes); `mostrarResultado({ resumen, advertencias })` desde `resultadoImport.js`; `setRetornoImport(fn)` / `retornarDeImport()` desde `retornoImport.js`.

**Regla de esta task: la lógica interna de las dos pantallas movidas queda byte-idéntica.** Los únicos cambios permitidos son (a) las rutas de import, porque bajan un nivel de directorio, y (b) en `resultadoImport.js`, la línea del callback de retorno. Se verifica con un diff explícito en el Step 5.

- [ ] **Step 1: Mover los archivos con git (preserva historial)**

```bash
mkdir -p src/ui/pantallas
git mv src/ui/pantallaConfirmacion.js src/ui/pantallas/confirmacionImport.js
git mv src/ui/pantallaResultado.js src/ui/pantallas/resultadoImport.js
git rm src/ui/pantallaInicio.js
```

- [ ] **Step 2: Ajustar SOLO las rutas de import en `src/ui/pantallas/confirmacionImport.js`**

Los imports pasan de `../` a `../../` para lo que está en `src/data` y `src/parser`, y de `./` a `../` para lo que está en `src/ui`. Se borra el de `./pantallaInicio.js` (esa pantalla ya no existe) y se agrega el del retorno común. El bloque completo queda exactamente así — **reemplazar el bloque de imports entero por este**, sin tocar una sola línea debajo de él:

```js
import { parsearPartidoCabb } from '../../parser/parserCabb.js';
import { calcularHashArchivo, mapearImportacion } from '../../data/mapearImportacion.js';
import { obtenerPlantelesDelClub, obtenerJugadoresDelClub, buscarImportacionPorHash, importarPartido } from '../../data/repositorio.js';
import { prepararPayloadImportacion } from '../../data/prepararPayloadImportacion.js';
import { obtenerClubActual } from '../sesion.js';
import { mostrarPantalla, toast, esErrorDeRed, escaparHtml } from '../nav.js';
import { mostrarResultado } from './resultadoImport.js';
import { retornarDeImport } from './retornoImport.js';
```

(Si el archivo original tenía `prepararPayloadImportacion` e `importarPartido` en líneas separadas, consolidarlos como arriba es equivalente y está bien; lo que no puede cambiar es qué se importa.)

La única referencia a `mostrarInicio` que quedaba está dentro de `ligarBotonVolver`, que pasa a usar el retorno común y queda:

```js
function ligarBotonVolver() {
  $('btn-volver-inicio')?.addEventListener('click', retornarDeImport);
}
```

**Nada más cambia en este archivo.** En particular, se conservan idénticos: `botonVolver()`, las dos líneas de limpieza idempotente al tope de `avanzarAJugadores` (`document.getElementById('cargando-jugadores')?.remove()` y `document.getElementById('btn-volver-inicio')?.remove()`), y las dos inserciones vía `insertAdjacentHTML('afterend', ...)` sobre `btn-confirmar-equipo-plantel`.

- [ ] **Step 3: Ajustar `src/ui/pantallas/resultadoImport.js`**

```js
import { mostrarPantalla, escaparHtml } from '../nav.js';
import { retornarDeImport } from './retornoImport.js';

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
  $('btn-volver-resultado').addEventListener('click', retornarDeImport);
}
```

- [ ] **Step 4: Crear `src/ui/pantallas/retornoImport.js`**

```js
/**
 * Punto único de retorno del flujo de import. Existe para que las pantallas
 * del import no tengan que importar la pantalla de DATOS (evita un ciclo de
 * imports) y para que las dos rutas de vuelta — el "Volver" del contenido y
 * la flecha del chrome — terminen en exactamente el mismo lugar.
 */
let manejador = () => {};

export function setRetornoImport(fn) {
  manejador = fn;
}

export function retornarDeImport() {
  manejador();
}
```

- [ ] **Step 5: Verificar que la lógica movida quedó byte-idéntica salvo lo permitido**

Comparar ambas versiones ignorando las líneas de import (que son lo único que se permitió tocar además del callback):

```bash
git show pre-etapa-3:src/ui/pantallaConfirmacion.js > /tmp/antes-conf.js
diff <(grep -v '^import ' /tmp/antes-conf.js) <(grep -v '^import ' src/ui/pantallas/confirmacionImport.js)
```

Expected: **exactamente una diferencia**, la del cuerpo de `ligarBotonVolver`:

```
<   $('btn-volver-inicio')?.addEventListener('click', mostrarInicio);
---
>   $('btn-volver-inicio')?.addEventListener('click', retornarDeImport);
```

Cualquier otra línea en ese diff significa que se cambió lógica que no se debía tocar: revertirla antes de seguir.

Y el mismo chequeo para la pantalla de resultado:

```bash
git show pre-etapa-3:src/ui/pantallaResultado.js > /tmp/antes-res.js
diff <(grep -v '^import ' /tmp/antes-res.js) <(grep -v '^import ' src/ui/pantallas/resultadoImport.js)
```

Expected: exactamente una diferencia, la del listener de `btn-volver-resultado` (`mostrarInicio` → `retornarDeImport`).

- [ ] **Step 6: Escribir `tests/navegacionInvariante.test.js`**

Guarda estática de la invariante que se rompió en la Etapa 2B. No hay jsdom ni se pueden agregar dependencias, así que se verifica el fuente.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fuente = (rel) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('confirmacionImport nunca appendea botonVolver() con beforeend', () => {
  const lineas = fuente('src/ui/pantallas/confirmacionImport.js').split('\n');
  const ofensivas = lineas.filter((l) => l.includes('botonVolver()') && l.includes("insertAdjacentHTML('beforeend'"));
  assert.deepStrictEqual(
    ofensivas,
    [],
    'appendear botonVolver() con beforeend apila un segundo .pie-fijo sobre el existente: es el bug de footers superpuestos de la Etapa 2B',
  );
});

test('avanzarAJugadores limpia los restos del intento anterior antes de reinsertar', () => {
  const src = fuente('src/ui/pantallas/confirmacionImport.js');
  assert.match(src, /getElementById\('cargando-jugadores'\)\?\.remove\(\)/);
  assert.match(src, /getElementById\('btn-volver-inicio'\)\?\.remove\(\)/);
});

test('el router no conoce ni toca el botón de volver del contenido', () => {
  const src = fuente('src/ui/main.js');
  assert.ok(
    !src.includes('btn-volver-inicio'),
    'un solo dueño por afordancia: la vuelta del chrome es del router, la del contenido es de la pantalla',
  );
});
```

- [ ] **Step 7: Agregar el test al script de `package.json`**

```json
"test": "node --test tests/parserCabb.test.js tests/mapearImportacion.test.js tests/prepararPayloadImportacion.test.js tests/navegacionInvariante.test.js"
```

- [ ] **Step 8: Correr los tests**

Run: `npm test`
Expected: 44 tests (41 + los 3 nuevos), 0 fallando.

Run: `node --check src/ui/pantallas/confirmacionImport.js && node --check src/ui/pantallas/resultadoImport.js && node --check src/ui/pantallas/retornoImport.js`
Expected: sin salida.

- [ ] **Step 9: Commit**

```bash
git add -A src/ui public/index.html tests/navegacionInvariante.test.js package.json
git commit -m "refactor: move import screens under pantallas/ and guard the navigation invariant"
```

---

## Task 9: Pantalla DATOS (real) — partidos y entrada al import

**Files:**
- Create: `src/ui/pantallas/datos.js`
- Modify: `src/ui/pantallas/registro.js`

**Interfaces:**
- Consumes: `obtenerPartidosDelPlantel` (Task 2); `obtenerClubActual`, `obtenerPlantelActivo` de `sesion.js`; `ir` de `main.js`; `iniciarConfirmacion` de `confirmacionImport.js`; `setRetornoImport` de `retornoImport.js`; `escaparHtml`, `toast`, `esErrorDeRed` de `nav.js`.
- Produces: `renderDatos()` y `iniciarDatos()`.

- [ ] **Step 1: Escribir `src/ui/pantallas/datos.js`**

```js
import { obtenerPartidosDelPlantel } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed } from '../nav.js';
import { ir } from '../main.js';
import { iniciarConfirmacion } from './confirmacionImport.js';
import { setRetornoImport } from './retornoImport.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('datos-contenido');

function formatearFecha(iso) {
  // 'YYYY-MM-DD' → 'DD/MM'. Se parsea a mano para no depender de la zona
  // horaria del navegador (new Date('2026-05-01') es UTC y puede correrse un día).
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio.slice(2)}`;
}

function filaPartido(p) {
  const propios = p.puntosPropios ?? '-';
  const rival = p.puntosRival ?? '-';
  const ganado = p.puntosPropios != null && p.puntosRival != null && p.puntosPropios > p.puntosRival;
  return `
    <div class="jug-fila">
      <div style="flex:1">
        <div class="nom">${escaparHtml(p.rivalNombre ?? 'Rival sin nombre')}</div>
        <div class="det">${formatearFecha(p.fecha)} · ${p.condicionPropia === 'local' ? 'Local' : 'Visitante'}</div>
      </div>
      <div class="chip ${ganado ? 'sube' : ''}">${propios}–${rival}</div>
    </div>
  `;
}

export async function renderDatos() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Partidos de ${escaparHtml(plantel.categoria)}</div>
      <div class="p" id="datos-estado">Cargando partidos...</div>
      <div id="datos-lista"></div>
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-cargar-partido">Cargar partido</button></div>
  `;
  $('btn-cargar-partido').addEventListener('click', () => $('input-archivo').click());

  let partidos;
  try {
    partidos = await obtenerPartidosDelPlantel(club.id, plantel.id);
  } catch (e) {
    $('datos-estado').textContent = esErrorDeRed(e)
      ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
      : 'No se pudieron cargar los partidos.';
    return;
  }

  if (!partidos.length) {
    $('datos-estado').outerHTML = `
      <div class="estado-vacio">
        <h2>Todavía no cargaste partidos</h2>
        <div class="p">Cargá la planilla <b>.xlsx</b> que exporta la app de la CABB y los datos del partido quedan guardados, con las estadísticas de cada jugador.</div>
      </div>
    `;
    return;
  }

  $('datos-estado').remove();
  $('datos-lista').innerHTML = `<div class="lista-2col">${partidos.map(filaPartido).join('')}</div>`;
}

export function iniciarDatos() {
  // El input de archivo vive en index.html, fuera de las pantallas, para que
  // el listener se registre una sola vez en toda la vida de la página.
  $('input-archivo').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    await ir('p-confirmacion', { push: true });
    await iniciarConfirmacion(archivo);
  });

  // Punto único de retorno del import: vuelve a DATOS y releé la lista, así
  // el partido recién importado aparece sin recargar la página.
  setRetornoImport(() => { ir('p-datos'); });
}
```

- [ ] **Step 2: Registrar la pantalla en `src/ui/pantallas/registro.js`**

```js
import { registrarPantalla } from '../main.js';
import { renderDatos, iniciarDatos } from './datos.js';

export function registrarPantallas() {
  registrarPantalla('p-login', { titulo: 'Ingresar' });
  registrarPantalla('p-datos', { titulo: 'Datos', render: renderDatos });
  registrarPantalla('p-confirmacion', { titulo: 'Confirmar partido' });
  registrarPantalla('p-resultado', { titulo: 'Partido guardado' });
  iniciarDatos();
}
```

- [ ] **Step 3: Verificar**

Run: `node --check src/ui/pantallas/datos.js && node --check src/ui/pantallas/registro.js`
Expected: sin salida.

Run: `grep -rl "@supabase/supabase-js" src/ui/`
Expected: sin matches.

Run: `npm test`
Expected: 44 tests, 0 fallando.

No hay navegador automatizable: la interacción real (tocar "Cargar partido", elegir archivo, volver) se verifica a mano en Task 14. Decirlo en el reporte.

- [ ] **Step 4: Commit**

```bash
git add src/ui/pantallas/datos.js src/ui/pantallas/registro.js
git commit -m "feat: add DATOS screen with real match list and import entry point"
```

---

## Task 10: Pantalla PLANTEL (real) — lista y estado vacío

**Files:**
- Create: `src/ui/pantallas/plantel.js`
- Modify: `src/ui/pantallas/registro.js`

**Interfaces:**
- Consumes: `obtenerJugadoresDelPlantel` (Task 2); `sesion.js`; `ir` de `main.js`; `nav.js`.
- Produces: `renderPlantel()`, y `abrirAltaManual` se le inyecta en Task 12 vía `setAbrirAltaManual`.

- [ ] **Step 1: Escribir `src/ui/pantallas/plantel.js`**

```js
import { obtenerJugadoresDelPlantel } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed } from '../nav.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('plantel-contenido');

let abrirAltaManual = () => {};
let abrirFicha = () => {};

/** Task 12 registra acá la apertura de la hoja de alta manual. */
export function setAbrirAltaManual(fn) {
  abrirAltaManual = fn;
}

/** Task 11 registra acá la apertura de la ficha de un jugador. */
export function setAbrirFicha(fn) {
  abrirFicha = fn;
}

export function iniciales(nombreLimpio) {
  const partes = nombreLimpio.split(',');
  const apellido = (partes[0] ?? '').trim();
  const nombre = (partes[1] ?? '').trim();
  return ((apellido[0] ?? '') + (nombre[0] ?? '')).toUpperCase() || '?';
}

/** NULL = "sin medir", nunca cero (Etapa 3, Decisión 8). */
export function textoMedicion(jugador) {
  const talla = jugador.tallaCm == null ? null : `${jugador.tallaCm} cm`;
  const peso = jugador.pesoKg == null ? null : `${jugador.pesoKg} kg`;
  if (talla == null && peso == null) return 'Sin medir';
  return [talla ?? 'talla sin medir', peso ?? 'peso sin medir'].join(' · ');
}

function filaJugador(j) {
  const sinMedir = j.tallaCm == null && j.pesoKg == null;
  return `
    <button class="jug" data-jugador="${j.id}">
      <div class="av">${escaparHtml(iniciales(j.nombreLimpio))}</div>
      <div>
        <div class="nom">${escaparHtml(j.nombreLimpio)}</div>
        <div class="det">${escaparHtml(textoMedicion(j))}</div>
      </div>
      <div class="der">
        ${sinMedir ? '<span class="chip sin">sin medir</span>' : ''}
        <span class="flecha">›</span>
      </div>
    </button>
  `;
}

function estadoVacioHtml(categoria) {
  return `
    <div class="estado-vacio">
      <h2>${escaparHtml(categoria)} todavía no tiene jugadores</h2>
      <div class="p">La forma más rápida de armar el plantel es cargar una planilla de la CABB: un partido suele traer entre el 70% y el 80% de los jugadores de una sola vez. Los que la CABB no trae, los agregás a mano.</div>
      <div class="acciones">
        <button class="btn" id="btn-vacio-importar">Cargar un partido de la CABB</button>
        <button class="btn sec" id="btn-vacio-manual">Agregar jugador a mano</button>
      </div>
    </div>
  `;
}

export async function renderPlantel() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p" id="plantel-estado">Cargando plantel...</div><div id="plantel-lista"></div></div>`;

  let jugadores;
  try {
    jugadores = await obtenerJugadoresDelPlantel(club.id, plantel.id);
  } catch (e) {
    $('plantel-estado').textContent = esErrorDeRed(e)
      ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.'
      : 'No se pudo cargar el plantel.';
    return;
  }

  if (!jugadores.length) {
    contenedor().innerHTML = `<div class="pad">${estadoVacioHtml(plantel.categoria)}</div>`;
    $('btn-vacio-importar').addEventListener('click', () => ir('p-datos'));
    $('btn-vacio-manual').addEventListener('click', () => abrirAltaManual());
    return;
  }

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">${escaparHtml(plantel.categoria)} <span class="der">${jugadores.length} jugador${jugadores.length === 1 ? '' : 'es'}</span></div>
      <div class="lista-2col" id="plantel-lista">${jugadores.map(filaJugador).join('')}</div>
    </div>
    <div class="pie-fijo"><button class="btn sec" id="btn-agregar-jugador">Agregar jugador a mano</button></div>
  `;
  $('btn-agregar-jugador').addEventListener('click', () => abrirAltaManual());
  contenedor().querySelectorAll('[data-jugador]').forEach((boton) => {
    boton.addEventListener('click', () => abrirFicha(boton.dataset.jugador));
  });
}
```

`ir()` (Task 7) sólo acepta `{ push }`: el `jugadorId` no viaja por el router, lo guarda `fichaJugador.js` en su propio módulo (Task 11) y esta pantalla sólo dispara `abrirFicha(id)`.

- [ ] **Step 2: Registrar la pantalla en `registro.js`** (agregar a lo que ya está)

```js
  registrarPantalla('p-plantel', { titulo: 'Plantel', render: renderPlantel });
```

con su import correspondiente `import { renderPlantel } from './plantel.js';`.

- [ ] **Step 3: Verificar**

Run: `node --check src/ui/pantallas/plantel.js && node --check src/ui/pantallas/registro.js`
Expected: sin salida.

Run: `npm test`
Expected: 44 tests, 0 fallando.

- [ ] **Step 4: Commit**

```bash
git add src/ui/pantallas/plantel.js src/ui/pantallas/registro.js
git commit -m "feat: add PLANTEL screen with real roster and empty state"
```

---

## Task 11: Ficha de jugador (real, mínima)

**Files:**
- Create: `src/ui/pantallas/fichaJugador.js`
- Modify: `src/ui/pantallas/registro.js`, `src/ui/pantallas/plantel.js` (registrar `setAbrirFicha`)

**Interfaces:**
- Consumes: `obtenerJugadoresDelPlantel`, `obtenerPertenenciasDeJugador` (Task 2); `textoMedicion`, `iniciales`, `setAbrirFicha` de `plantel.js`; `ir` de `main.js`.
- Produces: `renderFicha()`, `abrirFicha(jugadorId)`.

La ficha muestra **solo datos reales**: nombre, categorías con pertenencia vigente, y talla/peso/fecha de medición como "sin medir" cuando son `NULL`. Sin gráficos de ejemplo adentro (spec, Decisión 7).

- [ ] **Step 1: Escribir `src/ui/pantallas/fichaJugador.js`**

```js
import { obtenerJugadoresDelPlantel, obtenerPertenenciasDeJugador } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, esErrorDeRed } from '../nav.js';
import { ir } from '../main.js';
import { iniciales } from './plantel.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('ficha-contenido');

let jugadorId = null;

export function abrirFicha(id) {
  jugadorId = id;
  ir('p-ficha', { push: true });
}

function dato(k, valor, unidad) {
  const sin = valor == null;
  return `
    <div class="dato">
      <div class="k">${escaparHtml(k)}</div>
      <div class="v ${sin ? 'sin' : ''}">${sin ? 'sin medir' : escaparHtml(String(valor)) + (unidad ? `<small> ${unidad}</small>` : '')}</div>
    </div>
  `;
}

export async function renderFicha() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel || !jugadorId) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay un jugador seleccionado.</div></div>`;
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando jugador...</div></div>`;

  let jugador;
  let pertenencias = [];
  try {
    const jugadores = await obtenerJugadoresDelPlantel(club.id, plantel.id);
    jugador = jugadores.find((j) => j.id === jugadorId) ?? null;
    if (jugador) pertenencias = await obtenerPertenenciasDeJugador(club.id, jugadorId);
  } catch (e) {
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar el jugador.'
    }</div></div></div>`;
    return;
  }

  if (!jugador) {
    contenedor().innerHTML = `<div class="pad"><div class="p">Este jugador ya no está en ${escaparHtml(plantel.categoria)}.</div></div>`;
    return;
  }

  const categorias = pertenencias.map((p) => p.categoria).filter(Boolean);
  contenedor().innerHTML = `
    <div class="ficha-top">
      <div class="nom">${escaparHtml(jugador.nombreLimpio)}</div>
      <div class="sub">${categorias.length ? escaparHtml(categorias.join(' · ')) : 'Sin categoría vigente'}</div>
      <div class="datos-ficha">
        ${dato('Talla', jugador.tallaCm, 'cm')}
        ${dato('Peso', jugador.pesoKg, 'kg')}
      </div>
    </div>
    <div class="pad">
      <div class="eyebrow">Mediciones</div>
      <div class="p">${
        jugador.fechaMedicion
          ? `Última medición: ${escaparHtml(jugador.fechaMedicion)}.`
          : 'Todavía no tiene mediciones cargadas. Talla y peso salen de los estudios médicos de principio de año y se cargan aparte.'
      }</div>
    </div>
  `;
}
```

- [ ] **Step 2: Conectar `plantel.js` con la ficha**

En `src/ui/pantallas/registro.js`, después de los `registrarPantalla`, agregar:

```js
  setAbrirFicha(abrirFicha);
```

con los imports `import { renderFicha, abrirFicha } from './fichaJugador.js';` y `import { renderPlantel, setAbrirFicha } from './plantel.js';`, y el registro:

```js
  registrarPantalla('p-ficha', { titulo: 'Jugador', render: renderFicha });
```

- [ ] **Step 3: Verificar**

Run: `node --check src/ui/pantallas/fichaJugador.js && node --check src/ui/pantallas/registro.js`
Expected: sin salida.

Run: `npm test`
Expected: 44 tests, 0 fallando.

- [ ] **Step 4: Commit**

```bash
git add src/ui/pantallas/fichaJugador.js src/ui/pantallas/registro.js src/ui/pantallas/plantel.js
git commit -m "feat: add real player detail screen with sin-medir measurements"
```

---

## Task 12: Alta manual de jugador (hoja + RPC + sumar a categoría)

**Files:**
- Create: `src/ui/componentes/hoja.js`
- Create: `src/ui/pantallas/altaJugador.js`
- Modify: `src/ui/pantallas/registro.js`

**Interfaces:**
- Consumes: `limpiarNombre`, `clavearNombre` de `src/parser/parserCabb.js`; `obtenerJugadoresDelClub`, `altaJugadorManual`, `crearPertenencia` de `repositorio.js`; `setAbrirAltaManual` de `plantel.js`; `ir` de `main.js`.
- Produces: `abrirHoja({ titulo, cuerpo })`, `cerrarHoja()` desde `componentes/hoja.js`; `abrirAltaManual()` desde `altaJugador.js`.

- [ ] **Step 1: Escribir `src/ui/componentes/hoja.js`**

```js
const $ = (id) => document.getElementById(id);

/** Bottom sheet en celular; diálogo centrado a partir de 1024px (layout.css). */
export function abrirHoja({ titulo, cuerpo }) {
  const hoja = $('hoja');
  hoja.innerHTML = `
    <div class="asa"></div>
    <h2 id="hoja-titulo">${titulo}</h2>
    <div class="pad">${cuerpo}</div>
  `;
  $('velo').classList.add('on');
  hoja.classList.add('on');
}

export function cerrarHoja() {
  $('velo').classList.remove('on');
  $('hoja').classList.remove('on');
}

export function iniciarHoja() {
  $('velo').addEventListener('click', cerrarHoja);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarHoja();
  });
}
```

- [ ] **Step 2: Escribir `src/ui/pantallas/altaJugador.js`**

```js
import { limpiarNombre, clavearNombre } from '../../parser/parserCabb.js';
import { obtenerJugadoresDelClub, altaJugadorManual, crearPertenencia } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, toast, esErrorDeRed } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);

function hoyLocal() {
  // Fecha local, no UTC: después de las 21:00 en Argentina, toISOString() ya
  // devuelve el día siguiente.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function abrirAltaManual() {
  const plantel = obtenerPlantelActivo();
  if (!plantel) return;
  abrirHoja({
    titulo: 'Agregar jugador',
    cuerpo: `
      <div class="campo">
        <label for="in-nombre-jugador">Nombre</label>
        <input id="in-nombre-jugador" type="text" autocomplete="off" spellcheck="false">
        <div class="ayuda">Como en la CABB: Apellido, Nombre. El orden importa para que un import futuro lo reconozca en vez de duplicarlo.</div>
      </div>
      <div id="alta-aviso"></div>
      <button class="btn" id="btn-alta-confirmar">Agregar a ${escaparHtml(plantel.categoria)}</button>
    `,
  });
  $('in-nombre-jugador').focus();
  $('btn-alta-confirmar').addEventListener('click', confirmarAlta);
  $('in-nombre-jugador').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmarAlta();
  });
}

async function confirmarAlta() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  const boton = $('btn-alta-confirmar');
  const aviso = $('alta-aviso');
  const crudo = $('in-nombre-jugador').value;

  const nombreLimpio = limpiarNombre(crudo);
  const nombreClave = clavearNombre(nombreLimpio);
  if (!nombreClave) {
    aviso.innerHTML = `<div class="al"><div class="tx">Escribí un nombre.</div></div>`;
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Agregando...';
  aviso.innerHTML = '';

  // Chequeo previo contra el club entero: si ya existe, se ofrece sumarlo a
  // esta categoría en vez de crear un duplicado. Es el mismo caso del chico
  // de U17 citado a U21, por la otra puerta. La RPC igual lo bloquea con
  // JUGADOR_YA_EXISTE, así que esto es sólo para dar el mensaje bueno.
  let existentes = [];
  try {
    existentes = await obtenerJugadoresDelClub(club.id);
  } catch (e) {
    aviso.innerHTML = `<div class="al"><div class="tx">${esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos.' : 'No se pudo verificar si el jugador ya existe.'}</div></div>`;
    boton.disabled = false;
    boton.textContent = `Agregar a ${plantel.categoria}`;
    return;
  }

  const yaExiste = existentes.find((j) => j.nombreClave === nombreClave);
  if (yaExiste) {
    if (yaExiste.plantelesActuales.includes(plantel.id)) {
      aviso.innerHTML = `<div class="al ok"><div class="tx"><b>${escaparHtml(yaExiste.nombreLimpio)}</b> ya está en ${escaparHtml(plantel.categoria)}.</div></div>`;
      boton.disabled = false;
      boton.textContent = `Agregar a ${plantel.categoria}`;
      return;
    }
    mostrarOfertaDeSumar(yaExiste);
    return;
  }

  try {
    await altaJugadorManual({
      clubId: club.id,
      nombreClave,
      nombreLimpio,
      plantelId: plantel.id,
      temporadaId: plantel.temporadaId,
      desde: hoyLocal(),
    });
  } catch (e) {
    if (e?.message === 'JUGADOR_YA_EXISTE') {
      aviso.innerHTML = `<div class="al"><div class="tx">Ese nombre ya existe en el club. Cerrá y volvé a abrir para ver la opción de sumarlo a esta categoría.</div></div>`;
    } else {
      aviso.innerHTML = `<div class="al"><div class="tx">${esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo agregar el jugador.'}</div></div>`;
    }
    boton.disabled = false;
    boton.textContent = `Agregar a ${plantel.categoria}`;
    return;
  }

  cerrarHoja();
  toast(`${nombreLimpio} agregado a ${plantel.categoria}`);
  await ir('p-plantel');
}

function mostrarOfertaDeSumar(jugador) {
  const plantel = obtenerPlantelActivo();
  const boton = $('btn-alta-confirmar');
  boton.style.display = 'none';
  $('alta-aviso').innerHTML = `
    <div class="al ok">
      <div class="tx">
        <b>${escaparHtml(jugador.nombreLimpio)}</b> ya está cargado en el club, en otra categoría.
        <div class="mt">Se lo suma también a ${escaparHtml(plantel.categoria)}, sin crear un perfil nuevo.</div>
      </div>
    </div>
    <button class="btn" id="btn-sumar-categoria">Sumarlo a ${escaparHtml(plantel.categoria)}</button>
  `;
  $('btn-sumar-categoria').addEventListener('click', async () => {
    const b = $('btn-sumar-categoria');
    b.disabled = true;
    b.textContent = 'Sumando...';
    try {
      // Una sola fila: llamada simple, no necesita RPC (spec, Decisión 4).
      await crearPertenencia({
        clubId: obtenerClubActual().id,
        jugadorId: jugador.id,
        plantelId: plantel.id,
        temporadaId: plantel.temporadaId,
        desde: hoyLocal(),
      });
    } catch (e) {
      $('alta-aviso').insertAdjacentHTML('beforeend', `<div class="al"><div class="tx">${esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo sumar a la categoría.'}</div></div>`);
      b.disabled = false;
      b.textContent = `Sumarlo a ${plantel.categoria}`;
      return;
    }
    cerrarHoja();
    toast(`${jugador.nombreLimpio} sumado a ${plantel.categoria}`);
    await ir('p-plantel');
  });
}
```

- [ ] **Step 3: Conectar en `registro.js`**

Agregar los imports y, después de los registros:

```js
import { iniciarHoja } from '../componentes/hoja.js';
import { abrirAltaManual } from './altaJugador.js';
import { renderPlantel, setAbrirFicha, setAbrirAltaManual } from './plantel.js';
...
  iniciarHoja();
  setAbrirAltaManual(abrirAltaManual);
```

- [ ] **Step 4: Verificar**

Run: `node --check src/ui/componentes/hoja.js && node --check src/ui/pantallas/altaJugador.js && node --check src/ui/pantallas/registro.js`
Expected: sin salida.

Run: `grep -n "limpiarNombre\|clavearNombre" src/ui/pantallas/altaJugador.js`
Expected: se importan de `../../parser/parserCabb.js` — la misma normalización que usa el import, no una copia.

Run: `npm test`
Expected: 44 tests, 0 fallando.

- [ ] **Step 5: Commit**

```bash
git add src/ui/componentes/hoja.js src/ui/pantallas/altaJugador.js src/ui/pantallas/registro.js
git commit -m "feat: add manual player creation via transactional RPC with duplicate handling"
```

---

## Task 13: Pantallas de ejemplo — HOY, MEDIR, RECURSOS

**Files:**
- Create: `src/ui/datosEjemplo.js`
- Create: `src/ui/componentes/graficos.js`
- Create: `src/ui/componentes/bannerEjemplo.js`
- Create: `src/ui/pantallas/hoy.js`, `src/ui/pantallas/medir.js`, `src/ui/pantallas/recursos.js`
- Modify: `src/ui/pantallas/registro.js`

**Interfaces:**
- Produces: `bannerEjemplo()` (string HTML), `cancha(svg, vals, opts)`, `grafico(svg, series, opts)`, y los datos de ejemplo.

Los tres renderers de pantalla y los datos son **portados del prototipo** (`js/app.js`), conservando el aspecto. `cancha()` y `grafico()` van tal cual, con los hex sueltos cambiados por tokens donde aplica.

- [ ] **Step 1: Escribir `src/ui/datosEjemplo.js`**

```js
/**
 * Datos inventados para HOY, MEDIR y RECURSOS. Portados de js/app.js del
 * prototipo. Viven en src/ui/ y no en src/data/ porque son contenido de
 * pantalla, no una preocupación de la capa de datos.
 *
 * Ninguna pantalla que use esto puede renderizarse sin bannerEjemplo()
 * arriba (Etapa 3, Decisión 7).
 */
export const POS = [
  { id: 'esq_izq', n: 'Esquina izq.', c: 'ESQ IZQ', x: 32, y: 236 },
  { id: 'c45_izq', n: '45° izq.', c: '45 IZQ', x: 58, y: 158 },
  { id: 'frontal', n: 'Frontal', c: 'FRONTAL', x: 150, y: 118 },
  { id: 'c45_der', n: '45° der.', c: '45 DER', x: 242, y: 158 },
  { id: 'esq_der', n: 'Esquina der.', c: 'ESQ DER', x: 268, y: 236 },
];

export const TESTS = [
  ...POS.map((p) => ({ id: p.id, n: 'Tiro ' + p.n, tipo: 'tiro', u: '%', d: 'Aciertos sobre intentos' })),
  { id: 'libres', n: 'Tiros libres', tipo: 'tiro', u: '%', d: 'Aciertos sobre intentos' },
  { id: 'vel_con', n: 'Velocidad con pelota', tipo: 'tiempo', u: 's', d: 'Una cancha completa, en segundos' },
  { id: 'vel_sin', n: 'Velocidad sin pelota', tipo: 'tiempo', u: 's', d: 'Una cancha completa, en segundos' },
];

export const FECHAS = ['Mar', 'Abr', 'Jun', 'Ago'];

export const BIBLIO = [
  { t: 'Tiro de la esquina', d: 'Entrada con pies armados' },
  { t: 'Mecánica de libres', d: 'Rutina previa + 2 series' },
  { t: 'Manejo mano débil', d: 'Conos, cambio sin mirar' },
];

const NOMBRES = [
  ['Nicolás', 'Acosta'], ['Lautaro', 'Giménez'], ['Benjamín', 'Ríos'], ['Pablo', 'Sarmiento'],
  ['Tobías', 'Ferreyra'], ['Lautaro', 'Ojeda'], ['Ignacio', 'Villalba'], ['Facundo', 'Aguirre'],
  ['Máximo', 'Benítez'], ['Valentín', 'Sosa'], ['Bautista', 'Peralta'], ['Joaquín', 'Núñez'],
];

function rng(s) { let x = s * 7919 + 13; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }

function armar() {
  return NOMBRES.map(([n, a], i) => {
    const r = rng(307 + i * 13);
    const v = {};
    TESTS.forEach((t) => {
      let base = t.tipo === 'tiro' ? (t.id === 'libres' ? 45 + r() * 25 : 22 + r() * 30) : 4.4 + r() * 1.4;
      const s = [];
      for (let k = 0; k < FECHAS.length; k++) {
        s.push(+base.toFixed(t.tipo === 'tiempo' ? 1 : 0));
        base += t.tipo === 'tiempo' ? -(0.02 + r() * 0.12) : (r() * 5 - 0.6);
      }
      v[t.id] = s;
    });
    return {
      id: i, nom: n, ape: a, dor: 4 + i,
      pos: ['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'][Math.floor(r() * 5)],
      alt: Math.round(166 + r() * 16), peso: Math.round(48 + r() * 18),
      v, ini: (n[0] + a[0]),
    };
  });
}

export const JUGADORES_EJEMPLO = armar();
export const CARGADOS_EJEMPLO = { libres: 12, vel_sin: 12, esq_izq: 12, c45_izq: 12, frontal: 12 };

export function ultimo(j, id) { return j.v[id] ? j.v[id][FECHAS.length - 1] : null; }

export function promedio(id, k) {
  const a = JUGADORES_EJEMPLO.map((j) => (j.v[id] ? j.v[id][k] : null)).filter((x) => x != null);
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}
```

- [ ] **Step 2: Escribir `src/ui/componentes/graficos.js`** (portados de `js/app.js`, sin cambios de comportamiento)

```js
import { POS, FECHAS } from '../datosEjemplo.js';

const COL_MUTED = '#726E65'; // mismo tono que --gris-cl (auditoría de accesibilidad del prototipo)

/** Cancha con marcadores por posición. Portado tal cual del prototipo. */
export function cancha(svg, vals, { alto = 200 } = {}) {
  const W = 300, H = 290;
  const L = '#C9C5BE', T = '#131316';
  let g = `<rect x="6" y="6" width="288" height="278" fill="#FBFAF8" stroke="${L}" stroke-width="1.5"/>`;
  g += `<rect x="104" y="176" width="92" height="108" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  g += `<circle cx="150" cy="176" r="34" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  g += `<line x1="134" y1="272" x2="166" y2="272" stroke="${T}" stroke-width="2.5"/>`;
  g += `<line x1="150" y1="272" x2="150" y2="266" stroke="${T}" stroke-width="2"/>`;
  g += `<circle cx="150" cy="262" r="6" fill="none" stroke="${T}" stroke-width="2"/>`;
  g += `<path d="M28 284 L28 232 A126 126 0 0 1 272 232 L272 284" fill="none" stroke="${L}" stroke-width="1.5"/>`;
  POS.forEach((p) => {
    const v = vals[p.id];
    const op = v == null ? 0 : Math.max(0.18, Math.min(1, (v - 15) / 55));
    g += `<circle cx="${p.x}" cy="${p.y}" r="21" fill="#D9122E" opacity="${op}"/>`;
    g += `<circle cx="${p.x}" cy="${p.y}" r="21" fill="none" stroke="#D9122E" stroke-width="1.6"/>`;
    g += `<text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-family="IBM Plex Mono" font-size="14.5" font-weight="600" fill="${op > 0.55 ? '#fff' : '#131316'}">${v == null ? '—' : Math.round(v)}</text>`;
    g += `<text x="${p.x}" y="${p.y + 34}" text-anchor="middle" font-family="Barlow Condensed" font-size="10" letter-spacing="1" fill="#6E6B66">${p.c}</text>`;
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.height = alto + 'px';
  svg.innerHTML = g;
}

/** Gráfico de líneas con ejes. Portado tal cual del prototipo. */
export function grafico(svg, series, { u = '%', alto = 170, dec = 0 } = {}) {
  const W = 320, H = alto, ml = 30, mr = 8, mt = 12, mb = 24;
  const todos = series.flatMap((s) => s.d);
  let min = Math.min(...todos), max = Math.max(...todos);
  const pad = (max - min) * 0.25 || 1;
  min = min - pad; max = max + pad;
  if (u === '%') min = Math.max(0, min);
  const X = (i) => ml + i * (W - ml - mr) / (FECHAS.length - 1);
  const Y = (v) => mt + (1 - (v - min) / (max - min)) * (H - mt - mb);
  let g = '';
  for (let k = 0; k <= 3; k++) {
    const v = min + (max - min) * k / 3, y = Y(v);
    g += `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="#EAE6DF" stroke-width="1"/>`;
    g += `<text x="${ml - 6}" y="${y + 3.5}" text-anchor="end" font-family="IBM Plex Mono" font-size="10" fill="${COL_MUTED}">${v.toFixed(dec)}</text>`;
  }
  g += `<line x1="${ml}" y1="${Y(min)}" x2="${W - mr}" y2="${Y(min)}" stroke="#C9C5BE" stroke-width="1.2"/>`;
  FECHAS.forEach((f, i) => {
    g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-family="Barlow Condensed" font-size="11.5" letter-spacing=".7" fill="#6E6B66">${f.toUpperCase()}</text>`;
  });
  g += `<text x="4" y="9" font-family="Barlow Condensed" font-size="10" letter-spacing="1" fill="${COL_MUTED}">${u.toUpperCase()}</text>`;
  series.forEach((s) => {
    const pts = s.d.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="${s.c}" stroke-width="${s.w || 2.4}" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`;
    if (!s.dash) s.d.forEach((v, i) => {
      g += `<circle cx="${X(i)}" cy="${Y(v)}" r="${i === s.d.length - 1 ? 4 : 2.8}" fill="${i === s.d.length - 1 ? s.c : '#fff'}" stroke="${s.c}" stroke-width="1.8"/>`;
    });
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.height = alto + 'px';
  svg.innerHTML = g;
}
```

- [ ] **Step 3: Escribir `src/ui/componentes/bannerEjemplo.js`**

```js
/**
 * Franja de "datos de ejemplo". Obligatoria en toda pantalla que muestre
 * datos inventados (Etapa 3, Decisión 7): tiene que verse sin scrollear y
 * ser imposible de confundir con una alerta del negocio.
 */
export function bannerEjemplo() {
  return `
    <div class="banner-ejemplo" role="note">
      <span class="ico" aria-hidden="true">⚠</span>
      <span>Datos de ejemplo — no son datos reales del club</span>
    </div>
  `;
}
```

- [ ] **Step 4: Escribir `src/ui/pantallas/hoy.js`**

```js
import { bannerEjemplo } from '../componentes/bannerEjemplo.js';
import { cancha } from '../componentes/graficos.js';
import { POS, TESTS, FECHAS, JUGADORES_EJEMPLO, CARGADOS_EJEMPLO, promedio, ultimo } from '../datosEjemplo.js';
import { ir } from '../main.js';

const $ = (id) => document.getElementById(id);

export function renderHoy() {
  const faltan = TESTS.filter((t) => !CARGADOS_EJEMPLO[t.id]).length;
  const sinProgreso = JUGADORES_EJEMPLO.filter((j) => ultimo(j, 'libres') - j.v.libres[0] <= 0);
  const valores = {};
  POS.forEach((p) => { valores[p.id] = promedio(p.id, FECHAS.length - 1); });
  const promTiro = Math.round(POS.reduce((s, p) => s + valores[p.id], 0) / 5);

  $('hoy-contenido').innerHTML = `
    ${bannerEjemplo()}
    <div class="pad">
      <h2 class="h2">Buen día</h2>
      <div class="p">Así se vería el resumen de la categoría cuando haya mediciones cargadas.</div>

      <div class="eyebrow">Para revisar</div>
      <div class="al"><div class="ico">!</div><div class="tx">
        <b>${faltan} tests sin cargar.</b><div class="mt">Última medición completa: 9 de agosto</div></div></div>
      <div class="al"><div class="ico">!</div><div class="tx">
        <b>${sinProgreso.length} chicos sin mejora en tiro desde marzo.</b>
        <div class="mt">${sinProgreso.slice(0, 3).map((j) => j.nom + ' ' + j.ape).join(', ')}${sinProgreso.length > 3 ? '…' : ''}</div></div></div>
      <div class="al ok"><div class="ico">✓</div><div class="tx">
        <b>El promedio de tiro subió 6 puntos.</b><div class="mt">De marzo a agosto, en las 5 posiciones</div></div></div>

      <div class="eyebrow">Tiro de campo</div>
      <div class="tarj">
        <div class="tarj-h"><div class="t">Promedio de la categoría</div><div class="n">${promTiro}<small> %</small></div></div>
        <svg class="g" id="hoy-cancha"></svg>
        <div class="leyenda"><span>Cuanto más lleno el círculo, mejor el porcentaje</span></div>
      </div>
      <button class="btn sec" id="btn-hoy-plantel">Ver el plantel real</button>
    </div>
  `;
  cancha($('hoy-cancha'), valores);
  $('btn-hoy-plantel').addEventListener('click', () => ir('p-plantel'));
}
```

- [ ] **Step 5: Escribir `src/ui/pantallas/medir.js`**

```js
import { bannerEjemplo } from '../componentes/bannerEjemplo.js';
import { TESTS, CARGADOS_EJEMPLO, JUGADORES_EJEMPLO } from '../datosEjemplo.js';
import { toast } from '../nav.js';

const $ = (id) => document.getElementById(id);

function filaTest(t) {
  const hechos = CARGADOS_EJEMPLO[t.id];
  return `
    <button class="test-fila ${hechos ? 'hecho' : ''}" data-test="${t.id}">
      <div class="ic">${hechos ? '✓' : (t.u === '%' ? '%' : t.u)}</div>
      <div>
        <div class="t">${t.n}</div>
        <div class="d">${hechos ? `${hechos} de ${JUGADORES_EJEMPLO.length} cargados` : (t.d || 'Sin cargar')}</div>
      </div>
    </button>
  `;
}

export function renderMedir() {
  const hechos = Object.keys(CARGADOS_EJEMPLO).length;
  $('medir-contenido').innerHTML = `
    ${bannerEjemplo()}
    <div class="pad">
      <h2 class="h2">Medición</h2>
      <div class="p">Así se vería la batería de tests. La carga de mediciones todavía no está construida.</div>
      <div class="eyebrow">Batería base <span class="der">${hechos} de ${TESTS.length}</span></div>
      <div class="lista-2col">${TESTS.map(filaTest).join('')}</div>
    </div>
  `;
  $('medir-contenido').querySelectorAll('[data-test]').forEach((boton) => {
    boton.addEventListener('click', () => toast('La carga de mediciones todavía no está construida.'));
  });
}
```

- [ ] **Step 6: Escribir `src/ui/pantallas/recursos.js`**

```js
import { bannerEjemplo } from '../componentes/bannerEjemplo.js';
import { BIBLIO } from '../datosEjemplo.js';
import { toast } from '../nav.js';

const $ = (id) => document.getElementById(id);

export function renderRecursos() {
  $('recursos-contenido').innerHTML = `
    ${bannerEjemplo()}
    <div class="pad">
      <h2 class="h2">Recursos</h2>
      <div class="p">Material que dejás disponible para que el que quiera progrese por su cuenta. No es obligación ni control.</div>
      <div class="eyebrow">Ofrecidos</div>
      ${BIBLIO.map((b, i) => `
        <div class="rec">
          <div class="t">${b.t}</div>
          <div class="d">${b.d}</div>
          <div class="m"><span class="tag rojo">${i === 1 ? 'Todo el plantel' : `${2 + i} jugadores`}</span><span class="tag">${2 + i} lo abrieron</span></div>
        </div>
      `).join('')}
      <div class="p">Nadie queda “en falta” por no abrirlo. Si te interesa saber si sirvió, preguntá en el entrenamiento.</div>
      <button class="btn sec" id="btn-ofrecer">Ofrecer un recurso</button>
    </div>
  `;
  $('btn-ofrecer').addEventListener('click', () => toast('Ofrecer recursos todavía no está construido.'));
}
```

- [ ] **Step 7: Registrar las tres en `registro.js`**

```js
  registrarPantalla('p-hoy', { titulo: 'Hoy', render: renderHoy });
  registrarPantalla('p-medir', { titulo: 'Medir', render: renderMedir });
  registrarPantalla('p-recursos', { titulo: 'Recursos', render: renderRecursos });
```

con sus imports.

- [ ] **Step 8: Verificar que ninguna pantalla de ejemplo puede renderizarse sin la franja**

Run:
```bash
for f in hoy medir recursos; do
  grep -q "bannerEjemplo()" src/ui/pantallas/$f.js && echo "OK $f" || echo "FALTA banner en $f";
done
grep -rn "datosEjemplo" src/ui/pantallas/ | grep -v -E "hoy|medir|recursos"
```
Expected: `OK hoy`, `OK medir`, `OK recursos`, y el segundo grep sin salida (ninguna otra pantalla importa datos de ejemplo).

Run: `node --check src/ui/datosEjemplo.js && node --check src/ui/componentes/graficos.js && node --check src/ui/componentes/bannerEjemplo.js && node --check src/ui/pantallas/hoy.js && node --check src/ui/pantallas/medir.js && node --check src/ui/pantallas/recursos.js`
Expected: sin salida.

Run: `npm test`
Expected: 44 tests, 0 fallando.

- [ ] **Step 9: Commit**

```bash
git add src/ui/datosEjemplo.js src/ui/componentes/ src/ui/pantallas/hoy.js src/ui/pantallas/medir.js src/ui/pantallas/recursos.js src/ui/pantallas/registro.js
git commit -m "feat: port HOY, MEDIR and RECURSOS as example screens with a mandatory banner"
```

---

## Task 14: Verificación final y limpieza del prototipo

**Files:**
- Delete (solo si todo pasa): `index.html`, `js/app.js`, `css/app.css`, `css/tokens.css`
- Modify: `README`-equivalente no existe; documentar cómo levantar la app en el reporte final.

- [ ] **Step 1: Verificaciones automáticas de arquitectura**

```bash
npm test
grep -rl "@supabase/supabase-js" src/ui/ ; echo "ui-supabase: $?"
grep -rlE "document\.|window\." src/data/ ; echo "data-dom: $?"
grep -lE "@media[^{]*(min|max)-width" public/css/*.css
grep -rn "100vh" public/css/ src/ui/
grep -rn ":hover" public/css/ | grep -v "hover:hover" | grep -v "^public/css/layout.css:.*@media"
```
Expected: `npm test` en verde (44 tests); los dos `grep -rl` sin matches (exit 1); el `grep -lE` devuelve **solo** `public/css/layout.css`; sin `100vh`; y ningún `:hover` fuera de un bloque `@media (hover:hover)`.

- [ ] **Step 2: Aplicar las migraciones nuevas contra la base real**

Este paso lo corre el usuario (el agente no tiene el token de acceso de Supabase):
```bash
npx supabase db push
```
Expected: aplica `0007_mediciones_jugador.sql` y `0008_rpc_alta_jugador.sql` sin error.

- [ ] **Step 3: Verificar el rollback de la RPC nueva contra la base real**

```bash
SUPABASE_URL=https://lseqvbtdzebomxwtqhwu.supabase.co \
SUPABASE_PUBLISHABLE_KEY=<publishable key> \
VERIFICAR_RPC_EMAIL=<email de prueba> \
VERIFICAR_RPC_PASSWORD=<contraseña de prueba> \
node tests/verificarAltaJugador.js
```
Expected: `Verificación de rollback del alta manual: PASS`.

- [ ] **Step 4: Recorrer a mano el flujo del entrenador (Decisión 5 del spec)**

`npx serve .` y abrir `http://localhost:3000/public/`. Con las devtools en modo dispositivo a 375px:

1. Sin sesión: se ve **solo** el login, sin navegación ni selector de categoría.
2. Login con la cuenta de prueba → cae en PLANTEL, la navegación aparece, el selector muestra `U21M` y `U17M` reales.
3. PLANTEL sin jugadores muestra el estado vacío con los dos caminos.
4. "Cargar un partido de la CABB" lleva a DATOS; "Cargar partido" abre el selector de archivo; elegir un `.xlsx` real de `tests/fixtures/` corre el flujo de la Etapa 2B igual que antes; guardar vuelve a DATOS con el partido en la lista.
5. PLANTEL ahora muestra los jugadores reales, cada uno con "sin medir".
6. Importar un segundo partido: los repetidos se reusan, los nuevos aparecen en "nuevos". Confirmar en la base: `select count(*) from jugador where nombre_clave = '<uno repetido>'` da 1.
7. Con un jugador de la otra categoría: aparece en "Ya está en otra categoría" y al guardar genera pertenencia nueva, no jugador nuevo.
8. Alta manual: agregar un nombre nuevo → aparece en PLANTEL. Agregar un nombre que ya existe en la otra categoría → ofrece "Sumarlo a esta categoría" y no duplica.
9. Tocar un jugador abre su ficha con talla/peso "sin medir".
10. HOY, MEDIR y RECURSOS muestran la franja de ejemplo sin scrollear.
11. A 1280px: la navegación está a la izquierda, el contenido centrado con ancho máximo, y todo lo anterior sigue funcionando.

- [ ] **Step 5: Borrar los archivos del prototipo (solo si los Steps 1-4 pasaron todos)**

```bash
git rm index.html js/app.js css/app.css css/tokens.css
git commit -m "chore: remove the v3 prototype now that the unified app replaces it"
```

Si algún criterio no pasó: **no borrar nada**, reportar qué falló y arreglarlo primero.

- [ ] **Step 6: Commit final de verificación**

```bash
git add -A
git commit -m "chore: Etapa 3 acceptance verification"
```

---

## Final Acceptance Checklist

- [ ] Con la base sin jugadores, PLANTEL muestra el estado vacío con los dos caminos.
- [ ] El flujo de import funciona igual que al final de la Etapa 2B, ahora desde DATOS, con un `.xlsx` real.
- [ ] Después de importar, los jugadores aparecen en PLANTEL y el partido en DATOS sin recargar.
- [ ] Un segundo import no duplica (`select count(*) from jugador where nombre_clave = '...'` da 1).
- [ ] Un jugador de otra categoría genera pertenencia nueva, nunca jugador nuevo.
- [ ] El alta manual es transaccional (`verificarAltaJugador.js` PASS), normaliza igual que el import, y ofrece sumar a la categoría si el nombre ya existe.
- [ ] Talla y peso se muestran "sin medir" cuando son `NULL`.
- [ ] Ningún jugador rival llega a la base.
- [ ] Nada del flujo requiere el dashboard de Supabase ni la consola.
- [ ] 375px usable con una mano, targets ≥44px. 1280px con navegación lateral y contenido centrado.
- [ ] Todos los breakpoints en `layout.css`. Sin `100vh`. Sin `hover` fuera de `@media (hover:hover)`.
- [ ] `src/ui/` no importa `@supabase/supabase-js`; `src/data/` no toca el DOM.
- [ ] Las dos RPC nuevas/existentes son `security invoker` y tienen script de rollback.
- [ ] HOY, MEDIR y RECURSOS con la franja de ejemplo visible sin scrollear.
- [ ] `npm test` completo (44 tests) sin conexión a base.
- [ ] El aspecto es reconociblemente el del prototipo.
- [ ] Los archivos del prototipo en la raíz están borrados (y solo ahí).
