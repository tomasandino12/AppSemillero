# Etapa 5 — Biblioteca de ejercicios — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una biblioteca de ejercicios del club, compartida entre entrenadores, donde cargar cueste dos campos y donde quede registrado qué pasó al usar cada ejercicio.

**Architecture:** Tres tablas nuevas con RLS de club, más una policy de autor para que sólo el que cargó algo pueda editarlo o borrarlo. La biblioteca vive como una segunda pestaña dentro de RECURSOS, sin tocar la navegación. Ninguna operación escribe más de una fila, así que no hay RPC nueva: mandar un ejercicio a varios jugadores reusa `guardar_recurso` sin modificarla.

**Tech Stack:** HTML/CSS/JS vanilla, ES modules nativos, sin build step, sin frameworks, sin librerías de gráficos. Supabase. `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-06-etapa-5-biblioteca-ejercicios-design.md`

## Global Constraints

- **No se toca `src/parser/parserCabb.js`.**
- **No se tocan las migraciones `0001`–`0014`.** La nueva es `0015`.
- **No se modifica `guardar_recurso` (`0011`)** ni ninguna función existente de `repositorio.js`: sólo se agregan al final.
- **No se toca la lógica del import:** `mapearImportacion.js`, `prepararPayloadImportacion.js`, `confirmacionImport.js`, `resultadoImport.js`, `retornoImport.js`.
- **No se toca `miembro_club` ni su policy.** Es deliberadamente restrictiva.
- **Sólo `titulo` y `tema` son obligatorios.** Ningún otro campo puede volverse requerido.
- **El texto del profe se guarda tal cual**, sin transformar, recortar ni normalizar.
- **Ningún dato de jugador dentro de un ejercicio.**
- Ningún archivo de `src/ui/` importa `@supabase/supabase-js` ni llama a `fetch`.
- Ningún archivo de `src/data/` toca el DOM.
- Ningún breakpoint de ancho (`min-width` dentro de un `@media`) fuera de `layout.css`.
- Sólo tokens que existan en `public/css/tokens.css`. Los de tamaño son `--fs-100, 115, 125, 135, 145, 160, 170, 190, 200, 220, 230, 250, 260, 300`. Ningún hex suelto.
- Sin dependencias nuevas, sin frameworks, sin build steps, sin IA, sin funciones de servidor.
- Todo el texto de interfaz en castellano rioplatense.
- Cada task termina con `npm test` en verde y un commit.

---

## Estructura de archivos

```
supabase/migrations/
  0015_biblioteca_ejercicios.sql   Task 1   3 tablas + RLS + policy de autor + grants

src/data/
  temas.js                Task 2   TEMAS (editable) + validarTema
  repositorio.js          Task 3   SÓLO se agregan funciones al final

src/ui/
  perfil.js               Task 4   nombre del entrenador: leer, cachear, pedirlo una vez
  pantallas/recursos.js   Task 5   se parte en dos pestañas, sin cambiar Jugadores
  pantallas/ejercicios.js Tasks 6, 7   lista, filtro por tema, alta
  pantallas/ejercicio.js  Tasks 8, 9, 10  detalle, notas, editar, enviar
  pantallas/registro.js   Task 8   + p-ejercicio

public/index.html         Task 8   + sección p-ejercicio
public/css/componentes.css Tasks 5-10  clases nuevas, siempre append

tests/
  temas.test.js           Task 2
```

**Archivos que tocan varias tasks** — `repositorio.js`, `componentes.css`, `ejercicios.js`, `ejercicio.js`. En todos: **agregar, nunca reescribir**.

**No hay RPC nueva en esta etapa**, así que tampoco hay script de rollback. Es correcto: un ejercicio y una nota son una fila cada uno, y la única escritura multi-fila (mandar a varios jugadores) usa `guardar_recurso`, que ya tiene el suyo (`tests/verificarRecurso.js`).

---

## Task 1: Migración de la biblioteca

**Modelo sugerido:** capaz — es esquema, y la policy de autor es la primera del proyecto que distingue dentro de un club.

**Files:**
- Create: `supabase/migrations/0015_biblioteca_ejercicios.sql`

**Interfaces:**
- Produces: las tablas `perfil_entrenador`, `ejercicio`, `nota_ejercicio`, que consume la Task 3.

- [ ] **Step 1: Escribir la migración**

Seguí las convenciones de `0001_esquema_inicial.sql` (FKs compuestas), `0002_rls.sql` (forma de las policies) y `0006_grants_authenticated.sql` (grants).

