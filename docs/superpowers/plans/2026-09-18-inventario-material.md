# Inventario de material — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el coordinador cargue el inventario de material del club (con peso, sin peso y "otro") y que todos los miembros del club lo lean.

**Architecture:** Una tabla nueva `material` (migración 0026) con RLS: lee cualquier miembro del club, escribe sólo `es_coordinador_de(club_id)`, que ya existe. La lógica pura (tipos, validación, agrupado) vive en `src/data/inventario.js` con tests de `node --test`. Una sola pantalla, `src/ui/pantallas/inventario.js`, pinta dos variantes: la del coordinador (tercera pestaña de coordinación, edita por hojas) y la de lectura (a la que llega el profe desde el pie de FÍSICO).

**Tech Stack:** Supabase (Postgres 17, RLS, PostgREST vía `@supabase/supabase-js`), JS ES modules sin bundler, `node --test`, psql dentro del Docker local de Supabase.

**Spec:** `docs/superpowers/specs/2026-09-18-inventario-material-design.md`

## Global Constraints

- Tipos, exactos y en este orden: `mancuerna`, `disco`, `barra`, `pesa_rusa`, `balon_medicinal`, `pelota`, `cono`, `soga`, `escalerita`, `banda`, `otro`.
- Peso obligatorio en `mancuerna`, `disco`, `barra`, `pesa_rusa`, `balon_medicinal`; prohibido en `pelota`, `cono`, `soga`, `escalerita`, `banda`; opcional en `otro`.
- `otro` exige `detalle` no vacío (es el nombre).
- `peso_kg` es de UNA unidad, `numeric`, `> 0`. `cantidad` es de unidades sueltas, entero `> 0`.
- Una fila por `(club_id, tipo, peso_kg, lower(detalle))`, con nulos iguales entre sí.
- Lo que ya no se tiene se borra; no hay filas archivadas.
- Escribe sólo el coordinador (`es_coordinador_de`); no se crea ninguna función de permisos nueva.
- No se toca `paso_fuerza`, `movimiento_escalon`, `escalon_actual`, el import de plan físico ni `es_coordinador_de`.
- En pantalla: la pestaña se llama **"Inventario"**; los rótulos dicen **"Peso de cada unidad (kg)"** y **"Cantidad (unidades sueltas)"**.
- La migración se aplica sólo al Docker local. Aplicarla a producción no es parte de este plan.
- Textos de la UI en castellano rioplatense, como el resto de la app.

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/0026_material.sql` | Crear: tabla, índices, trigger, RLS y grants |
| `tests/verificarMaterial.sql` | Crear: verificación de la RLS y los checks contra el Docker local |
| `tests/rollback0026.sql` | Crear: deshace 0026 en local |
| `supabase/ESQUEMA.md` | Modificar: documenta `material` |
| `src/data/inventario.js` | Crear: tipos, validación, agrupado, etiquetas; sin red ni DOM |
| `tests/inventario.test.js` | Crear: tests de `inventario.js` |
| `package.json` | Modificar: suma `tests/inventario.test.js` al script de test |
| `src/data/repositorio.js` | Modificar: `obtenerMaterial`, `agregarMaterial`, `editarMaterial`, `quitarMaterial` |
| `src/ui/pantallas/inventario.js` | Crear: la pantalla, en sus dos variantes, y las hojas |
| `src/ui/chrome.js` | Modificar: tercera entrada de `TABS_COORDINACION` |
| `src/ui/pantallas/registro.js` | Modificar: registra `p-coord-inventario` y `p-inventario` |
| `public/index.html` | Modificar: las dos secciones `.pant` |
| `public/css/componentes.css` | Modificar: estilos del contador de cantidad y del título de grupo |
| `src/ui/pantallas/fisico.js` | Modificar: botón "Inventario del club" en el pie |
| `tests/navegacionInvariante.test.js` | Modificar: pestaña y registro |

---

### Task 1: La tabla `material` en la base

**Files:**
- Create: `tests/verificarMaterial.sql`
- Create: `supabase/migrations/0026_material.sql`
- Create: `tests/rollback0026.sql`
- Modify: `supabase/ESQUEMA.md`

**Interfaces:**
- Consumes: `es_coordinador_de(uuid) → boolean` (0017), tabla `miembro_club`, tabla `club`.
- Produces: tabla `public.material` con columnas `id uuid`, `club_id uuid`, `tipo text`, `peso_kg numeric | null`, `detalle text`, `cantidad integer`, `creado_por uuid`, `creado_en timestamptz`, `actualizado_por uuid`, `actualizado_en timestamptz`. `authenticated` puede: `select`, `delete`, `insert (club_id, tipo, peso_kg, detalle, cantidad)`, `update (peso_kg, detalle, cantidad)`. Errores que ve el cliente: `23505` (variante repetida), `23514` (check), `42501` (RLS en insert / grant).

- [ ] **Step 1: Escribir la verificación (falla antes de la migración)**

Crear `tests/verificarMaterial.sql`:

```sql
-- Verificación de 0026 (inventario de material) contra el Docker LOCAL.
--
-- CÓMO SE CORRE (nunca contra producción):
--   DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
--   docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/verificarMaterial.sql
--
-- Cada bloque dice qué se espera. Crea usuarios, un club y material sintéticos
-- dentro de UNA transacción que termina en ROLLBACK: no deja nada. La
-- impersonación (role authenticated + request.jwt.claims) es como PostgREST
-- evalúa la RLS de una sesión real.

\set ON_ERROR_STOP off
begin;

\echo '===== 0026 aplicada (esperado: t)'
select to_regclass('public.material') is not null as material;

