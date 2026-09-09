# Etapa 2A: Modelo de Datos y Capa de Acceso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the Supabase/Postgres schema and build the data-access layer so the CABB parser's output (Etapa 1, already merged) can become persisted records with lifelong per-player traceability — no UI, no Supabase deploy, no aggregate stats views.

**Architecture:** Three SQL migrations (schema, RLS, dev seed) plus a strict three-file split in `src/data/`: `mapearImportacion.js` is a pure function (no network, no Supabase, no IDs generated) that classifies parser output into ready-to-persist shapes; `repositorio.js` is the only module that calls Supabase, one thin function per operation; `cliente.js` builds the Supabase client from environment config. Also: 3 synthetic, committed `.xlsx` fixtures (the real ones stay out of git) covering the happy path plus the two edge-case bugs found in Etapa 1's review (`SIN_TOTALES`, `SIN_NOMBRE_EQUIPO`), which today are only tested via in-memory synthetic workbooks.

**Tech Stack:** Node.js (ES modules), `@supabase/supabase-js` (new dependency), `node:test`/`node:assert` for tests, plain SQL migrations (no ORM). Everything from Etapa 1 (`xlsx`, `src/parser/parserCabb.js`) is reused, untouched.

**Spec:** The full original Etapa 2A prompt (pasted by the user at the start of this conversation), plus `PARSER.md` at the repo root (the parser's output contract — read in full before this plan; every field name below matches it exactly) and Etapa 1's plan/history for context on what already exists.

## Global Constraints

- Stack: HTML/CSS/JS vanilla, ES modules, no build step. Supabase backend, Vercel deploy (deploy itself is out of scope here).
- **Multi-club from day one:** every domain table carries `club_id`, even where it would be derivable via a join (e.g. `pertenencia`, `estadistica_jugador_partido`) — this is what makes every RLS policy in this plan uniform and simple, and it is an explicit, non-negotiable decision from the spec, not a design choice made here.
- **Only the coach authenticates** (Supabase Auth, email+password). Players have no account in v1. `miembro_club(user_id, club_id, rol)` resolves permissions. RLS on every table: a user sees/writes only data of clubs where they're a member.
- **`jugador` is independent of category membership.** Membership lives in `pertenencia(jugador_id, plantel_id, temporada_id, desde, hasta)`. A player can belong to more than one `plantel` at once.
- **Player uniqueness is per club, not per category:** `UNIQUE(club_id, nombre_clave, desambiguador)`, `desambiguador text not null default ''`. This is what prevents a player called up from U17 to U21 from getting a duplicate profile — the single most expensive bug this schema exists to prevent.
- **No opposing-team player is ever persisted.** Only the match result: `partido.rival_nombre`, `puntos_propios`, `puntos_rival`.
- **Deduplication by file hash (SHA-256), with the CABB match ID as a secondary signal.** `importacion` stores `hash_archivo`, `id_partido_cabb` (nullable), `nombre_archivo`. `UNIQUE(club_id, hash_archivo)`.
- **Parser warnings are persisted:** `importacion.advertencias jsonb`.
- **`NULL`s are preserved.** A stat the parser couldn't read is `NULL`, never `0`.
- **CABB's category is a suggestion, never silent auto-assignment.** `plantel.codigo_cabb` (nullable) maps e.g. `U21M` to the club's internal `plantel` — resolving the mapping is Etapa 2B's job, not this one's.
- **`condicionPropia` ("local"/"visitante") is an explicit, required input to `mapearImportacion` — never inferred by comparing club-name strings.** An invalid value must produce a returned error, never a guess.
- Only new dependency allowed: `@supabase/supabase-js`. Anything else requires stopping and asking first.
- No credentials, keys, or project URLs in code or commits. `cliente.js` reads them from environment variables; `.env.example` documents the variable names with empty values.
- No real player data committed in any form, including seeds.
- Scope for this task: `supabase/`, `src/data/`, `tests/`, `package.json`, `.gitignore`, `.env.example`. Do **not** touch `src/parser/parserCabb.js` (if a parser bug appears, stop and report — don't fix it here), do not create UI/HTML/CSS, do not configure Vercel, do not write aggregate-stats views (Etapa 3).
- `mapearImportacion.js` must contain no occurrence of `supabase`, `fetch`, or `http` (verified by `grep`) — it must not import `node:crypto` either, since that would break future browser use; it uses the globally available Web Crypto API (`crypto.subtle`, present natively in Node ≥19 and in every browser) instead.

## Facts already verified before writing this plan (use these, don't re-derive)

- Current repo state: `main` at `45ae554`, clean, only `docs/` untracked. `package.json` currently has exactly one dependency (`xlsx`) and `"test": "node --test tests/parserCabb.test.js"`.
- `tests/parserCabb.test.js` currently has 16 tests, including two **in-memory-only** synthetic-workbook tests already covering `SIN_TOTALES` and `SIN_NOMBRE_EQUIPO` (added during Etapa 1's final review fix). This plan **adds** file-based versions of the same coverage using new, committed fixtures (per the spec's explicit ask) — it does not remove the existing in-memory tests, since more coverage of a previously-buggy code path is not redundant, it's cheap insurance.
- No local Postgres/Supabase CLI runtime is available in this environment to actually execute the migrations (Docker is installed but its daemon isn't running; user confirmed to proceed without live verification). The SQL in this plan was written and reviewed with extra care for exactly this reason, but running it against a real (even a fresh local) Postgres before considering Etapa 2A fully done is still recommended and is called out again in the Final Acceptance Checklist.
- The full `mapearImportacion` algorithm below (matching classification, hash dedup, `condicionPropia` validation, `requierePertenenciaNueva`) was hand-executed against 7 concrete scenarios (invalid `condicionPropia`, visitante-only mapping, exact match needing new `pertenencia` — the U17→U21 case, exact match already in the target `plantel`, no match at all, Levenshtein-distance match, same-surname match, hash-based dedup with a renamed "file") before this plan was written. All 7 passed. The synthetic-fixture generator was likewise run and its 3 outputs verified through the real `parsearPartidoCabb`/`tests/inspect.js` — all parse with the expected advertencias and zero cross-block contamination.
- `crypto.subtle.digest('SHA-256', ...)` works in this Node version (v22.14.0) without any import, including correctly handling a `Buffer` with a non-zero `byteOffset` into a shared underlying pool (verified directly — a naive `.buffer` pass-through without slicing by `byteOffset`/`byteLength` would silently hash the wrong bytes in that case).
- The spec's contexto shape typo `planteId` is treated as `plantelId` throughout this plan (matches `plantel` table and `plantelesActuales` elsewhere in the same spec).

## Task 1: Scaffold — dependency, env config, gitignore

**Files:**
- Modify: `package.json` (add `@supabase/supabase-js`, extend the test script)
- Create: `.env.example`
- Modify: `.gitignore` (add `.env`)

**Interfaces:**
- Produces: `npm test` running both `tests/parserCabb.test.js` and the new `tests/mapearImportacion.test.js` (created in Task 3).

- [ ] **Step 1: Update `package.json`**

```json
{
  "name": "app-formativa",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/parserCabb.test.js tests/mapearImportacion.test.js"
  },
  "dependencies": {
    "xlsx": "^0.18.5",
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

- [ ] **Step 2: Install and verify**

Run: `npm install`
Expected: `@supabase/supabase-js` added to `node_modules/` and `package-lock.json`, no unexpected errors (an `npm audit` note about `xlsx`'s pre-existing advisories, already documented in `PARSER.md`, is expected and not a new issue).

- [ ] **Step 3: Create `.env.example`**

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

- [ ] **Step 4: Update `.gitignore`**

Add `.env` as its own line (keep the existing `node_modules/` and `tests/fixtures/` lines):

```
node_modules/
tests/fixtures/
.env
```

- [ ] **Step 5: Verify**

Run: `cat package.json .env.example .gitignore` and `git status --short`
Expected: matches above; no `.env` file exists yet so nothing to ignore in practice, that's fine.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: add @supabase/supabase-js dependency and env config scaffold"
```

## Task 2: Supabase schema, RLS, dev seed, and ESQUEMA.md

**Files:**
- Create: `supabase/migrations/0001_esquema_inicial.sql`
- Create: `supabase/migrations/0002_rls.sql`
- Create: `supabase/migrations/0003_seed_dev.sql`
- Create: `supabase/ESQUEMA.md`

**Interfaces:**
- Produces: the table/column names every later task's SQL-facing code (`repositorio.js`) must match exactly.

- [ ] **Step 1: Write `supabase/migrations/0001_esquema_inicial.sql`**

```sql
-- Etapa 2A: esquema inicial.
--
-- Decisión de la Etapa 2A (no reabrir): TODA tabla de dominio lleva club_id,
-- incluso donde sería derivable por join (pertenencia vía jugador o plantel;
-- estadistica_jugador_partido vía partido). Esto es lo que permite que cada
-- política RLS en 0002_rls.sql sea el mismo patrón simple, sin joins profundos.
--
-- gen_random_uuid() es built-in desde PostgreSQL 13; pgcrypto se habilita
-- igual como red de seguridad para versiones más viejas de Postgres.
create extension if not exists pgcrypto;

create table club (
  id uuid primary key default gen_random_uuid(),
  nombre text not null
);

create table temporada (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  nombre text not null,
  unique (club_id, nombre)
);

create table plantel (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  temporada_id uuid not null references temporada(id),
  categoria text not null,
  -- Sugerencia de mapeo desde el título del parser (p.ej. "U21M"). Nunca se
  -- asigna sola: si no matchea, el import pregunta (Etapa 2B).
  codigo_cabb text,
  unique (club_id, temporada_id, categoria)
);

-- Un jugador es único por club, NUNCA por categoría/plantel — evita que un
-- citado de una categoría a otra genere un perfil duplicado y rompa la
-- trazabilidad de por vida que es la razón de ser de la app.
create table jugador (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  nombre_clave text not null,
  nombre_limpio text not null,
  desambiguador text not null default '',
  unique (club_id, nombre_clave, desambiguador)
);

create table pertenencia (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  jugador_id uuid not null references jugador(id),
  plantel_id uuid not null references plantel(id),
  temporada_id uuid not null references temporada(id),
  desde date not null,
  hasta date
);

-- Único mecanismo de autenticación/permisos: el entrenador. Los jugadores no
-- tienen cuenta en v1. La asignación de membresías es un acto administrativo
-- (ver 0002_rls.sql): no hay política de INSERT para el cliente autenticado.
create table miembro_club (
  user_id uuid not null references auth.users(id),
  club_id uuid not null references club(id),
  rol text not null,
  primary key (user_id, club_id)
);

create table importacion (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  hash_archivo text not null,
  id_partido_cabb text,
  nombre_archivo text not null,
  advertencias jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now(),
  -- Defensa principal contra reimportar el mismo archivo (sobrevive el
  -- renombrado, p.ej. un archivo reenviado por WhatsApp).
  unique (club_id, hash_archivo)
);

create table partido (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  plantel_id uuid not null references plantel(id),
  importacion_id uuid not null unique references importacion(id),
  -- El archivo de la CABB no trae fecha: la carga el entrenador en el import.
  fecha date not null,
  condicion_propia text not null check (condicion_propia in ('local', 'visitante')),
  -- Del rival sólo se guarda el nombre y el resultado — nunca sus jugadores.
  rival_nombre text,
  puntos_propios integer,
  puntos_rival integer,
  creado_en timestamptz not null default now()
);

create table estadistica_jugador_partido (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  partido_id uuid not null references partido(id) on delete cascade,
  jugador_id uuid not null references jugador(id),
  -- El número de camiseta va SOLO acá, nunca en jugador: cambia entre partidos.
  numero text,
  -- Nombre crudo del archivo para esta fila, para auditar contra el original.
  nombre_crudo text not null,
  min_segundos integer,
  pts integer,
  dos_anotados integer,
  dos_intentados integer,
  dos_porcentaje integer,
  tres_anotados integer,
  tres_intentados integer,
  tres_porcentaje integer,
  libres_anotados integer,
  libres_intentados integer,
  libres_porcentaje integer,
  reb_def integer,
  reb_of integer,
  reb_tot integer,
  ast integer,
  rec integer,
  per integer,
  tap_cometidos integer,
  tap_recibidos integer,
  fal_cometidas integer,
  fal_recibidas integer,
  val integer,
  mas_menos integer,
  creado_en timestamptz not null default now(),
  unique (partido_id, jugador_id)
);

-- Índices de apoyo: club_id es la columna que toda política RLS de 0002_rls.sql
-- usa para el join contra miembro_club; jugador_id/partido_id son los patrones
-- de lectura más comunes (historial de un jugador, planilla de un partido).
create index temporada_club_id_idx on temporada(club_id);
create index plantel_club_id_idx on plantel(club_id);
create index jugador_club_id_idx on jugador(club_id);
create index pertenencia_club_id_idx on pertenencia(club_id);
create index pertenencia_jugador_id_idx on pertenencia(jugador_id);
create index importacion_club_id_idx on importacion(club_id);
create index partido_club_id_idx on partido(club_id);
create index estadistica_club_id_idx on estadistica_jugador_partido(club_id);
create index estadistica_partido_id_idx on estadistica_jugador_partido(partido_id);
```

- [ ] **Step 2: Write `supabase/migrations/0002_rls.sql`**

```sql
-- Etapa 2A: Row Level Security.
--
-- Un usuario ve/edita únicamente lo de un club donde tiene una fila en
-- miembro_club. Como TODA tabla de dominio lleva club_id (0001), la misma
-- forma de política sirve para las nueve tablas sin excepción.

alter table club enable row level security;
alter table temporada enable row level security;
alter table plantel enable row level security;
alter table jugador enable row level security;
alter table pertenencia enable row level security;
alter table miembro_club enable row level security;
alter table importacion enable row level security;
alter table partido enable row level security;
alter table estadistica_jugador_partido enable row level security;

create policy club_miembros on club
  for all
  using (exists (select 1 from miembro_club m where m.club_id = club.id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = club.id and m.user_id = auth.uid()));

create policy temporada_miembros on temporada
  for all
  using (exists (select 1 from miembro_club m where m.club_id = temporada.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = temporada.club_id and m.user_id = auth.uid()));

create policy plantel_miembros on plantel
  for all
  using (exists (select 1 from miembro_club m where m.club_id = plantel.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = plantel.club_id and m.user_id = auth.uid()));

create policy jugador_miembros on jugador
  for all
  using (exists (select 1 from miembro_club m where m.club_id = jugador.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = jugador.club_id and m.user_id = auth.uid()));

create policy pertenencia_miembros on pertenencia
  for all
  using (exists (select 1 from miembro_club m where m.club_id = pertenencia.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = pertenencia.club_id and m.user_id = auth.uid()));

create policy importacion_miembros on importacion
  for all
  using (exists (select 1 from miembro_club m where m.club_id = importacion.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = importacion.club_id and m.user_id = auth.uid()));

create policy partido_miembros on partido
  for all
  using (exists (select 1 from miembro_club m where m.club_id = partido.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = partido.club_id and m.user_id = auth.uid()));

create policy estadistica_miembros on estadistica_jugador_partido
  for all
  using (exists (select 1 from miembro_club m where m.club_id = estadistica_jugador_partido.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = estadistica_jugador_partido.club_id and m.user_id = auth.uid()));

-- miembro_club es distinta: no tiene su propio club_id que apunte "hacia
-- afuera" de sí misma en el mismo sentido. Un usuario ve únicamente sus
-- propias filas de membresía. No hay política de insert/update/delete para
-- el cliente autenticado a propósito: dar de alta un entrenador en un club
-- es un acto administrativo (panel de Supabase o rol de servicio), nunca
-- algo que un usuario pueda hacerse a sí mismo.
create policy miembro_club_propio on miembro_club
  for select
  using (user_id = auth.uid());
```

- [ ] **Step 3: Write `supabase/migrations/0003_seed_dev.sql`**

```sql
-- Etapa 2A: datos de prueba para desarrollo local. NO son datos reales de
-- ningún club ni jugador — nombres e IDs inventados.
--
-- A propósito NO incluye filas de miembro_club: eso requiere un usuario real
-- de Supabase Auth. Después de correr esta seed, creá un usuario (signup
-- local) y agregá manualmente su fila, ver supabase/ESQUEMA.md.

insert into club (id, nombre) values
  ('00000000-0000-0000-0000-000000000001', 'Club de Prueba');

insert into temporada (id, club_id, nombre) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '2026');

insert into plantel (id, club_id, temporada_id, categoria, codigo_cabb) values
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'U21M', 'U21M'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'U17M', 'U17M');

insert into jugador (id, club_id, nombre_clave, nombre_limpio) values
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'PEREZ JUAN', 'PEREZ, JUAN'),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'GOMEZ LUIS', 'GOMEZ, LUIS');

insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '2026-03-01'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '2026-03-01');
```

- [ ] **Step 4: Manual review pass (no live DB available in this environment)**

Since there is no running Postgres/Docker in this environment, verify the SQL by careful manual reading instead of execution:
- Every `references` target table is defined earlier in the same file (no forward references).
- Every column used in a `unique (...)` or `check (...)` constraint exists in that same `create table`.
- Table and column names are consistent across all three files (grep for `estadistica_jugador_partido`, `miembro_club`, etc. across the 3 files and confirm no typos/mismatches).
- No column name collides with a reserved SQL keyword (`per`, `val`, `rol`, `desde`, `hasta` are all safe, unreserved identifiers in Postgres).

Note in the task report that live execution is still pending and should happen against a real (even local/free-tier) Supabase project before Etapa 2A is considered fully done — this is called out again in the plan's Final Acceptance Checklist.

- [ ] **Step 5: Write `supabase/ESQUEMA.md`**

```markdown
# ESQUEMA.md — Modelo de datos (Etapa 2A)

## Diagrama en texto

```
club (1) ──< temporada (1) ──< plantel >── (N) pertenencia >── (1) jugador
  │                                │                                  │
  │                                └──< partido                       │
  │                                        │                          │
  │                                        └──< estadistica_jugador_partido
  │                                                      │
  │                                                      └── (referencia) jugador
  │
  ├──< miembro_club >── auth.users
  └──< importacion ──(1:1)── partido
```

- Un `club` tiene muchas `temporada`s, cada `temporada` tiene muchos `plantel`es (uno por categoría).
- Un `jugador` pertenece a un `club` para siempre; su relación con un `plantel` en una `temporada` puntual vive en `pertenencia`, y puede tener varias a la vez (citado a más de una categoría).
- Un `partido` pertenece a un `plantel` (la categoría que jugó) y nace de exactamente una `importacion` (relación 1:1).
- `estadistica_jugador_partido` es la fila de planilla de un jugador propio en un partido puntual — el número de camiseta y el nombre crudo de ESE partido viven acá, no en `jugador`.

## Tablas

### `club`
El club. Multi-club desde el día uno aunque el piloto sea uno solo.
- `id`, `nombre`.

### `temporada`
Una temporada de un club (p.ej. "2026"). `unique(club_id, nombre)`.

### `plantel`
Un plantel: una categoría dentro de una temporada de un club (p.ej. "U21M 2026").
- `codigo_cabb`: mapeo sugerido desde la categoría que trae el título del parser (`U21M`, `U17M`, ...). Nunca se usa para asignar sola — si no matchea ningún plantel, el import (Etapa 2B) le pregunta al entrenador.
- `unique(club_id, temporada_id, categoria)`.

### `jugador`
**Decisión central del esquema:** único por `club_id` + `nombre_clave` + `desambiguador`, **nunca** por plantel/categoría.

Razón: si la unicidad fuera por plantel, un chico citado de U17 a U21 generaría dos perfiles de jugador distintos, y se rompería la trazabilidad de por vida que es la razón de existir de la app (el problema de negocio es la pérdida de memoria institucional cuando cambia el cuerpo técnico). `desambiguador` (default `''`) existe únicamente para el caso real de homónimos dentro del mismo club — lo resuelve el entrenador a mano, no el sistema.

El número de camiseta **no** vive acá — está verificado (Etapa 1) que cambia entre partidos para el mismo jugador, así que no es un dato de identidad.

### `pertenencia`
La membresía de un jugador a un plantel en una temporada, con rango `desde`/`hasta` (`hasta` NULL = vigente). Un jugador puede tener más de una pertenencia vigente a la vez (citado a dos categorías) — es el caso normal en inferiores, no una excepción.

### `miembro_club`
`(user_id, club_id, rol)`, PK compuesta. Resuelve permisos: sólo el entrenador se autentica (Supabase Auth, email+contraseña); los jugadores no tienen cuenta en v1.

### `importacion`
Un registro de "este archivo .xlsx se procesó". Guarda:
- `hash_archivo` (SHA-256 de los bytes del archivo): defensa **principal** contra reimportar el mismo partido — sobrevive el renombrado (p.ej. un archivo reenviado por WhatsApp con otro nombre tiene el mismo hash).
- `id_partido_cabb` (nullable): refuerzo secundario, viene del nombre de archivo real de la CABB cuando matchea el patrón (ver `PARSER.md`).
- `advertencias` (jsonb): las advertencias que devolvió el parser para este archivo. Sirven para dos cosas: detectar que la CABB cambió el formato de exportación, y (a futuro) mostrarle al entrenador qué tan confiable es una planilla.
- `unique(club_id, hash_archivo)`.

### `partido`
Un partido, siempre asociado a exactamente una `importacion` (`unique(importacion_id)`) y a un `plantel` (la categoría propia que jugó). No tiene fecha propia del archivo — el archivo de la CABB nunca trae fecha; la carga el entrenador al confirmar el import (Etapa 2B).
- `condicion_propia`: `'local'` o `'visitante'` — cuál de los dos bloques del archivo es el del club propio. Lo decide el entrenador en la pantalla de confirmación (Etapa 2B); nunca se infiere comparando nombres de club.
- `rival_nombre`, `puntos_propios`, `puntos_rival`: del bloque rival **no se guarda ningún jugador**, sólo esto. El nombre del rival es información pública de competencia; los `puntos_*` son nullable porque si el parser no pudo leer la fila `TOTALES` de ese bloque (advertencia `SIN_TOTALES`), el marcador real es "no se sabe", no `0`.

### `estadistica_jugador_partido`
Todo lo que trae el parser para un jugador **propio** en un partido: minutos en segundos, puntos, los tres tipos de tiro con anotados/intentados/porcentaje, rebotes, asistencias, recuperos, pérdidas, tapones cometidos/recibidos, faltas cometidas/recibidas, valoración y diferencial — cada campo numérico nullable de forma independiente, igual que en el contrato del parser (`PARSER.md`): un `NULL` significa "no se pudo leer", nunca se confunde con `0`.
- `numero`: el número de camiseta de ESE partido (nunca en `jugador`).
- `nombre_crudo`: el string exacto del archivo para esa fila, para poder auditar contra el original.
- `unique(partido_id, jugador_id)`: una sola fila de estadística por jugador por partido.

## Políticas RLS

Ver `migrations/0002_rls.sql`. Un usuario ve/edita únicamente filas cuyo `club_id` aparece en una fila de `miembro_club` con `user_id = auth.uid()`. Como toda tabla de dominio lleva `club_id` (decisión de la Etapa 2A), la política es literalmente la misma forma en las nueve tablas — sin excepciones ni casos especiales.

`miembro_club` es la única tabla sin esa forma de política: un usuario ve únicamente sus propias filas (`user_id = auth.uid()`), y **no existe política de insert/update/delete** para el cliente autenticado — dar de alta la membresía de un entrenador en un club es un acto administrativo, se hace desde el panel de Supabase o con un rol de servicio, nunca desde el cliente RLS-restringido. Para el piloto (un solo club, un puñado de entrenadores) esto es simple y suficiente; automatizar el alta de entrenadores es un problema de un estadio posterior del producto, no de esta etapa.

## Cómo probar localmente

1. `supabase/migrations/0003_seed_dev.sql` no crea ninguna fila de `miembro_club` porque requiere un `auth.users.id` real.
2. Levantar Supabase local (`npx supabase start`, requiere Docker corriendo), aplicar las 3 migraciones en orden.
3. Crear un usuario de prueba (signup por la Auth API o el Studio local).
4. Insertar a mano: `insert into miembro_club (user_id, club_id, rol) values ('<uuid del usuario creado>', '00000000-0000-0000-0000-000000000001', 'entrenador');`
5. Con ese usuario autenticado, confirmar que sólo ve las filas del "Club de Prueba" sembrado.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0001_esquema_inicial.sql supabase/migrations/0002_rls.sql supabase/migrations/0003_seed_dev.sql supabase/ESQUEMA.md
git commit -m "feat: add initial Supabase schema, RLS policies, and dev seed"
```

## Task 3: `mapearImportacion.js` (pure) and its tests

**Files:**
- Create: `src/data/mapearImportacion.js`
- Create: `tests/mapearImportacion.test.js`

**Interfaces:**
- Produces: `export function mapearImportacion(resultadoParser, contexto, jugadoresExistentes)`, `export function distanciaLevenshtein(a, b)`, `export async function calcularHashArchivo(datos)`, `export function esDuplicado(hash, hashesExistentes)`.
- Consumes: nothing from other Etapa 2A files — this task is fully self-contained. (It only relies on the parser's *output shape*, documented in `PARSER.md`, not on the parser module itself.)

- [ ] **Step 1: Write the failing tests**

Create `tests/mapearImportacion.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapearImportacion,
  distanciaLevenshtein,
  calcularHashArchivo,
  esDuplicado,
} from '../src/data/mapearImportacion.js';

function jugadorFicticio({ numero, nombreClave, nombreLimpio, pts = 10 }) {
  const [apellido, nombre] = nombreLimpio.split(',').map((s) => s.trim());
  return {
    fila: 1,
    numero,
    nombreCrudo: nombreLimpio,
    nombreLimpio,
    apellido,
    nombre: nombre ?? '',
    nombreClave,
    min: { texto: '10:00', segundos: 600 },
    pts,
    dos: { anotados: 1, intentados: 2, porcentaje: 50 },
    tres: { anotados: 0, intentados: 1, porcentaje: 0 },
    libres: { anotados: 2, intentados: 2, porcentaje: 100 },
    reb: { def: 1, of: 1, tot: 2 },
    ast: 1,
    rec: 1,
    per: 1,
    tap: { cometidos: 0, recibidos: 0 },
    fal: { cometidas: 1, recibidas: 1 },
    val: 5,
    masMenos: 2,
  };
}

function resultadoParserFicticio({
  localJugadores,
  visitanteJugadores,
  localTotales = { pts: 50 },
  visitanteTotales = { pts: 40 },
  localNombre = 'LOCAL FC',
  visitanteNombre = 'VISITANTE FC',
}) {
  return {
    errores: [],
    equipos: [
      { condicion: 'local', nombre: localNombre, filaNombre: 1, jugadores: localJugadores, totales: localTotales },
      { condicion: 'visitante', nombre: visitanteNombre, filaNombre: 1, jugadores: visitanteJugadores, totales: visitanteTotales },
    ],
  };
}

test('condicionPropia inválida devuelve error, no adivina', () => {
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [], visitanteJugadores: [] }),
    { condicionPropia: 'rival' },
    [],
  );
  assert.ok(r.error);
  assert.strictEqual(r.partido, null);
  assert.deepStrictEqual(r.estadisticas, []);
});

test('resultadoParser con errores no se mapea', () => {
  const resultado = resultadoParserFicticio({ localJugadores: [], visitanteJugadores: [] });
  resultado.errores = [{ fila: null, campo: null, mensaje: '[TITULO_INVALIDO] x' }];
  const r = mapearImportacion(resultado, { condicionPropia: 'local' }, []);
  assert.ok(r.error);
});

test('condicionPropia "visitante" no devuelve ni un jugador del bloque local', () => {
  const localJ = jugadorFicticio({ numero: '4', nombreClave: 'PEREZ LOCAL', nombreLimpio: 'PEREZ, LOCAL' });
  const visJ = jugadorFicticio({ numero: '5', nombreClave: 'GOMEZ VISITA', nombreLimpio: 'GOMEZ, VISITA' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [localJ], visitanteJugadores: [visJ] }),
    { condicionPropia: 'visitante', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    [],
  );
  assert.strictEqual(r.error, null);
  const clavesDevueltas = [
    ...r.estadisticas.map((e) => e.nombreClave),
    ...r.jugadoresNuevos.map((j) => j.nombreClave),
    ...r.jugadoresCoincidentes.map((j) => j.nombreClave),
    ...r.sugerencias.map((s) => s.nombreClave),
  ];
  assert.ok(!clavesDevueltas.includes('PEREZ LOCAL'), 'no debería aparecer ningún dato del jugador local');
  assert.ok(clavesDevueltas.includes('GOMEZ VISITA'));
  assert.strictEqual(r.partido.rivalNombre, 'LOCAL FC');
  assert.strictEqual(r.partido.puntosPropios, 40);
  assert.strictEqual(r.partido.puntosRival, 50);
});

test('jugador existente en el club pero no en el plantel importado: requierePertenenciaNueva, no jugadorNuevo (caso U17 -> U21)', () => {
  const jugadoresExistentes = [
    { id: 'jugador-1', nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN', plantelesActuales: ['plantel-u17'] },
  ];
  const archivoJ = jugadorFicticio({ numero: '10', nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [archivoJ], visitanteJugadores: [] }),
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'plantel-u21', temporadaId: 't1', fecha: '2026-05-01' },
    jugadoresExistentes,
  );
  assert.strictEqual(r.jugadoresNuevos.length, 0, 'NO debe aparecer como jugador nuevo');
  assert.strictEqual(r.jugadoresCoincidentes.length, 1);
  assert.strictEqual(r.jugadoresCoincidentes[0].jugadorId, 'jugador-1');
  assert.strictEqual(r.jugadoresCoincidentes[0].requierePertenenciaNueva, true);
  assert.deepStrictEqual(r.jugadoresCoincidentes[0].pertenenciaPropuesta, {
    plantelId: 'plantel-u21',
    temporadaId: 't1',
    desde: '2026-05-01',
  });
  assert.strictEqual(r.estadisticas[0].jugadorId, 'jugador-1');
});

test('jugador existente y ya en el plantel importado: requierePertenenciaNueva es false, sin propuesta', () => {
  const jugadoresExistentes = [
    { id: 'jugador-1', nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN', plantelesActuales: ['plantel-u21'] },
  ];
  const archivoJ = jugadorFicticio({ numero: '10', nombreClave: 'PEREZ JUAN', nombreLimpio: 'PEREZ, JUAN' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [archivoJ], visitanteJugadores: [] }),
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'plantel-u21', temporadaId: 't1', fecha: '2026-05-01' },
    jugadoresExistentes,
  );
  assert.strictEqual(r.jugadoresCoincidentes[0].requierePertenenciaNueva, false);
  assert.ok(!('pertenenciaPropuesta' in r.jugadoresCoincidentes[0]));
});

test('sin coincidencia alguna: jugadorNuevo, nunca se crea solo', () => {
  const archivoJ = jugadorFicticio({ numero: '99', nombreClave: 'ZZZZZ COMPLETAMENTE NUEVO', nombreLimpio: 'ZZZZZ, COMPLETAMENTE NUEVO' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [archivoJ], visitanteJugadores: [] }),
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    [],
  );
  assert.strictEqual(r.jugadoresNuevos.length, 1);
  assert.strictEqual(r.jugadoresNuevos[0].nombreClave, 'ZZZZZ COMPLETAMENTE NUEVO');
  assert.deepStrictEqual(r.jugadoresNuevos[0].pertenenciaPropuesta, { plantelId: 'p1', temporadaId: 't1', desde: '2026-05-01' });
  assert.strictEqual(r.jugadoresCoincidentes.length, 0);
  assert.strictEqual(r.sugerencias.length, 0);
  assert.strictEqual(r.estadisticas[0].jugadorId, null);
});

test('distanciaLevenshtein cuenta ediciones de a un caracter', () => {
  assert.strictEqual(distanciaLevenshtein('FERNANDEZ MARTIN', 'FERNANDEZ MARTIN'), 0);
  assert.strictEqual(distanciaLevenshtein('FERNANDEZ MARTIN', 'FERNANDEZ MARTIM'), 1);
});

test('coincidencia parcial por distancia <= 2 se devuelve como sugerencia, nunca se resuelve sola', () => {
  const jugadoresExistentes = [
    { id: 'jugador-2', nombreClave: 'FERNANDEZ MARTIN', nombreLimpio: 'FERNANDEZ, MARTIN', plantelesActuales: [] },
  ];
  const archivoJ = jugadorFicticio({ numero: '7', nombreClave: 'FERNANDEZ MARTIM', nombreLimpio: 'FERNANDEZ, MARTIM' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [archivoJ], visitanteJugadores: [] }),
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    jugadoresExistentes,
  );
  assert.strictEqual(r.sugerencias.length, 1);
  assert.strictEqual(r.sugerencias[0].candidato.jugadorId, 'jugador-2');
  assert.strictEqual(r.jugadoresNuevos.length, 0);
  assert.strictEqual(r.jugadoresCoincidentes.length, 0);
  assert.strictEqual(r.estadisticas[0].jugadorId, null, 'no se resuelve sola');
});

test('mismo apellido con nombre distinto se devuelve como sugerencia aunque la distancia total sea grande', () => {
  const jugadoresExistentes = [
    { id: 'jugador-3', nombreClave: 'GONZALEZ TOMAS', nombreLimpio: 'GONZALEZ, TOMAS', plantelesActuales: [] },
  ];
  const archivoJ = jugadorFicticio({ numero: '8', nombreClave: 'GONZALEZ FRANCISCO', nombreLimpio: 'GONZALEZ, FRANCISCO' });
  const r = mapearImportacion(
    resultadoParserFicticio({ localJugadores: [archivoJ], visitanteJugadores: [] }),
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    jugadoresExistentes,
  );
  assert.strictEqual(r.sugerencias.length, 1);
});

test('calcularHashArchivo: dos "archivos" con los mismos bytes y nombres distintos dan el mismo hash', async () => {
  const bytesOriginal = Buffer.from('contenido-de-un-xlsx-de-mentira');
  const bytesRenombrado = Buffer.from('contenido-de-un-xlsx-de-mentira');
  const hash1 = await calcularHashArchivo(bytesOriginal);
  const hash2 = await calcularHashArchivo(bytesRenombrado);
  assert.strictEqual(hash1, hash2);
  assert.strictEqual(esDuplicado(hash2, [hash1]), true);
  assert.strictEqual(esDuplicado('otro-hash-cualquiera', [hash1]), false);
});

test('calcularHashArchivo: contenidos distintos dan hashes distintos', async () => {
  const hashA = await calcularHashArchivo(Buffer.from('contenido A'));
  const hashB = await calcularHashArchivo(Buffer.from('contenido B'));
  assert.notStrictEqual(hashA, hashB);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/mapearImportacion.test.js`
Expected: FAIL — `Cannot find module '../src/data/mapearImportacion.js'`.

- [ ] **Step 3: Write `src/data/mapearImportacion.js`**

```js
const DISTANCIA_MAXIMA_SUGERENCIA = 2;

function extraerApellido(nombreLimpio) {
  const idx = nombreLimpio.indexOf(',');
  return idx === -1 ? nombreLimpio.trim() : nombreLimpio.slice(0, idx).trim();
}

export function distanciaLevenshtein(a, b) {
  const filas = a.length + 1;
  const columnas = b.length + 1;
  const dp = Array.from({ length: filas }, () => new Array(columnas).fill(0));
  for (let i = 0; i < filas; i++) dp[i][0] = i;
  for (let j = 0; j < columnas; j++) dp[0][j] = j;
  for (let i = 1; i < filas; i++) {
    for (let j = 1; j < columnas; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + costo,
      );
    }
  }
  return dp[filas - 1][columnas - 1];
}

// Web Crypto (crypto.subtle) en vez de node:crypto: disponible nativamente
// en Node >= 19 y en cualquier navegador, sin import — mapearImportacion.js
// debe seguir funcionando si algún día corre del lado del cliente.
export async function calcularHashArchivo(datos) {
  const bytes = datos instanceof ArrayBuffer
    ? datos
    : datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function esDuplicado(hash, hashesExistentes) {
  return hashesExistentes.includes(hash);
}

function mapearMetricas(jugadorArchivo) {
  return {
    numero: jugadorArchivo.numero,
    nombreCrudo: jugadorArchivo.nombreCrudo,
    nombreLimpio: jugadorArchivo.nombreLimpio,
    nombreClave: jugadorArchivo.nombreClave,
    minSegundos: jugadorArchivo.min ? jugadorArchivo.min.segundos : null,
    pts: jugadorArchivo.pts,
    dosAnotados: jugadorArchivo.dos.anotados,
    dosIntentados: jugadorArchivo.dos.intentados,
    dosPorcentaje: jugadorArchivo.dos.porcentaje,
    tresAnotados: jugadorArchivo.tres.anotados,
    tresIntentados: jugadorArchivo.tres.intentados,
    tresPorcentaje: jugadorArchivo.tres.porcentaje,
    libresAnotados: jugadorArchivo.libres.anotados,
    libresIntentados: jugadorArchivo.libres.intentados,
    libresPorcentaje: jugadorArchivo.libres.porcentaje,
    rebDef: jugadorArchivo.reb.def,
    rebOf: jugadorArchivo.reb.of,
    rebTot: jugadorArchivo.reb.tot,
    ast: jugadorArchivo.ast,
    rec: jugadorArchivo.rec,
    per: jugadorArchivo.per,
    tapCometidos: jugadorArchivo.tap.cometidos,
    tapRecibidos: jugadorArchivo.tap.recibidos,
    falCometidas: jugadorArchivo.fal.cometidas,
    falRecibidas: jugadorArchivo.fal.recibidas,
    val: jugadorArchivo.val,
    masMenos: jugadorArchivo.masMenos,
  };
}

function buscarCoincidenciaExacta(jugadorArchivo, jugadoresExistentes) {
  return jugadoresExistentes.find((j) => j.nombreClave === jugadorArchivo.nombreClave) ?? null;
}

function buscarSugerencia(jugadorArchivo, jugadoresExistentes) {
  const apellidoArchivo = extraerApellido(jugadorArchivo.nombreLimpio);
  let mejor = null;
  for (const existente of jugadoresExistentes) {
    if (existente.nombreClave === jugadorArchivo.nombreClave) continue;
    const distancia = distanciaLevenshtein(jugadorArchivo.nombreClave, existente.nombreClave);
    const mismoApellido = extraerApellido(existente.nombreLimpio) === apellidoArchivo;
    if (distancia > DISTANCIA_MAXIMA_SUGERENCIA && !mismoApellido) continue;
    if (!mejor || distancia < mejor.distancia) {
      mejor = { candidato: existente, distancia, mismoApellido };
    }
  }
  return mejor;
}

/**
 * Puro: sin red, sin Supabase, sin generar IDs. Clasifica la salida del
 * parser (ver PARSER.md) en datos listos para persistir. condicionPropia
 * ("local"|"visitante") es un dato que decide el entrenador — nunca se
 * infiere comparando nombres de club.
 */
export function mapearImportacion(resultadoParser, contexto, jugadoresExistentes) {
  const vacio = {
    error: null,
    partido: null,
    estadisticas: [],
    jugadoresNuevos: [],
    jugadoresCoincidentes: [],
    sugerencias: [],
  };

  if (contexto.condicionPropia !== 'local' && contexto.condicionPropia !== 'visitante') {
    return { ...vacio, error: `condicionPropia debe ser "local" o "visitante", se recibió ${JSON.stringify(contexto.condicionPropia)}` };
  }
  if (!resultadoParser || resultadoParser.errores.length > 0) {
    return { ...vacio, error: 'el resultado del parser tiene errores; no se puede mapear una importación a partir de un parseo incompleto' };
  }
  if (resultadoParser.equipos.length !== 2) {
    return { ...vacio, error: `se esperaban 2 equipos en el resultado del parser, se encontraron ${resultadoParser.equipos.length}` };
  }

  const equipoPropio = resultadoParser.equipos.find((e) => e.condicion === contexto.condicionPropia);
  const equipoRival = resultadoParser.equipos.find((e) => e.condicion !== contexto.condicionPropia);

  const partido = {
    clubId: contexto.clubId,
    plantelId: contexto.plantelId,
    fecha: contexto.fecha,
    condicionPropia: contexto.condicionPropia,
    rivalNombre: equipoRival.nombre,
    puntosPropios: equipoPropio.totales ? equipoPropio.totales.pts : null,
    puntosRival: equipoRival.totales ? equipoRival.totales.pts : null,
  };

  const pertenenciaPropuesta = { plantelId: contexto.plantelId, temporadaId: contexto.temporadaId, desde: contexto.fecha };

  const estadisticas = [];
  const jugadoresNuevos = [];
  const jugadoresCoincidentes = [];
  const sugerencias = [];

  for (const jugadorArchivo of equipoPropio.jugadores) {
    const metricas = mapearMetricas(jugadorArchivo);
    const exacto = buscarCoincidenciaExacta(jugadorArchivo, jugadoresExistentes);
    if (exacto) {
      const requierePertenenciaNueva = !exacto.plantelesActuales.includes(contexto.plantelId);
      jugadoresCoincidentes.push({
        jugadorId: exacto.id,
        nombreClave: jugadorArchivo.nombreClave,
        requierePertenenciaNueva,
        ...(requierePertenenciaNueva ? { pertenenciaPropuesta } : {}),
      });
      estadisticas.push({ ...metricas, jugadorId: exacto.id });
      continue;
    }

    const sugerencia = buscarSugerencia(jugadorArchivo, jugadoresExistentes);
    if (sugerencia) {
      sugerencias.push({
        nombreClave: jugadorArchivo.nombreClave,
        nombreLimpio: jugadorArchivo.nombreLimpio,
        candidato: {
          jugadorId: sugerencia.candidato.id,
          nombreClave: sugerencia.candidato.nombreClave,
          nombreLimpio: sugerencia.candidato.nombreLimpio,
        },
        razon: sugerencia.distancia <= DISTANCIA_MAXIMA_SUGERENCIA ? 'nombre_similar' : 'mismo_apellido',
      });
      estadisticas.push({ ...metricas, jugadorId: null });
      continue;
    }

    jugadoresNuevos.push({
      nombreClave: jugadorArchivo.nombreClave,
      nombreLimpio: jugadorArchivo.nombreLimpio,
      nombreCrudo: jugadorArchivo.nombreCrudo,
      pertenenciaPropuesta,
    });
    estadisticas.push({ ...metricas, jugadorId: null });
  }

  return { error: null, partido, estadisticas, jugadoresNuevos, jugadoresCoincidentes, sugerencias };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/mapearImportacion.test.js`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Verify purity**

Run: `grep -inE "supabase|fetch|http" src/data/mapearImportacion.js`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add src/data/mapearImportacion.js tests/mapearImportacion.test.js
git commit -m "feat: add pure mapearImportacion classification logic"
```

## Task 4: Synthetic fixtures + parser regression tests using them

**Files:**
- Create: `tests/generarFixturesSinteticos.js` (generator script, committed for reproducibility — not itself a test, not auto-run by `npm test`)
- Create: `tests/fixtures/sintetico/partido_ok.xlsx`
- Create: `tests/fixtures/sintetico/partido_sin_totales.xlsx`
- Create: `tests/fixtures/sintetico/partido_sin_nombre_equipo.xlsx`
- Modify: `tests/parserCabb.test.js` (add 3 tests using the new fixtures)
- Modify: `tests/mapearImportacion.test.js` (add 1 integration test: real parser output from `partido_ok.xlsx` feeding `mapearImportacion`)

**Interfaces:**
- Consumes: `parsearPartidoCabb` from `src/parser/parserCabb.js` (read-only — this task must not modify that file), `mapearImportacion` from Task 3.

- [ ] **Step 1: Write the generator script**

Create `tests/generarFixturesSinteticos.js`:

```js
import * as XLSX from 'xlsx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADER_ROW = ['Num.', 'Nombre', 'MIN', 'PTS', 'A/I', '%', 'A/I', '%', 'A/I', '%', 'DEF', 'OF', 'Tot.', 'AST', 'REC', 'PER', 'TC', 'TR', 'FC', 'FR', 'VAL', '+/-'];
const AGRUPADORES_ROW = ['', '', '', '', 'TC 2P', '', 'TC 3P', '', 'TL'];

// Nombres inventados, conservando la suciedad de formato real documentada en
// PARSER.md: espacio antes de coma, coma duplicada, apellido compuesto,
// doble espacio tras la coma, acentos y Ñ.
const JUGADORES_EQUIPO_A = [
  ['4', 'PÉREZ , FRANCO', '15:23', '8', '3/5', '60', '0/1', '0', '2/2', '100', '2', '1', '3', '2', '1', '0', '0', '0', '1', '2', '10', '4'],
  ['5', 'GONZÁLEZ, , MORENA', '12:10', '4', '2/4', '50', '0/0', '0', '0/0', '0', '1', '0', '1', '1', '0', '1', '0', '0', '0', '0', '4', '-1'],
  ['6', 'RODRÍGUEZ SOSA, VALENTINA ', '20:00', '12', '4/7', '57', '1/3', '33', '1/2', '50', '3', '2', '5', '0', '2', '1', '1', '0', '2', '1', '12', '6'],
];

const JUGADORES_EQUIPO_B = [
  ['7', 'FERNÁNDEZ,  IGNACIO', '18:45', '6', '2/3', '67', '0/2', '0', '2/2', '100', '2', '0', '2', '1', '1', '0', '0', '0', '0', '1', '6', '-3'],
  ['8', 'NÚÑEZ, ROCÍO', '10:00', '2', '1/2', '50', '0/0', '0', '0/0', '0', '0', '1', '1', '0', '0', '0', '0', '0', '0', '0', '2', '0'],
  ['9', 'MARTÍNEZ, LEANDRO', '22:30', '15', '5/9', '56', '1/4', '25', '2/2', '100', '4', '3', '7', '2', '0', '2', '0', '1', '2', '2', '15', '8'],
];

function sumarColumna(jugadores, indice, esFraccionAnotados) {
  return jugadores.reduce((acc, fila) => {
    const val = fila[indice];
    if (val.includes('/')) {
      const [anotados, intentados] = val.split('/').map(Number);
      return acc + (esFraccionAnotados ? anotados : intentados);
    }
    return acc + Number(val);
  }, 0);
}

function construirFilaTotales(jugadores) {
  const minTotal = jugadores.reduce((acc, f) => {
    const [m, s] = f[2].split(':').map(Number);
    return acc + m * 60 + s;
  }, 0);
  const minTexto = `${String(Math.floor(minTotal / 60)).padStart(2, '0')}:${String(minTotal % 60).padStart(2, '0')}`;
  const dosAn = sumarColumna(jugadores, 4, true), dosInt = sumarColumna(jugadores, 4, false);
  const tresAn = sumarColumna(jugadores, 6, true), tresInt = sumarColumna(jugadores, 6, false);
  const libAn = sumarColumna(jugadores, 8, true), libInt = sumarColumna(jugadores, 8, false);
  return [
    '', 'TOTALES', minTexto,
    String(sumarColumna(jugadores, 3)),
    `${dosAn}/${dosInt}`, String(dosInt ? Math.round((dosAn / dosInt) * 100) : 0),
    `${tresAn}/${tresInt}`, String(tresInt ? Math.round((tresAn / tresInt) * 100) : 0),
    `${libAn}/${libInt}`, String(libInt ? Math.round((libAn / libInt) * 100) : 0),
    String(sumarColumna(jugadores, 10)), String(sumarColumna(jugadores, 11)), String(sumarColumna(jugadores, 12)),
    String(sumarColumna(jugadores, 13)), String(sumarColumna(jugadores, 14)), String(sumarColumna(jugadores, 15)),
    String(sumarColumna(jugadores, 16)), String(sumarColumna(jugadores, 17)),
    String(sumarColumna(jugadores, 18)), String(sumarColumna(jugadores, 19)),
    String(sumarColumna(jugadores, 20)), String(sumarColumna(jugadores, 21)),
  ];
}

function construirLibro({ omitirTotalesA = false, omitirNombreB = false } = {}) {
  const aoa = [
    [],
    ['', '', 'CONFEDERACIÓN ARGENTINA DE BASQUETBOL'],
    [],
    [],
    ['Estadísticas - EQUIPO SINTÉTICO A vs EQUIPO SINTÉTICO B - U21M - LIGA SINTETICA DE PRUEBA 2026 - CABB - 2026'],
    [],
    [],
    [],
    ['TOTALES'],
    [],
    ['EQUIPO SINTÉTICO A'],
    AGRUPADORES_ROW,
    HEADER_ROW,
    ...JUGADORES_EQUIPO_A,
  ];
  if (!omitirTotalesA) aoa.push(construirFilaTotales(JUGADORES_EQUIPO_A));
  aoa.push([], []);
  if (!omitirNombreB) aoa.push(['EQUIPO SINTÉTICO B']);
  aoa.push(AGRUPADORES_ROW, HEADER_ROW, ...JUGADORES_EQUIPO_B, construirFilaTotales(JUGADORES_EQUIPO_B));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Estadísticas-');
  return wb;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'fixtures', 'sintetico');

XLSX.writeFile(construirLibro({}), path.join(outDir, 'partido_ok.xlsx'));
XLSX.writeFile(construirLibro({ omitirTotalesA: true }), path.join(outDir, 'partido_sin_totales.xlsx'));
XLSX.writeFile(construirLibro({ omitirNombreB: true }), path.join(outDir, 'partido_sin_nombre_equipo.xlsx'));

console.log('Generados en', outDir);
```

- [ ] **Step 2: Run the generator and verify its output manually**

```bash
mkdir -p tests/fixtures/sintetico
node tests/generarFixturesSinteticos.js
node tests/inspect.js tests/fixtures/sintetico/partido_ok.xlsx
node tests/inspect.js tests/fixtures/sintetico/partido_sin_totales.xlsx
node tests/inspect.js tests/fixtures/sintetico/partido_sin_nombre_equipo.xlsx
```

Expected:
- `partido_ok.xlsx`: 0 errores, 0 advertencias, both teams' rosters fully readable, dirty names cleaned correctly (e.g. `PÉREZ , FRANCO` → `PÉREZ, FRANCO`, `GONZÁLEZ, , MORENA` → `GONZÁLEZ, MORENA`).
- `partido_sin_totales.xlsx`: `EQUIPO SINTÉTICO A`'s `totales` missing, a `SIN_TOTALES` advertencia, `EQUIPO SINTÉTICO B` fully intact with its own name/players/totales (no cross-contamination).
- `partido_sin_nombre_equipo.xlsx`: second team's `nombre` is `null`, a `SIN_NOMBRE_EQUIPO` advertencia, but its actual players (`FERNÁNDEZ`, `NÚÑEZ`, `MARTÍNEZ`) are still correctly isolated from team A's players.

This exact generator and these exact 3 assertions were already run once while writing this plan — this step is a repeat-and-confirm, not exploratory.

- [ ] **Step 3: Add 3 tests to `tests/parserCabb.test.js`**

Append (these are NOT gated by `SKIP_SIN_FIXTURES` — the sintetico fixtures are always committed to the repo, unlike the real ones):

```js
const fixtureSintetico = (nombre) => readFileSync(path.join(__dirname, 'fixtures', 'sintetico', nombre));

test('fixture sintético partido_ok.xlsx parsea sin errores ni advertencias', () => {
  const resultado = parsearPartidoCabb(fixtureSintetico('partido_ok.xlsx'), 'partido_ok.xlsx');
  assert.deepStrictEqual(resultado.errores, []);
  assert.deepStrictEqual(resultado.advertencias, []);
  assert.strictEqual(resultado.equipos.length, 2);
  assert.strictEqual(resultado.equipos[0].jugadores.length, 3);
  assert.strictEqual(resultado.equipos[1].jugadores.length, 3);
});

test('fixture sintético partido_sin_totales.xlsx: advertencia SIN_TOTALES, sin mezclar datos entre bloques', () => {
  const resultado = parsearPartidoCabb(fixtureSintetico('partido_sin_totales.xlsx'), 'partido_sin_totales.xlsx');
  const equipoA = resultado.equipos.find((e) => e.nombre === 'EQUIPO SINTÉTICO A');
  const equipoB = resultado.equipos.find((e) => e.nombre === 'EQUIPO SINTÉTICO B');
  assert.ok(equipoA);
  assert.ok(equipoB);
  assert.strictEqual(equipoA.totales, null);
  assert.strictEqual(equipoA.jugadores.length, 3);
  assert.strictEqual(equipoB.totales.pts, 23, 'el segundo equipo no debería verse afectado');
  assert.strictEqual(equipoB.jugadores.length, 3);
  assert.ok(resultado.advertencias.some((a) => a.mensaje.includes('SIN_TOTALES')));
});

test('fixture sintético partido_sin_nombre_equipo.xlsx: advertencia SIN_NOMBRE_EQUIPO, sin mezclar datos entre bloques', () => {
  const resultado = parsearPartidoCabb(fixtureSintetico('partido_sin_nombre_equipo.xlsx'), 'partido_sin_nombre_equipo.xlsx');
  assert.strictEqual(resultado.equipos.length, 2);
  const equipoA = resultado.equipos[0];
  const equipoB = resultado.equipos[1];
  assert.strictEqual(equipoA.nombre, 'EQUIPO SINTÉTICO A');
  assert.strictEqual(equipoA.jugadores.length, 3);
  assert.strictEqual(equipoB.condicion, 'visitante');
  assert.strictEqual(equipoB.nombre, null);
  assert.strictEqual(equipoB.jugadores.length, 3, 'los jugadores del segundo equipo deben seguir siendo los suyos, no los del primero');
  assert.deepStrictEqual(equipoB.jugadores.map((j) => j.apellido), ['FERNÁNDEZ', 'NÚÑEZ', 'MARTÍNEZ']);
  assert.ok(resultado.advertencias.some((a) => a.mensaje.includes('SIN_NOMBRE_EQUIPO')));
});
```

- [ ] **Step 4: Add 1 integration test to `tests/mapearImportacion.test.js`**

Append (needs new imports at the top: add `import { readFileSync } from 'node:fs';`, `import path from 'node:path';`, `import { fileURLToPath } from 'node:url';`, `import { parsearPartidoCabb } from '../src/parser/parserCabb.js';` alongside the existing imports):

```js
const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('integración: la salida real del parser sobre partido_ok.xlsx se mapea sin error', () => {
  const datos = readFileSync(path.join(__dirname, 'fixtures', 'sintetico', 'partido_ok.xlsx'));
  const resultadoParser = parsearPartidoCabb(datos, 'partido_ok.xlsx');
  assert.deepStrictEqual(resultadoParser.errores, []);

  const r = mapearImportacion(
    resultadoParser,
    { condicionPropia: 'local', clubId: 'c1', plantelId: 'p1', temporadaId: 't1', fecha: '2026-05-01' },
    [],
  );
  assert.strictEqual(r.error, null);
  assert.strictEqual(r.partido.rivalNombre, 'EQUIPO SINTÉTICO B');
  assert.strictEqual(r.partido.puntosPropios, 24);
  assert.strictEqual(r.partido.puntosRival, 23);
  assert.strictEqual(r.estadisticas.length, 3);
  assert.strictEqual(r.jugadoresNuevos.length, 3, 'club vacío: los 3 jugadores propios son nuevos');
});
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all tests from Tasks 3 and 4 green, plus the 16 pre-existing `parserCabb.test.js` tests untouched and still green.

- [ ] **Step 6: Confirm `src/parser/parserCabb.js` was not touched**

Run: `git status --short src/parser/`
Expected: no output (clean — this task must never modify the parser).

- [ ] **Step 7: Commit**

```bash
git add tests/generarFixturesSinteticos.js tests/fixtures/sintetico/ tests/parserCabb.test.js tests/mapearImportacion.test.js
git commit -m "test: add committed synthetic xlsx fixtures and regression tests for SIN_TOTALES/SIN_NOMBRE_EQUIPO"
```

## Task 5: `repositorio.js` and `cliente.js`

**Files:**
- Create: `src/data/cliente.js`
- Create: `src/data/repositorio.js`

**Interfaces:**
- Consumes: table/column names from Task 2's migrations, `@supabase/supabase-js` from Task 1.
- No automated tests required for this task (per scope: `npm test` must pass without a DB connection, and this file's entire job is talking to a DB) — verify by careful reading against the Task 2 schema instead.

- [ ] **Step 1: Write `src/data/cliente.js`**

```js
import { createClient } from '@supabase/supabase-js';

function leerVariableEntorno(nombre) {
  if (typeof process !== 'undefined' && process.env && process.env[nombre]) {
    return process.env[nombre];
  }
  if (typeof window !== 'undefined' && window[nombre]) {
    return window[nombre];
  }
  return undefined;
}

export function crearClienteSupabase() {
  const url = leerVariableEntorno('SUPABASE_URL');
  const anonKey = leerVariableEntorno('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    throw new Error('Faltan las variables de entorno SUPABASE_URL / SUPABASE_ANON_KEY');
  }
  return createClient(url, anonKey);
}
```

- [ ] **Step 2: Write `src/data/repositorio.js`**

```js
import { crearClienteSupabase } from './cliente.js';

let clienteCache = null;
function obtenerCliente() {
  if (!clienteCache) clienteCache = crearClienteSupabase();
  return clienteCache;
}

export async function obtenerJugadoresDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('jugador')
    .select('id, nombre_clave, nombre_limpio, pertenencia(plantel_id, hasta)')
    .eq('club_id', clubId);
  if (error) throw error;
  return data.map((fila) => ({
    id: fila.id,
    nombreClave: fila.nombre_clave,
    nombreLimpio: fila.nombre_limpio,
    plantelesActuales: fila.pertenencia.filter((p) => p.hasta === null).map((p) => p.plantel_id),
  }));
}

export async function buscarImportacionPorHash(clubId, hashArchivo) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('importacion')
    .select('id, nombre_archivo, id_partido_cabb')
    .eq('club_id', clubId)
    .eq('hash_archivo', hashArchivo)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function crearImportacion({ clubId, hashArchivo, idPartidoCabb, nombreArchivo, advertencias }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('importacion')
    .insert({
      club_id: clubId,
      hash_archivo: hashArchivo,
      id_partido_cabb: idPartidoCabb,
      nombre_archivo: nombreArchivo,
      advertencias,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function crearPartido({ clubId, plantelId, importacionId, fecha, condicionPropia, rivalNombre, puntosPropios, puntosRival }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('partido')
    .insert({
      club_id: clubId,
      plantel_id: plantelId,
      importacion_id: importacionId,
      fecha,
      condicion_propia: condicionPropia,
      rival_nombre: rivalNombre,
      puntos_propios: puntosPropios,
      puntos_rival: puntosRival,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function crearJugador({ clubId, nombreClave, nombreLimpio, desambiguador = '' }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('jugador')
    .insert({ club_id: clubId, nombre_clave: nombreClave, nombre_limpio: nombreLimpio, desambiguador })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function crearPertenencia({ clubId, jugadorId, plantelId, temporadaId, desde }) {
  const supabase = obtenerCliente();
  const { error } = await supabase
    .from('pertenencia')
    .insert({ club_id: clubId, jugador_id: jugadorId, plantel_id: plantelId, temporada_id: temporadaId, desde });
  if (error) throw error;
}

export async function crearEstadisticas(clubId, partidoId, estadisticas) {
  const supabase = obtenerCliente();
  const filas = estadisticas.map((e) => ({
    club_id: clubId,
    partido_id: partidoId,
    jugador_id: e.jugadorId,
    numero: e.numero,
    nombre_crudo: e.nombreCrudo,
    min_segundos: e.minSegundos,
    pts: e.pts,
    dos_anotados: e.dosAnotados,
    dos_intentados: e.dosIntentados,
    dos_porcentaje: e.dosPorcentaje,
    tres_anotados: e.tresAnotados,
    tres_intentados: e.tresIntentados,
    tres_porcentaje: e.tresPorcentaje,
    libres_anotados: e.libresAnotados,
    libres_intentados: e.libresIntentados,
    libres_porcentaje: e.libresPorcentaje,
    reb_def: e.rebDef,
    reb_of: e.rebOf,
    reb_tot: e.rebTot,
    ast: e.ast,
    rec: e.rec,
    per: e.per,
    tap_cometidos: e.tapCometidos,
    tap_recibidos: e.tapRecibidos,
    fal_cometidas: e.falCometidas,
    fal_recibidas: e.falRecibidas,
    val: e.val,
    mas_menos: e.masMenos,
  }));
  const { error } = await supabase.from('estadistica_jugador_partido').insert(filas);
  if (error) throw error;
}
```

- [ ] **Step 3: Verify column-name consistency against Task 2's schema**

Run: `grep -oE "'[a-z_]+'" src/data/repositorio.js | sort -u` and cross-check every snake_case name against `supabase/migrations/0001_esquema_inicial.sql`'s actual column names (e.g. `dos_anotados`, `reb_def`, `mas_menos`, `tap_cometidos` — every field name used in `crearEstadisticas`'s row-shaping must exist verbatim in that migration).

Run: `npm test`
Expected: still all passing (this task adds no tests but must not break existing ones — confirms `repositorio.js`/`cliente.js` don't accidentally get picked up by the test runner or break an import elsewhere).

- [ ] **Step 4: Commit**

```bash
git add src/data/cliente.js src/data/repositorio.js
git commit -m "feat: add thin Supabase repository layer and client factory"
```

## Final Acceptance Checklist

- [ ] Migrations reviewed line-by-line for forward-reference and naming consistency (no live Postgres available in this environment — running them against a real/local Supabase project before considering Etapa 2A fully done is a recommended follow-up, not optional busywork).
- [ ] RLS enabled on all 9 domain tables; `miembro_club` has no client-facing write policy.
- [ ] `grep -inE "supabase|fetch|http" src/data/mapearImportacion.js` returns nothing.
- [ ] `condicionPropia: "visitante"` test confirms zero local-block leakage.
- [ ] U17→U21 test confirms `requierePertenenciaNueva`, never `jugadorNuevo`.
- [ ] Hash-based duplicate-detection test passes.
- [ ] All 3 synthetic fixtures exist, are committed, and their tests pass.
- [ ] `npm test` passes with the real fixtures absent and with no DB connection.
- [ ] `supabase/ESQUEMA.md` documents every table, every one of the 9 decisions with its reasoning, and the RLS policies.
- [ ] No credential appears anywhere in the repository (`git grep`-style check on `.env`, any hardcoded URL/key in `cliente.js`).