```sql
-- Etapa 5: biblioteca de ejercicios del club.
--
-- Lo que esto resuelve, dicho por un entrenador del club: "me acuerdo que
-- salió mal y por qué, pero no queda registrado", y sobre si los otros profes
-- saben qué ejercicios usa, "no, no tienen idea". El valor está en compartir y
-- en registrar qué pasó al usar algo, no en archivar para buscar.

-- El nombre del entrenador, para poder mostrar autoría.
--
-- Tabla propia y no una columna en miembro_club: la policy de miembro_club es
-- `user_id = auth.uid()`, o sea que un profe no puede leer NI SIQUIERA la fila
-- de membresía de otro. Agregarle un nombre no habría alcanzado, y ampliar esa
-- policy es tocar la seguridad de una tabla existente que es restrictiva a
-- propósito.
create table perfil_entrenador (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  user_id uuid not null references auth.users(id),
  nombre text not null,
  creado_en timestamptz not null default now(),
  unique (club_id, user_id)
);

create table ejercicio (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  titulo text not null,
  -- SIN check a propósito: la lista de temas vive en src/data/temas.js y tiene
  -- que poder editarse sin una migración. Un check la ataría a una migración
  -- cada vez que alguien quiera agregar "transición". Se valida en la app.
  tema text not null,
  -- Todo lo demás opcional: el que carga no es el que recibe el beneficio, y
  -- una función que pide esfuerzo hoy a cambio de un beneficio ajeno y futuro
  -- se abandona rápido. Dos campos obligatorios, ni uno más.
  --
  -- Texto libre y no números: "6 a 12 jugadores" es la respuesta real de un
  -- profe. `categorias` tampoco es FK a plantel — el entrenador entrevistado
  -- trabaja premini, mini y sub-13, que hoy no existen como planteles.
  descripcion text,
  enlace text,
  material text,
  jugadores text,
  categorias text,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- Target de la FK compuesta de nota_ejercicio.
  unique (club_id, id)
);

create table nota_ejercicio (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  ejercicio_id uuid not null,
  texto text not null,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  -- FK compuesta: club_id tiene que coincidir con el del ejercicio, no sólo
  -- existir (ver el comentario de plantel en 0001).
  foreign key (club_id, ejercicio_id) references ejercicio (club_id, id) on delete cascade
);

create index perfil_entrenador_club_id_idx on perfil_entrenador(club_id);
create index ejercicio_club_id_idx on ejercicio(club_id);
create index ejercicio_tema_idx on ejercicio(tema);
create index nota_ejercicio_club_id_idx on nota_ejercicio(club_id);
create index nota_ejercicio_ejercicio_id_idx on nota_ejercicio(ejercicio_id);

alter table perfil_entrenador enable row level security;
alter table ejercicio enable row level security;
alter table nota_ejercicio enable row level security;

-- Perfil: todos los del club se leen entre sí — sin eso la autoría no se puede
-- mostrar, que es el punto. Pero cada uno escribe SÓLO el suyo.
create policy perfil_entrenador_leer on perfil_entrenador
  for select
  using (exists (select 1 from miembro_club m where m.club_id = perfil_entrenador.club_id and m.user_id = auth.uid()));

create policy perfil_entrenador_propio on perfil_entrenador
  for all
  using (user_id = auth.uid() and exists (select 1 from miembro_club m where m.club_id = perfil_entrenador.club_id and m.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists (select 1 from miembro_club m where m.club_id = perfil_entrenador.club_id and m.user_id = auth.uid()));

-- Ejercicios y notas: los ve y los crea cualquiera del club, pero editar y
-- borrar es sólo de quien lo cargó. Va en la base y no en la UI: una guarda de
-- interfaz no es una garantía.
create policy ejercicio_leer on ejercicio
  for select
  using (exists (select 1 from miembro_club m where m.club_id = ejercicio.club_id and m.user_id = auth.uid()));

create policy ejercicio_crear on ejercicio
  for insert
  with check (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = ejercicio.club_id and m.user_id = auth.uid()));

create policy ejercicio_editar_lo_propio on ejercicio
  for update
  using (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = ejercicio.club_id and m.user_id = auth.uid()))
  with check (creado_por = auth.uid());

create policy ejercicio_borrar_lo_propio on ejercicio
  for delete
  using (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = ejercicio.club_id and m.user_id = auth.uid()));

create policy nota_leer on nota_ejercicio
  for select
  using (exists (select 1 from miembro_club m where m.club_id = nota_ejercicio.club_id and m.user_id = auth.uid()));

create policy nota_crear on nota_ejercicio
  for insert
  with check (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = nota_ejercicio.club_id and m.user_id = auth.uid()));

create policy nota_borrar_lo_propio on nota_ejercicio
  for delete
  using (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = nota_ejercicio.club_id and m.user_id = auth.uid()));

-- Postgres exige el GRANT de tabla ADEMÁS de la policy de RLS (ver 0006).
grant select, insert, update, delete on
  perfil_entrenador,
  ejercicio,
  nota_ejercicio
to authenticated;
```

- [ ] **Step 2: Verificar que no se tocó ninguna migración existente**

```bash
git status --short supabase/migrations/
```
Expected: exactamente una línea, `?? supabase/migrations/0015_biblioteca_ejercicios.sql`.

- [ ] **Step 3: `npm test` y commit**

```bash
npm test
git add supabase/migrations/0015_biblioteca_ejercicios.sql
git commit -m "feat: add exercise library tables with per-author write policies"
```

---

## Task 2: Los temas

**Modelo sugerido:** barato — el código está entero acá.

**Files:**
- Create: `src/data/temas.js`
- Create: `tests/temas.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `TEMAS` (array de `{id, nombre}`), `nombreDeTema(id)`, `esTemaValido(id)`.

- [ ] **Step 1: Escribir el test que falla**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMAS, nombreDeTema, esTemaValido } from '../src/data/temas.js';

test('hay una lista corta de temas, cada uno con id y nombre', () => {
  assert.ok(TEMAS.length >= 5 && TEMAS.length <= 12, 'la lista tiene que ser corta');
  for (const t of TEMAS) {
    assert.equal(typeof t.id, 'string');
    assert.equal(typeof t.nombre, 'string');
    assert.ok(t.id.length && t.nombre.length);
  }
});

test('los ids de tema no se repiten', () => {
  assert.equal(new Set(TEMAS.map((t) => t.id)).size, TEMAS.length);
});

test('esTemaValido acepta lo que está en la lista y rechaza el resto', () => {
  assert.equal(esTemaValido(TEMAS[0].id), true);
  assert.equal(esTemaValido('no_existe'), false);
  assert.equal(esTemaValido(''), false);
  assert.equal(esTemaValido(null), false);
  assert.equal(esTemaValido(undefined), false);
});

test('nombreDeTema devuelve el nombre, y el id crudo si no lo conoce', () => {
  assert.equal(nombreDeTema(TEMAS[0].id), TEMAS[0].nombre);
  // Un tema viejo guardado en la base cuando la lista era otra no puede
  // desaparecer de la pantalla: se muestra su id antes que nada.
  assert.equal(nombreDeTema('tema_viejo'), 'tema_viejo');
  assert.equal(nombreDeTema(null), '');
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test tests/temas.test.js`
Expected: FAIL — `Cannot find module '.../src/data/temas.js'`.