-- Coordinador puro (K), entrenador puro (E), los dos roles (D), todos de
-- Newell's; y un coordinador de otro club (X).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('66666666-6666-6666-6666-666666666601', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-inv-k@verificacion.invalid', now(), now(), now()),
  ('66666666-6666-6666-6666-666666666602', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-inv-e@verificacion.invalid', now(), now(), now()),
  ('66666666-6666-6666-6666-666666666603', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-inv-d@verificacion.invalid', now(), now(), now()),
  ('66666666-6666-6666-6666-666666666604', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-inv-x@verificacion.invalid', now(), now(), now());
insert into club (id, nombre) values
  ('66666666-6666-6666-6666-666666666600', 'ZZ Otro Club');
insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador) values
  ('66666666-6666-6666-6666-666666666601', '20000000-0000-0000-0000-000000000001', false, true),
  ('66666666-6666-6666-6666-666666666602', '20000000-0000-0000-0000-000000000001', true, false),
  ('66666666-6666-6666-6666-666666666603', '20000000-0000-0000-0000-000000000001', true, true),
  ('66666666-6666-6666-6666-666666666604', '66666666-6666-6666-6666-666666666600', false, true);

/* ---------- coordinador puro ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666601","role":"authenticated"}', true) \g /dev/null

\echo '===== coordinador agrega (esperado: mancuerna | 10 | 2 | t | t)'
insert into material (club_id, tipo, peso_kg, cantidad)
  values ('20000000-0000-0000-0000-000000000001', 'mancuerna', 10, 2)
  returning id \gset mancuerna_
select tipo, peso_kg, cantidad,
       creado_por = '66666666-6666-6666-6666-666666666601' as creado_por_k,
       actualizado_por = '66666666-6666-6666-6666-666666666601' as actualizado_por_k
from material where id = :'mancuerna_id';

\echo '===== coordinador edita la cantidad (esperado: 4)'
update material set cantidad = 4 where id = :'mancuerna_id' returning cantidad;

\echo '===== los tipos sin peso, con peso decimal y "otro" con y sin peso (esperado: 5 filas nuevas)'
insert into material (club_id, tipo, peso_kg, detalle, cantidad) values
  ('20000000-0000-0000-0000-000000000001', 'disco', 1.25, '', 4),
  ('20000000-0000-0000-0000-000000000001', 'pelota', null, 'N° 7', 15),
  ('20000000-0000-0000-0000-000000000001', 'cono', null, '', 20),
  ('20000000-0000-0000-0000-000000000001', 'otro', 5, 'Chaleco lastrado', 3),
  ('20000000-0000-0000-0000-000000000001', 'otro', null, 'Vallas', 8);
select count(*) as filas_del_club from material where club_id = '20000000-0000-0000-0000-000000000001';

\echo '===== mancuerna sin peso: esperado check violation'
savepoint c1;
insert into material (club_id, tipo, cantidad) values ('20000000-0000-0000-0000-000000000001', 'mancuerna', 1);
rollback to savepoint c1;

\echo '===== pesa rusa sin peso: esperado check violation'
savepoint c2;
insert into material (club_id, tipo, cantidad) values ('20000000-0000-0000-0000-000000000001', 'pesa_rusa', 1);
rollback to savepoint c2;

\echo '===== cono con peso: esperado check violation'
savepoint c3;
insert into material (club_id, tipo, peso_kg, cantidad) values ('20000000-0000-0000-0000-000000000001', 'cono', 1, 1);
rollback to savepoint c3;

\echo '===== otro sin nombre: esperado check violation'
savepoint c4;
insert into material (club_id, tipo, cantidad) values ('20000000-0000-0000-0000-000000000001', 'otro', 1);
rollback to savepoint c4;

\echo '===== peso 0: esperado check violation'
savepoint c5;
insert into material (club_id, tipo, peso_kg, cantidad) values ('20000000-0000-0000-0000-000000000001', 'disco', 0, 1);
rollback to savepoint c5;

\echo '===== cantidad 0: esperado check violation'
savepoint c6;
insert into material (club_id, tipo, peso_kg, cantidad) values ('20000000-0000-0000-0000-000000000001', 'disco', 20, 0);
rollback to savepoint c6;

\echo '===== detalle con espacios alrededor: esperado check violation'
savepoint c7;
insert into material (club_id, tipo, detalle, cantidad) values ('20000000-0000-0000-0000-000000000001', 'soga', ' larga ', 1);
rollback to savepoint c7;

\echo '===== tipo fuera de la lista: esperado check violation'
savepoint c8;
insert into material (club_id, tipo, cantidad) values ('20000000-0000-0000-0000-000000000001', 'valla', 1);
rollback to savepoint c8;

\echo '===== otra mancuerna de 10: esperado duplicate key (material_unico)'
savepoint u1;
insert into material (club_id, tipo, peso_kg, cantidad) values ('20000000-0000-0000-0000-000000000001', 'mancuerna', 10, 1);
rollback to savepoint u1;

\echo '===== otro cono sin detalle: esperado duplicate key (nulls not distinct)'
savepoint u2;
insert into material (club_id, tipo, cantidad) values ('20000000-0000-0000-0000-000000000001', 'cono', 5);
rollback to savepoint u2;

\echo '===== "vallas" en minúscula: esperado duplicate key (lower)'
savepoint u3;
insert into material (club_id, tipo, detalle, cantidad) values ('20000000-0000-0000-0000-000000000001', 'otro', 'vallas', 2);
rollback to savepoint u3;

\echo '===== cambiar el tipo: esperado permission denied'
savepoint g1;
update material set tipo = 'disco' where id = :'mancuerna_id';
rollback to savepoint g1;

\echo '===== mandar actualizado_por en el insert: esperado permission denied'
savepoint g2;
insert into material (club_id, tipo, peso_kg, cantidad, actualizado_por)
  values ('20000000-0000-0000-0000-000000000001', 'disco', 20, 2, '66666666-6666-6666-6666-666666666602');
rollback to savepoint g2;
reset role;

/* ---------- entrenador puro ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666602","role":"authenticated"}', true) \g /dev/null

\echo '===== entrenador lee todo el inventario (esperado: 6)'
select count(*) as ve_entrenador from material where club_id = '20000000-0000-0000-0000-000000000001';

\echo '===== entrenador edita y quita: no toca nada (esperado: 0 | 0)'
with e as (update material set cantidad = 99 where id = :'mancuerna_id' returning 1),
     q as (delete from material where id = :'mancuerna_id' returning 1)
select (select count(*) from e) as editadas, (select count(*) from q) as quitadas;

\echo '===== entrenador agrega: esperado row-level security'
savepoint r1;
insert into material (club_id, tipo, peso_kg, cantidad) values ('20000000-0000-0000-0000-000000000001', 'barra', 20, 1);
rollback to savepoint r1;
reset role;

/* ---------- los dos roles ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666603","role":"authenticated"}', true) \g /dev/null

\echo '===== los dos roles editan; el trigger sella al nuevo autor y creado_por queda (esperado: 3 | t | t)'
update material set cantidad = 3 where id = :'mancuerna_id'
  returning cantidad,
            actualizado_por = '66666666-6666-6666-6666-666666666603' as sellado_d,
            creado_por = '66666666-6666-6666-6666-666666666601' as creado_por_sigue_k;
reset role;

/* ---------- otro club ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666604","role":"authenticated"}', true) \g /dev/null

\echo '===== coordinador de otro club no ve nada (esperado: 0)'
select count(*) as ve_otro_club from material where club_id = '20000000-0000-0000-0000-000000000001';

\echo '===== coordinador de otro club agrega en Newell''s: esperado row-level security'
savepoint r2;
insert into material (club_id, tipo, peso_kg, cantidad) values ('20000000-0000-0000-0000-000000000001', 'barra', 20, 1);
rollback to savepoint r2;
reset role;

/* ---------- coordinador quita ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666601","role":"authenticated"}', true) \g /dev/null

\echo '===== coordinador quita la mancuerna (esperado: 1 | 0)'
with q as (delete from material where id = :'mancuerna_id' returning 1)
select (select count(*) from q) as quitadas,
       (select count(*) from material where id = :'mancuerna_id') as quedan;
reset role;

/* ---------- anon ---------- */

\echo '===== anon: esperado permission denied'
set local role anon;
savepoint a1;
select count(*) from material;
rollback to savepoint a1;
reset role;

rollback;
\echo '===== fin: todo deshecho'
```

- [ ] **Step 2: Correrla y ver que falla**

Con Docker corriendo y Supabase local levantado (`npx supabase start`):

```bash
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/verificarMaterial.sql
```

Esperado: el primer bloque imprime `f` y los siguientes fallan con `relation "material" does not exist`.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/0026_material.sql`:

```sql
-- Inventario de material físico del club.
-- Ver docs/superpowers/specs/2026-09-18-inventario-material-design.md.
--
-- Es la primera tabla de DATOS del club que escribe sólo el coordinador. La
-- regla no es nueva: miembro_club y asignacion_plantel ya la tienen (0017), y
-- es_coordinador_de ya se usa en with check de escritura. No hace falta otra
-- función de permisos.

create table material (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  -- Lista cerrada: el tipo decide reglas (si lleva peso, si se combina) y el
  -- cruce futuro con los ejercicios busca por tipo. Sumar uno es una decisión
  -- de diseño, así que pasa por una migración. 'otro' es para lo que no está.
  tipo text not null check (tipo in (
    'mancuerna', 'disco', 'barra', 'pesa_rusa', 'balon_medicinal',
    'pelota', 'cono', 'soga', 'escalerita', 'banda',
    'otro')),
  -- Kg de UNA unidad, nunca del par. numeric como paso_fuerza.paso: 1,25 es
  -- un disco real y el cruce futuro compara números del mismo tipo.
  peso_kg numeric check (peso_kg > 0),
  -- En los tipos fijos, lo que distingue dos filas del mismo tipo ("N° 7",
  -- "EZ", "roja, fuerte"); vacío si no hace falta. En 'otro', el nombre. not
  -- null para que el índice único no tome dos vacíos como distintos.
  detalle text not null default '',
  -- Unidades sueltas. Lo que ya no se tiene se borra: una fila dice que hay.
  cantidad integer not null check (cantidad > 0),
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid not null default auth.uid() references auth.users(id),
  actualizado_en timestamptz not null default now(),
  -- Con peso: obligatorio. Sin peso: prohibido. Otro: opcional.
  constraint material_peso_obligatorio check (
    tipo not in ('mancuerna', 'disco', 'barra', 'pesa_rusa', 'balon_medicinal')
    or peso_kg is not null),
  constraint material_sin_peso check (
    tipo not in ('pelota', 'cono', 'soga', 'escalerita', 'banda')
    or peso_kg is null),
  constraint material_otro_con_nombre check (tipo <> 'otro' or detalle <> ''),
  constraint material_detalle_recortado check (detalle = btrim(detalle))
);

-- Una fila por variante: la segunda carga de "mancuerna 10 kg" es editar la
-- primera. nulls not distinct (PG 15+): dos conos sin peso chocan en vez de
-- pasar porque null <> null. lower(): "EZ" y "ez" son la misma barra.
create unique index material_unico
  on material (club_id, tipo, peso_kg, lower(detalle)) nulls not distinct;
create index material_club_id_idx on material(club_id);

-- Quién hizo el último cambio y cuándo. El default sólo actúa en el insert;
-- el trigger cubre también el update. Mismo patrón que paso_fuerza.
create function sellar_material()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger material_sellar
  before insert or update on material
  for each row execute function sellar_material();


/* ---------- RLS ---------- */

alter table material enable row level security;

-- Sin datos de ningún chico: lo lee cualquier miembro del club, como
-- paso_fuerza. El sentido es que el profe sepa qué hay antes de armar una
-- rutina.
create policy material_leer on material
  for select using (exists (
    select 1 from miembro_club m
    where m.club_id = material.club_id and m.user_id = auth.uid()));

-- Escribe el rol coordinador, tenga o no además el de entrenador. Sin la
-- exclusión "a sí mismo" de asignacion_plantel: acá no hay acceso que ganar.
create policy material_coordinador_agrega on material
  for insert with check (es_coordinador_de(material.club_id));

create policy material_coordinador_edita on material
  for update using (es_coordinador_de(material.club_id))
  with check (es_coordinador_de(material.club_id));

create policy material_coordinador_quita on material
  for delete using (es_coordinador_de(material.club_id));

-- Supabase concede ALL por defecto sobre tablas nuevas (ver 0017): se revoca
-- todo y se concede lo mínimo, por columna. El cliente no manda autoría ni
-- fechas, y no cambia el tipo ni el club de una fila.
revoke all on material from anon, authenticated;
grant select, delete on material to authenticated;
grant insert (club_id, tipo, peso_kg, detalle, cantidad) on material to authenticated;
grant update (peso_kg, detalle, cantidad) on material to authenticated;

comment on table material is
  'Inventario de material del club: una fila por variante, con cantidad en unidades sueltas. Lee el club, escribe coordinación. v0026.';
comment on column material.peso_kg is
  'Kg de una unidad. Obligatorio en mancuerna, disco, barra, pesa_rusa, balon_medicinal; nulo en los sin peso; opcional en otro.';
```

- [ ] **Step 4: Aplicarla y correr la verificación**

```bash
npx supabase migration up
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/verificarMaterial.sql
```

Esperado, bloque por bloque: `t`; `mancuerna | 10 | 2 | t | t`; `4`; `6`; ocho `check constraint` (en c3 y c7 el nombre del constraint lo dice); tres `duplicate key value violates unique constraint "material_unico"`; dos `permission denied for table material`; `6`; `0 | 0`; `new row violates row-level security policy`; `3 | t | t`; `0`; `row-level security`; `1 | 0`; `permission denied`; `fin: todo deshecho`.

Si algún bloque da otra cosa, arreglar la migración (no la verificación) salvo que la verificación contradiga el spec.

- [ ] **Step 5: Escribir el rollback y probar que 0026 se reaplica**

Crear `tests/rollback0026.sql`:

```sql
-- Deshace 0026 en el Docker LOCAL. No se corre contra producción sin revisarlo:
-- borra el inventario cargado.
--
-- Borra también la fila de schema_migrations para poder volver a aplicar 0026
-- con `npx supabase migration up`.
begin;

drop table if exists material;
drop function if exists sellar_material();

delete from supabase_migrations.schema_migrations where version = '0026';
commit;
```

Correr:

```bash
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/rollback0026.sql
npx supabase migration up
docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/verificarMaterial.sql
```

Esperado: el rollback termina sin error, la migración se reaplica y la verificación da lo mismo que en el Step 4.

- [ ] **Step 6: Documentar en ESQUEMA.md**

En `supabase/ESQUEMA.md`:

1. Reemplazar el primer párrafo (el que empieza con "Estado al día de la migración") por:

```markdown
Estado al día de la migración `0019_nombre_y_categorias.sql`, más la sección de
escalones de fuerza de `0023_escalones_fuerza.sql` y el inventario de
`0026_material.sql`. Las tablas del plan físico de 0020–0022 todavía no están
documentadas acá (ver la Tarea 7 del plan de import).
```

2. Insertar, justo antes de `## Políticas RLS`:

```markdown
### `material` (0026)
El inventario de material del club: una fila por variante, con `cantidad` en
unidades sueltas (dos mancuernas de 10 kg son `cantidad = 2`).

- `tipo`: lista cerrada — `mancuerna`, `disco`, `barra`, `pesa_rusa`,
  `balon_medicinal` (con peso obligatorio), `pelota`, `cono`, `soga`,
  `escalerita`, `banda` (sin peso) y `otro` (peso opcional, `detalle`
  obligatorio como nombre). Sumar un tipo es una migración: el tipo decide si
  lleva peso y si se combina (sólo `disco`), y el cruce futuro con los
  ejercicios busca por tipo.
- `peso_kg`: de **una** unidad, `numeric`, como `paso_fuerza.paso`.
- `detalle`: lo que distingue dos filas del mismo tipo ("N° 7", "EZ"); `''` si
  no hace falta.
- Único por `(club_id, tipo, peso_kg, lower(detalle))` con `nulls not
  distinct`: la segunda carga de una variante es editar la primera.
- **Lo que ya no se tiene se borra**, no se archiva: la tabla dice lo que hay
  hoy, y ninguna consulta tiene que acordarse de filtrar bajas.
- `actualizado_por`/`actualizado_en` los sella un trigger; `creado_*` por
  default.
- La lee cualquier miembro del club; la escribe sólo `es_coordinador_de`, tenga
  o no además el rol de entrenador. Insert y update con grant por columna: el
  tipo y el club de una fila no cambian.
```

3. En la tabla de `## Políticas RLS`, agregar esta fila antes de la de "Panel: pendientes, ...":

```markdown
| `material` (inventario) | lee todo el club | lee y **escribe** todo el club | lee y escribe |
```

4. En el párrafo "**Siguen siendo a nivel club, a propósito:**", agregar `material` a la lista y al final del párrafo esta oración: `` `material` porque el inventario es del club entero, no de una categoría ni de un turno. ``

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0026_material.sql tests/verificarMaterial.sql tests/rollback0026.sql supabase/ESQUEMA.md
git commit -m "$(cat <<'EOF'
feat(db): inventario de material del club, escribe coordinación

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Lógica pura del inventario

**Files:**
- Create: `src/data/inventario.js`
- Create: `tests/inventario.test.js`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `parsearPeso(texto) → { error: string|null, kg: number|null }` y `formatearKg(kg) → string` de `src/data/escalones.js`.
- Produces (todas exportadas desde `src/data/inventario.js`):
  - `TIPOS: Array<{ clave: string, nombre: string, grupo: string, peso: 'obligatorio'|'no'|'opcional' }>`, en el orden de Global Constraints.
  - `tipoDe(clave: string) → tipo | null`.
  - `validarMaterial({ tipo: string, peso: string, detalle: string, cantidad: string|number }) → { error: string|null, fila: { tipo, pesoKg: number|null, detalle: string, cantidad: number } | null }`.
  - `buscarIgual(filas, fila) → fila | null`: misma `tipo`, mismo `pesoKg` (null = null) y mismo `detalle` sin distinguir mayúsculas.
  - `agruparInventario(filas) → Array<{ titulo: 'Con peso'|'Sin peso'|'Otros', grupos: Array<{ tipo: string, titulo: string, filas }> }>`, sin secciones ni grupos vacíos.
  - `etiquetaDeFila(fila) → string` ("10 kg · EZ", "N° 7", "Chaleco lastrado · 5 kg", o `''`).
  - `ultimoCambio(filas) → fila | null` (mayor `actualizadoEn`).
  - `textoYaExiste(fila) → string`.
  - Una "fila" es `{ id, tipo, pesoKg: number|null, detalle: string, cantidad: number, actualizadoPor: string, actualizadoEn: string }` (forma que produce el repositorio en la Task 3).

- [ ] **Step 1: Escribir los tests**

Crear `tests/inventario.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPOS, tipoDe, validarMaterial, buscarIgual, agruparInventario,
  etiquetaDeFila, ultimoCambio, textoYaExiste,
} from '../src/data/inventario.js';

const fila = (extra) => ({
  id: 'x', tipo: 'mancuerna', pesoKg: 10, detalle: '', cantidad: 2,
  actualizadoPor: 'u1', actualizadoEn: '2026-09-18T12:00:00+00:00', ...extra,
});

/* ---------- tipos ---------- */

test('TIPOS son los once de la migración, en el mismo orden', () => {
  assert.deepEqual(TIPOS.map((t) => t.clave), [
    'mancuerna', 'disco', 'barra', 'pesa_rusa', 'balon_medicinal',
    'pelota', 'cono', 'soga', 'escalerita', 'banda', 'otro',
  ]);
});

test('el peso de cada tipo coincide con los check de 0026', () => {
  const peso = Object.fromEntries(TIPOS.map((t) => [t.clave, t.peso]));
  for (const c of ['mancuerna', 'disco', 'barra', 'pesa_rusa', 'balon_medicinal']) assert.equal(peso[c], 'obligatorio', c);
  for (const c of ['pelota', 'cono', 'soga', 'escalerita', 'banda']) assert.equal(peso[c], 'no', c);
  assert.equal(peso.otro, 'opcional');
});

test('tipoDe devuelve null para un tipo que no existe', () => {
  assert.equal(tipoDe('mancuerna').nombre, 'Mancuerna');
  assert.equal(tipoDe('valla'), null);
});

/* ---------- validar ---------- */

test('validarMaterial: mancuerna con peso decimal y coma', () => {
  assert.deepEqual(
    validarMaterial({ tipo: 'mancuerna', peso: '2,5', detalle: '', cantidad: '4' }),
    { error: null, fila: { tipo: 'mancuerna', pesoKg: 2.5, detalle: '', cantidad: 4 } },
  );
});

test('validarMaterial: un tipo con peso sin número da error', () => {
  const r = validarMaterial({ tipo: 'disco', peso: '', detalle: '', cantidad: '1' });
  assert.equal(r.fila, null);
  assert.match(r.error, /número/);
});

test('validarMaterial: en un tipo sin peso ignora lo que venga en peso', () => {
  const r = validarMaterial({ tipo: 'pelota', peso: '3', detalle: ' N° 7 ', cantidad: 15 });
  assert.deepEqual(r.fila, { tipo: 'pelota', pesoKg: null, detalle: 'N° 7', cantidad: 15 });
});

test('validarMaterial: "otro" exige nombre y deja el peso opcional', () => {
  assert.match(validarMaterial({ tipo: 'otro', peso: '', detalle: '  ', cantidad: '1' }).error, /qué es/);
  assert.equal(validarMaterial({ tipo: 'otro', peso: '', detalle: 'Vallas', cantidad: '8' }).fila.pesoKg, null);
  assert.equal(validarMaterial({ tipo: 'otro', peso: '5', detalle: 'Chaleco', cantidad: '3' }).fila.pesoKg, 5);
  assert.match(validarMaterial({ tipo: 'otro', peso: 'cinco', detalle: 'Chaleco', cantidad: '3' }).error, /kg/);
});

test('validarMaterial: la cantidad es un entero de 1 para arriba', () => {
  for (const cantidad of ['0', '-1', '1,5', '', 'dos']) {
    assert.match(validarMaterial({ tipo: 'cono', peso: '', detalle: '', cantidad }).error, /cantidad/i, cantidad);
  }
});

test('validarMaterial: sin tipo da error', () => {
  assert.match(validarMaterial({ tipo: '', peso: '', detalle: '', cantidad: '1' }).error, /tipo/);
});

/* ---------- buscar igual ---------- */

test('buscarIgual usa la misma regla que el índice único', () => {
  const filas = [
    fila({ id: 'a' }),
    fila({ id: 'b', tipo: 'cono', pesoKg: null }),
    fila({ id: 'c', tipo: 'otro', pesoKg: null, detalle: 'Vallas' }),
  ];
  assert.equal(buscarIgual(filas, { tipo: 'mancuerna', pesoKg: 10, detalle: '' })?.id, 'a');
  assert.equal(buscarIgual(filas, { tipo: 'mancuerna', pesoKg: 12, detalle: '' }), null);
  assert.equal(buscarIgual(filas, { tipo: 'cono', pesoKg: null, detalle: '' })?.id, 'b');
  assert.equal(buscarIgual(filas, { tipo: 'otro', pesoKg: null, detalle: 'vallas' })?.id, 'c');
  assert.equal(buscarIgual(filas, { tipo: 'otro', pesoKg: 2, detalle: 'Vallas' }), null);
});

/* ---------- agrupar y mostrar ---------- */

test('agruparInventario: secciones en orden, grupos en el orden de TIPOS, sin vacíos', () => {
  const secciones = agruparInventario([
    fila({ id: 'v', tipo: 'otro', pesoKg: null, detalle: 'Vallas' }),
    fila({ id: 'p', tipo: 'pelota', pesoKg: null, detalle: 'N° 7' }),
    fila({ id: 'd', tipo: 'disco', pesoKg: 5 }),
    fila({ id: 'm', tipo: 'mancuerna', pesoKg: 10 }),
  ]);
  assert.deepEqual(secciones.map((s) => s.titulo), ['Con peso', 'Sin peso', 'Otros']);
  assert.deepEqual(secciones[0].grupos.map((g) => g.titulo), ['Mancuernas', 'Discos']);
  assert.deepEqual(secciones[1].grupos.map((g) => g.tipo), ['pelota']);
});

test('agruparInventario: dentro de un grupo, por peso y después por detalle', () => {
  const [conPeso] = agruparInventario([
    fila({ id: '10', pesoKg: 10 }),
    fila({ id: '2,5', pesoKg: 2.5 }),
    fila({ id: '5b', pesoKg: 5, detalle: 'hexagonal' }),
    fila({ id: '5a', pesoKg: 5, detalle: '' }),
  ]);
  assert.deepEqual(conPeso.grupos[0].filas.map((f) => f.id), ['2,5', '5a', '5b', '10']);
});

test('agruparInventario: sin filas, sin secciones', () => {
  assert.deepEqual(agruparInventario([]), []);
});

test('etiquetaDeFila: peso primero en los tipos fijos, nombre primero en "otro"', () => {
  assert.equal(etiquetaDeFila(fila({ tipo: 'barra', pesoKg: 10, detalle: 'EZ' })), '10 kg · EZ');
  assert.equal(etiquetaDeFila(fila({ tipo: 'disco', pesoKg: 1.25 })), '1,25 kg');
  assert.equal(etiquetaDeFila(fila({ tipo: 'pelota', pesoKg: null, detalle: 'N° 7' })), 'N° 7');
  assert.equal(etiquetaDeFila(fila({ tipo: 'otro', pesoKg: 5, detalle: 'Chaleco lastrado' })), 'Chaleco lastrado · 5 kg');
  assert.equal(etiquetaDeFila(fila({ tipo: 'cono', pesoKg: null })), '');
});

test('ultimoCambio: la fila con actualizadoEn más reciente', () => {
  const r = ultimoCambio([
    fila({ id: 'viejo', actualizadoEn: '2026-09-10T10:00:00+00:00' }),
    fila({ id: 'nuevo', actualizadoEn: '2026-09-18T09:00:00.5+00:00' }),
    fila({ id: 'medio', actualizadoEn: '2026-09-15T23:00:00-03:00' }),
  ]);
  assert.equal(r.id, 'nuevo');
  assert.equal(ultimoCambio([]), null);
});

test('textoYaExiste nombra el grupo, la variante y la cantidad', () => {
  assert.equal(
    textoYaExiste(fila({ pesoKg: 10, cantidad: 2 })),
    'Ya está en el inventario: Mancuernas · 10 kg (2 unid.).',
  );
  assert.equal(
    textoYaExiste(fila({ tipo: 'cono', pesoKg: null, cantidad: 20 })),
    'Ya está en el inventario: Conos (20 unid.).',
  );
});
```

- [ ] **Step 2: Sumar el test al script y ver que falla**

En `package.json`, agregar ` tests/inventario.test.js` al final de la lista del script `test` (después de `tests/prepararPayloadPlanFisico.test.js`, dentro de las comillas).

Run: `node --test tests/inventario.test.js`
Esperado: FAIL con `Cannot find module` de `src/data/inventario.js`.

- [ ] **Step 3: Implementar**

Crear `src/data/inventario.js`:

```js
import { parsearPeso, formatearKg } from './escalones.js';

/*
 * Lógica pura del inventario de material: los tipos, la validación del alta y
 * la edición, y cómo se agrupa y se nombra cada fila. Sin red, sin DOM. Ver
 * docs/superpowers/specs/2026-09-18-inventario-material-design.md.
 *
 * Los tipos y sus reglas de peso son los mismos que los check de
 * 0026_material.sql: si se suma un tipo, cambian los dos juntos.
 */

export const TIPOS = [
  { clave: 'mancuerna', nombre: 'Mancuerna', grupo: 'Mancuernas', peso: 'obligatorio' },
  { clave: 'disco', nombre: 'Disco', grupo: 'Discos', peso: 'obligatorio' },
  { clave: 'barra', nombre: 'Barra', grupo: 'Barras', peso: 'obligatorio' },
  { clave: 'pesa_rusa', nombre: 'Pesa rusa', grupo: 'Pesas rusas', peso: 'obligatorio' },
  { clave: 'balon_medicinal', nombre: 'Balón medicinal', grupo: 'Balones medicinales', peso: 'obligatorio' },
  { clave: 'pelota', nombre: 'Pelota', grupo: 'Pelotas', peso: 'no' },
  { clave: 'cono', nombre: 'Cono', grupo: 'Conos', peso: 'no' },
  { clave: 'soga', nombre: 'Soga', grupo: 'Sogas', peso: 'no' },
  { clave: 'escalerita', nombre: 'Escalerita', grupo: 'Escaleritas', peso: 'no' },
  { clave: 'banda', nombre: 'Banda elástica', grupo: 'Bandas elásticas', peso: 'no' },
  { clave: 'otro', nombre: 'Otro', grupo: 'Otros', peso: 'opcional' },
];

const SECCIONES = [
  { titulo: 'Con peso', peso: 'obligatorio' },
  { titulo: 'Sin peso', peso: 'no' },
  { titulo: 'Otros', peso: 'opcional' },
];

export function tipoDe(clave) {
  return TIPOS.find((t) => t.clave === clave) ?? null;
}

/**
 * Lo que escribió el coordinador → la fila a guardar, o el primer error. En
 * un tipo sin peso, lo que venga en `peso` se ignora: el campo ni se muestra.
 */
export function validarMaterial({ tipo, peso, detalle, cantidad }) {
  const t = tipoDe(tipo);
  if (!t) return { error: 'Elegí un tipo.', fila: null };

  const det = typeof detalle === 'string' ? detalle.trim() : '';
  if (t.peso === 'opcional' && !det) return { error: 'Escribí qué es.', fila: null };

  let pesoKg = null;
  const textoPeso = typeof peso === 'string' ? peso.trim() : '';
  if (t.peso === 'obligatorio' || (t.peso === 'opcional' && textoPeso)) {
    const r = parsearPeso(textoPeso);
    if (r.error) return { error: r.error, fila: null };
    pesoKg = r.kg;
  }

  const textoCantidad = String(cantidad ?? '').trim();
  const n = /^\d+$/.test(textoCantidad) ? Number(textoCantidad) : NaN;
  if (!(n >= 1)) return { error: 'La cantidad tiene que ser un número entero, de 1 para arriba.', fila: null };

  return { error: null, fila: { tipo: t.clave, pesoKg, detalle: det, cantidad: n } };
}

/** La fila que el índice único material_unico tomaría como la misma variante. */
export function buscarIgual(filas, fila) {
  const det = fila.detalle.toLowerCase();
  return filas.find((f) => f.tipo === fila.tipo
    && (f.pesoKg ?? null) === (fila.pesoKg ?? null)
    && f.detalle.toLowerCase() === det) ?? null;
}

function compararFilas(a, b) {
  const pa = a.pesoKg ?? -1;
  const pb = b.pesoKg ?? -1;
  if (pa !== pb) return pa - pb;
  return a.detalle.localeCompare(b.detalle, 'es');
}

function compararOtros(a, b) {
  return a.detalle.localeCompare(b.detalle, 'es') || (a.pesoKg ?? -1) - (b.pesoKg ?? -1);
}

/** Con peso, sin peso y otros; dentro, los tipos en el orden de TIPOS. */
export function agruparInventario(filas) {
  return SECCIONES.map((s) => ({
    titulo: s.titulo,
    grupos: TIPOS.filter((t) => t.peso === s.peso)
      .map((t) => ({
        tipo: t.clave,
        titulo: t.grupo,
        filas: filas.filter((f) => f.tipo === t.clave)
          .sort(t.peso === 'opcional' ? compararOtros : compararFilas),
      }))
      .filter((g) => g.filas.length),
  })).filter((s) => s.grupos.length);
}

/** Lo que distingue a la fila dentro de su grupo. '' si no tiene nada. */
export function etiquetaDeFila(fila) {
  const kg = fila.pesoKg != null ? `${formatearKg(fila.pesoKg)} kg` : '';
  const partes = fila.tipo === 'otro' ? [fila.detalle, kg] : [kg, fila.detalle];
  return partes.filter(Boolean).join(' · ');
}

export function ultimoCambio(filas) {
  let ultimo = null;
  for (const f of filas) {
    if (!ultimo || Date.parse(f.actualizadoEn) > Date.parse(ultimo.actualizadoEn)) ultimo = f;
  }
  return ultimo;
}

export function textoYaExiste(fila) {
  const etiqueta = etiquetaDeFila(fila);
  const grupo = tipoDe(fila.tipo)?.grupo ?? fila.tipo;
  return `Ya está en el inventario: ${grupo}${etiqueta ? ` · ${etiqueta}` : ''} (${fila.cantidad} unid.).`;
}
```

- [ ] **Step 4: Correr los tests**

Run: `node --test tests/inventario.test.js`
Esperado: PASS, todos.

Run: `npm test`
Esperado: PASS, todos (incluido el nuevo).

- [ ] **Step 5: Commit**

```bash
git add src/data/inventario.js tests/inventario.test.js package.json
git commit -m "$(cat <<'EOF'
feat(data): tipos, validación y agrupado del inventario

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Pestaña INVENTARIO del coordinador

**Files:**
- Modify: `src/data/repositorio.js` (agregar al final)
- Create: `src/ui/pantallas/inventario.js`
- Modify: `src/ui/chrome.js:42-45` (`TABS_COORDINACION`)
- Modify: `src/ui/pantallas/registro.js`
- Modify: `public/index.html:300` (después de la sección `p-coord-profes`)
- Modify: `public/css/componentes.css` (agregar al final)
- Test: `tests/navegacionInvariante.test.js`

**Interfaces:**
- Consumes: todo lo exportado por `src/data/inventario.js` (Task 2); tabla `material` (Task 1); `obtenerPerfilesDelClub(clubId) → { [userId]: nombre }` (ya existe en `repositorio.js`); `abrirHoja({ titulo, cuerpo, alCerrar })` y `cerrarHoja()` de `componentes/hoja.js`; `formatearKg`, `fechaLocal` de `data/escalones.js`; `escaparHtml`, `esErrorDeRed`, `toast`, `formatearFechaCorta` de `ui/nav.js`; `obtenerClubActual()` de `ui/sesion.js`.
- Produces:
  - En `repositorio.js`: `obtenerMaterial(clubId) → Promise<fila[]>`, `agregarMaterial({ clubId, tipo, pesoKg, detalle, cantidad }) → Promise<fila>`, `editarMaterial(id, { pesoKg, detalle, cantidad }) → Promise<fila>`, `quitarMaterial(id) → Promise<void>`. Los errores de Supabase se relanzan tal cual (conservan `.code`, p. ej. `'23505'`); un update o delete que la RLS no deja pasar lanza `Error('NO_SE_PUDO_EDITAR')` / `Error('NO_SE_PUDO_QUITAR')`.
  - En `ui/pantallas/inventario.js`: `renderInventarioCoordinacion() → Promise<void>` (pinta en `#coord-inventario-contenido`) y `renderInventarioLectura() → Promise<void>` (pinta en `#inventario-contenido`; lo usa la Task 4).

- [ ] **Step 1: Escribir el test de navegación**

Agregar al final de `tests/navegacionInvariante.test.js`:

```js
test('coordinación tiene INVENTARIO después de Profes, y cada pestaña tiene su sección', async () => {
  const { TABS_COORDINACION } = await import('../src/ui/chrome.js');
  assert.deepEqual(TABS_COORDINACION.map((t) => t.id), ['p-coord-panorama', 'p-coord-profes', 'p-coord-inventario']);
  assert.equal(TABS_COORDINACION[2].texto, 'Inventario');
  const html = fuente('public/index.html');
  for (const t of TABS_COORDINACION) assert.match(html, new RegExp(`<section class="pant" id="${t.id}">`), t.id);
  assert.match(html, /id="coord-inventario-contenido"/);
});

test('la pestaña INVENTARIO está registrada con su render', () => {
  const src = fuente('src/ui/pantallas/registro.js');
  assert.match(src, /registrarPantalla\('p-coord-inventario', \{ titulo: 'Inventario', render: renderInventarioCoordinacion \}\)/);
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `node --test tests/navegacionInvariante.test.js`
Esperado: FAIL en los dos tests nuevos (falta `p-coord-inventario`).

- [ ] **Step 3: Funciones del repositorio**

Agregar al final de `src/data/repositorio.js`:

```js
/* ---------- Inventario de material (0026) ---------- */

const COLUMNAS_MATERIAL = 'id, tipo, peso_kg, detalle, cantidad, actualizado_por, actualizado_en';

const materialDesdeFila = (f) => ({
  id: f.id,
  tipo: f.tipo,
  pesoKg: f.peso_kg == null ? null : Number(f.peso_kg),
  detalle: f.detalle,
  cantidad: f.cantidad,
  actualizadoPor: f.actualizado_por,
  actualizadoEn: f.actualizado_en,
});

/** Todo el inventario del club. Lo lee cualquier miembro (RLS de 0026). */
export async function obtenerMaterial(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('material')
    .select(COLUMNAS_MATERIAL)
    .eq('club_id', clubId);
  if (error) throw error;
  return data.map(materialDesdeFila);
}

/**
 * Insert simple, no upsert: si la variante ya existe, el índice único
 * devuelve 23505 y la pantalla ofrece editar la existente. Sumar cantidades a
 * ciegas es lo que infla un inventario.
 */
export async function agregarMaterial({ clubId, tipo, pesoKg, detalle, cantidad }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('material')
    .insert({ club_id: clubId, tipo, peso_kg: pesoKg, detalle, cantidad })
    .select(COLUMNAS_MATERIAL)
    .single();
  if (error) throw error;
  return materialDesdeFila(data);
}

/**
 * Sólo las columnas con grant de update: el tipo y el club no cambian. Se pide
 * la fila de vuelta porque un update que la RLS no deja pasar no da error:
 * afecta cero filas.
 */
export async function editarMaterial(id, { pesoKg, detalle, cantidad }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('material')
    .update({ peso_kg: pesoKg, detalle, cantidad })
    .eq('id', id)
    .select(COLUMNAS_MATERIAL);
  if (error) throw error;
  if (!data.length) throw new Error('NO_SE_PUDO_EDITAR');
  return materialDesdeFila(data[0]);
}

/** Lo que ya no se tiene se borra (spec 4.3). Cero filas = la RLS no dejó. */
export async function quitarMaterial(id) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('material')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_SE_PUDO_QUITAR');
}
```

- [ ] **Step 4: La pantalla**

Crear `src/ui/pantallas/inventario.js`:

```js
import {
  obtenerMaterial, agregarMaterial, editarMaterial, quitarMaterial, obtenerPerfilesDelClub,
} from '../../data/repositorio.js';
import {
  TIPOS, tipoDe, validarMaterial, buscarIgual, agruparInventario,
  etiquetaDeFila, ultimoCambio, textoYaExiste,
} from '../../data/inventario.js';
import { formatearKg, fechaLocal } from '../../data/escalones.js';
import { obtenerClubActual } from '../sesion.js';
import { escaparHtml, esErrorDeRed, toast, formatearFechaCorta } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';

const $ = (id) => document.getElementById(id);
const SIN_CONEXION = 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';

/*
 * Inventario de material del club. Una sola pantalla en dos variantes: la del
 * coordinador (pestaña INVENTARIO, agrega, edita y quita por hojas) y la de
 * lectura (el profe llega desde el pie de FÍSICO). Lo que cada uno puede hacer
 * lo garantiza la base (0026); esta pantalla sólo no ofrece lo que la base
 * rechazaría. Ver docs/superpowers/specs/2026-09-18-inventario-material-design.md.
 */

// Lo leído en el último render: { filas, nombres: { userId: nombre } }.
let vista = { filas: [], nombres: {} };

function mensajeDeError(e) {
  if (esErrorDeRed(e)) return SIN_CONEXION;
  const texto = e?.message ?? '';
  if (e?.code === '42501' || /NO_SE_PUDO|row-level security|permission denied/i.test(texto)) {
    return 'No tenés permiso para hacer eso.';
  }
  return 'No se pudo guardar. Probá de nuevo.';
}

/** "Tomás, 18/09", o sólo la fecha si esa persona no cargó nombre. */
function autoria(fila) {
  const fecha = formatearFechaCorta(fechaLocal(new Date(fila.actualizadoEn)));
  const nombre = vista.nombres[fila.actualizadoPor];
  return nombre ? `${escaparHtml(nombre)}, ${fecha}` : fecha;
}

/* ---------- lista ---------- */

function filaHtml(fila, editable) {
  const etiqueta = etiquetaDeFila(fila) || tipoDe(fila.tipo).nombre;
  const contenido = `
    <span class="nom">${escaparHtml(etiqueta)}</span>
    <span class="det">${fila.cantidad} unid.</span>
  `;
  return editable
    ? `<button type="button" class="jug-fila" data-material="${fila.id}">${contenido}</button>`
    : `<div class="jug-fila">${contenido}</div>`;
}

function listaHtml(editable) {
  return agruparInventario(vista.filas).map((s) => `
    <div class="eyebrow">${escaparHtml(s.titulo)}</div>
    ${s.grupos.map((g) => `
      <div class="inv-grupo">${escaparHtml(g.titulo)}</div>
      ${g.filas.map((f) => filaHtml(f, editable)).join('')}
    `).join('')}
  `).join('');
}

async function pintar(idContenedor, editable) {
  const club = obtenerClubActual();
  const contenedor = $(idContenedor);
  if (!club || !contenedor) return;
  contenedor.innerHTML = '<div class="pad"><div class="p">Cargando...</div></div>';

  try {
    const [filas, nombres] = await Promise.all([
      obtenerMaterial(club.id),
      obtenerPerfilesDelClub(club.id),
    ]);
    vista = { filas, nombres };
  } catch (e) {
    if (!esErrorDeRed(e)) console.error('No se pudo cargar el inventario:', e);
    contenedor.innerHTML = `<div class="pad"><div class="p">${
      esErrorDeRed(e) ? SIN_CONEXION : 'No se pudo cargar el inventario.'
    }</div></div>`;
    return;
  }

  const ultimo = ultimoCambio(vista.filas);
  const vacio = editable
    ? 'Todavía no hay nada en el inventario. Agregá lo que tiene el club para que los profes sepan con qué cuentan.'
    : 'Todavía no hay nada en el inventario. Lo carga coordinación.';
  const cuerpo = vista.filas.length
    ? `${listaHtml(editable)}<div class="p det">Último cambio: ${autoria(ultimo)}</div>`
    : `<div class="estado-vacio"><h2>Inventario</h2><div class="p">${vacio}</div></div>`;

  contenedor.innerHTML = `
    <div class="pad">${cuerpo}</div>
    ${editable ? '<div class="pie-fijo"><button class="btn" id="btn-agregar-material">Agregar material</button></div>' : ''}
  `;

  if (!editable) return;
  $('btn-agregar-material').addEventListener('click', () => abrirAlta());
  contenedor.querySelectorAll('[data-material]').forEach((b) => b.addEventListener('click', () => {
    abrirEdicion(vista.filas.find((f) => f.id === b.dataset.material));
  }));
}

export function renderInventarioCoordinacion() {
  return pintar('coord-inventario-contenido', true);
}

export function renderInventarioLectura() {
  return pintar('inventario-contenido', false);
}

/* ---------- hojas ---------- */

function campo(id, rotulo, valor, decimal = false) {
  return `
    <div class="campo">
      <label for="${id}">${escaparHtml(rotulo)}</label>
      <input id="${id}" type="text" ${decimal ? 'inputmode="decimal"' : ''} autocomplete="off" value="${escaparHtml(valor)}">
    </div>
  `;
}

/** Los campos de un tipo. En "otro", "Nombre" ocupa el lugar de "Detalle": los dos van a `detalle`. */
function camposHtml(t, { peso, detalle, cantidad }) {
  const esOtro = t.peso === 'opcional';
  const rotuloDetalle = esOtro ? 'Nombre' : t.clave === 'pelota' ? 'Número (opcional)' : 'Detalle (opcional)';
  const rotuloPeso = `Peso de cada unidad (kg)${esOtro ? ' (opcional)' : ''}`;
  return `
    ${esOtro ? campo('inv-detalle', rotuloDetalle, detalle) : ''}
    ${t.peso !== 'no' ? campo('inv-peso', rotuloPeso, peso, true) : ''}
    ${esOtro ? '' : campo('inv-detalle', rotuloDetalle, detalle)}
    <div class="campo">
      <label for="inv-cant">Cantidad (unidades sueltas)</label>
      <div class="inv-cantidad">
        <button type="button" class="btn sec chico" id="inv-menos" aria-label="Una menos">−</button>
        <input id="inv-cant" type="text" inputmode="numeric" autocomplete="off" value="${escaparHtml(String(cantidad))}">
        <button type="button" class="btn sec chico" id="inv-mas" aria-label="Una más">+</button>
      </div>
    </div>
  `;
}

/** − no baja de 1: llegar a cero es "Quitar del inventario". */
function ligarCantidad() {
  const input = $('inv-cant');
  $('inv-menos').addEventListener('click', () => {
    const n = parseInt(input.value, 10);
    input.value = String(Number.isInteger(n) && n > 1 ? n - 1 : 1);
  });
  $('inv-mas').addEventListener('click', () => {
    const n = parseInt(input.value, 10);
    input.value = String(Number.isInteger(n) && n > 0 ? n + 1 : 1);
  });
}

function valoresActuales() {
  return {
    peso: $('inv-peso')?.value ?? '',
    detalle: $('inv-detalle')?.value ?? '',
    cantidad: $('inv-cant')?.value ?? '1',
  };
}

function ofrecerEditar(fila) {
  abrirHoja({
    titulo: 'Ya está cargado',
    cuerpo: `
      <div class="p">${escaparHtml(textoYaExiste(fila))} ¿Editar esa fila?</div>
      <div class="acciones">
        <button class="btn" id="inv-ir-a-editar">Editar esa fila</button>
        <button class="btn sec" id="inv-cancelar">Cancelar</button>
      </div>
    `,
  });
  $('inv-cancelar').addEventListener('click', () => cerrarHoja());
  $('inv-ir-a-editar').addEventListener('click', () => abrirEdicion(fila));
}

function abrirAlta() {
  let tipo = null;
  abrirHoja({
    titulo: 'Agregar material',
    cuerpo: `
      <div class="chips-tema" role="group" aria-label="Tipo">
        ${TIPOS.map((t) => `<button type="button" class="chip-tema" data-tipo="${t.clave}">${escaparHtml(t.nombre)}</button>`).join('')}
      </div>
      <div id="inv-campos"></div>
      <div class="acciones">
        <button class="btn" id="inv-guardar" disabled>Guardar</button>
        <button class="btn sec" id="inv-cancelar">Cancelar</button>
      </div>
    `,
  });

  document.querySelectorAll('#hoja [data-tipo]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const previos = tipo ? valoresActuales() : { peso: '', detalle: '', cantidad: '1' };
      tipo = tipoDe(chip.dataset.tipo);
      document.querySelectorAll('#hoja [data-tipo]').forEach((c) => c.classList.toggle('on', c === chip));
      $('inv-campos').innerHTML = camposHtml(tipo, previos);
      ligarCantidad();
      $('inv-guardar').disabled = false;
    });
  });
  $('inv-cancelar').addEventListener('click', () => cerrarHoja());

  $('inv-guardar').addEventListener('click', async () => {
    const boton = $('inv-guardar');
    if (boton.disabled || !tipo) return;
    const r = validarMaterial({ tipo: tipo.clave, ...valoresActuales() });
    if (r.error) { toast(r.error); return; }
    const igual = buscarIgual(vista.filas, r.fila);
    if (igual) { ofrecerEditar(igual); return; }

    const club = obtenerClubActual();
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    try {
      await agregarMaterial({ clubId: club.id, ...r.fila });
      cerrarHoja();
      toast('Listo.');
      await renderInventarioCoordinacion();
    } catch (e) {
      // Otro coordinador la cargó mientras tanto: se relee y se ofrece esa.
      if (e?.code === '23505') {
        try {
          vista.filas = await obtenerMaterial(club.id);
          const otra = buscarIgual(vista.filas, r.fila);
          if (otra) { ofrecerEditar(otra); return; }
        } catch { /* cae al toast de abajo */ }
      }
      toast(mensajeDeError(e));
      boton.disabled = false;
      boton.textContent = 'Guardar';
    }
  });
}

