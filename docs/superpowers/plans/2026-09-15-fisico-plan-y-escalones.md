# Pantalla FÍSICO: ver el plan y manejar escalones — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que la pestaña FÍSICO muestre el plan cargado de la categoría activa
(sesiones, ejercicios, videos) y que el profe ubique, suba y baje a cada chico
entre los escalones de peso de una escalera por ejercicio, común a todo el club.

**Arquitectura:** una migración (`0023`: `escalera_fuerza`, `movimiento_escalon`
de sólo inserts, la vista `escalon_actual` y la baja de `escalon_kg`), funciones
puras en `src/data/escalones.js`, siete funciones nuevas en `repositorio.js`, y
tres pantallas: FÍSICO reescrita, más `p-fisico-sesion` y `p-fisico-escalones`.
Sin RPC: cada escritura toca una fila.

**Tech stack:** HTML/CSS/JS vanilla con módulos ES nativos y sin build; Supabase
(Postgres 17 + PostgREST, RLS); `node:test`; Docker local con la CLI de Supabase.

**Spec:** `docs/superpowers/specs/2026-09-15-fisico-plan-y-escalones-design.md`
(commit `4358fa4`). Leelo antes de empezar: este plan lo implementa y no repite
sus motivos.

## Restricciones globales

- **Nada contra producción.** Todo se prueba en el Docker local. `npx supabase
  db push` lo corre Tomás, y antes se le muestra el SQL completo.
- **No tocar** `src/parser/parserFisico.js`, `src/ui/pantallas/planFisico.js`,
  `src/data/prepararPayloadPlanFisico.js` ni `0021_rpc_importar_plan_fisico.sql`.
  El import y el matcheo de videos no cambian.
- **La app no propone ni calcula pesos.** Sin valores por defecto, sin normas por
  edad, sin placeholder numérico, y un chico sin escalón no se ubica solo en el
  más liviano.
- **Coincidencia exacta** entre una línea y su escalera: `clavearNombre` de
  `src/parser/parserCabb.js`, sin parecidos.
- **Un peso que ya no está en la escalera se informa, no se alarma:** texto
  normal de la fila ("este peso ya no está en la escalera actual"), sin rojo,
  sin ícono y sin `.al`.
- **Sin video no se dice nada.** Sólo aparece "Ver video" cuando hay link.
- **Reps, carga y pausa se muestran como texto, tal cual.**
- Los breakpoints sólo en `layout.css`; todo lo táctil a 44px; nada que dependa
  de hover.
- Club del piloto: `20000000-0000-0000-0000-000000000001`. Planteles: U17M
  `20000000-0000-0000-0000-000000000004`, U21M
  `20000000-0000-0000-0000-000000000003`.
- `npm test` en verde al cerrar cada tarea (hoy: 191 tests).
- Un commit por tarea. **No pushear.**

## Mapa de archivos

| Archivo | Tarea | Responsabilidad |
|---|---|---|
| `supabase/migrations/0023_escalones_fuerza.sql` | 1 | Tablas, trigger, vista, RLS, grants, baja de `escalon_kg`. |
| `tests/rollback0023.sql` | 1 | Deshace 0023 en el Docker local. |
| `tests/verificarEscalones.sql` | 1 | Constraints, grants y RLS contra el Docker local; termina en rollback. |
| `tests/verificarImportarPlanFisico.js` | 1 | Deja de leer `escalon_kg`. |
| `src/data/escalones.js` | 2 | Lógica pura: pesos, escalones, plan visible, fechas y agrupado. |
| `tests/escalones.test.js` | 2 | Tests de lo anterior. |
| `package.json` | 2 | Suma `tests/escalones.test.js` a `npm test`. |
| `src/data/repositorio.js` | 3 | Siete funciones nuevas, sólo agregar al final. |
| `public/css/componentes.css` | 4 | `.linea-fisico`, `.escalon-fila`, `.acciones-escalera`. |
| `src/ui/pantallas/fisico.js` | 4 | FÍSICO: cargando, sin plan, error, con plan. |
| `src/ui/pantallas/fisicoSesion.js` | 4 | Sesión. |
| `src/ui/pantallas/fisicoEscalones.js` | 5 | Escalones de un ejercicio y sus dos hojas. |
| `public/index.html`, `src/ui/pantallas/registro.js` | 4 y 5 | Secciones y registro de las pantallas. |
| `tests/navegacionInvariante.test.js` | 4 y 5 | Tests de fuente de las pantallas. |
| `supabase/ESQUEMA.md` | 6 | Documentación de 0023. |

---

## Preparación del entorno local (una vez, antes de la Tarea 1)

Nada de esto se commitea. Los archivos auxiliares van a un directorio de trabajo
fuera del repo: `TRABAJO=$(mktemp -d)`.

- [ ] **Paso 1: Docker y Supabase local arriba**

```bash
docker ps --format '{{.Names}}' | grep supabase_db_
npx supabase status -o json
```

Esperado: el contenedor `supabase_db_…` listado, y en el JSON `API_URL`
`http://127.0.0.1:54321`, `PUBLISHABLE_KEY` y `SERVICE_ROLE_KEY`.

- [ ] **Paso 2: entrenador de prueba asignado a U17M y U21M**

```bash
SRK=$(npx supabase status -o json | python -c "import sys,json; print(json.load(sys.stdin)['SERVICE_ROLE_KEY'])")
UID_=$(curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/users \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "Content-Type: application/json" \
  -d '{"email":"zztest.fisico@example.com","password":"zztest-local-1234","email_confirm":true,"user_metadata":{"nombre":"Profe ZZtest"}}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
docker exec -i "$DB" psql -U postgres -d postgres -X -c "
  insert into miembro_club (user_id, club_id, es_entrenador) values ('$UID_','20000000-0000-0000-0000-000000000001',true);
  insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen) values
    ('$UID_','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','manual'),
    ('$UID_','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','manual');"
```

- [ ] **Paso 3: jugadores en U17M**

```bash
docker exec -i "$DB" psql -U postgres -d postgres -X -t -A -c "
  select count(*) from pertenencia where plantel_id = '20000000-0000-0000-0000-000000000004' and hasta is null;"
```

Si da 0, crear tres sintéticos:

```bash
docker exec -i "$DB" psql -U postgres -d postgres -X -c "
  with j as (
    insert into jugador (club_id, nombre_clave, nombre_limpio) values
      ('20000000-0000-0000-0000-000000000001','ZZTEST DIAZ MATEO','ZZTEST DIAZ, MATEO'),
      ('20000000-0000-0000-0000-000000000001','ZZTEST GOMEZ LUIS','ZZTEST GOMEZ, LUIS'),
      ('20000000-0000-0000-0000-000000000001','ZZTEST ROSSI TOMAS','ZZTEST ROSSI, TOMAS')
    returning id)
  insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
  select p.club_id, j.id, p.id, p.temporada_id, current_date
  from j, plantel p where p.id = '20000000-0000-0000-0000-000000000004';"
```

- [ ] **Paso 4: la app apuntando al Docker local**

`public/index.html` trae la URL de producción. Se arma una copia en `$TRABAJO`
que apunta al Docker, con enlaces a `public/` y `src/` del repo. Crear
`$TRABAJO/armarLocal.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs';
const REPO = process.argv[2];
const KEY = process.argv[3];
let html = readFileSync(`${REPO}/public/index.html`, 'utf8');
html = html
  .replace(/window\.SUPABASE_URL\s*=\s*'[^']*';/, "window.SUPABASE_URL = 'http://127.0.0.1:54321';")
  .replace(/window\.SUPABASE_PUBLISHABLE_KEY\s*=\s*'[^']*';/, `window.SUPABASE_PUBLISHABLE_KEY = '${KEY}';`);
if (html.includes('.supabase.co')) throw new Error('La copia sigue apuntando a producción: no se escribe.');
writeFileSync(new URL('./local.html', import.meta.url), html);
console.log('local.html apunta a http://127.0.0.1:54321');
```

```bash
# Desde la raíz del repo:
REPO="$(pwd)"
KEY=$(npx supabase status -o json | python -c "import sys,json; print(json.load(sys.stdin)['PUBLISHABLE_KEY'])")
cd "$TRABAJO"
ln -s "$REPO/public" public; ln -s "$REPO/src" src
node armarLocal.mjs "$REPO" "$KEY"
python -m http.server 8765 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8765/local.html`, entrar con
`zztest.fisico@example.com` / `zztest-local-1234`, e importar el Físico.xlsx real
(`tests/fixtures/fisico.xlsx`) en U17M desde FÍSICO → "Cargar plan de fuerza".
`local.html` no se vuelve a armar: lee `src/` en vivo.

- [ ] **Paso 5 (al final de todo, Tarea 6): limpieza** — ver Tarea 6, Paso 7.

---

### Tarea 1: Migración 0023, rollback y verificación en la base

**Archivos:**
- Crear: `supabase/migrations/0023_escalones_fuerza.sql`
- Crear: `tests/rollback0023.sql`
- Crear: `tests/verificarEscalones.sql`
- Modificar: `tests/verificarImportarPlanFisico.js:114-121`

**Interfaces:**
- Consume: `jugador`, `pertenencia`, `miembro_club`, `ejercicio_asignado`
  (0001, 0016, 0017, 0020) y `puede_ver_plantel` / `puede_escribir_plantel`
  (cuerpo vigente de 0018).
- Produce, para las tareas 3 a 6:
  - `escalera_fuerza(id uuid, club_id uuid, clave text, nombre text, pesos numeric[], actualizado_por uuid, actualizado_en timestamptz)`, único `(club_id, clave)`. `authenticated` puede `select` e `insert`; `update` sólo sobre `pesos`.
  - `movimiento_escalon(id uuid, club_id uuid, jugador_id uuid, escalera_id uuid, kg numeric, creado_por uuid, creado_en timestamptz, orden bigint)`. `authenticated` puede `select` e `insert`, nada más.
  - Vista `escalon_actual(club_id, jugador_id, escalera_id, kg, creado_por, creado_en)`: un registro por `(jugador_id, escalera_id)` con el último movimiento.
  - `ejercicio_asignado` sin la columna `escalon_kg`.

- [ ] **Paso 1: escribir la verificación primero**

Crear `tests/verificarEscalones.sql`:

```sql
-- Verificación de 0023 (escalones de fuerza) contra el Docker LOCAL.
--
-- CÓMO SE CORRE (nunca contra producción):
--   DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
--   docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/verificarEscalones.sql
--
-- Cada bloque dice qué se espera. Crea usuarios, un jugador y movimientos
-- sintéticos dentro de UNA transacción que termina en ROLLBACK: no deja nada.
-- La impersonación (role authenticated + request.jwt.claims) es como PostgREST
-- evalúa la RLS de una sesión real.

\set ON_ERROR_STOP off
begin;

\echo '===== 0023 aplicada (esperado: t t t)'
select to_regclass('public.escalera_fuerza') is not null as escalera,
       to_regclass('public.movimiento_escalon') is not null as movimientos,
       to_regclass('public.escalon_actual') is not null as vista;

\echo '===== pesos_validos (esperado: t f f f f f)'
select pesos_validos(array[8, 10, 12.5]::numeric[]) as creciente,
       pesos_validos(array[10, 8]::numeric[]) as decreciente,
       pesos_validos(array[8, 8]::numeric[]) as repetido,
       pesos_validos('{}'::numeric[]) as vacio,
       pesos_validos(array[8, null]::numeric[]) as con_null,
       pesos_validos(array[0, 8]::numeric[]) as con_cero;

\echo '===== escalon_kg (esperado: 0)'
select count(*) as escalon_kg_existe
from information_schema.columns
where table_schema = 'public' and table_name = 'ejercicio_asignado' and column_name = 'escalon_kg';

-- Entrenador de U17M (C), coordinador puro (K), entrenador de U21M (O) y un
-- jugador (J) con pertenencia vigente a U17M.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('55555555-5555-5555-5555-555555555501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-c@verificacion.invalid', now(), now(), now()),
  ('55555555-5555-5555-5555-555555555502', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-k@verificacion.invalid', now(), now(), now()),
  ('55555555-5555-5555-5555-555555555503', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-o@verificacion.invalid', now(), now(), now());
insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador) values
  ('55555555-5555-5555-5555-555555555501', '20000000-0000-0000-0000-000000000001', true, false),
  ('55555555-5555-5555-5555-555555555502', '20000000-0000-0000-0000-000000000001', false, true),
  ('55555555-5555-5555-5555-555555555503', '20000000-0000-0000-0000-000000000001', true, false);
insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen) values
  ('55555555-5555-5555-5555-555555555501', '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'manual'),
  ('55555555-5555-5555-5555-555555555503', '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'manual');
insert into jugador (id, club_id, nombre_clave, nombre_limpio) values
  ('44444444-4444-4444-4444-444444444401', '20000000-0000-0000-0000-000000000001', 'ZZTEST JUGADOR', 'ZZTEST, JUGADOR');
insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
  select p.club_id, '44444444-4444-4444-4444-444444444401', p.id, p.temporada_id, current_date
  from plantel p where p.id = '20000000-0000-0000-0000-000000000004';

\echo '===== entrenador de U17M: define, ubica, sube; dos movimientos en la misma transacción (esperado: 12)'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555501","role":"authenticated"}', true) \g /dev/null
insert into escalera_fuerza (club_id, clave, nombre, pesos)
  values ('20000000-0000-0000-0000-000000000001', 'ZZTEST PRESS', 'ZZtest Press', array[8, 10, 12]::numeric[])
  returning id \gset esc_
insert into movimiento_escalon (club_id, jugador_id, escalera_id, kg)
  values ('20000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', :'esc_id', 10);
insert into movimiento_escalon (club_id, jugador_id, escalera_id, kg)
  values ('20000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', :'esc_id', 12);
select kg as escalon_actual from escalon_actual where jugador_id = '44444444-4444-4444-4444-444444444401';

\echo '===== editar pesos: permitido, y el trigger sella (esperado: {8,10,12,14} | t)'
update escalera_fuerza set pesos = array[8, 10, 12, 14]::numeric[] where id = :'esc_id'
  returning pesos, actualizado_por = '55555555-5555-5555-5555-555555555501' as sellado_por_trigger;

\echo '===== editar nombre: esperado permission denied'
savepoint s1;
update escalera_fuerza set nombre = 'Otro nombre' where id = :'esc_id';
rollback to savepoint s1;

\echo '===== update de un movimiento: esperado permission denied'
savepoint s2;
update movimiento_escalon set kg = 99 where jugador_id = '44444444-4444-4444-4444-444444444401';
rollback to savepoint s2;

\echo '===== delete de un movimiento: esperado permission denied'
savepoint s3;
delete from movimiento_escalon where jugador_id = '44444444-4444-4444-4444-444444444401';
rollback to savepoint s3;

\echo '===== movimiento a nombre de otro: esperado row-level security'
savepoint s4;
insert into movimiento_escalon (club_id, jugador_id, escalera_id, kg, creado_por)
  values ('20000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', :'esc_id', 8, '55555555-5555-5555-5555-555555555503');
rollback to savepoint s4;

\echo '===== kg 0: esperado check violation'
savepoint s5;
insert into movimiento_escalon (club_id, jugador_id, escalera_id, kg)
  values ('20000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', :'esc_id', 0);
rollback to savepoint s5;

\echo '===== escalera decreciente: esperado check violation'
savepoint s6;
insert into escalera_fuerza (club_id, clave, nombre, pesos)
  values ('20000000-0000-0000-0000-000000000001', 'ZZTEST OTRO', 'ZZtest Otro', array[10, 8]::numeric[]);
rollback to savepoint s6;
reset role;

\echo '===== entrenador de U21M sin el chico (esperado: 0 | 0 | 1, y el insert con row-level security)'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555503","role":"authenticated"}', true) \g /dev/null
select (select count(*) from movimiento_escalon where jugador_id = '44444444-4444-4444-4444-444444444401') as ve_movimientos,
       (select count(*) from escalon_actual where jugador_id = '44444444-4444-4444-4444-444444444401') as ve_escalon,
       (select count(*) from escalera_fuerza where clave = 'ZZTEST PRESS') as ve_escalera;
savepoint s7;
insert into movimiento_escalon (club_id, jugador_id, escalera_id, kg)
  values ('20000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', :'esc_id', 8);
rollback to savepoint s7;
reset role;

\echo '===== coordinador puro (esperado: 0 | 0 | 1)'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555502","role":"authenticated"}', true) \g /dev/null
select (select count(*) from movimiento_escalon) as ve_movimientos,
       (select count(*) from escalon_actual) as ve_escalon,
       (select count(*) from escalera_fuerza where clave = 'ZZTEST PRESS') as ve_escalera;
reset role;

\echo '===== citado también a U21M: el profe de U21M lo ve con el mismo escalón (esperado: 12)'
insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
  select p.club_id, '44444444-4444-4444-4444-444444444401', p.id, p.temporada_id, current_date
  from plantel p where p.id = '20000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555503","role":"authenticated"}', true) \g /dev/null
select kg as escalon_desde_u21m from escalon_actual where jugador_id = '44444444-4444-4444-4444-444444444401';
reset role;

\echo '===== anon: esperado permission denied'
set local role anon;
savepoint s8;
select count(*) from escalon_actual;
rollback to savepoint s8;
reset role;

rollback;
\echo '===== fin: todo deshecho'
```

- [ ] **Paso 2: correrla sin la migración y ver que falla**

```bash
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/verificarEscalones.sql
```

Esperado: el primer bloque da `f | f | f` y los siguientes fallan con
`function pesos_validos(numeric[]) does not exist` o `relation "escalera_fuerza"
does not exist`.

- [ ] **Paso 3: escribir la migración**

Crear `supabase/migrations/0023_escalones_fuerza.sql` con este contenido exacto
(es el de la sección 5.7 del spec, ya probado):

```sql
-- Etapa 7: escalones de peso por jugador.
-- Ver docs/superpowers/specs/2026-09-15-fisico-plan-y-escalones-design.md.

-- Pesos de una escalera: al menos uno, sin nulos, positivos, estrictamente
-- crecientes. Función aparte porque un CHECK no admite subconsultas.
create or replace function pesos_validos(p numeric[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
     and cardinality(p) >= 1
     and array_position(p, null) is null
     and not exists (
       select 1
       from unnest(p) with ordinality as x(v, i)
       -- ordinality es bigint y un subíndice de array tiene que ser integer.
       where v <= 0 or (i > 1 and v <= p[(i - 1)::int])
     );
$$;

-- Una escalera por ejercicio para todo el club. `clave` es clavearNombre del
-- nombre de la línea del plan: el mismo espacio de claves que ejercicio_fuerza,
-- pero tabla aparte porque video y escalera son independientes (spec, 4).
create table escalera_fuerza (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  clave text not null,
  -- Como lo escribió el archivo cuando se definió; sólo para mostrar.
  nombre text not null,
  -- numeric y no texto: los escribe el profe en la app, en kg, para que + y −
  -- tengan orden. Distinto de reps/carga/pausa del import, que copian el archivo.
  pesos numeric[] not null check (public.pesos_validos(pesos)),
  actualizado_por uuid not null default auth.uid() references auth.users(id),
  actualizado_en timestamptz not null default now(),
  unique (club_id, clave),
  unique (club_id, id)
);

create or replace function sellar_escalera_fuerza()
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

create trigger escalera_fuerza_sellar
  before update on escalera_fuerza
  for each row execute function sellar_escalera_fuerza();

-- Dónde quedó un chico en una escalera, cada vez que el profe lo ubicó, subió o
-- bajó. Sólo se agrega: sin update ni delete. kg absolutos y no posición: si
-- la escalera cambia, la historia sigue diciendo lo mismo. No se valida contra
-- la escalera por la misma razón.
create table movimiento_escalon (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  jugador_id uuid not null,
  escalera_id uuid not null,
  kg numeric not null check (kg > 0),
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  -- Orden de llegada: define cuál es el último movimiento. creado_en no
  -- alcanza: now() es la hora de inicio de la transacción, así que dos
  -- movimientos de la misma transacción empatan, y una transacción que empezó
  -- antes puede terminar después.
  orden bigint generated always as identity,
  foreign key (club_id, jugador_id) references jugador (club_id, id),
  foreign key (club_id, escalera_id) references escalera_fuerza (club_id, id)
);

create index escalera_fuerza_club_id_idx on escalera_fuerza(club_id);
create index movimiento_escalon_ultimo_idx
  on movimiento_escalon (jugador_id, escalera_id, orden desc);
create index movimiento_escalon_escalera_id_idx on movimiento_escalon(escalera_id);

-- El escalón vigente = el último movimiento. security_invoker: la vista aplica
-- la RLS de movimiento_escalon con los permisos de quien consulta; sin esto
-- correría como su dueño y se saltearía las policies. Primera vista del esquema.
create view escalon_actual
with (security_invoker = true) as
  select distinct on (jugador_id, escalera_id)
    club_id, jugador_id, escalera_id, kg, creado_por, creado_en
  from movimiento_escalon
  order by jugador_id, escalera_id, orden desc;

-- escalon_kg (0020) guardaba un número por línea, para todo el grupo: no sirve
-- para una escalera por jugador. Nunca se escribió; si alguna fila tiene valor,
-- se frena para mirar antes de perderlo.
do $$
begin
  if exists (select 1 from public.ejercicio_asignado where escalon_kg is not null) then
    raise exception 'ejercicio_asignado.escalon_kg tiene valores: revisar antes de eliminar la columna';
  end if;
end;
$$;

alter table ejercicio_asignado drop column escalon_kg;


/* ---------- RLS ---------- */

alter table escalera_fuerza enable row level security;
alter table movimiento_escalon enable row level security;

-- La escalera es del club y no tiene datos de ningún chico: la lee cualquier
-- miembro y la escriben los entrenadores, igual que ejercicio_fuerza (0020).
create policy escalera_fuerza_leer on escalera_fuerza
  for select using (exists (
    select 1 from miembro_club m
    where m.club_id = escalera_fuerza.club_id and m.user_id = auth.uid()));
create policy escalera_fuerza_crear on escalera_fuerza
  for insert with check (exists (
    select 1 from miembro_club m
    where m.club_id = escalera_fuerza.club_id and m.user_id = auth.uid()
      and m.es_entrenador));
create policy escalera_fuerza_editar on escalera_fuerza
  for update using (exists (
    select 1 from miembro_club m
    where m.club_id = escalera_fuerza.club_id and m.user_id = auth.uid()
      and m.es_entrenador))
  with check (exists (
    select 1 from miembro_club m
    where m.club_id = escalera_fuerza.club_id and m.user_id = auth.uid()
      and m.es_entrenador));

-- El escalón de un chico es un dato individual: como medicion_corporal (0016),
-- por pertenencia vigente y plantel asignado. Las funciones de 0018 excluyen al
-- coordinador.
create policy movimiento_escalon_ver on movimiento_escalon
  for select using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = movimiento_escalon.jugador_id and pe.hasta is null
      and puede_ver_plantel(pe.plantel_id)));
create policy movimiento_escalon_crear on movimiento_escalon
  for insert with check (
    movimiento_escalon.creado_por = auth.uid()
    and exists (
      select 1 from pertenencia pe
      where pe.jugador_id = movimiento_escalon.jugador_id and pe.hasta is null
        and puede_escribir_plantel(pe.plantel_id)));

revoke all on escalera_fuerza, movimiento_escalon, escalon_actual from anon, authenticated;
grant select, insert on escalera_fuerza to authenticated;
grant update (pesos) on escalera_fuerza to authenticated;
grant select, insert on movimiento_escalon to authenticated;
grant select on escalon_actual to authenticated;
revoke execute on function pesos_validos(numeric[]) from public, anon;
revoke execute on function sellar_escalera_fuerza() from public, anon, authenticated;
```

- [ ] **Paso 4: el rollback**

Crear `tests/rollback0023.sql`:

```sql
-- Deshace 0023 en el Docker LOCAL. No se corre contra producción sin revisarlo.
-- Borra también la fila de schema_migrations para poder volver a aplicarla con
-- `npx supabase migration up`. Los movimientos y escaleras se pierden.
begin;
drop view if exists escalon_actual;
drop table if exists movimiento_escalon;
drop table if exists escalera_fuerza;
drop function if exists sellar_escalera_fuerza();
drop function if exists pesos_validos(numeric[]);
alter table ejercicio_asignado add column if not exists escalon_kg numeric;
delete from supabase_migrations.schema_migrations where version = '0023';
commit;
```

- [ ] **Paso 5: aplicar en el Docker local y verificar**

```bash
npx supabase migration up
docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/verificarEscalones.sql
```

Esperado, bloque por bloque: `t t t`; `t f f f f f`; `0`; `12`;
`{8,10,12,14} | t`; tres `permission denied`; un `row-level security`; dos
`check violation`; `0 | 0 | 1` más `row-level security`; `0 | 0 | 1`; `12`;
`permission denied for view escalon_actual`; "fin: todo deshecho".