- [ ] **Step 3: Escribir `src/data/temas.js`**

```js
/**
 * Los temas de un ejercicio.
 *
 * La unidad de planificación real del entrenador es el tema, no la sesión con
 * tiempos: "vamos con la idea de lo que queremos trabajar, por ejemplo pase, y
 * de ahí vamos con los ejercicios o improvisamos".
 *
 * Esta lista es CORTA y se edita acá, en el código. Por eso la columna `tema`
 * de la migración 0015 no tiene un CHECK: si lo tuviera, agregar "transición"
 * costaría una migración. La validación vive en esta función.
 *
 * No se convierte en una taxonomía anidada ni en etiquetas jerárquicas: no hay
 * evidencia de que haga falta y sí de que cargar tiene que costar segundos.
 */
export const TEMAS = [
  { id: 'pase', nombre: 'Pase' },
  { id: 'defensa', nombre: 'Defensa' },
  { id: 'tiro', nombre: 'Tiro' },
  { id: 'contraataque', nombre: 'Contraataque' },
  { id: 'rebote', nombre: 'Rebote' },
  { id: 'fisico', nombre: 'Físico' },
  { id: 'juego', nombre: 'Juego' },
  { id: 'otro', nombre: 'Otro' },
];

export function esTemaValido(id) {
  return TEMAS.some((t) => t.id === id);
}

/**
 * El nombre para mostrar. Si el id no está en la lista devuelve el id crudo:
 * un ejercicio guardado con un tema que después se sacó de la lista tiene que
 * seguir viéndose, no desaparecer de la pantalla.
 */
export function nombreDeTema(id) {
  if (!id) return '';
  return TEMAS.find((t) => t.id === id)?.nombre ?? String(id);
}
```

- [ ] **Step 4: Pasar el test, agregarlo a `npm test`, commitear**

Agregá `tests/temas.test.js` al final de la lista del script `test` de `package.json`, preservando los que ya están.

```bash
npm test
git add src/data/temas.js tests/temas.test.js package.json
git commit -m "feat: add the short, code-editable list of exercise topics"
```

---

## Task 3: Funciones del repositorio

**Modelo sugerido:** medio — son consultas con join y mapeo snake_case → camelCase.

**Files:**
- Modify: `src/data/repositorio.js` (**agregar al final; no modificar ninguna función existente**)

**Interfaces:**
- Consumes: las tablas de la Task 1.
- Produces: las funciones que consumen las Tasks 4 a 10.

- [ ] **Step 1: Agregar al final de `src/data/repositorio.js`**

Mirá `obtenerRecursos` para el patrón de select con relación anidada y mapeo.

```js
/* ---------- Etapa 5: perfil del entrenador ---------- */

/** Mapa userId → nombre, de todos los del club. Sin él no hay autoría que mostrar. */
export async function obtenerPerfilesDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('perfil_entrenador')
    .select('user_id, nombre')
    .eq('club_id', clubId);
  if (error) throw error;
  const porUsuario = {};
  for (const f of data) porUsuario[f.user_id] = f.nombre;
  return porUsuario;
}

/** El id del usuario autenticado, para saber qué es propio y qué ajeno. */
export async function obtenerUsuarioActual() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

/**
 * Guarda el nombre propio. La policy de 0015 sólo deja escribir la fila propia,
 * así que esto no puede pisar el nombre de otro ni por error de programación.
 */
export async function guardarPerfilPropio(clubId, userId, nombre) {
  const supabase = obtenerCliente();
  const { error } = await supabase
    .from('perfil_entrenador')
    .upsert({ club_id: clubId, user_id: userId, nombre }, { onConflict: 'club_id,user_id' });
  if (error) throw error;
}

/* ---------- Etapa 5: ejercicios y notas ---------- */

/**
 * Los ejercicios del club. `tieneNotas` es una señal BINARIA de presencia, no
 * un contador ni un ranking: se traen los ids de las notas sólo para saber si
 * hay alguna, y el número no se muestra en ninguna parte.
 */
export async function obtenerEjercicios(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .select('id, titulo, tema, descripcion, enlace, material, jugadores, categorias, creado_por, creado_en, nota_ejercicio(id)')
    .eq('club_id', clubId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    tema: f.tema,
    descripcion: f.descripcion,
    enlace: f.enlace,
    material: f.material,
    jugadores: f.jugadores,
    categorias: f.categorias,
    creadoPor: f.creado_por,
    creadoEn: f.creado_en,
    tieneNotas: (f.nota_ejercicio ?? []).length > 0,
  }));
}

export async function obtenerEjercicio(clubId, ejercicioId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .select('id, titulo, tema, descripcion, enlace, material, jugadores, categorias, creado_por, creado_en')
    .eq('club_id', clubId)
    .eq('id', ejercicioId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    titulo: data.titulo,
    tema: data.tema,
    descripcion: data.descripcion,
    enlace: data.enlace,
    material: data.material,
    jugadores: data.jugadores,
    categorias: data.categorias,
    creadoPor: data.creado_por,
    creadoEn: data.creado_en,
  };
}

/**
 * Una sola fila: llamada directa, sin RPC. La regla del proyecto exige una
 * transacción sólo cuando se escribe más de una fila.
 *
 * El texto va tal cual lo escribió el profe: no se recorta, no se normaliza y
 * no se transforma. Cualquier versión estructurada que se genere el día que
 * haya IA será un campo adicional, nunca un reemplazo.
 */
export async function crearEjercicio({ clubId, titulo, tema, descripcion, enlace, material, jugadores, categorias }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .insert({
      club_id: clubId,
      titulo,
      tema,
      descripcion: descripcion || null,
      enlace: enlace || null,
      material: material || null,
      jugadores: jugadores || null,
      categorias: categorias || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Editar. Si el ejercicio es de otro, la policy de 0015 no devuelve ninguna
 * fila y esto lanza 'NO_ES_TUYO' en vez de fallar en silencio.
 */
export async function actualizarEjercicio(clubId, ejercicioId, campos) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .update({
      titulo: campos.titulo,
      tema: campos.tema,
      descripcion: campos.descripcion || null,
      enlace: campos.enlace || null,
      material: campos.material || null,
      jugadores: campos.jugadores || null,
      categorias: campos.categorias || null,
      actualizado_en: new Date().toISOString(),
    })
    .eq('club_id', clubId)
    .eq('id', ejercicioId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_ES_TUYO');
}

export async function borrarEjercicio(clubId, ejercicioId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('ejercicio')
    .delete()
    .eq('club_id', clubId)
    .eq('id', ejercicioId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_ES_TUYO');
}

/** Las notas de un ejercicio, de la más nueva a la más vieja. */
export async function obtenerNotas(clubId, ejercicioId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('nota_ejercicio')
    .select('id, texto, creado_por, creado_en')
    .eq('club_id', clubId)
    .eq('ejercicio_id', ejercicioId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data.map((f) => ({
    id: f.id,
    texto: f.texto,
    creadoPor: f.creado_por,
    creadoEn: f.creado_en,
  }));
}

/** Una sola fila. El texto va tal cual. */
export async function crearNota({ clubId, ejercicioId, texto }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('nota_ejercicio')
    .insert({ club_id: clubId, ejercicio_id: ejercicioId, texto })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function borrarNota(clubId, notaId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('nota_ejercicio')
    .delete()
    .eq('club_id', clubId)
    .eq('id', notaId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_ES_TUYO');
}
```