function abrirEdicion(fila) {
  const tipo = tipoDe(fila.tipo);
  abrirHoja({
    titulo: tipo.nombre,
    cuerpo: `
      ${camposHtml(tipo, {
        peso: fila.pesoKg != null ? formatearKg(fila.pesoKg) : '',
        detalle: fila.detalle,
        cantidad: fila.cantidad,
      })}
      <div class="p det">Modificado: ${autoria(fila)}</div>
      <div class="acciones">
        <button class="btn" id="inv-guardar">Guardar</button>
        <button class="btn sec" id="inv-cancelar">Cancelar</button>
      </div>
      <div class="acciones">
        <button class="btn sec" id="inv-quitar">Quitar del inventario</button>
      </div>
    `,
  });
  ligarCantidad();
  $('inv-cancelar').addEventListener('click', () => cerrarHoja());
  $('inv-quitar').addEventListener('click', () => confirmarQuitar(fila));

  $('inv-guardar').addEventListener('click', async () => {
    const boton = $('inv-guardar');
    if (boton.disabled) return;
    const r = validarMaterial({ tipo: fila.tipo, ...valoresActuales() });
    if (r.error) { toast(r.error); return; }
    if (buscarIgual(vista.filas.filter((f) => f.id !== fila.id), r.fila)) {
      toast('Ya hay otra fila igual. Editá esa, o quitá esta.');
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    try {
      await editarMaterial(fila.id, r.fila);
      cerrarHoja();
      toast('Listo.');
      await renderInventarioCoordinacion();
    } catch (e) {
      toast(e?.code === '23505' ? 'Ya hay otra fila igual. Editá esa, o quitá esta.' : mensajeDeError(e));
      boton.disabled = false;
      boton.textContent = 'Guardar';
    }
  });
}

function confirmarQuitar(fila) {
  const nombre = [tipoDe(fila.tipo).grupo, etiquetaDeFila(fila)].filter(Boolean).join(' · ');
  abrirHoja({
    titulo: 'Quitar del inventario',
    cuerpo: `
      <div class="p">¿Quitar ${escaparHtml(nombre)} (${fila.cantidad} unid.) del inventario?</div>
      <div class="acciones">
        <button class="btn" id="inv-confirmar-quitar">Quitar</button>
        <button class="btn sec" id="inv-cancelar">Cancelar</button>
      </div>
    `,
  });
  $('inv-cancelar').addEventListener('click', () => cerrarHoja());
  $('inv-confirmar-quitar').addEventListener('click', async () => {
    const boton = $('inv-confirmar-quitar');
    if (boton.disabled) return;
    boton.disabled = true;
    try {
      await quitarMaterial(fila.id);
      cerrarHoja();
      toast('Listo: quitado del inventario.');
      await renderInventarioCoordinacion();
    } catch (e) {
      toast(mensajeDeError(e));
      boton.disabled = false;
    }
  });
}
```

- [ ] **Step 5: Pestaña, registro, sección y estilos**

En `src/ui/chrome.js`, reemplazar el bloque de `TABS_COORDINACION`:

```js
// Coordinación: tres pestañas y ningún chip de categoría. No hay "categoría
// activa" porque el coordinador no entra a ninguna. INVENTARIO es del club
// entero, y es la única que escribe algo que no son accesos.
export const TABS_COORDINACION = [
  { id: 'p-coord-panorama', texto: 'Panorama', icono: ICONOS.datos },
  { id: 'p-coord-profes', texto: 'Profes', icono: ICONOS.plantel },
  { id: 'p-coord-inventario', texto: 'Inventario', icono: ICONOS.fisico },
];
```

En `src/ui/pantallas/registro.js`, agregar el import después del de `coordProfes.js`:

```js
import { renderInventarioCoordinacion } from './inventario.js';
```

y el registro después de `registrarPantalla('p-coord-profes', ...)`:

```js
  registrarPantalla('p-coord-inventario', { titulo: 'Inventario', render: renderInventarioCoordinacion });
```

En `public/index.html`, después de la línea `<section class="pant" id="p-coord-profes">...</section>`:

```html
    <section class="pant" id="p-coord-inventario"><div id="coord-inventario-contenido"></div></section>
```

Al final de `public/css/componentes.css`:

```css
/* Inventario: el tipo encima de sus filas, y el contador de cantidad. */
.inv-grupo{margin:var(--sp-3) 0 var(--sp-1);font-weight:600;font-size:var(--fs-125);color:var(--gris-osc)}
.inv-cantidad{display:flex;align-items:center;gap:var(--sp-2)}
.inv-cantidad input{width:5rem;text-align:center}
```

- [ ] **Step 6: Correr los tests**

Run: `npm test`
Esperado: PASS, todos (incluidos los dos nuevos de navegación).

- [ ] **Step 7: Probarlo en la app**

Con Supabase local levantado y 0026 aplicada, levantar la app como en las etapas anteriores (skill `run` del proyecto o el servidor estático de siempre) y entrar con un usuario coordinador del club de prueba. Comprobar a 375 px de ancho:

1. Aparece la pestaña **Inventario** después de Profes; estado vacío con "Agregar material".
2. Alta de mancuerna 10 kg × 2: aparece bajo "Con peso › Mancuernas" como "10 kg · 2 unid.".
3. Alta de "Otro" sin nombre: toast "Escribí qué es."; con nombre "Vallas" y sin peso: aparece bajo "Otros".
4. Alta de otra mancuerna de 10: se abre "Ya está cargado" y "Editar esa fila" lleva a la edición.
5. Edición: cambiar la cantidad a 4 con + y guardar; "Último cambio" muestra el nombre y la fecha de hoy.
6. − en 1 se queda en 1. "Quitar del inventario" pide confirmación y la fila desaparece.
7. Con un usuario entrenador sin rol de coordinador: no hay pestaña Inventario.

Si algo no coincide, arreglarlo antes de commitear.

- [ ] **Step 8: Commit**

```bash
git add src/data/repositorio.js src/ui/pantallas/inventario.js src/ui/chrome.js src/ui/pantallas/registro.js public/index.html public/css/componentes.css tests/navegacionInvariante.test.js
git commit -m "$(cat <<'EOF'
feat(ui): pestaña Inventario para coordinación

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: El profe ve el inventario desde FÍSICO

**Files:**
- Modify: `src/ui/pantallas/fisico.js` (`pieCargar`, `ligarCargar`, imports)
- Modify: `src/ui/pantallas/registro.js`
- Modify: `public/index.html` (después de la sección `p-fisico-escalones`)
- Test: `tests/navegacionInvariante.test.js`

**Interfaces:**
- Consumes: `renderInventarioLectura()` de `src/ui/pantallas/inventario.js` (Task 3); `ir(id, { push })` de `src/ui/main.js`.
- Produces: pantalla `p-inventario` (título "Inventario"), sólo lectura, a la que se llega con `ir('p-inventario', { push: true })`.

- [ ] **Step 1: Escribir el test**

Agregar al final de `tests/navegacionInvariante.test.js`:

```js
test('el profe llega al inventario desde el pie de FÍSICO, en una pantalla sólo de lectura', () => {
  const registro = fuente('src/ui/pantallas/registro.js');
  assert.match(registro, /registrarPantalla\('p-inventario', \{ titulo: 'Inventario', render: renderInventarioLectura \}\)/);
  const html = fuente('public/index.html');
  assert.match(html, /<section class="pant" id="p-inventario"><div id="inventario-contenido"><\/div><\/section>/);
  const fisico = fuente('src/ui/pantallas/fisico.js');
  assert.match(fisico, /id="btn-ver-inventario"/);
  assert.match(fisico, /ir\('p-inventario', \{ push: true \}\)/);
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `node --test tests/navegacionInvariante.test.js`
Esperado: FAIL en el test nuevo.

- [ ] **Step 3: Implementar**

En `src/ui/pantallas/fisico.js`, reemplazar `pieCargar` y `ligarCargar`:

```js
// El inventario es del club, no de la categoría: el enlace está en todos los
// estados de FÍSICO y no depende del chip. Va en el mismo pie: una sola
// franja inferior por pantalla.
function pieCargar() {
  return `<div class="pie-fijo">
    <button class="btn" id="btn-cargar-plan-fisico">Cargar plan de fuerza</button>
    <button class="btn sec" id="btn-ver-inventario">Inventario del club</button>
  </div>`;
}

function ligarCargar() {
  $('btn-cargar-plan-fisico')?.addEventListener('click', () => $('input-plan-fisico').click());
  $('btn-ver-inventario')?.addEventListener('click', () => ir('p-inventario', { push: true }));
}
```

(`ir` ya está importado de `'../main.js'` en la primera línea del archivo.)

En `src/ui/pantallas/registro.js`, cambiar el import de la Task 3 por:

```js
import { renderInventarioCoordinacion, renderInventarioLectura } from './inventario.js';
```

y agregar, después de `registrarPantalla('p-fisico-escalones', ...)`:

```js
  registrarPantalla('p-inventario', { titulo: 'Inventario', render: renderInventarioLectura });
```

En `public/index.html`, después de la línea `<section class="pant" id="p-fisico-escalones">...</section>`:

```html
    <section class="pant" id="p-inventario"><div id="inventario-contenido"></div></section>
```

- [ ] **Step 4: Correr los tests**

Run: `npm test`
Esperado: PASS, todos.

- [ ] **Step 5: Probarlo en la app**

Con un usuario entrenador (sin coordinación), a 375 px:

1. En FÍSICO, con y sin plan cargado, el pie muestra "Cargar plan de fuerza" y debajo "Inventario del club".
2. "Inventario del club" abre la lista con flecha de volver, sin botón "Agregar material", y tocar una fila no abre nada.
3. Volver regresa a FÍSICO.
4. El chip de categoría sigue visible arriba (el chrome lo muestra en todo el modo entrenar); cambiarlo no cambia la lista.

- [ ] **Step 6: Commit**

```bash
git add src/ui/pantallas/fisico.js src/ui/pantallas/registro.js public/index.html tests/navegacionInvariante.test.js
git commit -m "$(cat <<'EOF'
feat(ui): el profe ve el inventario del club desde FÍSICO

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Diferencias con el spec

Decididas al escribir el plan; el spec se corrige en el mismo commit que este plan.

- **Un solo archivo de pantalla**, `src/ui/pantallas/inventario.js`, en vez de `coordInventario.js`: la lista es la misma para el coordinador y para el profe, y cambia sólo si se puede editar.
- **El chip de categoría se ve** en la pantalla de lectura del profe: `renderChrome` lo pinta en todo el modo entrenar, y sacarlo para una sola pantalla es tocar el chrome por algo cosmético. La lista no depende de él.
- **"Peso de cada unidad"** en vez de "de cada una": el rótulo es el mismo para discos, barras y pesas rusas.
- **Guardar valida al tocarlo**, con un toast, en vez de quedar deshabilitado hasta que el formulario esté completo: es el patrón del resto de las hojas.