- [ ] **Paso 6: probar el rollback y volver a aplicar**

```bash
docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/rollback0023.sql
docker exec -i "$DB" psql -U postgres -d postgres -X -t -A -c "select to_regclass('public.escalera_fuerza') is null, (select count(*) from information_schema.columns where table_name='ejercicio_asignado' and column_name='escalon_kg');"
npx supabase migration up
docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/verificarEscalones.sql
```

Esperado: `t|1` después del rollback, y la verificación completa igual que en el
Paso 5.

- [ ] **Paso 7: `verificarImportarPlanFisico.js` deja de leer `escalon_kg`**

En `tests/verificarImportarPlanFisico.js`, reemplazar:

```js
    const { data: asignados } = await supabase
      .from('ejercicio_asignado')
      .select('nombre_original, reps, carga_sugerida, pausa, escalon_kg, ejercicio_fuerza_id')
      .in('sesion_id', (sesiones ?? []).map((s) => s.id));
    const conEscalon = (asignados ?? []).filter((a) => a.escalon_kg != null);
    if (conEscalon.length) falla('escalon_kg se escribió, y la RPC no debe escribirla nunca');
    else ok('escalon_kg quedó en null aunque el payload la traía');
```

por:

```js
    const { data: asignados } = await supabase
      .from('ejercicio_asignado')
      .select('nombre_original, reps, carga_sugerida, pausa, ejercicio_fuerza_id')
      .in('sesion_id', (sesiones ?? []).map((s) => s.id));
    // Desde 0023 escalon_kg no existe. El payload la sigue trayendo a propósito
    // (escalonKg: 40) y el import tiene que entrar igual, sin rastro del valor.
    if ((asignados ?? []).length === 2) ok('el import entra aunque el payload traiga escalonKg (la columna ya no existe)');
    else falla(`hay ${asignados?.length ?? 0} líneas guardadas, esperaba 2`);
```

- [ ] **Paso 8: correrlo**

```bash
KEY=$(npx supabase status -o json | python -c "import sys,json; print(json.load(sys.stdin)['PUBLISHABLE_KEY'])")
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISHABLE_KEY=$KEY \
VERIFICAR_RPC_EMAIL=zztest.fisico@example.com VERIFICAR_RPC_PASSWORD=zztest-local-1234 \
node tests/verificarImportarPlanFisico.js
```

Esperado: todas las líneas `OK` y `Todo OK`.

- [ ] **Paso 9: PARAR y mostrarle a Tomás** el SQL completo de 0023 y la salida
  de los Pasos 5, 6 y 8. No seguir con la Tarea 2 hasta que lo apruebe.

- [ ] **Paso 10: commit**

```bash
git add supabase/migrations/0023_escalones_fuerza.sql tests/rollback0023.sql tests/verificarEscalones.sql tests/verificarImportarPlanFisico.js
git commit -m "feat(db): escaleras de fuerza y escalones por jugador (0023)"
```

---

### Tarea 2: Lógica pura de escalones y del plan visible

**Archivos:**
- Crear: `src/data/escalones.js`
- Crear: `tests/escalones.test.js`
- Modificar: `package.json` (script `test`)

**Interfaces:**
- Consume: `clavearNombre(texto)` de `src/parser/parserCabb.js`.
- Produce, para las tareas 4 y 5 (todas puras, sin red ni DOM):
  - `fechaLocal(fecha?: Date) → 'AAAA-MM-DD'` en la zona del dispositivo.
  - `diaDeLaSemana(iso: string) → 'lunes' | … | 'domingo'`.
  - `formatearKg(kg: number) → string` ("22,5").
  - `textoDeEscalera(pesos: number[]) → string` ("20–40 kg", o "8 kg" si hay uno).
  - `parsearPesos(texto: string) → { error: string | null, pesos: number[] | null }`.
  - `estadoDelEscalon(pesos: number[], kg: number | null) → 'sin' | 'en' | 'fuera'`.
  - `pasoDeEscalon(pesos: number[], kg: number | null, direccion: 'subir' | 'bajar') → number | null`.
  - `quedanFuera(pesosNuevos: number[], escalones: { jugadorId, kg }[]) → { jugadorId, kg }[]`.
  - `claveDeEjercicio(nombre: string) → string`.
  - `escaleraDeLinea(nombreOriginal: string, escaleras: { clave }[]) → escalera | null`.
  - `estadoDePlan(plan: { desde, hasta }, hoy: string) → 'en_curso' | 'proximo' | 'terminado'`.
  - `elegirPlanVisible(planes: { id, nombreArchivo, creadoEn, fechas: string[] }[], hoy: string) → { visible: plan & { desde, hasta } | null, estado: string | null, otros: (plan & { desde, hasta })[] }`.
  - `bloquesDeLineas(lineas: { bloque }[]) → string[]` (sin repetidos, en orden de aparición).
  - `agruparPorBloque(lineas: { bloque }[]) → { bloque: string | null, lineas }[]` (grupos consecutivos).
  - `detalleDeLinea(linea: { series, reps, cargaSugerida, pausa }) → string` ("4 series · 5xL · PC · pausa 90''", sin lo que falta).

- [ ] **Paso 1: los tests**

Crear `tests/escalones.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fechaLocal, diaDeLaSemana, formatearKg, textoDeEscalera,
  parsearPesos, estadoDelEscalon, pasoDeEscalon, quedanFuera,
  claveDeEjercicio, escaleraDeLinea,
  estadoDePlan, elegirPlanVisible, bloquesDeLineas, agruparPorBloque, detalleDeLinea,
} from '../src/data/escalones.js';

/* ---------- fechas y formato ---------- */

test('fechaLocal usa la fecha del dispositivo, no la de UTC', () => {
  // 23:30 del 5 de marzo en hora local sigue siendo el 5, aunque en UTC ya sea el 6.
  assert.equal(fechaLocal(new Date(2026, 2, 5, 23, 30)), '2026-03-05');
});

test('diaDeLaSemana se deriva de la fecha sin correrse por el huso horario', () => {
  assert.equal(diaDeLaSemana('2026-04-06'), 'lunes');
  assert.equal(diaDeLaSemana('2026-04-05'), 'domingo');
});

test('formatearKg usa coma decimal y no agrega ceros', () => {
  assert.equal(formatearKg(22.5), '22,5');
  assert.equal(formatearKg(20), '20');
});

test('textoDeEscalera dice el menor y el mayor, o el único', () => {
  assert.equal(textoDeEscalera([20, 25, 30, 35, 40]), '20–40 kg');
  assert.equal(textoDeEscalera([8]), '8 kg');
});

/* ---------- pesos ---------- */

test('parsearPesos: separan espacio, punto y coma o coma seguida de espacio', () => {
  assert.deepEqual(parsearPesos('8 10 12'), { error: null, pesos: [8, 10, 12] });
  assert.deepEqual(parsearPesos('8, 10, 12'), { error: null, pesos: [8, 10, 12] });
  assert.deepEqual(parsearPesos('8;10; 12'), { error: null, pesos: [8, 10, 12] });
});

test('parsearPesos: una coma entre dígitos es decimal', () => {
  assert.deepEqual(parsearPesos('20 22,5 25'), { error: null, pesos: [20, 22.5, 25] });
  // "8,10" se lee 8,1: por eso la hoja muestra "Queda:" antes de guardar.
  assert.deepEqual(parsearPesos('8,10'), { error: null, pesos: [8.1] });
});

test('parsearPesos ordena y saca repetidos de lo que escribió el profe', () => {
  assert.deepEqual(parsearPesos('12 8 10 8'), { error: null, pesos: [8, 10, 12] });
});

test('parsearPesos rechaza vacío, texto, cero, negativos y listas sin espacio', () => {
  for (const texto of ['', '   ', 'diez', '0', '-5', '8,10,12', '8 kg']) {
    const r = parsearPesos(texto);
    assert.ok(r.error, `"${texto}" tendría que dar error`);
    assert.equal(r.pesos, null);
  }
});

/* ---------- escalones ---------- */

const PESOS = [20, 25, 30, 35, 40];

test('estadoDelEscalon: sin escalón, en la escalera o en un peso que ya no está', () => {
  assert.equal(estadoDelEscalon(PESOS, null), 'sin');
  assert.equal(estadoDelEscalon(PESOS, 25), 'en');
  assert.equal(estadoDelEscalon(PESOS, 22.5), 'fuera');
});

test('pasoDeEscalon sube y baja al valor contiguo', () => {
  assert.equal(pasoDeEscalon(PESOS, 25, 'subir'), 30);
  assert.equal(pasoDeEscalon(PESOS, 25, 'bajar'), 20);
});

test('pasoDeEscalon en los extremos devuelve null', () => {
  assert.equal(pasoDeEscalon(PESOS, 40, 'subir'), null);
  assert.equal(pasoDeEscalon(PESOS, 20, 'bajar'), null);
});

test('pasoDeEscalon desde un peso que ya no está en la escalera va al más cercano de cada lado', () => {
  assert.equal(pasoDeEscalon(PESOS, 22.5, 'subir'), 25);
  assert.equal(pasoDeEscalon(PESOS, 22.5, 'bajar'), 20);
  assert.equal(pasoDeEscalon(PESOS, 50, 'subir'), null);
  assert.equal(pasoDeEscalon(PESOS, 50, 'bajar'), 40);
});

test('pasoDeEscalon sin escalón devuelve null: no hay subir ni bajar sin ubicar antes', () => {
  assert.equal(pasoDeEscalon(PESOS, null, 'subir'), null);
  assert.equal(pasoDeEscalon(PESOS, null, 'bajar'), null);
});

test('quedanFuera: los chicos cuyo peso no está en la escalera nueva', () => {
  const escalones = [{ jugadorId: 'a', kg: 22.5 }, { jugadorId: 'b', kg: 25 }, { jugadorId: 'c', kg: null }];
  assert.deepEqual(quedanFuera(PESOS, escalones), [{ jugadorId: 'a', kg: 22.5 }]);
});

/* ---------- línea ↔ escalera ---------- */

test('escaleraDeLinea busca por nombre normalizado exacto, sin parecidos', () => {
  const escaleras = [
    { id: 'e1', clave: claveDeEjercicio('Press Plano') },
    { id: 'e2', clave: claveDeEjercicio('Press Plano (Manc)') },
  ];
  assert.equal(escaleraDeLinea('press  PLANO', escaleras).id, 'e1');
  assert.equal(escaleraDeLinea('Press Plano (Manc)', escaleras).id, 'e2');
  assert.equal(escaleraDeLinea('Press Plano Alternado', escaleras), null);
});

/* ---------- plan visible ---------- */

const plan = (id, fechas, creadoEn = '2026-01-01T00:00:00+00:00') => ({ id, nombreArchivo: `${id}.xlsx`, creadoEn, fechas });

test('elegirPlanVisible: el que contiene hoy', () => {
  const r = elegirPlanVisible([plan('marzo', ['2026-03-02', '2026-04-27']), plan('mayo', ['2026-05-04', '2026-06-29'])], '2026-04-06');
  assert.equal(r.visible.id, 'marzo');
  assert.equal(r.estado, 'en_curso');
  assert.deepEqual(r.otros.map((p) => p.id), ['mayo']);
});

test('elegirPlanVisible: si ninguno contiene hoy, el próximo', () => {
  const r = elegirPlanVisible([plan('marzo', ['2026-03-02', '2026-04-27']), plan('mayo', ['2026-05-04', '2026-06-29'])], '2026-05-01');
  assert.equal(r.visible.id, 'mayo');
  assert.equal(r.estado, 'proximo');
});

test('elegirPlanVisible: si tampoco hay próximo, el último', () => {
  const r = elegirPlanVisible([plan('marzo', ['2026-03-02', '2026-04-27']), plan('mayo', ['2026-05-04', '2026-06-29'])], '2026-08-01');
  assert.equal(r.visible.id, 'mayo');
  assert.equal(r.estado, 'terminado');
});

test('elegirPlanVisible: con un empate gana el importado más recientemente', () => {
  const r = elegirPlanVisible([
    plan('viejo', ['2026-03-02', '2026-04-27'], '2026-03-01T10:00:00+00:00'),
    plan('nuevo', ['2026-03-02', '2026-04-27'], '2026-03-01T12:00:00+00:00'),
  ], '2026-04-06');
  assert.equal(r.visible.id, 'nuevo');
});

test('elegirPlanVisible: el rango sale de la primera y la última fecha, en cualquier orden', () => {
  const r = elegirPlanVisible([plan('marzo', ['2026-04-27', '2026-03-02', '2026-03-05'])], '2026-03-03');
  assert.equal(r.visible.desde, '2026-03-02');
  assert.equal(r.visible.hasta, '2026-04-27');
});

test('elegirPlanVisible sin planes, o sin fechas, no elige nada', () => {
  assert.deepEqual(elegirPlanVisible([], '2026-04-06'), { visible: null, estado: null, otros: [] });
  assert.deepEqual(elegirPlanVisible([plan('vacio', [])], '2026-04-06'), { visible: null, estado: null, otros: [] });
});

test('estadoDePlan', () => {
  const p = { desde: '2026-03-02', hasta: '2026-04-27' };
  assert.equal(estadoDePlan(p, '2026-03-02'), 'en_curso');
  assert.equal(estadoDePlan(p, '2026-03-01'), 'proximo');
  assert.equal(estadoDePlan(p, '2026-04-28'), 'terminado');
});

/* ---------- bloques ---------- */

const lineas = [{ bloque: 'POTENCIA' }, { bloque: 'POTENCIA' }, { bloque: 'FUERZA' }, { bloque: null }, { bloque: 'FUERZA' }];

test('bloquesDeLineas: sin repetidos y en orden de aparición, sin los vacíos', () => {
  assert.deepEqual(bloquesDeLineas(lineas), ['POTENCIA', 'FUERZA']);
});

test('agruparPorBloque: grupos consecutivos, respetando el orden del archivo', () => {
  assert.deepEqual(agruparPorBloque(lineas).map((g) => [g.bloque, g.lineas.length]), [
    ['POTENCIA', 2], ['FUERZA', 1], [null, 1], ['FUERZA', 1],
  ]);
});

test('detalleDeLinea: series, reps, carga y pausa tal cual, sin lo que falta', () => {
  assert.equal(detalleDeLinea({ series: 4, reps: '5xL', cargaSugerida: 'PC', pausa: "90''" }), "4 series · 5xL · PC · pausa 90''");
  assert.equal(detalleDeLinea({ series: 1, reps: null, cargaSugerida: null, pausa: null }), '1 serie');
  assert.equal(detalleDeLinea({ series: null, reps: null, cargaSugerida: null, pausa: null }), '');
});
```