- [ ] **Step 2: Verificar que es append-only**

```bash
git diff --numstat src/data/repositorio.js
```
Expected: inserciones > 0, **borrados = 0**.

- [ ] **Step 3: Sintaxis, tests y commit**

```bash
node --check src/data/repositorio.js
npm test
git add src/data/repositorio.js
git commit -m "feat: add repository reads and writes for the exercise library"
```

---

## Task 4: El nombre del entrenador

**Modelo sugerido:** medio.

**Files:**
- Create: `src/ui/perfil.js`

**Interfaces:**
- Consumes: `obtenerPerfilesDelClub`, `obtenerUsuarioActual`, `guardarPerfilPropio` (Task 3); `abrirHoja`/`cerrarHoja` de `src/ui/componentes/hoja.js`.
- Produces:
  - `cargarPerfiles(clubId)` — trae perfiles y el usuario actual, los cachea. Devuelve nada.
  - `nombreDe(userId)` — el nombre, o `'Otro entrenador'` si no lo tiene, o `'Vos'` si es el usuario actual.
  - `esMio(userId)` — boolean.
  - `asegurarNombre(clubId)` — si el usuario ya tiene nombre resuelve de una; si no, abre una hoja pidiéndolo y resuelve cuando lo guardó. Devuelve `true` si hay nombre, `false` si el profe canceló.

- [ ] **Step 1: Escribir `src/ui/perfil.js`**

```js
import { obtenerPerfilesDelClub, obtenerUsuarioActual, guardarPerfilPropio } from '../data/repositorio.js';
import { abrirHoja, cerrarHoja } from './componentes/hoja.js';
import { esErrorDeRed } from './nav.js';

const $ = (id) => document.getElementById(id);

let perfiles = {};
let usuarioActual = null;

/**
 * Trae los nombres de todos los del club y el id del usuario autenticado.
 *
 * Sin esto la autoría es un UUID. La policy de `perfil_entrenador` (0015) deja
 * que los del club se lean entre sí justamente para que "quién lo cargó"
 * signifique algo; `miembro_club` no serviría, porque su policy sólo deja ver
 * la fila propia.
 */
export async function cargarPerfiles(clubId) {
  [perfiles, usuarioActual] = await Promise.all([
    obtenerPerfilesDelClub(clubId).catch(() => ({})),
    obtenerUsuarioActual().catch(() => null),
  ]);
}

export function esMio(userId) {
  return usuarioActual != null && userId === usuarioActual;
}

/** 'Vos' para lo propio; el nombre del otro; y un genérico si nunca lo cargó. */
export function nombreDe(userId) {
  if (esMio(userId)) return 'Vos';
  return perfiles[userId] ?? 'Otro entrenador';
}

export function tengoNombre() {
  return usuarioActual != null && typeof perfiles[usuarioActual] === 'string' && perfiles[usuarioActual].length > 0;
}

/**
 * Se pide una sola vez, en la misma hoja donde el profe está por cargar su
 * primer ejercicio o su primera nota. Sin pantalla de configuración y sin un
 * ítem nuevo en la navegación: pedir el nombre no vale una pantalla propia.
 *
 * Devuelve true si al terminar hay nombre; false si canceló.
 */
export function asegurarNombre(clubId) {
  if (tengoNombre()) return Promise.resolve(true);

  return new Promise((resolver) => {
    abrirHoja({
      titulo: '¿Cómo te llamás?',
      cuerpo: `
        <div class="p">Se muestra al lado de los ejercicios y las notas que cargues, para que los demás profes sepan de quién es cada cosa. Se pide una sola vez.</div>
        <div class="campo">
          <label for="in-nombre-perfil">Tu nombre</label>
          <input id="in-nombre-perfil" type="text" autocomplete="name" spellcheck="false">
        </div>
        <div id="perfil-aviso"></div>
        <button class="btn" id="btn-guardar-perfil">Guardar</button>
      `,
    });
    $('in-nombre-perfil').focus();

    const guardar = async () => {
      const boton = $('btn-guardar-perfil');
      if (boton.disabled) return;
      const nombre = $('in-nombre-perfil').value.trim();
      if (!nombre) {
        $('perfil-aviso').innerHTML = `<div class="al"><div class="tx">Escribí tu nombre.</div></div>`;
        return;
      }
      boton.disabled = true;
      boton.textContent = 'Guardando...';
      try {
        await guardarPerfilPropio(clubId, usuarioActual, nombre);
      } catch (e) {
        $('perfil-aviso').innerHTML = `<div class="al"><div class="tx">${
          esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo guardar tu nombre.'
        }</div></div>`;
        boton.disabled = false;
        boton.textContent = 'Guardar';
        return;
      }
      perfiles[usuarioActual] = nombre;
      cerrarHoja();
      resolver(true);
    };

    $('btn-guardar-perfil').addEventListener('click', guardar);
    $('in-nombre-perfil').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
    // Cerrar la hoja sin guardar cuenta como cancelar.
    $('velo').addEventListener('click', () => resolver(false), { once: true });
  });
}
```

- [ ] **Step 2: Sintaxis, tests y commit**

```bash
node --check src/ui/perfil.js
npm test
git add src/ui/perfil.js
git commit -m "feat: ask for the coach's name once, so authorship means something"
```

---

## Task 5: RECURSOS en dos pestañas

**Modelo sugerido:** capaz — parte un archivo que funciona y está verificado en producción.

**Files:**
- Modify: `src/ui/pantallas/recursos.js`
- Modify: `public/css/componentes.css` (append)

**Interfaces:**
- Produces: `renderRecursos()` con dos pestañas; la sección Jugadores queda en `renderSeccionJugadores()` escribiendo en `#recursos-jugadores`.
- Consumes (Task 6): `renderSeccionEjercicios()` de `./ejercicios.js`.

**Lo que no puede cambiar:** el comportamiento de la sección Jugadores. Alta de recurso, envío, reenvío, estado vacío y el camino de error con "Reintentar" tienen que funcionar exactamente igual.

- [ ] **Step 1: Partir el render**

`renderRecursos()` pasa a dibujar sólo el armazón: una tira de dos pestañas y dos contenedores hermanos. Después delega.

```js
let seccionActiva = 'jugadores';

export async function renderRecursos() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }

  contenedor().innerHTML = `
    <div class="pestanas" role="tablist">
      <button class="pest ${seccionActiva === 'jugadores' ? 'on' : ''}" data-seccion="jugadores" role="tab" aria-selected="${seccionActiva === 'jugadores'}">Jugadores</button>
      <button class="pest ${seccionActiva === 'ejercicios' ? 'on' : ''}" data-seccion="ejercicios" role="tab" aria-selected="${seccionActiva === 'ejercicios'}">Ejercicios</button>
    </div>
    <div id="recursos-jugadores" ${seccionActiva === 'jugadores' ? '' : 'hidden'}></div>
    <div id="recursos-ejercicios" ${seccionActiva === 'ejercicios' ? '' : 'hidden'}></div>
  `;

  contenedor().querySelectorAll('[data-seccion]').forEach((b) => {
    b.addEventListener('click', () => {
      seccionActiva = b.dataset.seccion;
      renderRecursos();
    });
  });

  if (seccionActiva === 'jugadores') await renderSeccionJugadores();
  else await renderSeccionEjercicios();
}
```

Todo el cuerpo actual de `renderRecursos` (desde el primer `contenedor().innerHTML` con `${encabezado}` hasta el final) pasa a llamarse `renderSeccionJugadores()`, **sin ningún otro cambio salvo uno**: donde decía `contenedor()` ahora dice `contenedorJugadores()`, con

```js
const contenedorJugadores = () => $('recursos-jugadores');
```

Las llamadas recursivas internas (`renderRecursos()` en el botón "Reintentar") pasan a llamar a `renderSeccionJugadores()`, para que reintentar no vuelva a dibujar las pestañas ni pierda la sección activa.

Agregá arriba: `import { renderSeccionEjercicios } from './ejercicios.js';`

- [ ] **Step 2: Crear un `ejercicios.js` mínimo para que el import resuelva**

La Task 6 lo completa. Por ahora:

```js
// src/ui/pantallas/ejercicios.js  (esqueleto; la Task 6 lo completa)
export async function renderSeccionEjercicios() {
  document.getElementById('recursos-ejercicios').innerHTML =
    `<div class="pad"><div class="p">En construcción.</div></div>`;
}
```

- [ ] **Step 3: CSS de las pestañas**

Al final de `componentes.css`. Targets de 48px: se usa con una mano.

```css
/* Etapa 5 — pestañas internas de RECURSOS. No es navegación: no se agrega un
   sexto ítem a la barra de abajo, que en celular ya está al límite. */
.pestanas{display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid var(--linea)}
.pest{min-height:48px;border:0;background:none;color:var(--gris-cl);font-family:'Barlow Condensed',sans-serif;font-size:var(--fs-160);letter-spacing:.06em;text-transform:uppercase;border-bottom:2px solid transparent}
.pest.on{color:var(--tinta);border-bottom-color:var(--rojo)}
```

> Antes de escribir, abrí `public/css/tokens.css` y confirmá que `--linea`, `--gris-cl`, `--tinta`, `--rojo` y `--fs-160` existen con ese nombre. Si alguno no existe, usá el real más cercano. No inventes tokens ni pongas hex sueltos.

- [ ] **Step 4: Verificar que Jugadores no se rompió, y commitear**

```bash
node --check src/ui/pantallas/recursos.js
node --check src/ui/pantallas/ejercicios.js
# el flujo de envío tiene que seguir intacto:
grep -c "guardarRecurso\|abrirAltaDeRecurso\|data-reenviar" src/ui/pantallas/recursos.js
node --test tests/importsResueltos.test.js
npm test
git add src/ui/pantallas/recursos.js src/ui/pantallas/ejercicios.js public/css/componentes.css
git commit -m "feat: split RECURSOS into Jugadores and Ejercicios tabs"
```

---

## Task 6: Lista de ejercicios, filtro por tema y estado vacío

**Modelo sugerido:** medio.

**Files:**
- Modify: `src/ui/pantallas/ejercicios.js` (reemplaza el esqueleto)
- Modify: `public/css/componentes.css` (append)