- [ ] **Paso 2: ver que fallan**

Run: `node --test tests/escalones.test.js`
Esperado: FAIL con `Cannot find module '…/src/data/escalones.js'`.

- [ ] **Paso 3: la implementación**

Crear `src/data/escalones.js`:

```js
// Mismo criterio de normalización que el import y el matcheo de videos, y de la
// misma fuente: una línea y su escalera coinciden sólo por nombre exacto.
import { clavearNombre } from '../parser/parserCabb.js';

/*
 * Lógica pura de la pantalla FÍSICO: el plan que se muestra y los escalones de
 * peso. Sin red, sin DOM. Ver
 * docs/superpowers/specs/2026-09-15-fisico-plan-y-escalones-design.md.
 *
 * Nada de acá propone un peso. pasoDeEscalon sólo se mueve entre valores que
 * escribió el profe, y con un chico sin escalón no devuelve nada.
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const KG = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** 'AAAA-MM-DD' en la zona del dispositivo: "hoy" es el día del profe, no el de UTC. */
export function fechaLocal(fecha = new Date()) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/** Se arma en UTC a mano: new Date('2026-04-06') es UTC y en Argentina se corre al día anterior. */
export function diaDeLaSemana(iso) {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return DIAS[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()];
}

export function formatearKg(kg) {
  return KG.format(Number(kg));
}

export function textoDeEscalera(pesos) {
  if (pesos.length === 1) return `${formatearKg(pesos[0])} kg`;
  return `${formatearKg(pesos[0])}–${formatearKg(pesos[pesos.length - 1])} kg`;
}

/**
 * Separan el espacio, el punto y coma o la coma seguida de espacio. Una coma
 * entre dígitos es decimal ("22,5"); por eso "8,10" es 8,1 y la hoja muestra
 * cómo se leyó antes de guardar. Ordena y saca repetidos: son los valores del
 * profe, no una sugerencia.
 */
export function parsearPesos(texto) {
  const crudo = typeof texto === 'string' ? texto.trim() : '';
  if (!crudo) return { error: 'Escribí al menos un peso.', pesos: null };
  const partes = crudo.split(/\s*;\s*|,\s+|\s+/).filter(Boolean);
  const pesos = [];
  for (const parte of partes) {
    if (!/^\d+([.,]\d+)?$/.test(parte)) {
      return { error: `"${parte}" no es un peso. Separá los pesos con espacio o con coma y espacio.`, pesos: null };
    }
    const kg = Number(parte.replace(',', '.'));
    if (!(kg > 0)) return { error: `${parte} no es mayor que cero.`, pesos: null };
    pesos.push(kg);
  }
  return { error: null, pesos: [...new Set(pesos)].sort((a, b) => a - b) };
}

export function estadoDelEscalon(pesos, kg) {
  if (kg == null) return 'sin';
  return pesos.map(Number).includes(Number(kg)) ? 'en' : 'fuera';
}

/**
 * Los kg de destino para + o −: el valor contiguo de la escalera, o el más
 * cercano de ese lado si el peso actual ya no está en ella. Sin escalón no hay
 * paso: ubicar a un chico es un toque explícito del profe.
 */
export function pasoDeEscalon(pesos, kg, direccion) {
  if (kg == null || !Array.isArray(pesos) || !pesos.length) return null;
  const actual = Number(kg);
  const valores = pesos.map(Number);
  if (direccion === 'subir') return valores.find((p) => p > actual) ?? null;
  if (direccion === 'bajar') return [...valores].reverse().find((p) => p < actual) ?? null;
  return null;
}

export function quedanFuera(pesosNuevos, escalones) {
  const valores = pesosNuevos.map(Number);
  return escalones.filter((e) => e.kg != null && !valores.includes(Number(e.kg)));
}

export function claveDeEjercicio(nombre) {
  return clavearNombre(nombre ?? '');
}

export function escaleraDeLinea(nombreOriginal, escaleras) {
  const clave = claveDeEjercicio(nombreOriginal);
  return escaleras.find((e) => e.clave === clave) ?? null;
}

export function estadoDePlan(plan, hoy) {
  if (plan.desde > hoy) return 'proximo';
  if (plan.hasta < hoy) return 'terminado';
  return 'en_curso';
}

/**
 * El plan que se muestra: el que contiene hoy; si no, el próximo; si no, el
 * último. En un empate, el importado más recientemente. Los demás, en "otros",
 * del más nuevo al más viejo.
 */
export function elegirPlanVisible(planes, hoy) {
  const conRango = (planes ?? [])
    .filter((p) => Array.isArray(p.fechas) && p.fechas.length)
    .map((p) => {
      const fechas = [...p.fechas].sort();
      return { ...p, desde: fechas[0], hasta: fechas[fechas.length - 1] };
    });
  if (!conRango.length) return { visible: null, estado: null, otros: [] };

  const masReciente = (a, b) => (b.creadoEn > a.creadoEn ? b : a);
  const enCurso = conRango.filter((p) => estadoDePlan(p, hoy) === 'en_curso');
  const proximos = conRango.filter((p) => estadoDePlan(p, hoy) === 'proximo');

  let visible;
  let estado;
  if (enCurso.length) {
    visible = enCurso.reduce(masReciente);
    estado = 'en_curso';
  } else if (proximos.length) {
    const inicio = proximos.map((p) => p.desde).sort()[0];
    visible = proximos.filter((p) => p.desde === inicio).reduce(masReciente);
    estado = 'proximo';
  } else {
    const fin = conRango.map((p) => p.hasta).sort()[conRango.length - 1];
    visible = conRango.filter((p) => p.hasta === fin).reduce(masReciente);
    estado = 'terminado';
  }

  const otros = conRango
    .filter((p) => p.id !== visible.id)
    .sort((a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : 0));
  return { visible, estado, otros };
}

export function bloquesDeLineas(lineas) {
  const bloques = [];
  for (const l of lineas) {
    if (l.bloque && !bloques.includes(l.bloque)) bloques.push(l.bloque);
  }
  return bloques;
}

export function agruparPorBloque(lineas) {
  const grupos = [];
  for (const l of lineas) {
    const bloque = l.bloque ?? null;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.bloque === bloque) ultimo.lineas.push(l);
    else grupos.push({ bloque, lineas: [l] });
  }
  return grupos;
}

/** Series, reps, carga y pausa como vienen del archivo; lo que falta no se muestra. */
export function detalleDeLinea(linea) {
  return [
    linea.series != null ? `${linea.series} ${linea.series === 1 ? 'serie' : 'series'}` : null,
    linea.reps,
    linea.cargaSugerida,
    linea.pausa ? `pausa ${linea.pausa}` : null,
  ].filter(Boolean).join(' · ');
}
```

- [ ] **Paso 4: ver que pasan**

Run: `node --test tests/escalones.test.js`
Esperado: todos los tests `ok`, `# fail 0`.

- [ ] **Paso 5: sumarlo a `npm test`**

En `package.json`, al final del script `test`, agregar ` tests/escalones.test.js`
antes de la comilla de cierre.

Run: `npm test`
Esperado: `# fail 0`, con los tests de `escalones.test.js` sumados a los 191.

- [ ] **Paso 6: commit**

```bash
git add src/data/escalones.js tests/escalones.test.js package.json
git commit -m "feat(data): lógica pura de escalones y del plan físico visible"
```

---

### Tarea 3: Repositorio

**Archivos:**
- Modificar: `src/data/repositorio.js` (sólo agregar, al final)

**Interfaces:**
- Consume: las tablas y la vista de la Tarea 1.
- Produce, para las tareas 4 y 5:
  - `obtenerPlanesFisicos(clubId, plantelId) → Promise<{ id, nombreArchivo, creadoEn, fechas: string[] }[]>`
  - `obtenerPlanFisico(planId) → Promise<{ id, fecha, lineas: { id, orden, bloque, nombreOriginal, series, reps, cargaSugerida, pausa, notas, video: { nombre, link } | null }[] }[]>` (sesiones por fecha, líneas por `orden`)
  - `obtenerEscaleras(clubId) → Promise<{ id, clave, nombre, pesos: number[] }[]>`
  - `crearEscalera({ clubId, clave, nombre, pesos }) → Promise<escalera>`
  - `editarEscalera(escaleraId, pesos) → Promise<escalera>` (lanza `Error('NO_SE_PUDO_EDITAR')` si la RLS no dejó tocar la fila)
  - `obtenerEscalonesActuales(escaleraId, jugadorIds) → Promise<{ jugadorId, kg: number, desde: string }[]>`
  - `moverEscalon({ clubId, jugadorId, escaleraId, kg }) → Promise<{ jugadorId, kg: number, desde: string }>`

- [ ] **Paso 1: las funciones**

Agregar al final de `src/data/repositorio.js`:

```js
/* ---------- Etapa 7: plan físico visible y escalones ---------- */

/**
 * Los planes de una categoría con las fechas de sus sesiones, para elegir cuál
 * se muestra (elegirPlanVisible). Dos consultas y no un embed: evita depender
 * de cómo PostgREST resuelve las FK compuestas de 0020.
 */
export async function obtenerPlanesFisicos(clubId, plantelId) {
  const supabase = obtenerCliente();
  const { data: planes, error } = await supabase
    .from('plan_fisico')
    .select('id, nombre_archivo, creado_en')
    .eq('club_id', clubId)
    .eq('plantel_id', plantelId);
  if (error) throw error;
  if (!planes.length) return [];
  const { data: sesiones, error: errorSesiones } = await supabase
    .from('sesion_fisico')
    .select('plan_id, fecha')
    .in('plan_id', planes.map((p) => p.id));
  if (errorSesiones) throw errorSesiones;
  return planes.map((p) => ({
    id: p.id,
    nombreArchivo: p.nombre_archivo,
    creadoEn: p.creado_en,
    fechas: sesiones.filter((s) => s.plan_id === p.id).map((s) => s.fecha),
  }));
}

/**
 * Un plan entero: sesiones por fecha, líneas en el orden del archivo, y el link
 * de video de las líneas que lo tienen. Una línea sin video trae video: null,
 * que es el caso normal.
 */
export async function obtenerPlanFisico(planId) {
  const supabase = obtenerCliente();
  const { data: sesiones, error } = await supabase
    .from('sesion_fisico')
    .select('id, fecha')
    .eq('plan_id', planId)
    .order('fecha');
  if (error) throw error;
  if (!sesiones.length) return [];

  const { data: lineas, error: errorLineas } = await supabase
    .from('ejercicio_asignado')
    .select('id, sesion_id, ejercicio_fuerza_id, orden, bloque, nombre_original, series, reps, carga_sugerida, pausa, notas')
    .in('sesion_id', sesiones.map((s) => s.id))
    .order('orden', { ascending: true, nullsFirst: false });
  if (errorLineas) throw errorLineas;

  const idsConVideo = [...new Set(lineas.map((l) => l.ejercicio_fuerza_id).filter(Boolean))];
  let videos = [];
  if (idsConVideo.length) {
    const { data, error: errorVideos } = await supabase
      .from('ejercicio_fuerza')
      .select('id, nombre, link')
      .in('id', idsConVideo);
    if (errorVideos) throw errorVideos;
    videos = data;
  }
  const videoPorId = new Map(videos.filter((v) => v.link).map((v) => [v.id, { nombre: v.nombre, link: v.link }]));

  return sesiones.map((s) => ({
    id: s.id,
    fecha: s.fecha,
    lineas: lineas
      .filter((l) => l.sesion_id === s.id)
      .map((l) => ({
        id: l.id,
        orden: l.orden,
        bloque: l.bloque,
        nombreOriginal: l.nombre_original,
        series: l.series,
        reps: l.reps,
        cargaSugerida: l.carga_sugerida,
        pausa: l.pausa,
        notas: l.notas,
        video: videoPorId.get(l.ejercicio_fuerza_id) ?? null,
      })),
  }));
}

const escaleraDesdeFila = (f) => ({ id: f.id, clave: f.clave, nombre: f.nombre, pesos: f.pesos.map(Number) });

/** Todas las escaleras del club: son de todo el club, no de una categoría (0023). */
export async function obtenerEscaleras(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('escalera_fuerza')
    .select('id, clave, nombre, pesos')
    .eq('club_id', clubId);
  if (error) throw error;
  return data.map(escaleraDesdeFila);
}

export async function crearEscalera({ clubId, clave, nombre, pesos }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('escalera_fuerza')
    .insert({ club_id: clubId, clave, nombre, pesos })
    .select('id, clave, nombre, pesos')
    .single();
  if (error) throw error;
  return escaleraDesdeFila(data);
}

/**
 * Sólo pesos, y no upsert: el update está otorgado sólo sobre esa columna, y un
 * upsert de PostgREST reescribe todas las que manda. Se pide la fila de vuelta
 * porque un update que la RLS no deja pasar no da error: afecta cero filas.
 */
export async function editarEscalera(escaleraId, pesos) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('escalera_fuerza')
    .update({ pesos })
    .eq('id', escaleraId)
    .select('id, clave, nombre, pesos');
  if (error) throw error;
  if (!data.length) throw new Error('NO_SE_PUDO_EDITAR');
  return escaleraDesdeFila(data[0]);
}

const escalonDesdeFila = (f) => ({ jugadorId: f.jugador_id, kg: Number(f.kg), desde: f.creado_en });

/** El último movimiento de cada chico en una escalera (vista escalon_actual). */
export async function obtenerEscalonesActuales(escaleraId, jugadorIds) {
  if (!jugadorIds.length) return [];
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('escalon_actual')
    .select('jugador_id, kg, creado_en')
    .eq('escalera_id', escaleraId)
    .in('jugador_id', jugadorIds);
  if (error) throw error;
  return data.map(escalonDesdeFila);
}

/** Un movimiento: los kg de destino, no "+1" (spec, sección 8). */
export async function moverEscalon({ clubId, jugadorId, escaleraId, kg }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('movimiento_escalon')
    .insert({ club_id: clubId, jugador_id: jugadorId, escalera_id: escaleraId, kg })
    .select('jugador_id, kg, creado_en')
    .single();
  if (error) throw error;
  return escalonDesdeFila(data);
}
```

- [ ] **Paso 2: tests**

Run: `node --test tests/importsResueltos.test.js && npm test`
Esperado: `# fail 0` en los dos.

- [ ] **Paso 3: probar las funciones contra el Docker local**

`repositorio.js` se puede importar en Node: `cliente.js` lee `SUPABASE_URL` y
`SUPABASE_PUBLISHABLE_KEY` de `process.env`, y `iniciarSesion` usa ese mismo
cliente. Con el plan real ya importado en U17M (Preparación, Paso 4), crear
`$TRABAJO/probarRepositorio.mjs`:

```js
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Se corre desde la raíz del repo.
const repo = await import(pathToFileURL(resolve('src/data/repositorio.js')).href);
const CLUB = '20000000-0000-0000-0000-000000000001';
const U17M = '20000000-0000-0000-0000-000000000004';
const esperar = (condicion, texto) => {
  if (!condicion) throw new Error('FALLA: ' + texto);
  console.log('OK   ' + texto);
};

await repo.iniciarSesion('zztest.fisico@example.com', 'zztest-local-1234');

const planes = await repo.obtenerPlanesFisicos(CLUB, U17M);
esperar(planes.length === 1 && planes[0].fechas.length === 17, `1 plan en U17M con 17 fechas (${planes.length} / ${planes[0]?.fechas.length})`);

const sesiones = await repo.obtenerPlanFisico(planes[0].id);
const lineas = sesiones.flatMap((s) => s.lineas);
esperar(sesiones.length === 17 && lineas.length === 135, `17 sesiones y 135 líneas (${sesiones.length} / ${lineas.length})`);
esperar(sesiones.every((s, i) => i === 0 || sesiones[i - 1].fecha <= s.fecha), 'sesiones en orden de fecha');
esperar(lineas.some((l) => l.video?.link), 'alguna línea con video');
esperar(lineas.every((l) => l.video === null || typeof l.video.link === 'string'), 'video es null o tiene link');

const jugadores = await repo.obtenerJugadoresDelPlantel(CLUB, U17M);
esperar(jugadores.length > 0, `hay jugadores en U17M (${jugadores.length})`);

const escalera = await repo.crearEscalera({ clubId: CLUB, clave: 'ZZTEST PRESS', nombre: 'ZZtest Press', pesos: [8, 10, 12] });
esperar(escalera.pesos.join() === '8,10,12', 'crearEscalera');
const editada = await repo.editarEscalera(escalera.id, [8, 10, 12, 14]);
esperar(editada.pesos.join() === '8,10,12,14', 'editarEscalera (sólo pesos, sin upsert)');
esperar((await repo.obtenerEscaleras(CLUB)).some((e) => e.id === escalera.id), 'obtenerEscaleras la trae');

const jugadorId = jugadores[0].id;
await repo.moverEscalon({ clubId: CLUB, jugadorId, escaleraId: escalera.id, kg: 10 });
const movido = await repo.moverEscalon({ clubId: CLUB, jugadorId, escaleraId: escalera.id, kg: 12 });
esperar(movido.kg === 12, 'moverEscalon devuelve los kg');
const actuales = await repo.obtenerEscalonesActuales(escalera.id, jugadores.map((j) => j.id));
esperar(actuales.length === 1 && actuales[0].kg === 12, 'obtenerEscalonesActuales devuelve el último movimiento');

console.log('Todo OK');
process.exit(0);
```

Correrlo desde la raíz del repo:

```bash
KEY=$(npx supabase status -o json | python -c "import sys,json; print(json.load(sys.stdin)['PUBLISHABLE_KEY'])")
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISHABLE_KEY=$KEY node "$TRABAJO/probarRepositorio.mjs"
```

Esperado: todas las líneas `OK` y `Todo OK`. Lo que no se prueba acá (editar el
nombre de una escalera, borrar un movimiento, lo que ve el coordinador) ya lo
cubre `tests/verificarEscalones.sql`.

Borrar después la escalera y los movimientos de prueba:

```bash
docker exec -i "$DB" psql -U postgres -d postgres -X -c "
  delete from movimiento_escalon where escalera_id in (select id from escalera_fuerza where clave like 'ZZTEST%');
  delete from escalera_fuerza where clave like 'ZZTEST%';"
```

- [ ] **Paso 4: commit**

```bash
git add src/data/repositorio.js
git commit -m "feat(data): repositorio del plan físico visible y de los escalones"
```

---

### Tarea 4: FÍSICO con el plan, y la sesión

**Archivos:**
- Modificar: `src/ui/pantallas/fisico.js` (reescribir `renderFisico`; `iniciarFisico` queda igual)
- Crear: `src/ui/pantallas/fisicoSesion.js`
- Crear: `src/ui/pantallas/fisicoEscalones.js` (sólo el esqueleto que usa la sesión; la Tarea 5 lo completa)
- Modificar: `public/index.html`, `src/ui/pantallas/registro.js`, `public/css/componentes.css`, `tests/navegacionInvariante.test.js`

**Interfaces:**
- Consume: de la Tarea 2, `fechaLocal`, `diaDeLaSemana`, `elegirPlanVisible`,
  `estadoDePlan`, `bloquesDeLineas`, `agruparPorBloque`, `escaleraDeLinea`,
  `textoDeEscalera`, `detalleDeLinea`; de la Tarea 3, `obtenerPlanesFisicos`, `obtenerPlanFisico`,
  `obtenerEscaleras`.
- Produce, para la Tarea 5:
  - `abrirSesion({ plantelId, plan, sesion })` en `fisicoSesion.js`, donde `plan`
    es `{ id, nombreArchivo, desde, hasta }` y `sesion` es un elemento de
    `obtenerPlanFisico`.
  - `abrirEscalones({ plantelId, plan, sesion, linea })` exportada por
    `fisicoEscalones.js` (la implementa la Tarea 5).
  - Pantallas registradas: `p-fisico-sesion` (render `renderSesion`) y
    `p-fisico-escalones` (render `renderEscalones`).

- [ ] **Paso 1: tests de fuente que tienen que fallar**

Agregar al final de `tests/navegacionInvariante.test.js`:

```js
test('FÍSICO pregunta a la base si hay un plan antes de mostrar el estado vacío', () => {
  const src = fuente('src/ui/pantallas/fisico.js');
  assert.match(src, /obtenerPlanesFisicos\(/);
  assert.match(src, /elegirPlanVisible\(/);
});

test('sesión y escalones vuelven a FÍSICO si cambia la categoría: lo que se veía es de otro plantel', () => {
  for (const archivo of ['fisicoSesion.js', 'fisicoEscalones.js']) {
    const src = fuente(`src/ui/pantallas/${archivo}`);
    assert.match(src, /plantel\.id !== actual\.plantelId/, archivo);
    assert.match(src, /ir\('p-fisico'\)/, archivo);
  }
});

test('la sesión no dice nada de los ejercicios sin video', () => {
  const src = fuente('src/ui/pantallas/fisicoSesion.js');
  assert.doesNotMatch(src, /sin video/i);
});
```

Run: `node --test tests/navegacionInvariante.test.js`
Esperado: FAIL en los tres (los archivos no existen o no llaman a esas funciones).

- [ ] **Paso 2: secciones y registro**

En `public/index.html`, debajo de
`<section class="pant" id="p-fisico"><div id="fisico-contenido"></div></section>`:

```html
    <section class="pant" id="p-fisico-sesion"><div id="fisico-sesion-contenido"></div></section>
    <section class="pant" id="p-fisico-escalones"><div id="fisico-escalones-contenido"></div></section>
```

En `src/ui/pantallas/registro.js`, debajo de
`import { renderFisico, iniciarFisico } from './fisico.js';`:

```js
import { renderSesion } from './fisicoSesion.js';
import { renderEscalones } from './fisicoEscalones.js';
```

y debajo de `registrarPantalla('p-fisico', { titulo: 'Físico', render: renderFisico });`:

```js
  registrarPantalla('p-fisico-sesion', { titulo: 'Sesión', render: renderSesion });
  registrarPantalla('p-fisico-escalones', { titulo: 'Escalones', render: renderEscalones });
```

- [ ] **Paso 3: CSS**

Agregar al final de `public/css/componentes.css`:

```css
/* Etapa 7 — plan físico y escalones. Sin breakpoints: a 375px ya entra. */
.linea-fisico{cursor:pointer}
.linea-fisico .nom{font-weight:600;font-size:var(--fs-145);line-height:1.2;flex:1}
.linea-fisico .det{font-size:var(--fs-125);color:var(--gris);margin-top:.25rem}
.linea-fisico .pie-linea{display:flex;align-items:center;flex-wrap:wrap;gap:var(--sp-3);margin-top:var(--sp-3)}
.linea-fisico .escalera{font-size:var(--fs-125);color:var(--gris)}
.linea-fisico a.btn{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.escalon-fila{
  display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;align-items:center;gap:var(--sp-2);
  background:var(--blanco);padding:var(--sp-3);border-radius:var(--r);margin-bottom:var(--sp-2);box-shadow:var(--sombra);
}
.escalon-fila.sin-escalon{grid-template-columns:minmax(0,1fr) auto}
.escalon-fila .nom{font-weight:600;font-size:var(--fs-145);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.escalon-fila .det{font-size:var(--fs-115);color:var(--gris);margin-top:.125rem}
.escalon-fila .kg{min-width:4.5rem;text-align:center;font-family:var(--ff-mono);font-size:var(--fs-160);font-weight:600}
.escalon-fila .btn.chico{min-width:var(--tap);padding:0}
.acciones-escalera{display:flex;flex-wrap:wrap;gap:var(--sp-2);margin:var(--sp-3) 0}
```

- [ ] **Paso 4: `fisico.js`**

Reemplazar la función `renderFisico` y los imports de `src/ui/pantallas/fisico.js`.
El archivo completo queda:

```js
import { ir } from '../main.js';
import { iniciarPlanFisico } from './planFisico.js';
import { setRetornoPlanFisico } from './retornoPlanFisico.js';
import { abrirSesion } from './fisicoSesion.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { obtenerPlanesFisicos, obtenerPlanFisico } from '../../data/repositorio.js';
import {
  elegirPlanVisible, estadoDePlan, fechaLocal, diaDeLaSemana, bloquesDeLineas,
} from '../../data/escalones.js';
import { escaparHtml, esErrorDeRed, formatearFechaCorta } from '../nav.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('fisico-contenido');

/**
 * Pestaña FÍSICO: el plan de fuerza de la categoría activa. Cuál se muestra lo
 * decide elegirPlanVisible (el que contiene hoy, si no el próximo, si no el
 * último). El estado vacío es sólo el caso sin ningún plan.
 */

// El plan de "Otros planes" que abrió el profe. Vive en memoria mientras no
// cambie la categoría ni se recargue la página; no se guarda como preferencia.
let planAbierto = null;   // { plantelId, planId }

export async function renderFisico() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = `<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }
  if (planAbierto && planAbierto.plantelId !== plantel.id) planAbierto = null;

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando el plan…</div></div>${pieCargar()}`;
  ligarCargar();

  let planes;
  let sesiones;
  let visible;
  let otros;
  const hoy = fechaLocal();
  try {
    planes = await obtenerPlanesFisicos(club.id, plantel.id);
    if (obtenerPlantelActivo()?.id !== plantel.id) return;   // cambió el chip mientras cargaba
    const eleccion = elegirPlanVisible(planes, hoy);
    if (!eleccion.visible) {
      renderSinPlan();
      return;
    }
    const todos = [eleccion.visible, ...eleccion.otros];
    visible = todos.find((p) => p.id === planAbierto?.planId) ?? eleccion.visible;
    otros = todos.filter((p) => p.id !== visible.id);
    sesiones = await obtenerPlanFisico(visible.id);
    if (obtenerPlantelActivo()?.id !== plantel.id) return;
  } catch (e) {
    if (!esErrorDeRed(e)) console.error('No se pudo cargar el plan físico:', e);
    contenedor().innerHTML = `
      <div class="pad"><div class="al"><div class="tx">${
        esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar el plan.'
      }</div></div></div>
      ${pieCargar()}`;
    ligarCargar();
    return;
  }

  renderConPlan({ plantel, visible, otros, sesiones, hoy });
}

function renderSinPlan() {
  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Fuerza</div>
      <div class="estado-vacio">
        <h2>Plan de fuerza</h2>
        <div class="p">Cargá el plan de fuerza en <b>.xlsx</b> y queda guardado en la categoría elegida, con sus sesiones y sus ejercicios.</div>
      </div>
    </div>
    ${pieCargar()}
  `;
  ligarCargar();
}