**Interfaces:**
- Consumes: `obtenerEjercicios` (Task 3), `TEMAS`/`nombreDeTema` (Task 2), `cargarPerfiles`/`nombreDe` (Task 4), `abrirEjercicio` de `./ejercicio.js` (Task 8, inyectada como en `plantel.js`).
- Produces: `renderSeccionEjercicios()`, `setAbrirEjercicio(fn)`, `abrirAltaEjercicio(previo)` (la escribe la Task 7).

**Sobre la dirección de los imports:** `ejercicios.js` NO importa de `ejercicio.js` — recibe `abrirEjercicio` inyectada, igual que `plantel.js` recibe `abrirFicha`. Al revés sí: `ejercicio.js` importa `abrirAltaEjercicio` de `ejercicios.js` directo, porque es una sola dirección y no hay ciclo. No inventes una segunda inyección para eso.

**Requisitos que el reviewer verifica:**

1. **Estado vacío** que explica para qué sirve la biblioteca y ofrece cargar el primero. No una pantalla que parezca rota.
2. **Filtro por tema**: una fila de chips con "Todos" más los temas que efectivamente tienen ejercicios. No se muestran temas vacíos.
3. **Autor visible** en cada ejercicio.
4. **Marca binaria de "ya probado"** en los que tienen al menos una nota. **Sin contador y sin ranking**: la marca es igual con una nota que con nueve.
5. La lista tiene que verse bien con uno, con diez y con cien.

- [ ] **Step 1: Escribir la pantalla**

```js
import { obtenerEjercicios } from '../../data/repositorio.js';
import { TEMAS, nombreDeTema } from '../../data/temas.js';
import { obtenerClubActual } from '../sesion.js';
import { escaparHtml, esErrorDeRed } from '../nav.js';
import { cargarPerfiles, nombreDe } from '../perfil.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('recursos-ejercicios');

let temaFiltro = null;              // null = todos
let abrirEjercicio = () => {};

/**
 * La Task 8 registra acá la apertura del detalle. Es inyección y no import
 * para no armar un ciclo: `ejercicio.js` sí importa de este archivo.
 */
export function setAbrirEjercicio(fn) { abrirEjercicio = fn; }

function estadoVacioHtml() {
  return `
    <div class="estado-vacio">
      <h2>La biblioteca está vacía</h2>
      <div class="p">Acá van los ejercicios del club, con lo que cada profe aprendió al usarlos. Lo que hoy se pierde no es el ejercicio —eso está en internet— sino qué pasó cuando lo probaste con estos chicos.</div>
      <div class="p">Cargar uno son dos campos: título y tema.</div>
      <div class="acciones"><button class="btn" id="btn-primer-ejercicio">Cargar el primero</button></div>
    </div>
  `;
}

function tarjetaEjercicio(e) {
  return `
    <button class="ejercicio" data-ejercicio="${e.id}">
      <div class="cab">
        <span class="tema">${escaparHtml(nombreDeTema(e.tema))}</span>
        ${e.tieneNotas ? '<span class="probado" title="Tiene notas de uso">✓ probado</span>' : ''}
      </div>
      <div class="tit">${escaparHtml(e.titulo)}</div>
      <div class="autor">${escaparHtml(nombreDe(e.creadoPor))}</div>
    </button>
  `;
}
```

`renderSeccionEjercicios()`:
1. Pinta "Cargando ejercicios..." en `contenedor()`.
2. `await cargarPerfiles(club.id)` y `obtenerEjercicios(club.id)` en un `Promise.all`. Si falla, muestra el error y un botón "Reintentar" — **igual que la sección Jugadores, el error no puede dejar la pantalla sin su acción principal**.
3. Si no hay ninguno: `estadoVacioHtml()` y engancha `btn-primer-ejercicio` a `abrirAltaEjercicio(null)`, que vive en este mismo archivo (Task 7).
4. Si hay: la fila de chips de filtro (sólo con los temas presentes), la lista filtrada, y un `.pie-fijo` con "Cargar un ejercicio".
5. Engancha cada `[data-ejercicio]` a `abrirEjercicio(id)`.

- [ ] **Step 2: CSS**

```css
/* Etapa 5 — lista de ejercicios */
.chips-tema{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.chip-tema{min-height:40px;padding:0 12px;border:1px solid var(--linea);border-radius:20px;background:var(--papel);color:var(--tinta);font-size:var(--fs-135)}
.chip-tema.on{background:var(--rojo);border-color:var(--rojo);color:#fff}
.ejercicio{display:block;width:100%;text-align:left;padding:12px 0;border:0;border-bottom:1px solid var(--linea);background:none}
.ejercicio .cab{display:flex;align-items:baseline;gap:8px}
.ejercicio .tema{font-family:'Barlow Condensed',sans-serif;font-size:var(--fs-125);letter-spacing:.06em;text-transform:uppercase;color:var(--gris-cl)}
.ejercicio .probado{font-family:'Barlow Condensed',sans-serif;font-size:var(--fs-125);letter-spacing:.05em;text-transform:uppercase;color:var(--rojo)}
.ejercicio .tit{font-size:var(--fs-160);color:var(--tinta);margin:2px 0}
.ejercicio .autor{font-size:var(--fs-125);color:var(--gris-cl)}
```

- [ ] **Step 3: Verificar y commitear**

```bash
node --check src/ui/pantallas/ejercicios.js
# la marca es binaria: no puede haber un contador de notas en la lista
grep -niE "notas\.length|\{.*notas.*\}.*nota[s]? *\)" src/ui/pantallas/ejercicios.js
npm test
git add src/ui/pantallas/ejercicios.js public/css/componentes.css
git commit -m "feat: list exercises with a topic filter and a tried-it marker"
```

---

## Task 7: Alta de ejercicio en dos campos

**Modelo sugerido:** medio — es el riesgo central de toda la funcionalidad.

**Files:**
- Modify: `src/ui/pantallas/ejercicios.js` (agrega el alta; **no toques lo de la Task 6**)
- Modify: `public/css/componentes.css` (append)

**Requisitos duros:**

1. La hoja arranca con **dos campos visibles: título y una fila de chips de tema**. Nada más.
2. **Los chips, no un `<select>`.** En celular un select abre el picker nativo: tres toques contra uno.
3. Lo demás (descripción, enlace, material, jugadores, categorías) vive detrás de un **"Agregar más detalles" plegado y cerrado por defecto**.
4. Guardar se habilita con título y tema. **Ningún otro campo puede ser obligatorio.**
5. Antes de guardar, `await asegurarNombre(club.id)`; si devuelve `false`, no se guarda.
6. Guarda contra doble submit: `if (boton.disabled) return;` arriba de todo, como en `altaJugador.js`.
7. El texto va **tal cual**: nada de `trim()` sobre la descripción, ni normalizar saltos de línea. (Sobre el título sí se puede `trim()` para validar que no esté vacío, pero se guarda lo tipeado.)

- [ ] **Step 1: Escribir `abrirAltaEjercicio(ejercicioExistente)`**

Una sola función que sirve para crear y para editar (Task 9): si recibe un ejercicio, precarga los campos y llama a `actualizarEjercicio`; si no, llama a `crearEjercicio`.

```js
function cuerpoDeAlta(previo) {
  return `
    <div class="campo">
      <label for="in-ej-titulo">Título</label>
      <input id="in-ej-titulo" type="text" autocomplete="off" value="${escaparHtml(previo?.titulo ?? '')}">
    </div>
    <div class="campo">
      <label id="lbl-tema">Tema</label>
      <div class="chips-tema" role="group" aria-labelledby="lbl-tema">
        ${TEMAS.map((t) => `<button type="button" class="chip-tema ${previo?.tema === t.id ? 'on' : ''}" data-tema="${t.id}">${escaparHtml(t.nombre)}</button>`).join('')}
      </div>
    </div>
    <button class="btn sec" id="btn-mas-detalles" type="button">Agregar más detalles</button>
    <div id="ej-detalles" hidden>
      <div class="campo"><label for="in-ej-desc">Descripción</label><textarea id="in-ej-desc" rows="4">${escaparHtml(previo?.descripcion ?? '')}</textarea></div>
      <div class="campo"><label for="in-ej-enlace">Enlace</label><input id="in-ej-enlace" type="url" inputmode="url" placeholder="https://" value="${escaparHtml(previo?.enlace ?? '')}"></div>
      <div class="campo"><label for="in-ej-material">Material</label><input id="in-ej-material" type="text" placeholder="conos, dos pelotas" value="${escaparHtml(previo?.material ?? '')}"></div>
      <div class="campo"><label for="in-ej-jugadores">Jugadores</label><input id="in-ej-jugadores" type="text" placeholder="6 a 12" value="${escaparHtml(previo?.jugadores ?? '')}"></div>
      <div class="campo"><label for="in-ej-categorias">Categorías</label><input id="in-ej-categorias" type="text" placeholder="mini, sub-13" value="${escaparHtml(previo?.categorias ?? '')}"></div>
    </div>
    <div id="ej-aviso"></div>
    <button class="btn" id="btn-guardar-ejercicio">${previo ? 'Guardar los cambios' : 'Guardar'}</button>
  `;
}
```

El botón "Agregar más detalles" hace `$('ej-detalles').hidden = false;` y se esconde a sí mismo. Los chips se comportan como radio: al tocar uno se apaga el resto.

- [ ] **Step 2: Verificar los requisitos y commitear**

```bash
node --check src/ui/pantallas/ejercicios.js
# nada de select para el tema
grep -c "<select" src/ui/pantallas/ejercicios.js       # Expected: 0
# el nombre se pide antes de guardar
grep -c "asegurarNombre" src/ui/pantallas/ejercicios.js # Expected: >= 1
npm test
git add src/ui/pantallas/ejercicios.js public/css/componentes.css
git commit -m "feat: create an exercise with two fields and optional details"
```

---

## Task 8: Detalle del ejercicio, con las notas al mismo nivel

**Modelo sugerido:** capaz — es la pieza que más importa del spec.

**Files:**
- Create: `src/ui/pantallas/ejercicio.js`
- Modify: `src/ui/pantallas/registro.js` (**preservar todos los registros existentes**)
- Modify: `public/index.html` (**agregar una sección; no tocar ninguna otra línea**)
- Modify: `public/css/componentes.css` (append)

**Interfaces:**
- Produces: `abrirEjercicio(id)`, `renderEjercicio()`.

**El requisito que define esta task:** en el detalle, **descripción y notas son dos bloques hermanos con el mismo peso visual**. Mismo tipo de encabezado, mismo tamaño de texto. Las notas **no** van al pie, **no** van plegadas y **no** son un comentario secundario.

El motivo, del spec: un ejercicio con la nota *"con los de mini no funcionó hasta que achiqué la cancha"* vale mucho más que el mismo ejercicio sin ella, y es lo único que no se puede encontrar en internet. Si las notas quedan escondidas abajo de todo se pierde el valor real de la biblioteca.

- [ ] **Step 1: Agregar la sección a `public/index.html`**

Justo después de la línea de `p-recursos`, sin tocar ninguna otra:

```html
    <section class="pant" id="p-ejercicio"><div id="ejercicio-contenido"></div></section>
```

- [ ] **Step 2: Registrar la pantalla**

En `registro.js`, **preservando cada `registrarPantalla` y cada llamada de inicialización que ya está**:

```js
  registrarPantalla('p-ejercicio', { titulo: 'Ejercicio', render: renderEjercicio });
  setAbrirEjercicio(abrirEjercicio);
```

- [ ] **Step 3: Escribir el detalle**

Orden de la pantalla:

1. Título, tema y autor.
2. **Descripción** — `eyebrow` "Descripción" y el texto. Si no hay, una línea que invite a completarlo (el ejercicio puede haberse guardado con dos campos).
3. **Notas de uso** — `eyebrow` "Notas de uso" **con el mismo estilo que el de Descripción**, la lista de notas con autor y fecha, y un botón "Agregar una nota" visible.
4. Los campos opcionales que tengan valor (material, jugadores, categorías, enlace), en un bloque menor.
5. Acciones: "Mandar a jugadores" (Task 10), y si es tuyo, "Editar" y "Borrar" (Task 9).

Estado vacío de notas: *"Todavía nadie anotó qué pasó al usarlo. Si lo probaste, lo que aprendiste le sirve al que venga."*

Agregar nota: hoja con un `textarea`, `await asegurarNombre(club.id)` antes de guardar, guarda contra doble submit, y el texto va tal cual.

- [ ] **Step 4: Verificar la jerarquía y commitear**

```bash
node --check src/ui/pantallas/ejercicio.js
# descripción y notas usan el MISMO tipo de encabezado
grep -c "eyebrow" src/ui/pantallas/ejercicio.js
grep -c "registrarPantalla('" src/ui/pantallas/registro.js    # Expected: 13
node --test tests/importsResueltos.test.js
npm test
git add src/ui/pantallas/ejercicio.js src/ui/pantallas/registro.js public/index.html public/css/componentes.css
git commit -m "feat: exercise detail with usage notes as a first-class block"
```

---

## Task 9: Editar y borrar lo propio

**Modelo sugerido:** medio.

**Files:**
- Modify: `src/ui/pantallas/ejercicio.js`

**Requisitos:**

1. Los botones de editar y borrar **sólo aparecen si el ejercicio es tuyo** (`esMio(e.creadoPor)`).
2. Eso es comodidad, **no la garantía**: la garantía es la policy de RLS de `0015`. Si `actualizarEjercicio` o `borrarEjercicio` lanzan `NO_ES_TUYO`, se muestra un mensaje claro en vez de un error crudo.
3. Borrar **pide confirmación** antes: es irreversible y se lleva las notas de otros por el `on delete cascade`. El texto de confirmación tiene que decir eso último.
4. Editar reusa `abrirAltaEjercicio(previo)` de la Task 7.
5. Las notas de otros no se pueden borrar. La propia sí.

- [ ] **Step 1: Implementar y commitear**

```bash
node --check src/ui/pantallas/ejercicio.js
grep -c "esMio" src/ui/pantallas/ejercicio.js      # Expected: >= 2
grep -c "NO_ES_TUYO" src/ui/pantallas/ejercicio.js # Expected: >= 1
npm test
git add src/ui/pantallas/ejercicio.js
git commit -m "feat: let a coach edit and delete only their own exercises and notes"
```

---

## Task 10: Mandar un ejercicio a jugadores

**Modelo sugerido:** medio.

**Files:**
- Modify: `src/ui/pantallas/ejercicio.js`

**La decisión que hay que respetar:** se crea un `recurso` **nuevo copiando** título, descripción y enlace del ejercicio. Es una foto del momento: si el ejercicio se edita después, lo ya enviado no cambia. Lo que se mandó, se mandó.

**`guardar_recurso` (`0011`) no se toca.** Se la llama tal cual, con el payload que ya acepta:

```js
await guardarRecurso({
  clubId: club.id,
  recursoId: null,
  titulo: ejercicio.titulo,
  descripcion: ejercicio.descripcion ?? ejercicio.titulo,
  enlace: ejercicio.enlace ?? null,
  fecha: hoyLocal(),
  jugadorIds,
});
```

> `descripcion` es `not null` en la tabla `recurso` (0009), y en un ejercicio es opcional. Por eso cae al título cuando está vacía. **No inventes un texto de relleno.**

La selección de jugadores reusa la lista con checkboxes y "Todo el plantel" que ya existe en `recursos.js`. Si el plantel está vacío, avisar antes de abrir el formulario, igual que ahí.

- [ ] **Step 1: Implementar y commitear**

```bash
node --check src/ui/pantallas/ejercicio.js
git diff --numstat supabase/migrations/0011_rpc_guardar_recurso.sql   # Expected: sin salida
npm test
git add src/ui/pantallas/ejercicio.js public/css/componentes.css
git commit -m "feat: send an exercise to players as a frozen resource copy"
```

---

## Task 11: Verificación final

**Modelo sugerido:** los comandos los corre el controlador, sin subagente.

- [ ] **Step 1: Arquitectura por grep**

```bash
grep -rn "@supabase/supabase-js" src/ui/          # Expected: sin salida
grep -rn "fetch(" src/ui/                          # Expected: sin salida
grep -rn "document\.\|window\." src/data/          # Expected: sin salida
grep -c "min-width" public/css/base.css            # Expected: 0
grep -rn "security definer" supabase/migrations/   # Expected: sin salida
```

- [ ] **Step 2: Lo verificado no se tocó**

```bash
git diff pre-etapa-5 --stat -- src/parser/ src/data/mapearImportacion.js src/data/prepararPayloadImportacion.js src/ui/pantallas/confirmacionImport.js src/ui/pantallas/resultadoImport.js supabase/migrations/0001_esquema_inicial.sql supabase/migrations/0002_rls.sql supabase/migrations/0005_rpc_importar_partido.sql supabase/migrations/0011_rpc_guardar_recurso.sql
# Expected: sin salida
git diff pre-etapa-5 --numstat -- src/data/repositorio.js   # Expected: 0 borrados
```

- [ ] **Step 3: `npm test` completo**

```bash
npm test          # Expected: # fail 0, incluido importsResueltos
```

- [ ] **Step 4: Lo que necesita a la persona**

1. `npx supabase db push` — aplica `0015`.
2. Recorrido a 375px: cargar un ejercicio con dos campos; que pida el nombre la primera vez; agregar una nota; ver la marca de "probado" en la lista; filtrar por tema; mandarlo a jugadores; y confirmar que la pestaña Jugadores sigue funcionando igual.