function renderConPlan({ plantel, visible, otros, sesiones, hoy }) {
  const proxima = sesiones.find((s) => s.fecha >= hoy) ?? null;
  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Plan de fuerza</div>
      <div class="tarj">
        <div class="linea-fisico" style="cursor:default">
          <div class="nom">${escaparHtml(visible.nombreArchivo)}</div>
          <div class="det">${escaparHtml(rango(visible))} · ${sesiones.length} ${sesiones.length === 1 ? 'sesión' : 'sesiones'}</div>
          <div class="det">${escaparHtml(textoDeEstado(visible, hoy))}</div>
        </div>
      </div>

      ${proxima ? `<div class="eyebrow">Próxima sesión</div>${filaSesion(proxima, hoy)}` : ''}

      <div class="eyebrow">Sesiones</div>
      ${sesiones.map((s) => filaSesion(s, hoy)).join('')}

      ${otros.length ? `
        <div class="eyebrow">Otros planes</div>
        ${otros.map((p) => `
          <button class="jug" data-plan="${escaparHtml(p.id)}">
            <div style="flex:1;text-align:left">
              <div class="nom">${escaparHtml(p.nombreArchivo)}</div>
              <div class="det">${escaparHtml(rango(p))} · ${escaparHtml(textoDeEstado(p, hoy))}</div>
            </div>
            <div class="der">›</div>
          </button>`).join('')}` : ''}
    </div>
    ${pieCargar()}
  `;

  contenedor().querySelectorAll('[data-sesion]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const sesion = sesiones.find((s) => s.id === boton.dataset.sesion);
      abrirSesion({ plantelId: plantel.id, plan: visible, sesion });
    });
  });
  contenedor().querySelectorAll('[data-plan]').forEach((boton) => {
    boton.addEventListener('click', () => {
      planAbierto = { plantelId: plantel.id, planId: boton.dataset.plan };
      renderFisico();
    });
  });
  ligarCargar();
}

function filaSesion(s, hoy) {
  const dia = `${diaDeLaSemana(s.fecha).slice(0, 3)} ${formatearFechaCorta(s.fecha)}`;
  const bloques = bloquesDeLineas(s.lineas);
  return `
    <button class="jug" data-sesion="${escaparHtml(s.id)}">
      <div style="flex:1;text-align:left">
        <div class="nom">${escaparHtml(s.fecha === hoy ? `Hoy · ${dia}` : dia)}</div>
        <div class="det">${s.lineas.length} ${s.lineas.length === 1 ? 'ejercicio' : 'ejercicios'}${bloques.length ? ` · ${escaparHtml(bloques.join(', '))}` : ''}</div>
      </div>
      <div class="der">›</div>
    </button>
  `;
}

function rango(plan) {
  return plan.desde === plan.hasta
    ? formatearFechaCorta(plan.desde)
    : `${formatearFechaCorta(plan.desde)} al ${formatearFechaCorta(plan.hasta)}`;
}

function textoDeEstado(plan, hoy) {
  const estado = estadoDePlan(plan, hoy);
  if (estado === 'en_curso') return 'En curso';
  if (estado === 'proximo') return `Empieza el ${formatearFechaCorta(plan.desde)}`;
  return `Terminó el ${formatearFechaCorta(plan.hasta)}`;
}

function pieCargar() {
  return `<div class="pie-fijo"><button class="btn" id="btn-cargar-plan-fisico">Cargar plan de fuerza</button></div>`;
}

function ligarCargar() {
  $('btn-cargar-plan-fisico')?.addEventListener('click', () => $('input-plan-fisico').click());
}

export function iniciarFisico() {
  // El input vive en index.html, fuera de las pantallas, para que el listener
  // se registre una sola vez en toda la vida de la página.
  $('input-plan-fisico').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;
    await ir('p-plan-fisico', { push: true });
    await iniciarPlanFisico(archivo);
  });

  // Todos los "Volver" del import de plan físico terminan acá, y el render
  // vuelve a leer: el plan recién importado aparece sin recargar.
  setRetornoPlanFisico(() => { ir('p-fisico'); });
}
```

- [ ] **Paso 5: `fisicoSesion.js`**

Crear `src/ui/pantallas/fisicoSesion.js`:

```js
import { ir } from '../main.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { obtenerEscaleras } from '../../data/repositorio.js';
import {
  agruparPorBloque, diaDeLaSemana, escaleraDeLinea, textoDeEscalera, detalleDeLinea,
} from '../../data/escalones.js';
import { escaparHtml, esErrorDeRed, formatearFechaCorta } from '../nav.js';
import { abrirEscalones } from './fisicoEscalones.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('fisico-sesion-contenido');

// Lo que se abrió desde FÍSICO: { plantelId, plan, sesion }.
let actual = null;

export function abrirSesion(datos) {
  actual = datos;
  ir('p-fisico-sesion', { push: true });
}

/**
 * Una sesión del plan: sus ejercicios por bloque, en el orden del archivo.
 * Series, reps, carga y pausa como texto, tal cual. Lo que no tiene video no
 * muestra nada de video. Se relee al volver desde escalones, así una escalera
 * recién definida aparece.
 */
export async function renderSesion() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!actual || !club || !plantel) {
    ir('p-fisico');
    return;
  }
  // Un chip de otra categoría: esta sesión es de otro plantel.
  if (plantel.id !== actual.plantelId) {
    ir('p-fisico');
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando la sesión…</div></div>`;
  let escaleras;
  try {
    escaleras = await obtenerEscaleras(club.id);
  } catch (e) {
    if (!esErrorDeRed(e)) console.error('No se pudieron cargar las escaleras:', e);
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${
      esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar la sesión.'
    }</div></div></div>`;
    return;
  }

  const { plan, sesion } = actual;
  const dia = diaDeLaSemana(sesion.fecha);
  contenedor().innerHTML = `
    <div class="pad">
      <div class="p"><b>${escaparHtml(dia.charAt(0).toUpperCase() + dia.slice(1))} ${formatearFechaCorta(sesion.fecha)}</b> · ${escaparHtml(plan.nombreArchivo)}</div>
      ${agruparPorBloque(sesion.lineas).map((grupo) => `
        ${grupo.bloque ? `<div class="eyebrow">${escaparHtml(grupo.bloque)}</div>` : ''}
        ${grupo.lineas.map((l) => tarjetaDeLinea(l, escaleras)).join('')}
      `).join('')}
    </div>
  `;

  contenedor().querySelectorAll('[data-linea]').forEach((tarjeta) => {
    const abrir = () => {
      const linea = sesion.lineas.find((l) => l.id === tarjeta.dataset.linea);
      abrirEscalones({ plantelId: actual.plantelId, plan, sesion, linea });
    };
    tarjeta.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;   // "Ver video" abre el link, no los escalones
      abrir();
    });
    tarjeta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.closest('a')) abrir();
    });
  });
}

function tarjetaDeLinea(l, escaleras) {
  const escalera = escaleraDeLinea(l.nombreOriginal, escaleras);
  const detalle = detalleDeLinea(l);
  return `
    <div class="tarj linea-fisico" data-linea="${escaparHtml(l.id)}" role="button" tabindex="0">
      <div style="display:flex;gap:var(--sp-2)">
        <div class="nom">${l.orden != null ? `${l.orden} · ` : ''}${escaparHtml(l.nombreOriginal)}</div>
        <div aria-hidden="true">›</div>
      </div>
      ${detalle ? `<div class="det">${escaparHtml(detalle)}</div>` : ''}
      ${l.notas ? `<div class="det">${escaparHtml(l.notas)}</div>` : ''}
      <div class="pie-linea">
        ${l.video ? `<a class="btn sec chico" href="${escaparHtml(l.video.link)}" target="_blank" rel="noopener noreferrer">Ver video</a>` : ''}
        <span class="escalera">${escaparHtml(escalera ? `Escalera ${textoDeEscalera(escalera.pesos)}` : 'Sin escalera')}</span>
      </div>
    </div>
  `;
}
```

- [ ] **Paso 6: esqueleto de `fisicoEscalones.js`**

Para que la sesión y el registro resuelvan sus imports; la Tarea 5 lo reemplaza
entero. Crear `src/ui/pantallas/fisicoEscalones.js`:

```js
import { ir } from '../main.js';
import { obtenerPlantelActivo } from '../sesion.js';

const $ = (id) => document.getElementById(id);

// Lo que se abrió desde la sesión: { plantelId, plan, sesion, linea }.
let actual = null;

export function abrirEscalones(datos) {
  actual = datos;
  ir('p-fisico-escalones', { push: true });
}

export async function renderEscalones() {
  const plantel = obtenerPlantelActivo();
  if (!actual || !plantel || plantel.id !== actual.plantelId) {
    ir('p-fisico');
    return;
  }
  $('fisico-escalones-contenido').innerHTML = `<div class="pad"><div class="p">${actual.linea.nombreOriginal}</div></div>`;
}
```

- [ ] **Paso 7: tests**

Run: `node --test tests/navegacionInvariante.test.js && npm test`
Esperado: `# fail 0` en los dos.

- [ ] **Paso 8: verlo en el navegador**

En `http://127.0.0.1:8765/local.html`, a 375px (DevTools, dispositivo 375×812) y
en escritorio:

- FÍSICO con U17M: "Plan de fuerza", Físico.xlsx, "02/03 al 27/04 · 17
  sesiones" y el estado según la fecha de hoy; la lista de 17 sesiones con día,
  cantidad de ejercicios y bloques.
- Chip U21M sin plan: el estado vacío con "Cargar plan de fuerza".
- Tocar una sesión: bloques en orden; cada ejercicio con número, nombre, series,
  reps, carga y pausa tal cual; "Ver video" sólo en los que tienen, y abre el
  link en otra pestaña sin abrir los escalones; "Sin escalera" en todos.
- Tocar un ejercicio: la pantalla "Escalones" con el nombre (esqueleto).
- Desde la sesión, tocar el chip U21M: vuelve a FÍSICO de U21M.
- Consola sin errores; nada se desborda en horizontal.

- [ ] **Paso 9: commit**

```bash
git add src/ui/pantallas/fisico.js src/ui/pantallas/fisicoSesion.js src/ui/pantallas/fisicoEscalones.js public/index.html src/ui/pantallas/registro.js public/css/componentes.css tests/navegacionInvariante.test.js
git commit -m "feat(ui): FÍSICO muestra el plan cargado y sus sesiones"
```

---

### Tarea 5: Escalones de un ejercicio

**Archivos:**
- Modificar: `src/ui/pantallas/fisicoEscalones.js` (reemplazo completo del esqueleto)
- Modificar: `tests/navegacionInvariante.test.js`

**Interfaces:**
- Consume: de la Tarea 2, `claveDeEjercicio`, `escaleraDeLinea`,
  `estadoDelEscalon`, `pasoDeEscalon`, `parsearPesos`, `quedanFuera`,
  `formatearKg`, `fechaLocal`; de la Tarea 3, `obtenerEscaleras`,
  `crearEscalera`, `editarEscalera`, `obtenerEscalonesActuales`, `moverEscalon`,
  y `obtenerJugadoresDelPlantel(clubId, plantelId) → { id, nombreClave, nombreLimpio, fechaNacimiento }[]`
  (existente); y `detalleDeLinea`, también de la Tarea 2.
- Produce: `abrirEscalones({ plantelId, plan, sesion, linea })` y `renderEscalones()`,
  con la misma firma del esqueleto.

- [ ] **Paso 1: tests de fuente que tienen que fallar**

Agregar al final de `tests/navegacionInvariante.test.js`:

```js
test('los escalones no proponen pesos: ningún placeholder con números', () => {
  const src = fuente('src/ui/pantallas/fisicoEscalones.js');
  assert.doesNotMatch(src, /placeholder=/);
});

test('un peso que ya no está en la escalera se informa como dato, no como alerta', () => {
  const src = fuente('src/ui/pantallas/fisicoEscalones.js');
  assert.match(src, /este peso ya no está en la escalera actual/);
  assert.doesNotMatch(src, /class="al"[^`]*este peso ya no está/);
  assert.doesNotMatch(src, /class="al"[^`]*no está en esta escalera/);
});

test('ubicar a un chico es un toque sobre un valor de la escalera, nunca un valor inicial', () => {
  const src = fuente('src/ui/pantallas/fisicoEscalones.js');
  assert.match(src, /data-accion="ubicar"/);
  assert.doesNotMatch(src, /pesos\[0\]/);
});
```

Run: `node --test tests/navegacionInvariante.test.js`
Esperado: FAIL en "informa como dato" y en "ubicar" (el esqueleto no tiene esos
textos).

- [ ] **Paso 2: la pantalla**

Reemplazar entero `src/ui/pantallas/fisicoEscalones.js`:

```js
import { ir } from '../main.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import {
  obtenerEscaleras, crearEscalera, editarEscalera,
  obtenerEscalonesActuales, moverEscalon, obtenerJugadoresDelPlantel,
} from '../../data/repositorio.js';
import {
  claveDeEjercicio, escaleraDeLinea, estadoDelEscalon, pasoDeEscalon,
  parsearPesos, quedanFuera, formatearKg, fechaLocal, detalleDeLinea,
} from '../../data/escalones.js';
import { escaparHtml, esErrorDeRed, formatearFechaCorta, nombreCorto, toast } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('fisico-escalones-contenido');
const SIN_CONEXION = 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';

/*
 * Escalones de un ejercicio: su escalera (una para todo el club) y dónde está
 * parado cada chico de la categoría. El profe ubica, sube y baja; la app nunca
 * propone un peso ni ubica a nadie sola. Cada toque es un movimiento guardado en
 * el momento. Ver la sección 8 del spec.
 */

// Lo que se abrió desde la sesión: { plantelId, plan, sesion, linea }.
let actual = null;
// Lo leído en el último render: { escalera, jugadores, escalonPorJugador: Map }.
let vista = null;

export function abrirEscalones(datos) {
  actual = datos;
  ir('p-fisico-escalones', { push: true });
}

export async function renderEscalones() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!actual || !club || !plantel) {
    ir('p-fisico');
    return;
  }
  // Un chip de otra categoría: estos chicos son de otro plantel.
  if (plantel.id !== actual.plantelId) {
    ir('p-fisico');
    return;
  }

  contenedor().innerHTML = `<div class="pad"><div class="p">Cargando los escalones…</div></div>`;
  try {
    const [escaleras, jugadores] = await Promise.all([
      obtenerEscaleras(club.id),
      obtenerJugadoresDelPlantel(club.id, plantel.id),
    ]);
    jugadores.sort((a, b) => a.nombreLimpio.localeCompare(b.nombreLimpio, 'es'));
    const escalera = escaleraDeLinea(actual.linea.nombreOriginal, escaleras);
    const escalones = escalera ? await obtenerEscalonesActuales(escalera.id, jugadores.map((j) => j.id)) : [];
    vista = { escalera, jugadores, escalonPorJugador: new Map(escalones.map((e) => [e.jugadorId, e])) };
  } catch (e) {
    if (!esErrorDeRed(e)) console.error('No se pudieron cargar los escalones:', e);
    contenedor().innerHTML = `<div class="pad"><div class="al"><div class="tx">${esErrorDeRed(e) ? SIN_CONEXION : 'No se pudieron cargar los escalones.'}</div></div></div>`;
    return;
  }
  pintar(plantel);
}

function pintar(plantel) {
  const { escalera, jugadores } = vista;
  const detalle = detalleDeLinea(actual.linea);
  contenedor().innerHTML = `
    <div class="pad">
      <div class="linea-fisico" style="cursor:default">
        <div class="nom">${escaparHtml(actual.linea.nombreOriginal)}</div>
        ${detalle ? `<div class="det">En esta sesión: ${escaparHtml(detalle)}</div>` : ''}
      </div>

      ${escalera ? `
        <div class="eyebrow">Escalera</div>
        <div class="tarj">
          <div class="p">${escaparHtml(escalera.pesos.map(formatearKg).join(' · '))} kg</div>
          <div class="acciones-al"><button class="btn sec chico" id="fe-editar">Editar escalera</button></div>
        </div>

        <div class="eyebrow">${escaparHtml(plantel.categoria)} · ${jugadores.length} ${jugadores.length === 1 ? 'jugador' : 'jugadores'}</div>
        <div id="fe-lista">
          ${jugadores.length ? jugadores.map(filaDeJugador).join('') : '<div class="p">Esta categoría todavía no tiene jugadores.</div>'}
        </div>
      ` : `
        <div class="estado-vacio">
          <div class="p">Este ejercicio todavía no tiene escalera.</div>
          <div class="acciones"><button class="btn" id="fe-editar">Definir escalera</button></div>
        </div>
      `}
    </div>
  `;

  $('fe-editar').addEventListener('click', abrirEditor);
  $('fe-lista')?.addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-accion]');
    if (!boton || boton.disabled) return;
    const jugadorId = boton.closest('[data-jugador]').dataset.jugador;
    if (boton.dataset.accion === 'ubicar') abrirUbicar(jugadorId);
    else mover(jugadorId, Number(boton.dataset.kg));
  });
}

function filaDeJugador(j) {
  const { escalera } = vista;
  const escalon = vista.escalonPorJugador.get(j.id) ?? null;
  const estado = estadoDelEscalon(escalera.pesos, escalon?.kg ?? null);
  const nombre = `<div class="nom">${escaparHtml(nombreCorto(j.nombreLimpio))}</div>`;

  if (estado === 'sin') {
    return `
      <div class="escalon-fila sin-escalon" data-jugador="${escaparHtml(j.id)}">
        <div>${nombre}<div class="det">sin escalón</div></div>
        <button class="btn sec chico" data-accion="ubicar">Ubicar</button>
      </div>
    `;
  }

  const bajar = pasoDeEscalon(escalera.pesos, escalon.kg, 'bajar');
  const subir = pasoDeEscalon(escalera.pesos, escalon.kg, 'subir');
  // Un peso que ya no está en la escalera es un dato: nadie hizo nada mal y el
  // chico sigue en su peso. Texto normal de la fila, sin rojo ni .al.
  const desde = `desde el ${formatearFechaCorta(fechaLocal(new Date(escalon.desde)))}`;
  const texto = estado === 'fuera' ? `${desde} · este peso ya no está en la escalera actual` : desde;
  return `
    <div class="escalon-fila" data-jugador="${escaparHtml(j.id)}">
      <div>${nombre}<div class="det">${escaparHtml(texto)}</div></div>
      <button class="btn sec chico" data-accion="bajar" data-kg="${bajar ?? ''}" ${bajar == null ? 'disabled' : ''} aria-label="Bajar un escalón">−</button>
      <div class="kg">${escaparHtml(formatearKg(escalon.kg))} kg</div>
      <button class="btn sec chico" data-accion="subir" data-kg="${subir ?? ''}" ${subir == null ? 'disabled' : ''} aria-label="Subir un escalón">+</button>
    </div>
  `;
}

function repintarFila(jugadorId) {
  const fila = contenedor().querySelector(`[data-jugador="${CSS.escape(jugadorId)}"]`);
  const jugador = vista.jugadores.find((j) => j.id === jugadorId);
  if (fila && jugador) fila.outerHTML = filaDeJugador(jugador);
}

/** Guarda en el momento. Mientras escribe, la fila no responde; si falla, vuelve a lo que estaba. */
async function mover(jugadorId, kg) {
  const club = obtenerClubActual();
  const fila = contenedor().querySelector(`[data-jugador="${CSS.escape(jugadorId)}"]`);
  fila?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    const escalon = await moverEscalon({ clubId: club.id, jugadorId, escaleraId: vista.escalera.id, kg });
    vista.escalonPorJugador.set(jugadorId, escalon);
  } catch (e) {
    if (!esErrorDeRed(e)) console.error('No se pudo guardar el escalón:', e);
    toast(esErrorDeRed(e) ? SIN_CONEXION : 'No se pudo guardar el escalón. Intentá de nuevo.');
  }
  repintarFila(jugadorId);
}

function abrirUbicar(jugadorId) {
  const jugador = vista.jugadores.find((j) => j.id === jugadorId);
  abrirHoja({
    titulo: `Ubicar a ${nombreCorto(jugador.nombreLimpio)}`,
    cuerpo: `
      <div class="p">Elegí el escalón donde está hoy.</div>
      <div class="acciones-escalera">
        ${vista.escalera.pesos.map((p) => `<button class="btn sec chico" data-kg="${p}">${escaparHtml(formatearKg(p))} kg</button>`).join('')}
      </div>
      <div class="acciones-bateria"><button class="btn sec" id="fe-cancelar-ubicar">Cancelar</button></div>
    `,
  });
  document.querySelectorAll('#hoja [data-kg]').forEach((boton) => {
    boton.addEventListener('click', () => {
      cerrarHoja();
      mover(jugadorId, Number(boton.dataset.kg));
    });
  });
  $('fe-cancelar-ubicar').addEventListener('click', () => cerrarHoja());
}

function abrirEditor() {
  const existente = vista.escalera;
  const nombre = actual.linea.nombreOriginal;
  // Sin placeholder: un "ej. 8, 10, 12" también sería proponer pesos.
  abrirHoja({
    titulo: `Escalera de ${nombre}`,
    cuerpo: `
      <div class="p">Es la misma para todo el club.</div>
      <div class="campo">
        <label for="fe-pesos">Pesos (kg)</label>
        <input id="fe-pesos" type="text" inputmode="decimal" autocomplete="off" value="${existente ? escaparHtml(existente.pesos.map(formatearKg).join(' ')) : ''}">
        <div class="ayuda">De menor a mayor, separados por espacio o por coma y espacio.</div>
      </div>
      <div class="p" id="fe-queda"></div>
      <div class="p" id="fe-fuera"></div>
      <div id="fe-aviso"></div>
      <div class="acciones-bateria">
        <button class="btn" id="fe-guardar">Guardar escalera</button>
        <button class="btn sec" id="fe-cancelar">Cancelar</button>
      </div>
    `,
  });

  const actualizar = () => {
    const { error, pesos } = parsearPesos($('fe-pesos').value);
    $('fe-aviso').innerHTML = '';
    if (error) {
      $('fe-queda').textContent = $('fe-pesos').value.trim() ? error : '';
      $('fe-fuera').textContent = '';
      return null;
    }
    $('fe-queda').textContent = `Queda: ${pesos.map(formatearKg).join(' · ')} kg`;
    const fuera = quedanFuera(pesos, [...vista.escalonPorJugador.values()]);
    $('fe-fuera').textContent = !fuera.length ? ''
      : fuera.length === 1
        ? `1 jugador está en ${formatearKg(fuera[0].kg)} kg, un peso que no está en esta escalera. Sigue en ese peso; + y − lo llevan al escalón más cercano.`
        : `${fuera.length} jugadores están en pesos que no están en esta escalera. Siguen en esos pesos; + y − los llevan al escalón más cercano.`;
    return pesos;
  };

  const guardar = async () => {
    const boton = $('fe-guardar');
    if (boton.disabled) return;
    const pesos = actualizar();
    if (!pesos) {
      $('fe-aviso').innerHTML = `<div class="al"><div class="tx">${escaparHtml(parsearPesos($('fe-pesos').value).error)}</div></div>`;
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    try {
      vista.escalera = existente
        ? await editarEscalera(existente.id, pesos)
        : await crearEscalera({ clubId: obtenerClubActual().id, clave: claveDeEjercicio(nombre), nombre: nombre.trim(), pesos });
      cerrarHoja();
      renderEscalones();
    } catch (e) {
      if (!esErrorDeRed(e)) console.error('No se pudo guardar la escalera:', e);
      const mensaje = e?.code === '23505'
        ? 'Alguien definió esta escalera recién. Cerrá y volvé a abrir el ejercicio.'
        : esErrorDeRed(e) ? SIN_CONEXION : 'No se pudo guardar la escalera.';
      $('fe-aviso').innerHTML = `<div class="al"><div class="tx">${escaparHtml(mensaje)}</div></div>`;
      boton.disabled = false;
      boton.textContent = 'Guardar escalera';
    }
  };

  $('fe-pesos').addEventListener('input', actualizar);
  $('fe-pesos').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
  $('fe-guardar').addEventListener('click', guardar);
  $('fe-cancelar').addEventListener('click', () => cerrarHoja());
  actualizar();
  $('fe-pesos').focus();
}
```

- [ ] **Paso 3: tests**

Run: `node --test tests/navegacionInvariante.test.js && npm test`
Esperado: `# fail 0` en los dos.

- [ ] **Paso 4: verlo en el navegador**

En `local.html`, U17M, una sesión, un ejercicio con peso (por ejemplo "Press
Plano"), a 375px y en escritorio:

- "Este ejercicio todavía no tiene escalera" y "Definir escalera".
- La hoja arranca vacía y sin ningún número de ejemplo. Escribir `8, 10, 12` →
  "Queda: 8 · 10 · 12 kg"; escribir `8,10,12` → el mensaje de separar con espacio;
  escribir `12 8 10` → "Queda: 8 · 10 · 12 kg". Guardar.
- La escalera aparece arriba y cada chico dice "sin escalón" con "Ubicar". No hay
  − ni + en esas filas.
- Ubicar a uno en 10: la fila muestra `− 10 kg +` y "desde el <hoy>".
- + → 12; + queda deshabilitado. − → 10. − → 8; − queda deshabilitado.
- Editar la escalera a `8 9 11 12`: la hoja dice "1 jugador está en 10 kg, un
  peso que no está en esta escalera…" en texto normal, sin barra roja. Guardar:
  la fila dice "desde el <hoy> · este peso ya no está en la escalera actual", sin
  rojo. + → 11, − → 9.
- Volver a la sesión: el ejercicio dice "Escalera 8–12 kg".
- Cortar la red (DevTools → Offline) y tocar +: aviso de sin conexión y la fila
  vuelve a lo que estaba.
- En la base: `select kg, creado_en from movimiento_escalon order by orden;` tiene
  una fila por cada toque.
- Consola sin errores; ninguna fila se desborda a 375px; todos los botones de 44px.

- [ ] **Paso 5: commit**

```bash
git add src/ui/pantallas/fisicoEscalones.js tests/navegacionInvariante.test.js
git commit -m "feat(ui): escalones de peso por jugador en FÍSICO"
```

---

### Tarea 6: Verificación de punta a punta, documentación y cierre

**Archivos:**
- Modificar: `supabase/ESQUEMA.md`

**Interfaces:**
- Consume: todo lo anterior.
- Produce: nada nuevo de código.

- [ ] **Paso 1: los tests y verificaciones de la base, otra vez**

```bash
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
KEY=$(npx supabase status -o json | python -c "import sys,json; print(json.load(sys.stdin)['PUBLISHABLE_KEY'])")
npm test
docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/verificarEscalones.sql
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISHABLE_KEY=$KEY \
VERIFICAR_RPC_EMAIL=zztest.fisico@example.com VERIFICAR_RPC_PASSWORD=zztest-local-1234 \
node tests/verificarImportarPlanFisico.js
```

Esperado: `# fail 0`; la verificación SQL como en la Tarea 1, Paso 5; `Todo OK`.

- [ ] **Paso 2: el recorrido completo en el navegador, a 375px y en escritorio**

Con `local.html`:

1. Importar el mismo Físico.xlsx en U21M desde FÍSICO: al terminar, "Volver a
   Físico" muestra el plan de U21M sin recargar.
2. Un segundo plan en U17M: abrir `tests/fixtures/fisico.xlsx` en Excel o
   LibreOffice, cambiar el texto de una nota técnica cualquiera, guardarlo como
   `fisico-copia.xlsx` (otro contenido, otro hash) e importarlo en U17M. Tiene
   las mismas fechas, así que es el caso de empate: se muestra el importado
   último. En FÍSICO, el visible sigue
   la regla de la sección 9 y el otro aparece en "Otros planes"; tocarlo lo
   muestra; cambiar de chip y volver aplica otra vez la regla.
3. Un chico citado a dos categorías: sumarle a uno de U17M una pertenencia
   vigente a U21M por SQL, y verificar que en los escalones del mismo ejercicio
   aparece en las dos categorías con el mismo peso, y que moverlo desde U21M se
   ve desde U17M.
4. Coordinación: crear una cuenta sólo coordinadora y entrar con ella; FÍSICO
   no aparece en la navegación.

   ```bash
   SRK=$(npx supabase status -o json | python -c "import sys,json; print(json.load(sys.stdin)['SERVICE_ROLE_KEY'])")
   UID_C=$(curl -s -X POST http://127.0.0.1:54321/auth/v1/admin/users \
     -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "Content-Type: application/json" \
     -d '{"email":"zztest.coord@example.com","password":"zztest-local-1234","email_confirm":true,"user_metadata":{"nombre":"Coord ZZtest"}}' \
     | python -c "import sys,json; print(json.load(sys.stdin)['id'])")
   docker exec -i "$DB" psql -U postgres -d postgres -X -c "
     insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador)
     values ('$UID_C','20000000-0000-0000-0000-000000000001', false, true);"
   ```
5. Todo lo del Paso 4 de las Tareas 4 y 5, sin errores de consola.

- [ ] **Paso 3: capturas de los tres estados de FÍSICO, la sesión y los escalones
  (con un chico sin escalón, uno en la escalera y uno en un peso que ya no está),
  a 375px, y mirarlas de verdad.** Si algo se ve como error sin serlo, o algo se
  corta, arreglarlo y volver al Paso 1.

- [ ] **Paso 4: `ESQUEMA.md`**

En `supabase/ESQUEMA.md`, cambiar la primera línea de estado por:

```markdown
Estado al día de la migración `0019_nombre_y_categorias.sql`, más la sección de
escalones de fuerza de `0023_escalones_fuerza.sql`. Las tablas del plan físico de
0020–0022 todavía no están documentadas acá (ver la Tarea 7 del plan de import).
```

y agregar al final de la sección `## Tablas`:

```markdown
### `escalera_fuerza` (0023)
La progresión de pesos de un ejercicio de fuerza, **una para todo el club**:
`(club_id, clave, nombre, pesos numeric[])`, único por `(club_id, clave)`.

- `clave` es `clavearNombre` del nombre de la línea del plan: una línea y su
  escalera coinciden sólo por nombre normalizado exacto. Es independiente de
  `ejercicio_fuerza` (el anexo de videos): un ejercicio sin video puede tener
  escalera y viceversa.
- `pesos` en kg, estrictamente creciente, sin nulos y positivo (`pesos_validos`).
  Los escribe el profe en la app; la app no propone valores.
- La lee cualquier miembro del club y la escriben los entrenadores. El update
  está otorgado sólo sobre `pesos`; `actualizado_por` y `actualizado_en` los pone
  un trigger. Sin delete.

### `movimiento_escalon` (0023)
Cada vez que el profe ubica, sube o baja a un chico en una escalera:
`(club_id, jugador_id, escalera_id, kg, creado_por, creado_en, orden)`.

- **Sólo inserts.** Sin update ni delete: un error se corrige con otro
  movimiento, y la historia queda completa.
- `kg` absolutos, no la posición en la escalera: si la escalera cambia, la
  historia sigue diciendo lo mismo. No se valida contra la escalera.
- `orden` (identity) define cuál es el último; `creado_en` es para mostrar.
- El escalón es del jugador y del ejercicio, no del plan ni de la categoría: se
  conserva de por vida, igual que `jugador` es del club y no de un plantel.
- RLS como `medicion_corporal`: por pertenencia vigente y plantel asignado.
  Coordinación no lo ve.

### `escalon_actual` (vista, 0023)
El último movimiento de cada `(jugador_id, escalera_id)`. Con
`security_invoker = true`: aplica la RLS de `movimiento_escalon` con los permisos
de quien consulta. Es la primera vista del esquema.

### `ejercicio_asignado.escalon_kg` (eliminada en 0023)
Guardaba un número por línea, o sea para todo el grupo, y nunca se escribió. El
escalón por jugador vive en `movimiento_escalon`.
```

- [ ] **Paso 5: commit**

```bash
git add supabase/ESQUEMA.md
git commit -m "docs: escaleras y escalones de fuerza en ESQUEMA.md"
```

- [ ] **Paso 6: PARAR y avisarle a Tomás** que está listo para que corra
  `npx supabase db push` (0023 sigue a 0021 y 0022; si 0021 todavía no está en
  producción, necesita `--include-all`), con el SQL de 0023 y la salida de
  `tests/verificarEscalones.sql`. No pushear.

- [ ] **Paso 7: limpieza del Docker local**

```bash
docker exec -i "$DB" psql -U postgres -d postgres -X -c "
  delete from movimiento_escalon;
  delete from escalera_fuerza;
  delete from ejercicio_asignado a using sesion_fisico s, plan_fisico p where a.sesion_id = s.id and s.plan_id = p.id;
  delete from sesion_fisico;
  delete from plan_fisico;
  delete from ejercicio_fuerza;
  delete from pertenencia where jugador_id in (select id from jugador where nombre_clave like 'ZZTEST%');
  delete from jugador where nombre_clave like 'ZZTEST%';
  delete from asignacion_plantel where miembro_club_user_id in (select id from auth.users where email in ('zztest.fisico@example.com', 'zztest.coord@example.com'));
  delete from miembro_club where user_id in (select id from auth.users where email in ('zztest.fisico@example.com', 'zztest.coord@example.com'));
  delete from auth.users where email in ('zztest.fisico@example.com', 'zztest.coord@example.com');"
```

Sólo contra el Docker local, y sólo si antes de empezar esas tablas estaban
vacías (lo estaban el 2026-09-15).
