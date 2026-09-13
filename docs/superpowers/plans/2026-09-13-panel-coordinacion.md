# Panel de coordinación — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que un coordinador habilite profes y les asigne categorías desde la app, que la RLS refleje esas asignaciones con historia (desde/hasta, sin borrado), y que el coordinador vea un panorama agregado por categoría sin acceso a datos individuales.

**Architecture:** dos migraciones nuevas. `0017` es aditiva (roles como booleanos, asignación con historia, policies y funciones del coordinador, RPC `asignar_planteles`, backfill para que nadie pierda acceso). `0018` es la única restrictiva (le saca al coordinador la lectura individual). En el cliente, un módulo puro `src/data/coordinacion.js` arma lo que dibujan dos pantallas nuevas, y el chrome gana un modo "coordinar".

**Tech Stack:** Postgres/Supabase (RLS, plpgsql), HTML/CSS/JS vanilla con ES modules nativos, `node:test`, `@supabase/supabase-js` (ya instalado).

**Spec:** `docs/superpowers/specs/2026-09-13-panel-coordinacion-design.md`

## Global Constraints

- **No aplicar nada contra la base.** Las migraciones y scripts se escriben y se entregan; los aplica Tomás, en el orden del spec §5.
- **No modificar migraciones existentes** (`0001`–`0016`), ni `src/parser/`, ni la lógica de import (`confirmacionImport.js`, `mapearImportacion.js`, `prepararPayloadImportacion.js`, `importar_partido`).
- **No restringir `ejercicio` ni `nota_ejercicio`** en RLS.
- **Ninguna vía** para que un entrenador asigne o desasigne. **Ninguna** para que el coordinador lea filas de `jugador`, `pertenencia`, `partido`, `estadistica_jugador_partido`, `sesion_medicion`, `medicion_tiro`, `medicion_velocidad`, `medicion_corporal`, `envio_recurso`, `meta_zona` (tras 0018).
- **No borrar asignaciones:** se cierran con `hasta`.
- **Sin dependencias nuevas, sin build step, sin frameworks, sin librerías de gráficos.**
- Toda función `security definer`: `set search_path = ''`, nombres calificados `public.`/`auth.`, `revoke execute ... from public, anon`, `grant execute ... to authenticated`.
- Toda operación que escribe más de una fila: RPC `security invoker`.
- Presentación: ningún porcentaje sin denominador (`textoPorcentaje`); umbral único `UMBRAL_INTENTOS` de `estadisticas.js`; afirmación sólo si supera el margen (`compararPorcentajes`); sin tendencias, proyecciones, normas por edad, jerga estadística, rankings ni comparación entre categorías.
- Club del piloto: `20000000-0000-0000-0000-000000000001`. Club de control: `00000000-0000-0000-0000-000000000001`.
- `npm test` pasa completo, incluido `importsResueltos.test.js`.
- Usable a 375px con una mano; toda media query de ancho vive en `public/css/layout.css`.

**Decisiones del spec (§9), respondidas el 2026-09-13.** P1: caso B, el backfill queda y en producción no hace nada. P2: el coordinador no se autoasigna. P3: coordinadores sólo por SQL. P4: sólo Newell's, límite documentado. **P5: triples Y libres, las dos series separadas.**

**Ajuste por P5 (reemplaza lo que digan las Tareas 5 y 7 sobre una sola serie):**
- `armarPanorama` devuelve en cada tarjeta `triples: { serie, variacion }` y `libres: { serie, variacion }` en lugar de `serie` y `variacion`. Triples = `serieDeZonasAgregada(filas, POSICIONES ids)`; libres = `serieDeZonasAgregada(filas, [LIBRES.id])`. Claves de la tarjeta: `aCargo, categoria, jugadores, libres, nombreCategoria, partidos, plantelId, triples, ultimaMedicion`.
- La tarjeta dibuja dos bloques, **"Triples"** y **"Libres"**, cada uno con su gráfico 0–100, su variación contra la batería anterior y su tabla. En pantalla nunca se dice "del arco".
- Los tests de la Tarea 5 cubren las dos series y que libres no se mezcle con triples.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/0017_coordinacion.sql` | crear | roles, asignación con historia, funciones, policies, RPC, backfill |
| `supabase/migrations/0018_endurecer_coordinador.sql` | crear | coordinador sin lectura individual; dedup sólo entrenadores |
| `tests/verificarCoordinacion.sql` | crear | 12 casos con impersonación, se deshace entero |
| `tests/rollback0017.sql`, `tests/rollback0018.sql` | crear | volver al estado previo |
| `tests/verificarAccesoPorCategoria.js` | crear | lecturas con una sesión real de entrenador / coordinador |
| `src/data/estadisticas.js` | modificar | `serieDeZonasAgregada` |
| `src/ui/componentes/graficos.js` | modificar | escala fija opcional `{min, max}` |
| `src/data/coordinacion.js` | crear | `armarPanorama`, `armarProfes` (puro) |
| `src/data/repositorio.js` | modificar | lecturas y escrituras del panel |
| `src/ui/sesion.js` | modificar | roles y modo |
| `src/ui/chrome.js` | modificar | pestañas por modo, botón Coordinar/Entrenar |
| `src/ui/main.js` | modificar | decide modo al entrar; filtra chips a lo asignado |
| `src/ui/componentes/variacion.js` | crear | `variacionHtml`, sacado de `hoy.js` |
| `src/ui/pantallas/hoy.js` | modificar | importa `variacionHtml` |
| `src/ui/pantallas/plantel.js` | modificar | estado "sin categorías asignadas" |
| `src/ui/pantallas/coordPanorama.js` | crear | pantalla Panorama |
| `src/ui/pantallas/coordProfes.js` | crear | pantalla Profes y sus hojas |
| `src/ui/pantallas/registro.js` | modificar | registra las dos pantallas |
| `public/index.html` | modificar | secciones nuevas; texto de `v-sin-club` |
| `public/css/componentes.css`, `public/css/layout.css` | modificar | estilos del panel |
| `tests/graficos.test.js`, `tests/estadisticas.test.js` | modificar | casos nuevos |
| `tests/coordinacion.test.js`, `tests/coordinacionSinDatosIndividuales.test.js` | crear | lógica pura y guarda de arquitectura |
| `package.json` | modificar | suma los dos tests nuevos al script |
| `docs/COORDINACION.md` | crear | roles, despliegue, primer coordinador |
| `docs/CONFIGURAR-AUTH.md`, `supabase/ESQUEMA.md` | modificar | estado al día |
| `tests/verificarAutorizacionPlantel.sql` | modificar | nota: aplica sólo al estado de 0016 |

---

### Tarea 1: Migración 0017 (aditiva)

**Riesgo alto.** Modelo capaz y review detallado.

**Files:**
- Create: `supabase/migrations/0017_coordinacion.sql`

**Interfaces:**
- Produces (SQL, usado por Tareas 2, 3, 6):
  - `miembro_club.es_entrenador boolean`, `miembro_club.es_coordinador boolean`, `habilitado_por uuid`, `habilitado_en timestamptz`; columna `rol` eliminada.
  - `asignacion_plantel.desde timestamptz`, `hasta timestamptz`, `asignado_por uuid`, `cerrado_por uuid`, `origen text` (`'panel'|'manual'|'migracion'`).
  - `es_coordinador_de(uuid) → boolean`, `es_entrenador_de(uuid) → boolean`
  - `usuarios_pendientes() → table(user_id uuid, email text, registrado_en timestamptz)`
  - `miembros_del_club(p_club_id uuid) → table(user_id uuid, email text, nombre text, es_entrenador boolean, es_coordinador boolean, habilitado_en timestamptz)`
  - `panorama_del_club(p_club_id uuid) → jsonb` con `{ planteles: [{plantelId, jugadores, partidos, ultimaMedicion, ultimoPartido}], tiro: [{plantelId, sesionId, fecha, posicion, anotados, intentos, jugadoresQueMidieron}] }`
  - `asignar_planteles(p_user_id uuid, p_club_id uuid, p_plantel_ids uuid[]) → jsonb {habilitado, asignadas, yaVigentes}`; errores `SIN_CATEGORIAS`, `NO_ES_ENTRENADOR` (P0001), 42501 por RLS.
  - `comment on function puede_ver_plantel(uuid)` empieza con `v0017`.

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Panel de coordinación: roles combinables, asignaciones con historia, y lo
-- mínimo para que un coordinador habilite y asigne desde la app.
--
-- ESTA MIGRACIÓN ES ADITIVA: nadie puede hacer menos que antes de aplicarla.
-- El coordinador todavía conserva la lectura individual que le dio 0016; se la
-- saca 0018, en un paso aparte y explícito. Ver
-- docs/superpowers/specs/2026-09-13-panel-coordinacion-design.md §5.

do $$
begin
  if to_regclass('public.asignacion_plantel') is null then
    raise exception '0017 necesita 0016 aplicada (no existe asignacion_plantel).';
  end if;
end $$;


/* =====================================================================
   1. Roles: dos booleanos en vez de un rol único
   ===================================================================== */

-- La PK (user_id, club_id) admite UNA fila por persona y club, así que con un
-- rol de texto nadie podía ser entrenador y coordinador a la vez. Son dos
-- roles fijos: dos booleanos se leen en una policy sin join, y el check hace
-- imposible una membresía sin rol.
alter table miembro_club
  add column es_entrenador  boolean not null default false,
  add column es_coordinador boolean not null default false,
  add column habilitado_por uuid references auth.users(id),
  -- Sin default al agregarla: las filas existentes quedan en null ("antes del
  -- panel") en vez de aparentar que se habilitaron el día de esta migración.
  add column habilitado_en  timestamptz;

update miembro_club
set es_entrenador  = (rol = 'entrenador'),
    es_coordinador = (rol = 'coordinador');

alter table miembro_club
  add constraint miembro_club_con_rol check (es_entrenador or es_coordinador);

-- Con el cliente autenticado, auth.uid() es quien habilita. Por SQL desde el
-- dashboard da null, que es lo correcto: "a mano".
alter table miembro_club alter column habilitado_en  set default now();
alter table miembro_club alter column habilitado_por set default auth.uid();


/* =====================================================================
   2. Asignaciones con historia
   ===================================================================== */

-- Fuera el unique total y las dos FK con cascade. Se buscan por catálogo
-- porque 0016 no les puso nombre. Se filtran las FK por tabla referenciada
-- para no tocar ninguna otra.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.asignacion_plantel'::regclass
      and (contype = 'u'
           or (contype = 'f' and confrelid in ('public.miembro_club'::regclass, 'public.plantel'::regclass)))
  loop
    execute format('alter table public.asignacion_plantel drop constraint %I', r.conname);
  end loop;
end $$;

alter table asignacion_plantel
  add column desde        timestamptz,
  add column hasta        timestamptz,
  add column asignado_por uuid references auth.users(id),
  add column cerrado_por  uuid references auth.users(id),
  add column origen       text;

update asignacion_plantel set desde = creado_en, origen = 'manual';

alter table asignacion_plantel
  alter column desde  set not null,
  alter column desde  set default now(),
  alter column origen set not null,
  alter column origen set default 'panel',
  alter column asignado_por set default auth.uid(),
  add constraint asignacion_origen_valido  check (origen in ('panel', 'manual', 'migracion')),
  add constraint asignacion_fechas_validas check (hasta is null or hasta >= desde),
  add constraint asignacion_cierre_con_fecha check (cerrado_por is null or hasta is not null),
  -- RESTRICT y no cascade: borrar una membresía por SQL no puede llevarse
  -- puesta la historia de quién estuvo a cargo de qué categoría.
  add constraint asignacion_miembro_fk
    foreign key (miembro_club_user_id, miembro_club_club_id)
    references miembro_club (user_id, club_id) on delete restrict,
  add constraint asignacion_plantel_fk
    foreign key (miembro_club_club_id, plantel_id)
    references plantel (club_id, id) on delete restrict;

-- Una sola asignación VIGENTE por persona y plantel. Las cerradas pueden
-- repetirse: alguien que vuelve a una categoría que ya tuvo suma una fila.
create unique index asignacion_vigente_unica
  on asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id)
  where hasta is null;

-- El cierre lo sella el servidor. El cliente sólo puede tocar `hasta` (ver
-- grants abajo), y acá se ignora lo que mandó: la fecha es now() y el autor es
-- quien llama. Una fila cerrada no se vuelve a tocar — ni reabrir, ni correr
-- la fecha. Así "quién estuvo a cargo en 2026" no se puede reescribir.
create function sellar_cierre_asignacion()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if old.hasta is not null then
    raise exception 'ASIGNACION_YA_CERRADA' using errcode = 'P0001';
  end if;
  if new.hasta is null then
    raise exception 'SOLO_SE_PUEDE_CERRAR' using errcode = 'P0001';
  end if;
  new := old;
  new.hasta := now();
  new.cerrado_por := auth.uid();
  return new;
end;
$fn$;

create trigger asignacion_sellar_cierre
  before update on asignacion_plantel
  for each row execute function sellar_cierre_asignacion();


/* =====================================================================
   3. Funciones de autorización
   ===================================================================== */

-- security definer por el mismo motivo que 0016: se llaman desde policies de
-- miembro_club y asignacion_plantel, que consultan esas mismas tablas.

create function es_coordinador_de(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.miembro_club m
    where m.club_id = p_club_id and m.user_id = auth.uid() and m.es_coordinador
  );
$fn$;

create function es_entrenador_de(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.miembro_club m
    where m.club_id = p_club_id and m.user_id = auth.uid() and m.es_entrenador
  );
$fn$;

revoke execute on function es_coordinador_de(uuid) from public, anon;
revoke execute on function es_entrenador_de(uuid)  from public, anon;
grant  execute on function es_coordinador_de(uuid) to authenticated;
grant  execute on function es_entrenador_de(uuid)  to authenticated;

-- Las diez policies de datos de jugador llaman a estas dos: reescribirlas
-- cambia a todas juntas, sin tocar una policy por tabla.
create or replace function puede_ver_plantel(p_plantel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.plantel pl
    join public.miembro_club m on m.club_id = pl.club_id and m.user_id = auth.uid()
    where pl.id = p_plantel_id
      and (
        -- TRANSITORIO: 0018 saca esta rama. Queda para que aplicar 0017 no
        -- le cambie nada a nadie.
        m.es_coordinador
        or (m.es_entrenador and exists (
              select 1 from public.asignacion_plantel a
              where a.miembro_club_user_id = m.user_id
                and a.miembro_club_club_id = m.club_id
                and a.plantel_id = pl.id
                and a.hasta is null))
      )
  );
$fn$;

comment on function puede_ver_plantel(uuid) is
  'v0017: entrenador con asignación vigente, o coordinador (rama transitoria hasta 0018).';

create or replace function puede_escribir_plantel(p_plantel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.plantel pl
    join public.miembro_club m on m.club_id = pl.club_id and m.user_id = auth.uid()
    join public.asignacion_plantel a
      on a.miembro_club_user_id = m.user_id
     and a.miembro_club_club_id = m.club_id
     and a.plantel_id = pl.id
     and a.hasta is null
    where pl.id = p_plantel_id
      and m.es_entrenador
  );
$fn$;

-- La única policy de 0016 que miraba `rol` directamente.
drop policy jugador_crear on jugador;
create policy jugador_crear on jugador
  for insert with check (es_entrenador_de(jugador.club_id));

-- Recién ahora, sin nada que la lea, se va la columna vieja.
alter table miembro_club drop constraint miembro_club_rol_valido;
alter table miembro_club drop column rol;


/* =====================================================================
   4. Policies del coordinador
   ===================================================================== */

-- plantel: el nombre de la categoría. Sin esto, tras 0018 el coordinador no
-- sabría qué categorías existen. "U17M 2026" no es un dato de menores.
create policy plantel_coordinador_ver on plantel
  for select using (es_coordinador_de(plantel.club_id));

create policy miembro_club_coordinador_ver on miembro_club
  for select using (es_coordinador_de(miembro_club.club_id));

-- Habilitar: sólo ENTRENADORES, nunca coordinadores, nunca a sí mismo. Dar el
-- rol que reparte accesos queda como SQL (spec P3). Autohabilitarse abriría
-- la puerta a que el coordinador llegue a datos individuales (spec P2).
create policy miembro_club_coordinador_habilita on miembro_club
  for insert with check (
    es_coordinador_de(miembro_club.club_id)
    and miembro_club.user_id <> auth.uid()
    and miembro_club.es_entrenador
    and not miembro_club.es_coordinador
  );

create policy asignacion_coordinador_ver on asignacion_plantel
  for select using (es_coordinador_de(asignacion_plantel.miembro_club_club_id));

create policy asignacion_coordinador_asigna on asignacion_plantel
  for insert with check (
    es_coordinador_de(asignacion_plantel.miembro_club_club_id)
    and asignacion_plantel.miembro_club_user_id <> auth.uid()
    and asignacion_plantel.hasta is null
    and exists (
      select 1 from miembro_club m
      where m.user_id = asignacion_plantel.miembro_club_user_id
        and m.club_id = asignacion_plantel.miembro_club_club_id
        and m.es_entrenador)
  );

-- Cerrar. El with check se evalúa DESPUÉS del trigger, que ya puso hasta.
create policy asignacion_coordinador_cierra on asignacion_plantel
  for update
  using (
    es_coordinador_de(asignacion_plantel.miembro_club_club_id)
    and asignacion_plantel.hasta is null
    and asignacion_plantel.miembro_club_user_id <> auth.uid())
  with check (
    es_coordinador_de(asignacion_plantel.miembro_club_club_id)
    and asignacion_plantel.hasta is not null);

-- Grants: lo mínimo, por columna. Supabase concede ALL por defecto a anon y
-- authenticated sobre las tablas nuevas de public, así que el "grant select"
-- de 0016 no restringía nada: acá se revoca todo y se concede explícito.
--
-- Insert por columna: el cliente no puede mandar desde, hasta, asignado_por,
-- origen, es_coordinador ni habilitado_*. Toman sus defaults. No se puede
-- antedatar una asignación ni crear un coordinador.
revoke all on miembro_club from anon;
revoke insert, update, delete, truncate, references, trigger on miembro_club from authenticated;
grant select on miembro_club to authenticated;
grant insert (user_id, club_id, es_entrenador) on miembro_club to authenticated;

revoke all on asignacion_plantel from anon, authenticated;
grant select on asignacion_plantel to authenticated;
grant insert (miembro_club_user_id, miembro_club_club_id, plantel_id) on asignacion_plantel to authenticated;
grant update (hasta) on asignacion_plantel to authenticated;


/* =====================================================================
   5. Lecturas del panel (sólo coordinación)
   ===================================================================== */

-- Cuentas con mail CONFIRMADO y sin ningún club. Las no confirmadas quedan
-- afuera: cualquiera crea una cuenta con un mail ajeno.
-- Límite conocido (spec P4): con más de un club, cualquier coordinador ve
-- todas las cuentas sin club de la plataforma.
create function usuarios_pendientes()
returns table (user_id uuid, email text, registrado_en timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not exists (
    select 1 from public.miembro_club m
    where m.user_id = auth.uid() and m.es_coordinador
  ) then
    raise exception 'Sólo coordinación.' using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text, u.created_at
    from auth.users u
    where u.email_confirmed_at is not null
      and not exists (select 1 from public.miembro_club m2 where m2.user_id = u.id)
    order by u.created_at desc;
end;
$fn$;

-- auth.users no es legible desde el cliente, y el nombre puede no estar
-- cargado todavía: la UI muestra el nombre si hay, el mail si no.
create function miembros_del_club(p_club_id uuid)
returns table (
  user_id uuid, email text, nombre text,
  es_entrenador boolean, es_coordinador boolean, habilitado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.es_coordinador_de(p_club_id) then
    raise exception 'Sólo coordinación de ese club.' using errcode = '42501';
  end if;

  return query
    select m.user_id, u.email::text, pe.nombre,
           m.es_entrenador, m.es_coordinador, m.habilitado_en
    from public.miembro_club m
    join auth.users u on u.id = m.user_id
    left join public.perfil_entrenador pe
      on pe.user_id = m.user_id and pe.club_id = m.club_id
    where m.club_id = p_club_id
    order by coalesce(pe.nombre, u.email::text);
end;
$fn$;

-- SÓLO conteos y sumas. Ninguna fila de jugador, ningún nombre, ningún
-- porcentaje: el porcentaje, el umbral de muestra y el margen se calculan en
-- src/data/estadisticas.js, que sigue siendo el único lugar donde viven.
-- La base tampoco sabe qué posiciones son "del arco": lo dice posiciones.js.
--
-- tiro: una fila por (sesión, posición) con anotados e intentos sumados entre
-- jugadores, contando sólo mediciones reales (anotados no nulo, igual que
-- zonasDeSesion), y cuántos jugadores midieron algo en esa sesión.
create function panorama_del_club(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_resultado jsonb;
begin
  if not public.es_coordinador_de(p_club_id) then
    raise exception 'Sólo coordinación de ese club.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'planteles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plantelId', pl.id,
        'jugadores', (select count(distinct pe.jugador_id) from public.pertenencia pe
                      where pe.plantel_id = pl.id and pe.hasta is null),
        'partidos', (select count(*) from public.partido pa where pa.plantel_id = pl.id),
        'ultimoPartido', (select max(pa.fecha) from public.partido pa where pa.plantel_id = pl.id),
        'ultimaMedicion', (select max(s.fecha) from public.sesion_medicion s where s.plantel_id = pl.id)
      ))
      from public.plantel pl
      where pl.club_id = p_club_id
    ), '[]'::jsonb),
    'tiro', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plantelId', t.plantel_id,
        'sesionId', t.sesion_id,
        'fecha', t.fecha,
        'posicion', t.posicion,
        'anotados', t.anotados,
        'intentos', t.intentos,
        'jugadoresQueMidieron', t.jugadores
      ) order by t.fecha, t.posicion)
      from (
        select s.plantel_id, s.id as sesion_id, s.fecha, mt.posicion,
               sum(mt.anotados)::int as anotados,
               sum(mt.intentos)::int as intentos,
               (select count(distinct m2.jugador_id)::int
                  from public.medicion_tiro m2
                 where m2.sesion_id = s.id and m2.anotados is not null) as jugadores
        from public.sesion_medicion s
        join public.plantel pl on pl.id = s.plantel_id and pl.club_id = p_club_id
        join public.medicion_tiro mt on mt.sesion_id = s.id and mt.anotados is not null
        where s.tipo = 'tiro'
        group by s.plantel_id, s.id, s.fecha, mt.posicion
      ) t
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;

revoke execute on function usuarios_pendientes()        from public, anon;
revoke execute on function miembros_del_club(uuid)      from public, anon;
revoke execute on function panorama_del_club(uuid)      from public, anon;
grant  execute on function usuarios_pendientes()        to authenticated;
grant  execute on function miembros_del_club(uuid)      to authenticated;
grant  execute on function panorama_del_club(uuid)      to authenticated;


/* =====================================================================
   6. RPC: habilitar y asignar en una sola transacción
   ===================================================================== */

-- security invoker: sujeto a las mismas policies que un insert directo. Si
-- quien llama no es coordinador, falla el insert de la membresía o el de la
-- asignación, y se deshace TODO — incluida la membresía, así no queda un profe
-- "habilitado a medias" sin categorías. Un plantel de otro club rompe la FK
-- compuesta y aborta igual.
create function asignar_planteles(p_user_id uuid, p_club_id uuid, p_plantel_ids uuid[])
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_es_entrenador boolean;
  v_habilitado boolean := false;
  v_asignadas integer := 0;
  v_ya_vigentes integer := 0;
  v_plantel uuid;
begin
  if p_plantel_ids is null or cardinality(p_plantel_ids) = 0 then
    raise exception 'SIN_CATEGORIAS' using errcode = 'P0001';
  end if;

  select m.es_entrenador into v_es_entrenador
  from miembro_club m
  where m.user_id = p_user_id and m.club_id = p_club_id;

  if not found then
    insert into miembro_club (user_id, club_id, es_entrenador)
    values (p_user_id, p_club_id, true);
    v_habilitado := true;
  elsif not v_es_entrenador then
    -- Un coordinador puro. Hacerlo además entrenador es SQL (spec P2).
    raise exception 'NO_ES_ENTRENADOR' using errcode = 'P0001';
  end if;

  foreach v_plantel in array (select array(select distinct unnest(p_plantel_ids)))
  loop
    if exists (
      select 1 from asignacion_plantel a
      where a.miembro_club_user_id = p_user_id
        and a.miembro_club_club_id = p_club_id
        and a.plantel_id = v_plantel
        and a.hasta is null
    ) then
      v_ya_vigentes := v_ya_vigentes + 1;
    else
      insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id)
      values (p_user_id, p_club_id, v_plantel);
      v_asignadas := v_asignadas + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'habilitado', v_habilitado,
    'asignadas', v_asignadas,
    'yaVigentes', v_ya_vigentes
  );
end;
$$;

revoke execute on function asignar_planteles(uuid, uuid, uuid[]) from public, anon;
grant  execute on function asignar_planteles(uuid, uuid, uuid[]) to authenticated;


/* =====================================================================
   7. Backfill: nadie pierde acceso
   ===================================================================== */

-- Un entrenador SIN NINGUNA asignación recibe todas las categorías de su club,
-- que es lo que veía antes de 0016. Quien ya tiene asignaciones no se toca.
-- En local y en una base nueva miembro_club está vacía y esto no hace nada.
--
-- Quedan marcadas 'migracion' y el panel las señala: "todos ven todo" no queda
-- escondido, queda como una tarea visible del coordinador (spec §5, P1).
insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen)
select m.user_id, m.club_id, p.id, 'migracion'
from miembro_club m
join plantel p on p.club_id = m.club_id
where m.es_entrenador
  and not exists (
    select 1 from asignacion_plantel a
    where a.miembro_club_user_id = m.user_id
      and a.miembro_club_club_id = m.club_id
  );
```

- [ ] **Step 2: Revisión de la migración contra el spec**

Chequear a mano, con el archivo abierto:
- Toda referencia a la tabla externa dentro de una subquery de policy va calificada (`asignacion_plantel.miembro_club_user_id`, no `miembro_club_user_id`) — el agujero descripto en el bloque 6 de `0016`.
- Ninguna función `security definer` tiene un nombre sin calificar.
- `grep -n "\brol\b" supabase/migrations/0017_coordinacion.sql` sólo aparece en el `update` del backfill de roles y en el `drop`.

- [ ] **Step 3 (opcional): aplicar en local si Docker está disponible**

Run: `npx supabase start` y luego `npx supabase db reset`
Expected: aplica 0001–0017 sin error. Si Docker no está, se saltea y lo corre Tomás en su momento; **nunca** contra el proyecto remoto.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0017_coordinacion.sql
git commit -m "feat(db): roles combinables, asignaciones con historia y panel de coordinación"
```

---

### Tarea 2: Migración 0018 (restrictiva) y los dos rollbacks

**Riesgo alto.**

**Files:**
- Create: `supabase/migrations/0018_endurecer_coordinador.sql`
- Create: `tests/rollback0018.sql`
- Create: `tests/rollback0017.sql`

**Interfaces:**
- Consumes: todo lo de la Tarea 1.
- Produces: `comment on function puede_ver_plantel(uuid)` empieza con `v0018` (lo detecta la Tarea 3).

- [ ] **Step 1: Escribir 0018**

```sql
-- El paso restrictivo: el coordinador deja de leer datos individuales.
--
-- Se aplica DESPUÉS de 0017, del deploy del panel, y de que el coordinador
-- revisó las asignaciones 'migracion'. Si el coordinador también entrena,
-- tiene que tener es_entrenador y sus categorías ANTES de esto, o se queda sin
-- sus datos. Ver spec §5, pasos 5 a 7.

-- Sin coordinador, un club no se puede administrar desde la app.
do $$
declare
  n integer;
begin
  select count(*) into n
  from public.club c
  where exists (select 1 from public.miembro_club m where m.club_id = c.id)
    and not exists (select 1 from public.miembro_club m where m.club_id = c.id and m.es_coordinador);
  if n > 0 then
    raise exception
      '0018 abortada: % club(es) con miembros y sin coordinador. Crear el primer coordinador (docs/COORDINACION.md) antes de endurecer.', n;
  end if;
end $$;

-- Sin la rama del coordinador: sólo entrenador con asignación vigente.
create or replace function puede_ver_plantel(p_plantel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.plantel pl
    join public.miembro_club m on m.club_id = pl.club_id and m.user_id = auth.uid()
    join public.asignacion_plantel a
      on a.miembro_club_user_id = m.user_id
     and a.miembro_club_club_id = m.club_id
     and a.plantel_id = pl.id
     and a.hasta is null
    where pl.id = p_plantel_id
      and m.es_entrenador
  );
$fn$;

comment on function puede_ver_plantel(uuid) is
  'v0018: sólo entrenador con asignación vigente. El coordinador ve el panorama agregado, no filas.';

-- El dedup expone nombres de chicos de todo el club. Hasta acá bastaba con ser
-- miembro; un coordinador no importa partidos ni da de alta jugadores, así que
-- no lo necesita. El cuerpo es el de 0016 con otro chequeo de entrada.
create or replace function jugadores_del_club_para_dedup(p_club_id uuid)
returns table (
  id uuid,
  nombre_clave text,
  nombre_limpio text,
  planteles_visibles uuid[]
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.es_entrenador_de(p_club_id) then
    raise exception 'Sólo entrenadores de ese club.' using errcode = '42501';
  end if;

  return query
    select
      j.id,
      j.nombre_clave,
      j.nombre_limpio,
      coalesce(
        array_agg(p.plantel_id) filter (where p.plantel_id is not null),
        '{}'::uuid[]
      )
    from public.jugador j
    left join public.pertenencia p
      on p.jugador_id = j.id
     and p.hasta is null
     and public.puede_ver_plantel(p.plantel_id)
    where j.club_id = p_club_id
    group by j.id, j.nombre_clave, j.nombre_limpio
    order by j.id;
end;
$fn$;
```

- [ ] **Step 2: Escribir `tests/rollback0018.sql`**

```sql
-- Rollback de 0018: el coordinador vuelve a leer lo que leía con 0017.
-- Pegado entero en el SQL Editor. Commitea. No toca datos.

begin;

create or replace function puede_ver_plantel(p_plantel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.plantel pl
    join public.miembro_club m on m.club_id = pl.club_id and m.user_id = auth.uid()
    where pl.id = p_plantel_id
      and (
        m.es_coordinador
        or (m.es_entrenador and exists (
              select 1 from public.asignacion_plantel a
              where a.miembro_club_user_id = m.user_id
                and a.miembro_club_club_id = m.club_id
                and a.plantel_id = pl.id
                and a.hasta is null))
      )
  );
$fn$;

comment on function puede_ver_plantel(uuid) is
  'v0017: entrenador con asignación vigente, o coordinador (rama transitoria hasta 0018).';

create or replace function jugadores_del_club_para_dedup(p_club_id uuid)
returns table (id uuid, nombre_clave text, nombre_limpio text, planteles_visibles uuid[])
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not exists (
    select 1 from public.miembro_club m
    where m.club_id = p_club_id and m.user_id = auth.uid()
  ) then
    raise exception 'No sos miembro de ese club.' using errcode = '42501';
  end if;

  return query
    select j.id, j.nombre_clave, j.nombre_limpio,
           coalesce(array_agg(p.plantel_id) filter (where p.plantel_id is not null), '{}'::uuid[])
    from public.jugador j
    left join public.pertenencia p
      on p.jugador_id = j.id and p.hasta is null and public.puede_ver_plantel(p.plantel_id)
    where j.club_id = p_club_id
    group by j.id, j.nombre_clave, j.nombre_limpio
    order by j.id;
end;
$fn$;

commit;

select obj_description('public.puede_ver_plantel(uuid)'::regprocedure, 'pg_proc') as version_actual;
```

- [ ] **Step 3: Escribir `tests/rollback0017.sql`**

```sql
-- Rollback de 0017: vuelve a la forma de 0016.
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor, como service role, DESPUÉS de
-- rollback0018.sql si 0018 estaba aplicada. Commitea.
--
-- ABORTA, sin adivinar, si la forma de 0016 no puede representar lo que hay:
--   - alguien con los dos roles (0016 admite un rol por persona);
--   - alguna asignación cerrada (0016 no tiene "hasta": conservarla reabriría
--     un acceso, borrarla perdería historia).
-- El mensaje dice cuáles son, para resolverlos a mano.
--
-- Las asignaciones con origen 'migracion' QUEDAN como asignaciones de 0016.
-- Si hay que sacarlas, descomentar el delete marcado abajo: son filas que creó
-- la propia migración, no historia.

begin;

do $$
declare
  ambos text;
  cerradas integer;
begin
  select string_agg(user_id::text, ', ') into ambos
  from public.miembro_club where es_entrenador and es_coordinador;
  if ambos is not null then
    raise exception 'Rollback abortado: con los dos roles: %. Dejarles uno antes de volver a 0016.', ambos;
  end if;

  select count(*) into cerradas from public.asignacion_plantel where hasta is not null;
  if cerradas > 0 then
    raise exception 'Rollback abortado: hay % asignación(es) cerrada(s). 0016 no puede representarlas.', cerradas;
  end if;
end $$;

select set_config('verif.miembro_club',       (select count(*) from miembro_club)::text,       false),
       set_config('verif.asignacion_plantel', (select count(*) from asignacion_plantel)::text, false),
       set_config('verif.plantel',            (select count(*) from plantel)::text,            false),
       set_config('verif.jugador',            (select count(*) from jugador)::text,            false),
       set_config('verif.sesion_medicion',    (select count(*) from sesion_medicion)::text,    false);

-- delete from asignacion_plantel where origen = 'migracion';   -- sólo si se decide sacarlas

/* 1. Fuera lo nuevo */
drop function if exists asignar_planteles(uuid, uuid, uuid[]);
drop function if exists panorama_del_club(uuid);
drop function if exists miembros_del_club(uuid);
drop function if exists usuarios_pendientes();

drop policy if exists plantel_coordinador_ver           on plantel;
drop policy if exists miembro_club_coordinador_ver      on miembro_club;
drop policy if exists miembro_club_coordinador_habilita on miembro_club;
drop policy if exists asignacion_coordinador_ver        on asignacion_plantel;
drop policy if exists asignacion_coordinador_asigna     on asignacion_plantel;
drop policy if exists asignacion_coordinador_cierra     on asignacion_plantel;

drop trigger if exists asignacion_sellar_cierre on asignacion_plantel;
drop function if exists sellar_cierre_asignacion();

/* 2. Vuelve `rol` */
alter table miembro_club add column rol text;
update miembro_club set rol = case when es_coordinador then 'coordinador' else 'entrenador' end;
alter table miembro_club alter column rol set not null;
alter table miembro_club add constraint miembro_club_rol_valido check (rol in ('entrenador','coordinador'));

/* 3. Funciones y la policy de 0016, tal cual */
drop policy if exists jugador_crear on jugador;
create policy jugador_crear on jugador
  for insert with check (exists (
    select 1 from miembro_club m
    where m.club_id = jugador.club_id
      and m.user_id = auth.uid()
      and m.rol = 'entrenador'));

create or replace function puede_ver_plantel(p_plantel_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $fn$
  select exists (
    select 1
    from public.plantel pl
    join public.miembro_club m on m.club_id = pl.club_id
    where pl.id = p_plantel_id
      and m.user_id = auth.uid()
      and (
        m.rol = 'coordinador'
        or exists (
          select 1 from public.asignacion_plantel a
          where a.miembro_club_user_id = m.user_id
            and a.miembro_club_club_id = m.club_id
            and a.plantel_id = pl.id)
      )
  );
$fn$;
comment on function puede_ver_plantel(uuid) is null;

create or replace function puede_escribir_plantel(p_plantel_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $fn$
  select exists (
    select 1
    from public.plantel pl
    join public.miembro_club m on m.club_id = pl.club_id
    join public.asignacion_plantel a
      on a.miembro_club_user_id = m.user_id
     and a.miembro_club_club_id = m.club_id
     and a.plantel_id = pl.id
    where pl.id = p_plantel_id
      and m.user_id = auth.uid()
      and m.rol = 'entrenador'
  );
$fn$;

drop function if exists es_coordinador_de(uuid);
drop function if exists es_entrenador_de(uuid);

/* 4. Columnas, índice y constraints de asignacion_plantel */
drop index if exists asignacion_vigente_unica;
alter table asignacion_plantel
  drop constraint if exists asignacion_origen_valido,
  drop constraint if exists asignacion_fechas_validas,
  drop constraint if exists asignacion_cierre_con_fecha,
  drop constraint if exists asignacion_miembro_fk,
  drop constraint if exists asignacion_plantel_fk,
  drop column desde, drop column hasta, drop column asignado_por,
  drop column cerrado_por, drop column origen;

alter table asignacion_plantel
  add constraint asignacion_plantel_unica
    unique (miembro_club_user_id, miembro_club_club_id, plantel_id),
  add constraint asignacion_miembro_fk
    foreign key (miembro_club_user_id, miembro_club_club_id)
    references miembro_club (user_id, club_id) on delete cascade,
  add constraint asignacion_plantel_fk
    foreign key (miembro_club_club_id, plantel_id)
    references plantel (club_id, id) on delete cascade;

/* 5. Columnas de miembro_club */
alter table miembro_club
  drop constraint if exists miembro_club_con_rol,
  drop column es_entrenador, drop column es_coordinador,
  drop column habilitado_por, drop column habilitado_en;

/* 6. Grants como los declaraban 0006 y 0016 */
grant select, insert, update, delete on miembro_club to authenticated;
revoke all on asignacion_plantel from authenticated;
grant select on asignacion_plantel to authenticated;

/* 7. Nada se perdió */
do $$
begin
  if (select count(*) from miembro_club)::text       <> current_setting('verif.miembro_club')
  or (select count(*) from asignacion_plantel)::text <> current_setting('verif.asignacion_plantel')
  or (select count(*) from plantel)::text            <> current_setting('verif.plantel')
  or (select count(*) from jugador)::text            <> current_setting('verif.jugador')
  or (select count(*) from sesion_medicion)::text    <> current_setting('verif.sesion_medicion')
  then
    raise exception 'Rollback abortado: cambió un conteo de filas.';
  end if;
end $$;

commit;

select 'rollback de 0017 completo' as resultado;
```

(Si se descomenta el `delete`, se corre **después** del `set_config` y el conteo de `asignacion_plantel` va a diferir: en ese caso descomentarlo **antes** del `select set_config(...)`.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0018_endurecer_coordinador.sql tests/rollback0017.sql tests/rollback0018.sql
git commit -m "feat(db): el coordinador deja de leer datos individuales, con rollbacks de 0017 y 0018"
```

---

### Tarea 3: Script de verificación SQL

**Riesgo alto.** Es la prueba de que la RLS hace lo que dice el spec.

**Files:**
- Create: `tests/verificarCoordinacion.sql`

**Interfaces:**
- Consumes: Tareas 1 y 2 (nombres exactos de funciones, columnas, comment `v0018`).

- [ ] **Step 1: Escribir el script**

```sql
-- Verificación de 0017 y 0018 (panel de coordinación).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role, después de aplicar 0017 y otra vez después de 0018.
--
-- LOS RESULTADOS SALEN COMO TABLA, una fila por caso: OK, FALLA o PENDIENTE.
-- PENDIENTE = el caso depende de 0018 y 0018 todavía no está aplicada.
--
-- NO DEJA NADA. Crea usuarios sintéticos en auth.users, membresías, jugadores,
-- mediciones y asignaciones dentro de un sub-bloque que al final se deshace a
-- propósito con un SQLSTATE reservado. Los resultados sobreviven en variables.
-- Ningún dato real de ningún menor entra ni sale de este archivo.
--
-- La impersonación (role = authenticated + request.jwt.claims) es exactamente
-- como PostgREST evalúa RLS para una sesión real.

drop table if exists verificacion_coordinacion;
create temporary table verificacion_coordinacion (
  n integer primary key, caso text, estado text, detalle text
);

do $$
declare
  v_club      uuid := '20000000-0000-0000-0000-000000000001';
  v_otro_club uuid := '00000000-0000-0000-0000-000000000001';
  v_rol_previo text := current_setting('role');
  v_hay_0018 boolean := coalesce(
    obj_description('public.puede_ver_plantel(uuid)'::regprocedure, 'pg_proc') like 'v0018%', false);

  v_u17 uuid; v_u21 uuid; v_t17 uuid; v_t21 uuid;
  v_a  uuid := gen_random_uuid();   -- entrenador U17M
  v_b  uuid := gen_random_uuid();   -- entrenador U21M
  v_c  uuid := gen_random_uuid();   -- coordinador
  v_d  uuid := gen_random_uuid();   -- entrenador U21M + coordinador
  v_p  uuid := gen_random_uuid();   -- pendiente confirmado
  v_q  uuid := gen_random_uuid();   -- pendiente SIN confirmar
  v_p2 uuid := gen_random_uuid();   -- pendiente para el caso de rollback

  v_j17 uuid; v_j17b uuid; v_j21 uuid;
  v_imp uuid; v_par uuid; v_ses21 uuid; v_sesvel uuid; v_ses17 uuid; v_ses_p uuid;
  v_ej uuid; v_asig_b uuid;
  v_hasta timestamptz; v_cerrado uuid;
  v_json jsonb; v_res jsonb;
  n integer; m integer; k integer;
  pudo boolean; txt text;

  nombres text[] := array[
    '1. Entrenador de U17M no lee nada de U21M',
    '2. Entrenador ve toda la biblioteca',
    '3. Entrenador no tiene ninguna vía para asignar',
    '4. Coordinador ve pendientes confirmados',
    '5. Varios profes por categoría y varias categorías por profe',
    '6. Cerrar sin borrar: fecha y autor del servidor',
    '7. Límites del coordinador',
    '8. El RPC es todo o nada',
    '9. Panorama: sólo sumas correctas',
    '10. Coordinador sin datos individuales (0018)',
    '11. Persona con los dos roles',
    '12. Nadie ve el otro club'
  ];
  estados  text[] := array_fill('no corrió'::text, array[12]);
  detalles text[] := array_fill(''::text, array[12]);
  falla_setup text := null;
begin

  begin

    /* ---------- setup, como service role ---------- */

    select id, temporada_id into v_u17, v_t17 from plantel where club_id = v_club and categoria = 'U17M';
    select id, temporada_id into v_u21, v_t21 from plantel where club_id = v_club and categoria = 'U21M';
    if v_u17 is null or v_u21 is null then
      raise exception 'No encontré U17M y U21M en el club del piloto.';
    end if;

    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'zztest-' || u.etiqueta || '@verificacion.invalid',
           case when u.etiqueta = 'q' then null else now() end, now(), now()
    from (values (v_a,'a'), (v_b,'b'), (v_c,'c'), (v_d,'d'), (v_p,'p'), (v_q,'q'), (v_p2,'p2'))
         as u(id, etiqueta);

    insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador) values
      (v_a, v_club, true,  false),
      (v_b, v_club, true,  false),
      (v_c, v_club, false, true),
      (v_d, v_club, true,  true);

    insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen)
    values (v_a, v_club, v_u17, 'manual'), (v_d, v_club, v_u21, 'manual');
    insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen)
    values (v_b, v_club, v_u21, 'manual') returning id into v_asig_b;

    insert into jugador (club_id, nombre_clave, nombre_limpio)
      values (v_club, 'ZZTEST COORD DIECISIETE', 'ZZTEST, COORD DIECISIETE') returning id into v_j17;
    insert into jugador (club_id, nombre_clave, nombre_limpio)
      values (v_club, 'ZZTEST COORD DIECISIETE DOS', 'ZZTEST, COORD DIECISIETE DOS') returning id into v_j17b;
    insert into jugador (club_id, nombre_clave, nombre_limpio)
      values (v_club, 'ZZTEST COORD VEINTIUNO', 'ZZTEST, COORD VEINTIUNO') returning id into v_j21;

    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde) values
      (v_club, v_j17,  v_u17, v_t17, '2026-03-01'),
      (v_club, v_j17b, v_u17, v_t17, '2026-03-01'),
      (v_club, v_j21,  v_u21, v_t21, '2026-03-01');

    insert into importacion (club_id, hash_archivo, nombre_archivo)
      values (v_club, 'zztest-coord-' || gen_random_uuid(), 'zztest.xlsx') returning id into v_imp;
    insert into partido (club_id, plantel_id, importacion_id, fecha, condicion_propia)
      values (v_club, v_u21, v_imp, '2026-04-01', 'local') returning id into v_par;
    insert into estadistica_jugador_partido (club_id, partido_id, jugador_id, nombre_crudo)
      values (v_club, v_par, v_j21, 'ZZTEST');

    insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
      values (v_club, v_u21, '2026-04-02', 'tiro') returning id into v_ses21;
    insert into medicion_tiro (club_id, sesion_id, jugador_id, posicion, anotados)
      values (v_club, v_ses21, v_j21, 'frontal', 4);
    insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
      values (v_club, v_u21, '2026-04-03', 'velocidad') returning id into v_sesvel;
    insert into medicion_velocidad (club_id, sesion_id, jugador_id, segundos)
      values (v_club, v_sesvel, v_j21, 5.2);
    insert into medicion_corporal (club_id, jugador_id, fecha_medicion, altura_cm)
      values (v_club, v_j21, '2026-04-04', 180);

    -- Sesión de U17M para el panorama: 3/10 + 5/10 en frontal, y una posición
    -- sin medir que NO tiene que aparecer.
    insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
      values (v_club, v_u17, '2020-01-01', 'tiro') returning id into v_ses17;
    insert into medicion_tiro (club_id, sesion_id, jugador_id, posicion, anotados) values
      (v_club, v_ses17, v_j17,  'frontal', 3),
      (v_club, v_ses17, v_j17b, 'frontal', 5),
      (v_club, v_ses17, v_j17b, 'esq_izq', null);

    insert into ejercicio (club_id, titulo, tema, creado_por)
      values (v_club, 'ZZTEST ejercicio', 'tiro', v_b) returning id into v_ej;
    insert into nota_ejercicio (club_id, ejercicio_id, texto, creado_por)
      values (v_club, v_ej, 'ZZTEST nota', v_b);


    /* ---------- como A: entrenador de U17M ---------- */

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

    -- 1
    select (select count(*) from jugador where id = v_j21)
         + (select count(*) from pertenencia where plantel_id = v_u21)
         + (select count(*) from partido where plantel_id = v_u21)
         + (select count(*) from estadistica_jugador_partido where partido_id = v_par)
         + (select count(*) from sesion_medicion where plantel_id = v_u21)
         + (select count(*) from medicion_tiro where sesion_id = v_ses21)
         + (select count(*) from medicion_velocidad where sesion_id = v_sesvel)
         + (select count(*) from medicion_corporal where jugador_id = v_j21)
      into n;
    select count(*) into m from jugador where id = v_j17;
    if n <> 0 then
      estados[1] := 'FALLA'; detalles[1] := format('Ve %s fila(s) de U21M.', n);
    elsif m <> 1 then
      estados[1] := 'FALLA'; detalles[1] := 'No ve al jugador de su propia categoría.';
    else
      estados[1] := 'OK'; detalles[1] := '0 filas de U21M en las 8 tablas; ve lo suyo.';
    end if;

    -- 2
    select count(*) into n from ejercicio where id = v_ej;
    select count(*) into m from nota_ejercicio where ejercicio_id = v_ej;
    if n = 1 and m = 1 then
      estados[2] := 'OK'; detalles[2] := 'Lee el ejercicio y la nota que cargó el profe de U21M.';
    else
      estados[2] := 'FALLA'; detalles[2] := format('Ejercicio %s/1, nota %s/1.', n, m);
    end if;

    -- 3
    txt := '';
    begin
      insert into miembro_club (user_id, club_id, es_entrenador) values (v_p, v_club, true);
      txt := txt || 'habilitó a otro; ';
    exception when others then null; end;
    begin
      insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id)
      values (v_a, v_club, v_u21);
      txt := txt || 'se asignó U21M; ';
    exception when others then null; end;
    begin
      update asignacion_plantel set hasta = now() where id = v_asig_b;
      get diagnostics n = row_count;
      if n > 0 then txt := txt || 'cerró la asignación de otro; '; end if;
    exception when others then null; end;
    begin
      perform asignar_planteles(v_p, v_club, array[v_u17]);
      txt := txt || 'RPC para otro; ';
    exception when others then null; end;
    begin
      perform asignar_planteles(v_a, v_club, array[v_u21]);
      txt := txt || 'RPC para sí; ';
    exception when others then null; end;
    begin
      perform 1 from usuarios_pendientes();
      txt := txt || 'leyó pendientes; ';
    exception when others then null; end;
    begin
      perform 1 from miembros_del_club(v_club);
      txt := txt || 'leyó miembros; ';
    exception when others then null; end;
    begin
      perform panorama_del_club(v_club);
      txt := txt || 'leyó el panorama; ';
    exception when others then null; end;
    if txt = '' then
      estados[3] := 'OK'; detalles[3] := 'Las 8 vías rechazadas.';
    else
      estados[3] := 'FALLA'; detalles[3] := txt;
    end if;


    /* ---------- como C: coordinador ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);

    -- 4
    select count(*) filter (where user_id = v_p), count(*) filter (where user_id = v_q)
      into n, m from usuarios_pendientes();
    if n = 1 and m = 0 then
      estados[4] := 'OK'; detalles[4] := 'Ve al confirmado, no al que no confirmó el mail.';
    else
      estados[4] := 'FALLA'; detalles[4] := format('Confirmado %s/1, sin confirmar %s/0.', n, m);
    end if;

    -- 5
    begin
      v_res := asignar_planteles(v_p, v_club, array[v_u17, v_u21]);
      perform set_config('role', v_rol_previo, true);
      select count(*) into n from miembro_club where user_id = v_p and club_id = v_club and es_entrenador;
      select count(*) into m from asignacion_plantel where miembro_club_user_id = v_p and hasta is null;
      select count(*) into k from asignacion_plantel
        where plantel_id = v_u17 and hasta is null and miembro_club_user_id in (v_a, v_p);
      if n = 1 and m = 2 and k = 2 and (v_res->>'habilitado')::boolean then
        estados[5] := 'OK'; detalles[5] := 'Habilitado con 2 categorías; U17M queda con 2 profes.';
      else
        estados[5] := 'FALLA';
        detalles[5] := format('membresía %s/1, vigentes %s/2, profes en U17M %s/2, respuesta %s', n, m, k, v_res);
      end if;
    exception when others then
      estados[5] := 'FALLA'; detalles[5] := 'El RPC falló: ' || sqlerrm;
    end;
    perform set_config('role', 'authenticated', true);

    -- 6
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_p, 'role', 'authenticated')::text, true);
      insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
        values (v_club, v_u21, '2026-05-01', 'tiro') returning id into v_ses_p;

      perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
      update asignacion_plantel set hasta = '2020-01-01'
        where miembro_club_user_id = v_p and plantel_id = v_u21 and hasta is null;
      get diagnostics n = row_count;

      perform set_config('request.jwt.claims', json_build_object('sub', v_p, 'role', 'authenticated')::text, true);
      select count(*) into m from sesion_medicion where plantel_id = v_u21;

      perform set_config('role', v_rol_previo, true);
      select hasta, cerrado_por into v_hasta, v_cerrado
        from asignacion_plantel where miembro_club_user_id = v_p and plantel_id = v_u21;
      select count(*) into k from sesion_medicion where id = v_ses_p;

      if n = 1 and v_hasta > '2021-01-01' and v_cerrado = v_c and m = 0 and k = 1 then
        estados[6] := 'OK'; detalles[6] := 'Fila cerrada con now() y autor C; P ya no ve U21M; su sesión sigue.';
      else
        estados[6] := 'FALLA';
        detalles[6] := format('filas %s/1, hasta %s, cerrado_por ok %s, P ve %s/0, sesión existe %s/1',
                              n, v_hasta, v_cerrado = v_c, m, k);
      end if;
    exception when others then
      estados[6] := 'FALLA'; detalles[6] := 'Error: ' || sqlerrm;
    end;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);

    -- 7
    txt := '';
    begin
      delete from asignacion_plantel where miembro_club_user_id = v_p and plantel_id = v_u21;
      get diagnostics n = row_count;
      if n > 0 then txt := txt || 'borró una asignación; '; end if;
    exception when others then null; end;
    begin
      update asignacion_plantel set hasta = null where miembro_club_user_id = v_p and plantel_id = v_u21;
      get diagnostics n = row_count;
      if n > 0 then txt := txt || 'reabrió una cerrada; '; end if;
    exception when others then null; end;
    begin
      insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, desde)
      values (v_b, v_club, v_u17, '2020-01-01');
      txt := txt || 'antedató una asignación; ';
    exception when others then null; end;
    begin
      insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador)
      values (v_p2, v_club, true, true);
      txt := txt || 'creó un coordinador; ';
    exception when others then null; end;
    begin
      insert into miembro_club (user_id, club_id, es_entrenador) values (v_p2, v_otro_club, true);
      txt := txt || 'habilitó en otro club; ';
    exception when others then null; end;

    perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
    begin
      insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id)
      values (v_d, v_club, v_u17);
      txt := txt || 'se autoasignó (insert); ';
    exception when others then null; end;
    begin
      perform asignar_planteles(v_d, v_club, array[v_u17]);
      txt := txt || 'se autoasignó (RPC); ';
    exception when others then null; end;

    if txt = '' then
      estados[7] := 'OK'; detalles[7] := 'Las 7 vías rechazadas.';
    else
      estados[7] := 'FALLA'; detalles[7] := txt;
    end if;

    -- 8
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
    pudo := false;
    txt := '';
    begin
      -- El segundo plantel no existe: rompe la FK compuesta DESPUÉS de haber
      -- insertado la membresía y la asignación a U17M.
      perform asignar_planteles(v_p2, v_club, array[v_u17, gen_random_uuid()]);
      pudo := true;
    exception when others then
      txt := sqlerrm;
    end;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from miembro_club where user_id = v_p2;
    select count(*) into m from asignacion_plantel where miembro_club_user_id = v_p2;
    if pudo then
      estados[8] := 'FALLA'; detalles[8] := 'El RPC no falló con un plantel inexistente.';
    elsif n + m <> 0 then
      estados[8] := 'FALLA'; detalles[8] := format('Quedaron %s membresía(s) y %s asignación(es).', n, m);
    else
      estados[8] := 'OK'; detalles[8] := 'Falló (' || left(txt, 60) || ') y no dejó nada.';
    end if;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);

    -- 9
    begin
      v_json := panorama_del_club(v_club);
      select (e->>'anotados')::int, (e->>'intentos')::int, (e->>'jugadoresQueMidieron')::int
        into n, m, k
        from jsonb_array_elements(v_json->'tiro') e
       where e->>'sesionId' = v_ses17::text and e->>'posicion' = 'frontal';
      txt := '';
      if n is distinct from 8 or m is distinct from 20 or k is distinct from 2 then
        txt := txt || format('frontal %s/%s con %s jugadores, esperaba 8/20 con 2; ', n, m, k);
      end if;
      if exists (select 1 from jsonb_array_elements(v_json->'tiro') e
                 where e->>'sesionId' = v_ses17::text and e->>'posicion' = 'esq_izq') then
        txt := txt || 'trae una posición sin medir; ';
      end if;
      if exists (select 1 from jsonb_array_elements(v_json->'tiro') e, jsonb_object_keys(e) clave
                 where clave not in ('plantelId','sesionId','fecha','posicion','anotados','intentos','jugadoresQueMidieron'))
      or exists (select 1 from jsonb_array_elements(v_json->'planteles') e, jsonb_object_keys(e) clave
                 where clave not in ('plantelId','jugadores','partidos','ultimaMedicion','ultimoPartido')) then
        txt := txt || 'trae claves fuera de la lista; ';
      end if;
      if txt = '' then
        estados[9] := 'OK'; detalles[9] := '8/20 con 2 jugadores; sin posiciones vacías; sólo claves permitidas.';
      else
        estados[9] := 'FALLA'; detalles[9] := txt;
      end if;
    exception when others then
      estados[9] := 'FALLA'; detalles[9] := 'Error: ' || sqlerrm;
    end;

    -- 10
    select (select count(*) from jugador where id in (v_j17, v_j17b, v_j21))
         + (select count(*) from pertenencia where plantel_id in (v_u17, v_u21))
         + (select count(*) from partido where plantel_id in (v_u17, v_u21))
         + (select count(*) from estadistica_jugador_partido where partido_id = v_par)
         + (select count(*) from sesion_medicion where plantel_id in (v_u17, v_u21))
         + (select count(*) from medicion_tiro where sesion_id in (v_ses17, v_ses21))
         + (select count(*) from medicion_velocidad where sesion_id = v_sesvel)
         + (select count(*) from medicion_corporal where jugador_id = v_j21)
      into n;
    select count(*) into m from plantel where club_id = v_club;
    pudo := false;
    begin
      perform 1 from jugadores_del_club_para_dedup(v_club);
      pudo := true;
    exception when others then null; end;
    if m < 2 then
      estados[10] := 'FALLA'; detalles[10] := format('Ve %s plantel(es) de su club, esperaba al menos 2.', m);
    elsif not v_hay_0018 then
      estados[10] := 'PENDIENTE';
      detalles[10] := format('Sin 0018 el coordinador todavía lee %s fila(s) individuales. Ve los planteles.', n);
    elsif n <> 0 or pudo then
      estados[10] := 'FALLA'; detalles[10] := format('Lee %s fila(s) individuales; dedup permitido: %s.', n, pudo);
    else
      estados[10] := 'OK'; detalles[10] := '0 filas individuales, dedup rechazado, ve los planteles.';
    end if;


    /* ---------- como D: los dos roles ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);

    -- 11
    begin
      txt := '';
      select count(*) into n from jugador where id = v_j21;
      if n <> 1 then txt := txt || 'no ve su categoría; '; end if;
      insert into sesion_medicion (club_id, plantel_id, fecha, tipo) values (v_club, v_u21, '2026-05-02', 'tiro');
      perform 1 from miembros_del_club(v_club);
      select count(*) into m from jugador where id = v_j17;
      if v_hay_0018 and m <> 0 then txt := txt || 've U17M, que no tiene asignada; '; end if;
      if txt <> '' then
        estados[11] := 'FALLA'; detalles[11] := txt;
      elsif not v_hay_0018 then
        estados[11] := 'PENDIENTE'; detalles[11] := 'Ve y escribe U21M y usa el panel. Sin 0018 todavía ve U17M.';
      else
        estados[11] := 'OK'; detalles[11] := 'Ve y escribe U21M, usa el panel, no ve U17M.';
      end if;
    exception when others then
      estados[11] := 'FALLA'; detalles[11] := 'Error: ' || sqlerrm;
    end;


    /* ---------- 12: el otro club ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
    begin perform panorama_del_club(v_otro_club); txt := txt || 'panorama del otro club; ';
    exception when others then null; end;
    begin perform 1 from miembros_del_club(v_otro_club); txt := txt || 'miembros del otro club; ';
    exception when others then null; end;
    select count(*) into n from plantel where club_id = v_otro_club;
    if n <> 0 then txt := txt || 'el coordinador ve planteles del otro club; '; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    select count(*) into n from plantel where club_id = v_otro_club;
    select count(*) into m from jugador where club_id = v_otro_club;
    if n + m <> 0 then txt := txt || 'el entrenador ve datos del otro club; '; end if;

    if txt = '' then
      estados[12] := 'OK'; detalles[12] := 'Ni tablas ni funciones del panel.';
    else
      estados[12] := 'FALLA'; detalles[12] := txt;
    end if;

    raise exception using errcode = 'ZY001', message = 'fin';

  exception
    when sqlstate 'ZY001' then
      null;  -- salida normal: todo lo escrito arriba quedó deshecho
    when others then
      falla_setup := sqlerrm;
  end;

  perform set_config('role', v_rol_previo, true);

  if falla_setup is not null then
    insert into verificacion_coordinacion values
      (0, 'SETUP', 'ERROR', falla_setup || '  (los casos que no llegaron a correr dicen "no corrió")');
  end if;

  for i in 1..12 loop
    insert into verificacion_coordinacion values (i, nombres[i], estados[i], detalles[i]);
  end loop;

  insert into verificacion_coordinacion values
    (99, '0018 aplicada', case when v_hay_0018 then 'sí' else 'no' end, '');
end $$;

select n as "#", caso, estado, detalle
from verificacion_coordinacion
order by n;
```

- [ ] **Step 2: Revisión de consistencia**

Comparar contra la Tarea 1: nombres de las funciones, de las claves del jsonb del panorama, y que la lista de claves permitidas del caso 9 coincida **exactamente** con la de `panorama_del_club`.

- [ ] **Step 3: Commit**

```bash
git add tests/verificarCoordinacion.sql
git commit -m "test(db): verificación de la coordinación con usuarios sintéticos"
```

---

### Tarea 4: Serie agregada y escala fija del gráfico

**Riesgo bajo.** TDD.

**Files:**
- Modify: `src/data/estadisticas.js` (al final)
- Modify: `src/ui/componentes/graficos.js:104-116`
- Test: `tests/estadisticas.test.js`, `tests/graficos.test.js`

**Interfaces:**
- Produces:
  - `serieDeZonasAgregada(filas, zonaIds) → [{ sesionId, fecha, jugadoresQueMidieron, valor: {pct, anotados, intentos, muestraChica} }]`, ordenada de la más vieja a la más nueva. `filas`: `[{ sesionId, fecha, posicion, anotados, intentos, jugadoresQueMidieron }]`.
  - `grafico(svg, datos, { u, alto, dec, min, max })` — con `min` y `max` numéricos, la escala queda fija.

- [ ] **Step 1: Tests que fallan — `tests/estadisticas.test.js`**

Sumar `serieDeZonasAgregada` al import del principio del archivo, y al final:

```js
test('la serie agregada da lo mismo que serieDeZonas con filas por jugador', () => {
  const ses = [
    { id: 's1', fecha: '2026-03-01', tipo: 'tiro' },
    { id: 's2', fecha: '2026-04-01', tipo: 'tiro' },
  ];
  const med = [
    { sesionId: 's1', jugadorId: 'a', posicion: 'frontal', anotados: 3, intentos: 10 },
    { sesionId: 's1', jugadorId: 'b', posicion: 'frontal', anotados: 5, intentos: 10 },
    { sesionId: 's1', jugadorId: 'a', posicion: 'esq_izq', anotados: 2, intentos: 10 },
    { sesionId: 's1', jugadorId: 'a', posicion: 'libres', anotados: 9, intentos: 10 },
    { sesionId: 's2', jugadorId: 'a', posicion: 'frontal', anotados: 6, intentos: 10 },
  ];
  // Lo mismo, como lo devuelve panorama_del_club: sumado por sesión y posición.
  const agregadas = [
    { sesionId: 's1', fecha: '2026-03-01', posicion: 'frontal', anotados: 8, intentos: 20, jugadoresQueMidieron: 2 },
    { sesionId: 's1', fecha: '2026-03-01', posicion: 'esq_izq', anotados: 2, intentos: 10, jugadoresQueMidieron: 2 },
    { sesionId: 's1', fecha: '2026-03-01', posicion: 'libres', anotados: 9, intentos: 10, jugadoresQueMidieron: 2 },
    { sesionId: 's2', fecha: '2026-04-01', posicion: 'frontal', anotados: 6, intentos: 10, jugadoresQueMidieron: 1 },
  ];
  const arco = POSICIONES.map((z) => z.id);
  const individual = serieDeZonas(ses, med, arco);
  const agregada = serieDeZonasAgregada(agregadas, arco);
  assert.deepEqual(agregada.map((p) => p.valor), individual.map((p) => p.valor));
  assert.deepEqual(agregada.map((p) => p.fecha), ['2026-03-01', '2026-04-01']);
  assert.deepEqual(agregada.map((p) => p.jugadoresQueMidieron), [2, 1]);
});

test('la serie agregada deja afuera los libres y no inventa puntos', () => {
  const filas = [
    { sesionId: 's1', fecha: '2026-03-01', posicion: 'libres', anotados: 9, intentos: 10, jugadoresQueMidieron: 1 },
  ];
  assert.deepEqual(serieDeZonasAgregada(filas, POSICIONES.map((z) => z.id)), []);
  assert.deepEqual(serieDeZonasAgregada([], ['frontal']), []);
  assert.deepEqual(serieDeZonasAgregada(null, ['frontal']), []);
});

test('la serie agregada marca la muestra chica con el umbral único', () => {
  const filas = [
    { sesionId: 's1', fecha: '2026-03-01', posicion: 'frontal', anotados: 1, intentos: UMBRAL_INTENTOS - 1, jugadoresQueMidieron: 1 },
  ];
  const [p] = serieDeZonasAgregada(filas, ['frontal']);
  assert.equal(p.valor.muestraChica, true);
});
```

- [ ] **Step 2: Test que falla — `tests/graficos.test.js`** (al final)

```js
test('con min y max la escala queda fija, sin depender de los datos', () => {
  const svg = svgFalso();
  grafico(svg, {
    etiquetas: ['01/03', '01/04'],
    series: [{ nombre: 'arco', c: '#D9122E', d: [40, 45] }],
  }, { min: 0, max: 100 });
  assert.match(svg.innerHTML, />0<\/text>/);
  assert.match(svg.innerHTML, />100<\/text>/);
});

test('sin min y max la escala sigue saliendo de los datos', () => {
  const svg = svgFalso();
  grafico(svg, {
    etiquetas: ['01/03', '01/04'],
    series: [{ nombre: 'arco', c: '#D9122E', d: [40, 45] }],
  });
  assert.doesNotMatch(svg.innerHTML, />100<\/text>/);
});
```

- [ ] **Step 3: Correr y ver que fallan**

Run: `node --test tests/estadisticas.test.js tests/graficos.test.js`
Expected: FAIL — `serieDeZonasAgregada` no exportada; el test de escala fija no encuentra `>100</text>`.

- [ ] **Step 4: Implementar en `src/data/estadisticas.js`** (al final)

```js
/**
 * La misma serie que serieDeZonas, pero a partir de SUMAS por sesión y
 * posición en vez de filas por jugador.
 *
 * Existe para el panorama de coordinación: el coordinador no tiene acceso a
 * mediciones individuales, y la base le devuelve anotados e intentos ya
 * sumados entre jugadores (panorama_del_club, 0017). El porcentaje, el umbral
 * y la muestra chica salen de porcentaje(), igual que en todo el proyecto.
 *
 * filas: [{ sesionId, fecha, posicion, anotados, intentos, jugadoresQueMidieron }]
 */
export function serieDeZonasAgregada(filas, zonaIds) {
  const porSesion = new Map();
  for (const f of filas ?? []) {
    if (!zonaIds.includes(f.posicion)) continue;
    if (!porSesion.has(f.sesionId)) {
      porSesion.set(f.sesionId, {
        sesionId: f.sesionId,
        fecha: f.fecha,
        jugadoresQueMidieron: f.jugadoresQueMidieron,
        anotados: 0,
        intentos: 0,
      });
    }
    const acum = porSesion.get(f.sesionId);
    acum.anotados += f.anotados;
    acum.intentos += f.intentos;
  }
  return [...porSesion.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((s) => ({
      sesionId: s.sesionId,
      fecha: s.fecha,
      jugadoresQueMidieron: s.jugadoresQueMidieron,
      valor: porcentaje(s.anotados, s.intentos),
    }))
    .filter((p) => p.valor != null);
}
```

- [ ] **Step 5: Implementar en `src/ui/componentes/graficos.js`**

Actualizar el JSDoc de `grafico` sumando la línea:

```js
 * `min` y `max`, si vienen los dos, fijan la escala del eje Y. El panorama de
 * coordinación los usa en 0–100 para que dos tarjetas lado a lado no se lean
 * como comparables por tener escalas distintas.
```

Reemplazar la firma y el cálculo de escala:

```js
export function grafico(svg, { etiquetas, series }, { u = '%', alto = 170, dec = 0, min: minFijo = null, max: maxFijo = null } = {}) {
```

```js
  const W = 320, H = alto, ml = 30, mr = 8, mt = 12, mb = 24;
  let min, max;
  if (minFijo != null && maxFijo != null) {
    min = minFijo;
    max = maxFijo;
  } else {
    min = Math.min(...todos);
    max = Math.max(...todos);
    const pad = (max - min) * 0.25 || 1;
    min = min - pad; max = max + pad;
    if (u === '%') min = Math.max(0, min);
  }
```

(borrando las cuatro líneas viejas `let min = ...`, `const pad = ...`, `min = min - pad...`, `if (u === '%')...`).

- [ ] **Step 6: Correr**

Run: `npm test`
Expected: PASS completo.

- [ ] **Step 7: Commit**

```bash
git add src/data/estadisticas.js src/ui/componentes/graficos.js tests/estadisticas.test.js tests/graficos.test.js
git commit -m "feat(estadisticas): serie de zonas desde sumas, y escala fija opcional en el gráfico"
```

---

### Tarea 5: Lógica pura del panel — `src/data/coordinacion.js`

**Riesgo medio.** TDD.

**Files:**
- Create: `src/data/coordinacion.js`
- Create: `tests/coordinacion.test.js`
- Modify: `package.json` (sumar `tests/coordinacion.test.js` al script `test`)

**Interfaces:**
- Consumes: `serieDeZonasAgregada`, `compararPorcentajes` (estadisticas.js); `POSICIONES` (posiciones.js).
- Produces (formas que usan las Tareas 6–8):
  - Plantel: `{ id, categoria, categoriaCodigo, codigoCabb, temporadaId }`
  - Categoría del catálogo: `{ codigo, nombre, orden }`
  - Temporada: `{ id, nombre }`
  - Miembro: `{ userId, email, nombre, esEntrenador, esCoordinador, habilitadoEn }`
  - Asignación: `{ id, userId, plantelId, desde, hasta, origen }`
  - Pendiente: `{ userId, email, registradoEn }`
  - `temporadaMasReciente(temporadas) → Temporada | null`
  - `plantelesEnOrdenDeCatalogo(planteles, catalogo, temporadaId) → Plantel[]`
  - `etiquetaDeMiembro(miembro) → string`
  - `armarPanorama({ planteles, catalogo, temporadas, panorama, miembros, asignaciones }) → { temporada, tarjetas: [{ plantelId, categoria, nombreCategoria, jugadores, partidos, ultimaMedicion, aCargo: string[], serie, variacion }] }`
  - `armarProfes({ planteles, catalogo, temporadas, miembros, asignaciones, pendientes, usuarioActualId }) → { temporada, plantelesDeLaTemporada, pendientes, profes: [{ userId, etiqueta, email, esEntrenador, esCoordinador, esUnoMismo, categorias: [{ asignacionId, plantelId, etiqueta, origen }] }], sinProfe: Plantel[] }`

- [ ] **Step 1: Tests que fallan — `tests/coordinacion.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  temporadaMasReciente, plantelesEnOrdenDeCatalogo, etiquetaDeMiembro, armarPanorama, armarProfes,
} from '../src/data/coordinacion.js';

const catalogo = [
  { codigo: 'U13M', nombre: 'Sub-13 Masculino', orden: 10 },
  { codigo: 'U17M', nombre: 'Sub-17 Masculino', orden: 30 },
  { codigo: 'U21M', nombre: 'Sub-21 Masculino', orden: 40 },
];
const temporadas = [{ id: 't25', nombre: '2025' }, { id: 't26', nombre: '2026' }];
const planteles = [
  { id: 'p21', categoria: 'U21M', categoriaCodigo: 'U21M', temporadaId: 't26' },
  { id: 'p13', categoria: 'U13M', categoriaCodigo: 'U13M', temporadaId: 't26' },
  { id: 'p17', categoria: 'U17M', categoriaCodigo: 'U17M', temporadaId: 't26' },
  { id: 'p17viejo', categoria: 'U17M', categoriaCodigo: 'U17M', temporadaId: 't25' },
];
const miembros = [
  { userId: 'ana', email: 'ana@x.com', nombre: 'Ana', esEntrenador: true, esCoordinador: false },
  { userId: 'beto', email: 'beto@x.com', nombre: null, esEntrenador: true, esCoordinador: false },
  { userId: 'coord', email: 'coord@x.com', nombre: 'Coordi', esEntrenador: false, esCoordinador: true },
];
const tiroFila = (plantelId, sesionId, fecha, anotados, intentos) => (
  { plantelId, sesionId, fecha, posicion: 'frontal', anotados, intentos, jugadoresQueMidieron: 3 }
);

test('la temporada más reciente sale del nombre', () => {
  assert.equal(temporadaMasReciente(temporadas).id, 't26');
  assert.equal(temporadaMasReciente([]), null);
});

test('los planteles van en el orden del catálogo y sólo de la temporada pedida', () => {
  assert.deepEqual(plantelesEnOrdenDeCatalogo(planteles, catalogo, 't26').map((p) => p.id), ['p13', 'p17', 'p21']);
});

test('la etiqueta de un miembro es el nombre, o el mail si no cargó nombre', () => {
  assert.equal(etiquetaDeMiembro(miembros[0]), 'Ana');
  assert.equal(etiquetaDeMiembro(miembros[1]), 'beto@x.com');
});

test('el panorama ordena por catálogo aunque los números digan otra cosa', () => {
  // U21M tira muchísimo mejor que U13M: igual va última. Ordenar por valor
  // sería un ranking de categorías, y con eso, de entrenadores.
  const panorama = {
    planteles: [],
    tiro: [tiroFila('p21', 's1', '2026-03-01', 90, 100), tiroFila('p13', 's2', '2026-03-01', 10, 100)],
  };
  const { tarjetas } = armarPanorama({ planteles, catalogo, temporadas, panorama, miembros, asignaciones: [] });
  assert.deepEqual(tarjetas.map((t) => t.plantelId), ['p13', 'p17', 'p21']);
});

test('una tarjeta no trae ningún campo de comparación entre categorías', () => {
  const { tarjetas } = armarPanorama({ planteles, catalogo, temporadas, panorama: { planteles: [], tiro: [] }, miembros, asignaciones: [] });
  assert.deepEqual(Object.keys(tarjetas[0]).sort(), [
    'aCargo', 'categoria', 'jugadores', 'nombreCategoria', 'partidos', 'plantelId', 'serie', 'ultimaMedicion', 'variacion',
  ]);
});

test('cada categoría se compara sólo con su propia batería anterior', () => {
  const panorama = {
    planteles: [{ plantelId: 'p17', jugadores: 14, partidos: 3, ultimaMedicion: '2026-04-01', ultimoPartido: '2026-03-20' }],
    tiro: [
      tiroFila('p17', 's1', '2026-03-01', 300, 700),
      tiroFila('p17', 's2', '2026-04-01', 310, 700),
      tiroFila('p21', 's3', '2026-04-01', 600, 700),
    ],
  };
  const { tarjetas } = armarPanorama({ planteles, catalogo, temporadas, panorama, miembros, asignaciones: [] });
  const u17 = tarjetas.find((t) => t.plantelId === 'p17');
  assert.equal(u17.serie.length, 2);
  assert.equal(u17.variacion.pp, 1);
  assert.equal(u17.variacion.concluyente, false);
  assert.equal(u17.jugadores, 14);
  assert.equal(u17.partidos, 3);
  assert.equal(u17.ultimaMedicion, '2026-04-01');
  const u13 = tarjetas.find((t) => t.plantelId === 'p13');
  assert.deepEqual(u13.serie, []);
  assert.equal(u13.variacion, null);
  assert.equal(u13.jugadores, 0);
});

test('a cargo: sólo entrenadores con asignación vigente', () => {
  const asignaciones = [
    { id: 'a1', userId: 'ana', plantelId: 'p17', hasta: null, origen: 'panel' },
    { id: 'a2', userId: 'beto', plantelId: 'p17', hasta: '2026-05-01T00:00:00Z', origen: 'panel' },
    { id: 'a3', userId: 'coord', plantelId: 'p21', hasta: null, origen: 'manual' },
  ];
  const { tarjetas } = armarPanorama({ planteles, catalogo, temporadas, panorama: { planteles: [], tiro: [] }, miembros, asignaciones });
  assert.deepEqual(tarjetas.find((t) => t.plantelId === 'p17').aCargo, ['Ana']);
  assert.deepEqual(tarjetas.find((t) => t.plantelId === 'p21').aCargo, []);
});

test('profes: categorías sin profe, uno mismo, y asignaciones de otra temporada', () => {
  const asignaciones = [
    { id: 'a1', userId: 'ana', plantelId: 'p17', hasta: null, origen: 'migracion' },
    { id: 'a2', userId: 'ana', plantelId: 'p17viejo', hasta: null, origen: 'manual' },
    { id: 'a3', userId: 'beto', plantelId: 'p13', hasta: null, origen: 'panel' },
  ];
  const vista = armarProfes({
    planteles, catalogo, temporadas, miembros, asignaciones,
    pendientes: [{ userId: 'nuevo', email: 'nuevo@x.com', registradoEn: '2026-09-10T12:00:00Z' }],
    usuarioActualId: 'coord',
  });
  assert.deepEqual(vista.sinProfe.map((p) => p.id), ['p21']);
  assert.deepEqual(vista.plantelesDeLaTemporada.map((p) => p.id), ['p13', 'p17', 'p21']);
  assert.equal(vista.pendientes.length, 1);
  const ana = vista.profes.find((p) => p.userId === 'ana');
  assert.deepEqual(ana.categorias.map((c) => c.etiqueta), ['U17M', 'U17M 2025']);
  assert.equal(ana.categorias[0].origen, 'migracion');
  assert.equal(vista.profes.find((p) => p.userId === 'coord').esUnoMismo, true);
  assert.equal(ana.esUnoMismo, false);
});
```

Sumar `tests/coordinacion.test.js` al final de la lista del script `test` en `package.json`.

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test tests/coordinacion.test.js`
Expected: FAIL — no existe `src/data/coordinacion.js`.

- [ ] **Step 3: Implementar `src/data/coordinacion.js`**

```js
import { serieDeZonasAgregada, compararPorcentajes } from './estadisticas.js';
import { POSICIONES } from './posiciones.js';

/**
 * Lo que dibujan las pantallas de coordinación, armado a partir de lo que
 * devuelve la base. Funciones puras: sin red, sin DOM.
 *
 * Dos reglas que viven acá y no en la pantalla, para que no dependan de que
 * alguien se acuerde:
 *  - Las categorías van SIEMPRE en el orden del catálogo, nunca por un valor.
 *    Ordenar por porcentaje sería un ranking de categorías, y con eso de
 *    entrenadores.
 *  - Cada categoría se compara sólo consigo misma: la variación es entre su
 *    última batería y la anterior. Comparar U13 con U17 compara edades, no
 *    trabajo.
 */

/** El arco completo, igual que la card de HOY: libres es otra serie. */
const IDS_ARCO = POSICIONES.map((z) => z.id);

/** Hoy el nombre de la temporada es el año, así que ordenar el texto alcanza. */
export function temporadaMasReciente(temporadas) {
  return [...(temporadas ?? [])].sort((a, b) => b.nombre.localeCompare(a.nombre))[0] ?? null;
}

export function plantelesEnOrdenDeCatalogo(planteles, catalogo, temporadaId) {
  const orden = new Map((catalogo ?? []).map((c) => [c.codigo, c.orden]));
  return (planteles ?? [])
    .filter((p) => p.temporadaId === temporadaId)
    .sort((a, b) => (orden.get(a.categoriaCodigo) ?? Infinity) - (orden.get(b.categoriaCodigo) ?? Infinity));
}

/** El nombre si lo cargó (perfil_entrenador), el mail si no. */
export function etiquetaDeMiembro(miembro) {
  return miembro?.nombre || miembro?.email || 'Cuenta sin nombre';
}

function vigentes(asignaciones) {
  return (asignaciones ?? []).filter((a) => a.hasta == null);
}

function entrenadoresACargo(plantelId, asignacionesVigentes, miembrosPorId) {
  return asignacionesVigentes
    .filter((a) => a.plantelId === plantelId)
    .map((a) => miembrosPorId.get(a.userId))
    .filter((m) => m?.esEntrenador);
}

export function armarPanorama({ planteles, catalogo, temporadas, panorama, miembros, asignaciones }) {
  const temporada = temporadaMasReciente(temporadas);
  if (!temporada) return { temporada: null, tarjetas: [] };

  const miembrosPorId = new Map((miembros ?? []).map((m) => [m.userId, m]));
  const resumenPorPlantel = new Map((panorama?.planteles ?? []).map((r) => [r.plantelId, r]));
  const nombreDeCategoria = new Map((catalogo ?? []).map((c) => [c.codigo, c.nombre]));
  const asignacionesVigentes = vigentes(asignaciones);

  const tarjetas = plantelesEnOrdenDeCatalogo(planteles, catalogo, temporada.id).map((p) => {
    const resumen = resumenPorPlantel.get(p.id) ?? {};
    const serie = serieDeZonasAgregada((panorama?.tiro ?? []).filter((t) => t.plantelId === p.id), IDS_ARCO);
    const variacion = serie.length >= 2
      ? compararPorcentajes(serie[serie.length - 1].valor, serie[serie.length - 2].valor)
      : null;
    return {
      plantelId: p.id,
      categoria: p.categoria,
      nombreCategoria: nombreDeCategoria.get(p.categoriaCodigo) ?? p.categoria,
      jugadores: resumen.jugadores ?? 0,
      partidos: resumen.partidos ?? 0,
      ultimaMedicion: resumen.ultimaMedicion ?? null,
      aCargo: entrenadoresACargo(p.id, asignacionesVigentes, miembrosPorId).map(etiquetaDeMiembro),
      serie,
      variacion,
    };
  });

  return { temporada, tarjetas };
}

export function armarProfes({ planteles, catalogo, temporadas, miembros, asignaciones, pendientes, usuarioActualId }) {
  const temporada = temporadaMasReciente(temporadas);
  const plantelesPorId = new Map((planteles ?? []).map((p) => [p.id, p]));
  const nombreDeTemporada = new Map((temporadas ?? []).map((t) => [t.id, t.nombre]));
  const orden = new Map((catalogo ?? []).map((c) => [c.codigo, c.orden]));
  const miembrosPorId = new Map((miembros ?? []).map((m) => [m.userId, m]));
  const asignacionesVigentes = vigentes(asignaciones);
  const plantelesDeLaTemporada = temporada ? plantelesEnOrdenDeCatalogo(planteles, catalogo, temporada.id) : [];

  // Una asignación de otra temporada todavía vigente se muestra con el año:
  // "U17M" sola haría creer que es la de este año.
  const etiquetaDePlantel = (p) => (p.temporadaId === temporada?.id
    ? p.categoria
    : `${p.categoria} ${nombreDeTemporada.get(p.temporadaId) ?? ''}`.trim());

  const profes = [...(miembros ?? [])]
    .sort((a, b) => etiquetaDeMiembro(a).localeCompare(etiquetaDeMiembro(b)))
    .map((m) => ({
      userId: m.userId,
      etiqueta: etiquetaDeMiembro(m),
      email: m.email,
      esEntrenador: m.esEntrenador,
      esCoordinador: m.esCoordinador,
      esUnoMismo: m.userId === usuarioActualId,
      categorias: asignacionesVigentes
        .filter((a) => a.userId === m.userId && plantelesPorId.has(a.plantelId))
        .map((a) => ({ a, p: plantelesPorId.get(a.plantelId) }))
        .sort((x, y) => (orden.get(x.p.categoriaCodigo) ?? Infinity) - (orden.get(y.p.categoriaCodigo) ?? Infinity)
          || (nombreDeTemporada.get(y.p.temporadaId) ?? '').localeCompare(nombreDeTemporada.get(x.p.temporadaId) ?? ''))
        .map(({ a, p }) => ({ asignacionId: a.id, plantelId: p.id, etiqueta: etiquetaDePlantel(p), origen: a.origen })),
    }));

  const sinProfe = plantelesDeLaTemporada
    .filter((p) => entrenadoresACargo(p.id, asignacionesVigentes, miembrosPorId).length === 0);

  return { temporada, plantelesDeLaTemporada, pendientes: pendientes ?? [], profes, sinProfe };
}
```

- [ ] **Step 4: Correr**

Run: `npm test`
Expected: PASS completo.

- [ ] **Step 5: Commit**

```bash
git add src/data/coordinacion.js tests/coordinacion.test.js package.json
git commit -m "feat(coordinacion): panorama por categoría contra sí misma y vista de profes"
```

---

### Tarea 6: Datos, sesión y chrome con modo coordinación

**Riesgo medio.** Toca el arranque de la app para todos.

**Files:**
- Modify: `src/data/repositorio.js` (`obtenerPlantelesDelClub` y funciones nuevas al final)
- Modify: `src/ui/sesion.js`
- Modify: `src/ui/chrome.js`
- Modify: `src/ui/main.js`
- Create: `src/ui/componentes/variacion.js`
- Modify: `src/ui/pantallas/hoy.js:43-58` y su import
- Modify: `src/ui/pantallas/plantel.js:70-75`
- Modify: `public/index.html` (`v-sin-club` y secciones nuevas)
- Modify: `public/css/layout.css` (cabecera)

**Interfaces:**
- Consumes: SQL de la Tarea 1; formas de la Tarea 5.
- Produces:
  - repositorio: `obtenerMisRoles(clubId) → {esEntrenador, esCoordinador}`, `obtenerMisPlantelesAsignados(clubId) → Set<plantelId>`, `obtenerCatalogoDeCategorias() → Categoría[]`, `obtenerTemporadasDelClub(clubId) → Temporada[]`, `obtenerUsuariosPendientes() → Pendiente[]`, `obtenerMiembrosDelClub(clubId) → Miembro[]`, `obtenerAsignacionesDelClub(clubId) → Asignación[]`, `obtenerPanoramaDelClub(clubId) → {planteles, tiro}`, `asignarPlanteles({userId, clubId, plantelIds}) → {habilitado, asignadas, yaVigentes}`, `cerrarAsignacion(asignacionId) → void`. `obtenerPlantelesDelClub` suma `categoriaCodigo`.
  - sesion: `setRoles(roles)`, `obtenerRoles()`, `obtenerModo() → 'entrenar'|'coordinar'`, `setModo(modo)`.
  - chrome: `TABS_COORDINACION`, `pantallaInicialDelModo() → string`; `iniciarChrome({ onTab, onPlantel, onVolver, onSalir, onModo })`.
  - componentes: `variacionHtml(variacion) → string`.

- [ ] **Step 1: `src/ui/componentes/variacion.js`**

Mover la función de `hoy.js` tal cual, con su comentario:

```js
/**
 * La variación contra la batería anterior.
 *
 * Sólo lleva flecha y color cuando supera el margen de error de la
 * comparación. Dos baterías de ~700 intentos tienen ±2 pp cada una: una
 * diferencia de 2 pp entre sesiones está dentro del ruido, y pintarla verde
 * con una flecha para arriba le diría al entrenador que el equipo mejoró
 * cuando el dato no alcanza para afirmarlo.
 *
 * La flecha es la señal, no el color: quien no distinga los tonos igual ve
 * para qué lado se movió.
 *
 * Vive acá y no en hoy.js porque el panorama de coordinación la usa igual:
 * una sola forma de decir "no alcanza para afirmarlo" en toda la app.
 */
export function variacionHtml(variacion) {
  if (variacion == null) return '';
  const signo = variacion.pp > 0 ? '+' : '';
  const texto = `${signo}${variacion.pp}`;
  if (!variacion.concluyente) {
    return `<span class="var neutra" title="La diferencia no supera el margen de error">${texto} pp · sin diferencia clara</span>`;
  }
  const flecha = variacion.pp > 0 ? '▲' : '▼';
  return `<span class="var ${variacion.pp > 0 ? 'sube' : 'baja'}">${flecha} ${texto} pp</span>`;
}
```

En `hoy.js`: borrar `variacionHtml` y su comentario (líneas 40–58) y sumar `import { variacionHtml } from '../componentes/variacion.js';`.

- [ ] **Step 2: `src/data/repositorio.js`**

En `obtenerPlantelesDelClub`, `select('id, categoria, categoria_codigo, codigo_cabb, temporada_id')` y en el `map` sumar `categoriaCodigo: fila.categoria_codigo,`. Actualizar su comentario: *"Un entrenador ve sus planteles asignados; un coordinador, todos los de su club (0017). El modo entrenar filtra a lo asignado: ver main.js."*

Al final del archivo:

```js
/* ---------- Coordinación (0017) ---------- */

/**
 * Los roles propios en el club. La policy miembro_club_propio deja leer la
 * fila propia; un coordinador además ve las de todo el club, por eso el filtro
 * por user_id no es opcional.
 */
export async function obtenerMisRoles(clubId) {
  const supabase = obtenerCliente();
  const userId = await obtenerUsuarioActual();
  const { data, error } = await supabase
    .from('miembro_club')
    .select('es_entrenador, es_coordinador')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return { esEntrenador: data?.es_entrenador === true, esCoordinador: data?.es_coordinador === true };
}

/** Los planteles con asignación VIGENTE propia. Es lo que muestran los chips en modo entrenar. */
export async function obtenerMisPlantelesAsignados(clubId) {
  const supabase = obtenerCliente();
  const userId = await obtenerUsuarioActual();
  const { data, error } = await supabase
    .from('asignacion_plantel')
    .select('plantel_id')
    .eq('miembro_club_club_id', clubId)
    .eq('miembro_club_user_id', userId)
    .is('hasta', null);
  if (error) throw error;
  return new Set(data.map((f) => f.plantel_id));
}

export async function obtenerCatalogoDeCategorias() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.from('categoria').select('codigo, nombre, orden');
  if (error) throw error;
  return data;
}

export async function obtenerTemporadasDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.from('temporada').select('id, nombre').eq('club_id', clubId);
  if (error) throw error;
  return data;
}

/** Cuentas con mail confirmado y sin club. Sólo coordinación (la función rechaza al resto). */
export async function obtenerUsuariosPendientes() {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('usuarios_pendientes');
  if (error) throw error;
  return data.map((f) => ({ userId: f.user_id, email: f.email, registradoEn: f.registrado_en }));
}

export async function obtenerMiembrosDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('miembros_del_club', { p_club_id: clubId });
  if (error) throw error;
  return data.map((f) => ({
    userId: f.user_id,
    email: f.email,
    nombre: f.nombre,
    esEntrenador: f.es_entrenador,
    esCoordinador: f.es_coordinador,
    habilitadoEn: f.habilitado_en,
  }));
}

/** Asignaciones vigentes del club. Las cerradas quedan en la base; el panel no las lista. */
export async function obtenerAsignacionesDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('asignacion_plantel')
    .select('id, miembro_club_user_id, plantel_id, desde, hasta, origen')
    .eq('miembro_club_club_id', clubId)
    .is('hasta', null);
  if (error) throw error;
  return data.map((f) => ({
    id: f.id, userId: f.miembro_club_user_id, plantelId: f.plantel_id,
    desde: f.desde, hasta: f.hasta, origen: f.origen,
  }));
}

/**
 * Conteos y sumas por plantel, nunca filas de jugador (panorama_del_club,
 * 0017). La forma ya viene en camelCase desde la base.
 */
export async function obtenerPanoramaDelClub(clubId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('panorama_del_club', { p_club_id: clubId });
  if (error) throw error;
  return data;
}

/** Habilitar (si hace falta) y asignar varias categorías: una sola transacción. */
export async function asignarPlanteles({ userId, clubId, plantelIds }) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase.rpc('asignar_planteles', {
    p_user_id: userId, p_club_id: clubId, p_plantel_ids: plantelIds,
  });
  if (error) throw error;
  return data;
}

/**
 * Cierra una asignación. La fecha que se manda es irrelevante: el trigger de
 * 0017 la reemplaza por la del servidor y pone quién la cerró. Se pide la fila
 * de vuelta porque un update que la RLS no deja pasar no da error, afecta
 * cero filas — y eso no puede verse como éxito.
 */
export async function cerrarAsignacion(asignacionId) {
  const supabase = obtenerCliente();
  const { data, error } = await supabase
    .from('asignacion_plantel')
    .update({ hasta: new Date().toISOString() })
    .eq('id', asignacionId)
    .select('id');
  if (error) throw error;
  if (!data.length) throw new Error('NO_SE_PUDO_CERRAR');
}
```

- [ ] **Step 3: `src/ui/sesion.js`**

```js
let roles = { esEntrenador: false, esCoordinador: false };
let modo = 'entrenar';

/**
 * Quien entrena arranca entrenando aunque también coordine: es el uso de
 * todos los días. Quien sólo coordina no tiene otro modo.
 */
export function setRoles(nuevos) {
  roles = { esEntrenador: nuevos.esEntrenador === true, esCoordinador: nuevos.esCoordinador === true };
  modo = roles.esEntrenador ? 'entrenar' : 'coordinar';
}

export function obtenerRoles() {
  return roles;
}

export function obtenerModo() {
  return modo;
}

/** Ignora un modo que el rol no permite: la UI no puede quedar en un estado sin salida. */
export function setModo(nuevo) {
  if (nuevo === 'coordinar' && roles.esCoordinador) modo = 'coordinar';
  if (nuevo === 'entrenar' && roles.esEntrenador) modo = 'entrenar';
}
```

y en `limpiarSesion()` sumar `roles = { esEntrenador: false, esCoordinador: false }; modo = 'entrenar';`.

- [ ] **Step 4: `src/ui/chrome.js`**

Import: sumar `obtenerModo, obtenerRoles` desde `./sesion.js`.

Después de `TABS`:

```js
// Coordinación: dos pestañas y ningún chip de categoría. No hay "categoría
// activa" porque el coordinador no entra a ninguna.
export const TABS_COORDINACION = [
  { id: 'p-coord-panorama', texto: 'Panorama', icono: ICONOS.datos },
  { id: 'p-coord-profes', texto: 'Profes', icono: ICONOS.plantel },
];

export function pantallaInicialDelModo() {
  return obtenerModo() === 'coordinar' ? TABS_COORDINACION[0].id : TABS[1].id;
}
```

`let alCambiarModo = () => {};` y en `iniciarChrome({ onTab, onPlantel, onVolver, onSalir, onModo })` sumar `alCambiarModo = onModo ?? (() => {});`.

En `renderChrome`, la cabecera:

```js
  const roles = obtenerRoles();
  const coordinando = obtenerModo() === 'coordinar';
  // Sólo quien tiene los dos roles cambia de modo. Vive en el chrome, junto a
  // Salir, por la misma invariante que el botón de volver.
  const botonModo = roles.esEntrenador && roles.esCoordinador
    ? `<button class="salir modo" id="btn-modo">${coordinando ? 'Entrenar' : 'Coordinar'}</button>`
    : '';
  cabecera.innerHTML = `
    ${izquierda}
    <div>
      <h1>${escaparHtml(titulo ?? '')}</h1>
      <div class="sub">${escaparHtml(club?.nombre ?? '')}</div>
    </div>
    ${botonModo}
    <button class="salir" id="btn-salir">Salir</button>
  `;
  $('btn-atras')?.addEventListener('click', () => alVolver());
  $('btn-modo')?.addEventListener('click', () => alCambiarModo());
  $('btn-salir').addEventListener('click', () => alSalir());
```

Los chips: si `coordinando`, `cats.innerHTML = ''` (`.cats:empty` ya se oculta, `layout.css:63`) y no se registran listeners; si no, lo de hoy.

La navegación: `const tabs = coordinando ? TABS_COORDINACION : TABS;` y `nav.innerHTML = tabs.map(...)`.

- [ ] **Step 5: `public/css/layout.css`** (después de `.cabecera .salir{...}`)

```css
/* Con los dos roles hay un segundo botón de texto. Los dos llevan
   margin-left:auto: sin esto el espacio libre se reparte entre ellos y
   quedan separados por medio encabezado. */
.cabecera .modo{margin-right:0}
.cabecera .modo + .salir{margin-left:0}
```

- [ ] **Step 6: `src/ui/main.js`**

Imports: sumar `obtenerMisRoles, obtenerMisPlantelesAsignados` de repositorio; `setRoles, obtenerModo, setModo` de sesion; `pantallaInicialDelModo` de chrome.

En `volver()`: `const destino = pila.pop() ?? pantallaInicialDelModo();`

`entrarConSesion`, desde `setClubActual(clubes[0]);`:

```js
  setClubActual(clubes[0]);

  try {
    setRoles(await obtenerMisRoles(clubes[0].id));
  } catch {
    toast('No se pudo cargar tu acceso. Revisá tu conexión.');
    volverALaLanding();
    return;
  }

  // Los chips del modo entrenar son SÓLO las categorías asignadas vigentes.
  // Con RLS alcanzaba para un entrenador puro, pero quien además coordina ve
  // todos los planteles del club (policy plantel_coordinador_ver): sin este
  // filtro tendría chips de categorías cuyas pantallas le quedan vacías.
  let planteles = [];
  if (obtenerModo() === 'entrenar') {
    try {
      const [todos, asignados] = await Promise.all([
        obtenerPlantelesDelClub(clubes[0].id),
        obtenerMisPlantelesAsignados(clubes[0].id),
      ]);
      planteles = todos.filter((p) => asignados.has(p.id));
    } catch {
      toast('No se pudieron cargar las categorías. Revisá tu conexión.');
    }
  }
  setPlanteles(planteles);

  mostrarApp();
  await ir(pantallaInicialDelModo());
}
```

Actualizar el comentario de "Landing en PLANTEL" a: *"Entrenando arranca en PLANTEL, donde empieza el flujo de quien arranca de cero; coordinando, en el Panorama."*

Hay un caso nuevo: quien tiene los dos roles y cambia a Entrenar por primera vez no tiene planteles cargados si entró coordinando — no pasa, porque con los dos roles siempre arranca entrenando. Igual `onModo` recarga para no depender de eso:

```js
  iniciarChrome({
    onTab: (id) => ir(id),
    onPlantel: () => refrescar(),
    onVolver: () => volver(),
    onSalir: () => salir(),
    onModo: () => {
      setModo(obtenerModo() === 'coordinar' ? 'entrenar' : 'coordinar');
      ir(pantallaInicialDelModo());
    },
  });
```

- [ ] **Step 7: `src/ui/pantallas/plantel.js`**

Import: sumar `obtenerPlanteles` desde `../sesion.js`. En `renderPlantel`:

```js
  if (!club || !plantel) {
    // Sin ninguna categoría no es "no elegiste": es que todavía no le
    // asignaron. Decírselo evita que piense que la app está rota.
    const mensaje = obtenerPlanteles().length === 0
      ? 'Todavía no tenés categorías asignadas. Pedíselas al coordinador del club.'
      : 'No hay una categoría seleccionada.';
    contenedor().innerHTML = `<div class="pad"><div class="p">${mensaje}</div></div>`;
    return;
  }
```

- [ ] **Step 8: `public/index.html`**

En `v-sin-club`, reemplazar los dos `<div class="d">`:

```html
      <div class="d">
        La cuenta se creó bien y podés entrar con ella. Lo que todavía no tenés es
        acceso a los datos del club: eso lo habilita el coordinador de tu club.
      </div>
      <div class="d">Pasale este mail al coordinador para que te habilite:</div>
```

Dentro de `<main class="cuerpo">`, después de `p-medir-velocidad`:

```html
    <!-- Coordinación: panorama agregado y profes. Nunca datos individuales. -->
    <section class="pant" id="p-coord-panorama"><div id="coord-panorama-contenido"></div></section>
    <section class="pant" id="p-coord-profes"><div id="coord-profes-contenido"></div></section>
```

- [ ] **Step 9: Correr**

Run: `npm test`
Expected: PASS completo (en particular `importsResueltos.test.js`: `variacionHtml` desde `componentes/variacion.js`).

- [ ] **Step 10: Commit**

```bash
git add src/data/repositorio.js src/ui/sesion.js src/ui/chrome.js src/ui/main.js src/ui/componentes/variacion.js src/ui/pantallas/hoy.js src/ui/pantallas/plantel.js public/index.html public/css/layout.css
git commit -m "feat(ui): roles y modo coordinación en el chrome; chips sólo de lo asignado"
```

---

### Tarea 7: Pantalla Panorama

**Riesgo medio** (presentación de datos: reglas del proyecto).

**Files:**
- Create: `src/ui/pantallas/coordPanorama.js`
- Modify: `src/ui/pantallas/registro.js`
- Modify: `public/css/componentes.css`, `public/css/layout.css`

**Interfaces:**
- Consumes: `armarPanorama` (Tarea 5); repositorio (Tarea 6); `grafico` con `{min, max}` (Tarea 4); `variacionHtml` (Tarea 6); `textoPorcentaje`, `formatearFechaCorta`, `escaparHtml`, `esErrorDeRed` (nav.js).
- Produces: `renderPanorama()`.

- [ ] **Step 1: `src/ui/pantallas/coordPanorama.js`**

```js
import {
  obtenerPlantelesDelClub, obtenerCatalogoDeCategorias, obtenerTemporadasDelClub,
  obtenerPanoramaDelClub, obtenerMiembrosDelClub, obtenerAsignacionesDelClub,
} from '../../data/repositorio.js';
import { armarPanorama } from '../../data/coordinacion.js';
import { obtenerClubActual } from '../sesion.js';
import { escaparHtml, esErrorDeRed, textoPorcentaje, formatearFechaCorta } from '../nav.js';
import { grafico } from '../componentes/graficos.js';
import { variacionHtml } from '../componentes/variacion.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('coord-panorama-contenido');

/**
 * El panorama del club para coordinación: una tarjeta por categoría, cada una
 * contra sí misma a lo largo de la temporada.
 *
 * Lo que esta pantalla NO hace, a propósito: ordenar por ningún valor, poner
 * una categoría contra otra, promediar el club, etiquetar ("mejor", "rinde",
 * "atención") ni pintar una categoría distinta de otra. Comparar U13 con U17
 * compara edades, no trabajo; y un ranking de categorías es un ranking de
 * entrenadores. Se muestran las series; la lectura la hace la persona.
 *
 * Todas las tarjetas usan el eje 0–100: con la escala automática una categoría
 * que se movió 3 puntos se vería igual de dramática que una que se movió 20.
 */

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function operativosHtml(t) {
  const medicion = t.ultimaMedicion ? `última medición ${formatearFechaCorta(t.ultimaMedicion)}` : 'sin mediciones';
  return `<div class="det">${plural(t.jugadores, 'jugador', 'jugadores')} · ${plural(t.partidos, 'partido importado', 'partidos importados')} · ${medicion}</div>`;
}

function aCargoHtml(t) {
  return t.aCargo.length
    ? `<div class="det">A cargo: ${escaparHtml(t.aCargo.join(', '))}</div>`
    : '<span class="chip sin">Sin profe asignado</span>';
}

function serieHtml(t) {
  if (!t.serie.length) {
    return `<div class="p">Todavía no hay baterías de tiro en ${escaparHtml(t.categoria)}.</div>`;
  }
  const anterior = t.serie.length >= 2 ? t.serie[t.serie.length - 2] : null;
  return `
    <div class="k">Tiro del arco · batería por batería</div>
    <div class="sub">
      ${anterior
        ? `${variacionHtml(t.variacion)} <span class="det">última contra la del ${escaparHtml(formatearFechaCorta(anterior.fecha))}</span>`
        : '<span class="var neutra">Una sola batería: todavía no hay con qué comparar</span>'}
    </div>
    <svg class="g" id="svg-panorama-${t.plantelId}"></svg>
    <div class="tabla-ev">
      ${[...t.serie].reverse().map((p) => `
        <div class="fila-ev tres">
          <div class="f">${escaparHtml(formatearFechaCorta(p.fecha))}</div>
          <div>${textoPorcentaje(p.valor)}</div>
          <div class="f">${plural(p.jugadoresQueMidieron, 'jugador', 'jugadores')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function tarjetaHtml(t) {
  return `
    <article class="tarjeta-cat">
      <h2 class="nom">${escaparHtml(t.categoria)} <span class="det">${escaparHtml(t.nombreCategoria)}</span></h2>
      ${operativosHtml(t)}
      ${aCargoHtml(t)}
      ${serieHtml(t)}
    </article>
  `;
}

export async function renderPanorama() {
  const club = obtenerClubActual();
  if (!club) return;
  contenedor().innerHTML = '<div class="pad"><div class="p">Cargando el panorama...</div></div>';

  let vista;
  try {
    const [planteles, catalogo, temporadas, panorama, miembros, asignaciones] = await Promise.all([
      obtenerPlantelesDelClub(club.id),
      obtenerCatalogoDeCategorias(),
      obtenerTemporadasDelClub(club.id),
      obtenerPanoramaDelClub(club.id),
      obtenerMiembrosDelClub(club.id),
      obtenerAsignacionesDelClub(club.id),
    ]);
    vista = armarPanorama({ planteles, catalogo, temporadas, panorama, miembros, asignaciones });
  } catch (e) {
    const mensaje = esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar el panorama.';
    contenedor().innerHTML = `<div class="pad"><div class="p">${mensaje}</div></div>`;
    return;
  }

  if (!vista.tarjetas.length) {
    contenedor().innerHTML = '<div class="pad"><div class="p">Todavía no hay categorías cargadas para este club.</div></div>';
    return;
  }

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Temporada ${escaparHtml(vista.temporada.nombre)}</div>
      <div class="p">Cada categoría contra sí misma a lo largo de la temporada. No se comparan entre sí: son chicos distintos en momentos distintos.</div>
      <div class="panorama">${vista.tarjetas.map(tarjetaHtml).join('')}</div>
    </div>
  `;

  for (const t of vista.tarjetas) {
    if (!t.serie.length) continue;
    grafico($(`svg-panorama-${t.plantelId}`), {
      etiquetas: t.serie.map((p) => formatearFechaCorta(p.fecha)),
      series: [{
        nombre: t.categoria,
        c: '#D9122E',
        d: t.serie.map((p) => p.valor.pct),
        chico: t.serie.map((p) => p.valor.muestraChica),
      }],
    }, { alto: 140, min: 0, max: 100 });
  }
}
```

- [ ] **Step 2: Registrar** — `src/ui/pantallas/registro.js`

```js
import { renderPanorama } from './coordPanorama.js';
```

```js
  registrarPantalla('p-coord-panorama', { titulo: 'Panorama', render: renderPanorama });
```

- [ ] **Step 3: CSS**

`public/css/componentes.css`, al final:

```css
/* ---- coordinación ---- */
.panorama{display:grid;gap:var(--sp-4)}
.tarjeta-cat{background:var(--blanco);border-radius:var(--r);box-shadow:var(--sombra);padding:var(--sp-4);min-width:0}
.tarjeta-cat .nom{font-family:var(--ff-titulo);font-size:var(--fs-190);font-weight:600;margin-bottom:var(--sp-1)}
.tarjeta-cat .det{font-size:var(--fs-115);color:var(--gris);margin-top:.125rem}
.tarjeta-cat .nom .det{font-family:inherit;font-weight:500;margin-left:var(--sp-2)}
.tarjeta-cat .k{font-family:var(--ff-titulo);font-size:var(--fs-125);letter-spacing:.06em;text-transform:uppercase;color:var(--gris-cl);margin-top:var(--sp-3)}
.tarjeta-cat .sub{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px}
.tarjeta-cat .chip.sin{display:inline-block;margin-top:var(--sp-2)}
.fila-ev.tres{grid-template-columns:auto 1fr auto}
```

`public/css/layout.css`, dentro de `@media (min-width:40rem){ ... }` (el primero, línea 162):

```css
  /* Las categorías una al lado de la otra. Todas iguales en tamaño y en orden
     de catálogo: la grilla no sugiere que una importe más. */
  .panorama{grid-template-columns:repeat(auto-fill,minmax(18rem,1fr))}
```

- [ ] **Step 4: Correr**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/pantallas/coordPanorama.js src/ui/pantallas/registro.js public/css/componentes.css public/css/layout.css
git commit -m "feat(ui): panorama de coordinación, cada categoría contra sí misma"
```

---

### Tarea 8: Pantalla Profes

**Riesgo medio.**

**Files:**
- Create: `src/ui/pantallas/coordProfes.js`
- Modify: `src/ui/pantallas/registro.js`
- Modify: `public/css/componentes.css`

**Interfaces:**
- Consumes: `armarProfes` (Tarea 5); repositorio y `obtenerUsuarioActual` (Tarea 6); `abrirHoja`, `cerrarHoja`; `toast`, `escaparHtml`, `esErrorDeRed`, `formatearFechaCorta`.
- Produces: `renderProfes()`.

- [ ] **Step 1: `src/ui/pantallas/coordProfes.js`**

```js
import {
  obtenerPlantelesDelClub, obtenerCatalogoDeCategorias, obtenerTemporadasDelClub,
  obtenerMiembrosDelClub, obtenerAsignacionesDelClub, obtenerUsuariosPendientes,
  obtenerUsuarioActual, asignarPlanteles, cerrarAsignacion,
} from '../../data/repositorio.js';
import { armarProfes } from '../../data/coordinacion.js';
import { obtenerClubActual } from '../sesion.js';
import { escaparHtml, esErrorDeRed, toast, formatearFechaCorta } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('coord-profes-contenido');

/**
 * Quién tiene acceso a qué, y el único lugar desde donde se cambia.
 *
 * Todo lo que se ve acá lo garantiza la base, no esta pantalla: un entrenador
 * que llegara hasta acá no podría leer pendientes ni asignar nada (0017).
 * La pantalla sólo evita ofrecer lo que la base va a rechazar — por ejemplo,
 * que el coordinador se asigne a sí mismo.
 */

let vista = null;

function mensajeDeError(e) {
  if (esErrorDeRed(e)) return 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';
  const texto = e?.message ?? '';
  if (/SIN_CATEGORIAS/.test(texto)) return 'Marcá al menos una categoría.';
  if (/NO_ES_ENTRENADOR/.test(texto)) return 'Esa cuenta es de coordinación. Para que además entrene, hay que dárselo desde la base.';
  if (/NO_SE_PUDO_CERRAR|row-level security|permission denied|42501/i.test(texto)) return 'No tenés permiso para hacer eso.';
  return 'No se pudo guardar. Probá de nuevo.';
}

/* ---------- bloques ---------- */

function pendientesHtml(pendientes) {
  if (!pendientes.length) return '<div class="p">No hay cuentas esperando acceso.</div>';
  return pendientes.map((u) => `
    <div class="jug-fila">
      <div style="flex:1;min-width:0">
        <div class="nom">${escaparHtml(u.email)}</div>
        <div class="det">Se registró el ${escaparHtml(formatearFechaCorta(u.registradoEn.slice(0, 10)))}</div>
      </div>
      <button class="btn chico" data-habilitar="${u.userId}">Habilitar</button>
    </div>
  `).join('');
}

function sinProfeHtml(sinProfe) {
  if (!sinProfe.length) return '<div class="p">Todas las categorías de la temporada tienen al menos un profe.</div>';
  return sinProfe.map((p) => `
    <div class="jug-fila">
      <div class="nom">${escaparHtml(p.categoria)}</div>
      <button class="btn sec chico" data-asignar-plantel="${p.id}">Asignar</button>
    </div>
  `).join('');
}

function profeHtml(p) {
  const roles = [p.esEntrenador && 'Entrenador', p.esCoordinador && 'Coordinación'].filter(Boolean).join(' · ');
  // El propio coordinador no se edita desde acá (la base lo rechaza), y a un
  // coordinador puro no se le asignan categorías (NO_ES_ENTRENADOR).
  const editable = p.esEntrenador && !p.esUnoMismo;
  const categorias = p.categorias.map((c) => `
    <div class="profe-cat">
      <div style="flex:1;min-width:0">
        <span class="nom">${escaparHtml(c.etiqueta)}</span>
        ${c.origen === 'migracion' ? '<div class="det">Asignada al activar el panel — confirmá que corresponde</div>' : ''}
      </div>
      ${editable ? `<button class="btn sec chico" data-quitar="${c.asignacionId}" data-profe="${p.userId}">Quitar</button>` : ''}
    </div>
  `).join('');
  return `
    <div class="profe">
      <div class="nom">${escaparHtml(p.etiqueta)}${p.esUnoMismo ? ' <span class="det">(vos)</span>' : ''}</div>
      <div class="det">${roles}${p.etiqueta !== p.email ? ` · ${escaparHtml(p.email)}` : ''}</div>
      ${categorias || (p.esEntrenador ? '<span class="chip sin">Sin categorías</span>' : '')}
      ${editable ? `<button class="btn sec chico" data-asignar-a="${p.userId}">Asignar categorías</button>` : ''}
    </div>
  `;
}

/* ---------- hojas ---------- */

function abrirElegirCategorias({ titulo, texto, planteles, textoBoton, alConfirmar }) {
  if (!planteles.length) {
    toast('No quedan categorías de esta temporada para asignar.');
    return;
  }
  abrirHoja({
    titulo,
    cuerpo: `
      <div class="p">${texto}</div>
      <div id="casillas">
        ${planteles.map((p) => `
          <button class="jug-fila casilla" data-plantel="${p.id}" aria-pressed="false">
            <span class="nom">${escaparHtml(p.categoria)}</span>
            <span class="chk"></span>
          </button>
        `).join('')}
      </div>
      <div class="acciones">
        <button class="btn" id="btn-confirmar-asignacion" disabled>${escaparHtml(textoBoton)}</button>
        <button class="btn sec" id="btn-cancelar-asignacion">Cancelar</button>
      </div>
    `,
  });

  const elegidos = new Set();
  document.querySelectorAll('#casillas [data-plantel]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const id = boton.dataset.plantel;
      if (elegidos.has(id)) elegidos.delete(id); else elegidos.add(id);
      const marcado = elegidos.has(id);
      boton.setAttribute('aria-pressed', String(marcado));
      const chk = boton.querySelector('.chk');
      chk.classList.toggle('on', marcado);
      chk.textContent = marcado ? '✓' : '';
      $('btn-confirmar-asignacion').disabled = elegidos.size === 0;
    });
  });
  $('btn-cancelar-asignacion').addEventListener('click', () => cerrarHoja());
  $('btn-confirmar-asignacion').addEventListener('click', async () => {
    const boton = $('btn-confirmar-asignacion');
    if (boton.disabled) return;
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    try {
      await alConfirmar([...elegidos]);
      cerrarHoja();
      await renderProfes();
    } catch (e) {
      toast(mensajeDeError(e));
      boton.disabled = false;
      boton.textContent = textoBoton;
    }
  });
}

function abrirHabilitar(pendiente) {
  const club = obtenerClubActual();
  abrirElegirCategorias({
    titulo: 'Habilitar',
    texto: `${escaparHtml(pendiente.email)} va a poder entrar como entrenador y ver sólo las categorías que marques. La biblioteca de ejercicios la ve entera.`,
    planteles: vista.plantelesDeLaTemporada,
    textoBoton: 'Habilitar y asignar',
    alConfirmar: async (plantelIds) => {
      const r = await asignarPlanteles({ userId: pendiente.userId, clubId: club.id, plantelIds });
      toast(`Listo: ${pendiente.email} ya puede entrar, con ${r.asignadas} categoría${r.asignadas === 1 ? '' : 's'}.`);
    },
  });
}

function abrirAsignarA(profe) {
  const club = obtenerClubActual();
  const yaTiene = new Set(profe.categorias.map((c) => c.plantelId));
  abrirElegirCategorias({
    titulo: `Asignar a ${profe.etiqueta}`,
    texto: 'Marcá las categorías que suma. Las que ya tiene no aparecen.',
    planteles: vista.plantelesDeLaTemporada.filter((p) => !yaTiene.has(p.id)),
    textoBoton: 'Asignar',
    alConfirmar: async (plantelIds) => {
      await asignarPlanteles({ userId: profe.userId, clubId: club.id, plantelIds });
      toast('Listo.');
    },
  });
}

function abrirElegirProfe(plantel) {
  const club = obtenerClubActual();
  const candidatos = vista.profes.filter((p) => p.esEntrenador && !p.esUnoMismo);
  if (!candidatos.length) {
    toast('Todavía no hay entrenadores habilitados. Habilitá a alguien desde Pendientes.');
    return;
  }
  abrirHoja({
    titulo: `Asignar ${plantel.categoria}`,
    cuerpo: `
      <div class="p">¿Quién queda a cargo de ${escaparHtml(plantel.categoria)}?</div>
      <div id="candidatos">
        ${candidatos.map((p) => `
          <button class="jug-fila casilla" data-candidato="${p.userId}"><span class="nom">${escaparHtml(p.etiqueta)}</span></button>
        `).join('')}
      </div>
      <div class="acciones"><button class="btn sec" id="btn-cancelar-asignacion">Cancelar</button></div>
    `,
  });
  $('btn-cancelar-asignacion').addEventListener('click', () => cerrarHoja());
  const botones = document.querySelectorAll('#candidatos [data-candidato]');
  botones.forEach((boton) => {
    boton.addEventListener('click', async () => {
      if (boton.disabled) return;
      botones.forEach((b) => { b.disabled = true; });
      try {
        await asignarPlanteles({ userId: boton.dataset.candidato, clubId: club.id, plantelIds: [plantel.id] });
        cerrarHoja();
        toast('Listo.');
        await renderProfes();
      } catch (e) {
        toast(mensajeDeError(e));
        botones.forEach((b) => { b.disabled = false; });
      }
    });
  });
}

/**
 * Quitar lleva confirmación y habilitar no: cortarle el acceso a alguien en
 * medio de su trabajo es lo que duele si fue un dedazo.
 */
function abrirQuitar(profe, categoria) {
  abrirHoja({
    titulo: `Quitar ${categoria.etiqueta}`,
    cuerpo: `
      <div class="p">${escaparHtml(profe.etiqueta)} deja de ver ${escaparHtml(categoria.etiqueta)} desde ahora.</div>
      <div class="p">Lo que cargó queda en el club, y la asignación queda registrada con su fecha de cierre.</div>
      <div class="acciones">
        <button class="btn" id="btn-confirmar-quitar">Quitar ${escaparHtml(categoria.etiqueta)}</button>
        <button class="btn sec" id="btn-cancelar-quitar">Cancelar</button>
      </div>
    `,
  });
  $('btn-cancelar-quitar').addEventListener('click', () => cerrarHoja());
  $('btn-confirmar-quitar').addEventListener('click', async () => {
    const boton = $('btn-confirmar-quitar');
    if (boton.disabled) return;
    boton.disabled = true;
    try {
      await cerrarAsignacion(categoria.asignacionId);
      cerrarHoja();
      toast(`Listo: ${profe.etiqueta} ya no ve ${categoria.etiqueta}.`);
      await renderProfes();
    } catch (e) {
      toast(mensajeDeError(e));
      boton.disabled = false;
    }
  });
}

/* ---------- pantalla ---------- */

export async function renderProfes() {
  const club = obtenerClubActual();
  if (!club) return;
  contenedor().innerHTML = '<div class="pad"><div class="p">Cargando...</div></div>';

  try {
    const [planteles, catalogo, temporadas, miembros, asignaciones, pendientes, usuarioActualId] = await Promise.all([
      obtenerPlantelesDelClub(club.id),
      obtenerCatalogoDeCategorias(),
      obtenerTemporadasDelClub(club.id),
      obtenerMiembrosDelClub(club.id),
      obtenerAsignacionesDelClub(club.id),
      obtenerUsuariosPendientes(),
      obtenerUsuarioActual(),
    ]);
    vista = armarProfes({ planteles, catalogo, temporadas, miembros, asignaciones, pendientes, usuarioActualId });
  } catch (e) {
    const mensaje = esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar la lista de profes.';
    contenedor().innerHTML = `<div class="pad"><div class="p">${mensaje}</div></div>`;
    return;
  }

  contenedor().innerHTML = `
    <div class="pad">
      <div class="eyebrow">Esperando acceso <span class="der">${vista.pendientes.length}</span></div>
      ${pendientesHtml(vista.pendientes)}

      <div class="eyebrow">Categorías sin profe</div>
      ${sinProfeHtml(vista.sinProfe)}

      <div class="eyebrow">Profes del club</div>
      <div class="lista-2col">${vista.profes.map(profeHtml).join('')}</div>
    </div>
  `;

  contenedor().querySelectorAll('[data-habilitar]').forEach((b) => b.addEventListener('click', () => {
    abrirHabilitar(vista.pendientes.find((u) => u.userId === b.dataset.habilitar));
  }));
  contenedor().querySelectorAll('[data-asignar-plantel]').forEach((b) => b.addEventListener('click', () => {
    abrirElegirProfe(vista.sinProfe.find((p) => p.id === b.dataset.asignarPlantel));
  }));
  contenedor().querySelectorAll('[data-asignar-a]').forEach((b) => b.addEventListener('click', () => {
    abrirAsignarA(vista.profes.find((p) => p.userId === b.dataset.asignarA));
  }));
  contenedor().querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => {
    const profe = vista.profes.find((p) => p.userId === b.dataset.profe);
    abrirQuitar(profe, profe.categorias.find((c) => c.asignacionId === b.dataset.quitar));
  }));
}
```

- [ ] **Step 2: Registrar** — `src/ui/pantallas/registro.js`

```js
import { renderProfes } from './coordProfes.js';
```

```js
  registrarPantalla('p-coord-profes', { titulo: 'Profes', render: renderProfes });
```

- [ ] **Step 3: CSS** — `public/css/componentes.css`, al final del bloque de coordinación

```css
.profe{background:var(--blanco);border-radius:var(--r);box-shadow:var(--sombra);padding:var(--sp-3);margin-bottom:var(--sp-2);display:flex;flex-direction:column;gap:var(--sp-2);min-width:0}
.profe .nom{font-weight:600;font-size:var(--fs-145)}
.profe .det{font-size:var(--fs-115);color:var(--gris)}
.profe-cat{display:flex;align-items:center;gap:var(--sp-3);border-top:1px solid var(--linea);padding-top:var(--sp-2)}
.profe .btn.chico{align-self:flex-start}
.casilla{width:100%;text-align:left;cursor:pointer}
```

- [ ] **Step 4: Correr**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/pantallas/coordProfes.js src/ui/pantallas/registro.js public/css/componentes.css
git commit -m "feat(ui): profes — habilitar, asignar y quitar categorías"
```

---

### Tarea 9: Guarda de arquitectura

**Riesgo bajo.**

**Files:**
- Create: `tests/coordinacionSinDatosIndividuales.test.js`
- Modify: `package.json`

- [ ] **Step 1: El test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * La base es la que impide que el coordinador lea datos individuales (0018).
 * Este test es la segunda línea: que la UI de coordinación ni siquiera los
 * pida. Si alguien suma "ver el plantel" al panorama, que se entere acá y no
 * cuando la pantalla aparezca vacía en producción.
 */
const ARCHIVOS = [
  'src/ui/pantallas/coordPanorama.js',
  'src/ui/pantallas/coordProfes.js',
  'src/data/coordinacion.js',
];

const LECTURAS_INDIVIDUALES = [
  'obtenerJugadoresDelClub', 'obtenerJugadoresDelPlantel', 'obtenerPartidosDelPlantel',
  'obtenerPertenenciasDeJugador', 'obtenerSesionesDeMedicion', 'obtenerMedicionesTiroDelPlantel',
  'obtenerMedicionesVelocidadDelPlantel', 'obtenerEstadisticasDelPlantel', 'obtenerEnviosDeJugador',
  'obtenerMedicionesCorporalesDeJugador', 'obtenerMedicionesCorporalesDelClub', 'obtenerMetasDelPlantel',
  'obtenerEjercicios', 'obtenerRecursos',
];

test('las pantallas de coordinación no piden datos individuales', () => {
  const ofensas = [];
  for (const archivo of ARCHIVOS) {
    const src = readFileSync(archivo, 'utf8');
    for (const nombre of LECTURAS_INDIVIDUALES) {
      if (new RegExp(`\\b${nombre}\\b`).test(src)) ofensas.push(`${archivo} usa ${nombre}`);
    }
    if (/\.from\(|\.rpc\(/.test(src)) ofensas.push(`${archivo} habla con la base directo`);
  }
  assert.deepEqual(ofensas, []);
});

test('el panorama no usa palabras de ranking ni de juicio', () => {
  const src = readFileSync('src/ui/pantallas/coordPanorama.js', 'utf8')
    .replace(/\/\*\*[\s\S]*?\*\//g, '')   // los comentarios explican lo que NO se hace
    .replace(/\/\/.*$/gm, '');
  const palabras = src.match(/\b(mejor|peor|ranking|rinde|atenci[oó]n|promedio del club|destacad[ao])\b/gi) ?? [];
  assert.deepEqual(palabras, []);
});
```

Sumar `tests/coordinacionSinDatosIndividuales.test.js` al script `test` de `package.json`.

- [ ] **Step 2: Correr**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/coordinacionSinDatosIndividuales.test.js package.json
git commit -m "test: la UI de coordinación no pide datos individuales ni rankea"
```

---

### Tarea 10: Verificación con sesión real (Node)

**Riesgo bajo** (sólo lecturas).

**Files:**
- Create: `tests/verificarAccesoPorCategoria.js`

- [ ] **Step 1: El script**

```js
import { createClient } from '@supabase/supabase-js';

/**
 * Verificación con una sesión REAL, no impersonada: el mismo cliente que usa
 * la app, contra la base de verdad.
 *
 * SÓLO LECTURAS, a propósito. Una escritura que debería fallar, si por un error
 * de policy no falla, queda escrita en producción. Las escrituras prohibidas se
 * prueban en tests/verificarCoordinacion.sql, que se deshace entero.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... \
 *   VERIFICAR_EMAIL=<entrenador> VERIFICAR_PASSWORD=... \
 *   [VERIFICAR_COORD_EMAIL=<coordinador> VERIFICAR_COORD_PASSWORD=...] \
 *   node tests/verificarAccesoPorCategoria.js
 */

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const entrenador = { email: process.env.VERIFICAR_EMAIL, password: process.env.VERIFICAR_PASSWORD };
const coordinador = { email: process.env.VERIFICAR_COORD_EMAIL, password: process.env.VERIFICAR_COORD_PASSWORD };

if (!url || !key || !entrenador.email || !entrenador.password) {
  console.error('Faltan SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, VERIFICAR_EMAIL o VERIFICAR_PASSWORD.');
  process.exit(1);
}

let fallas = 0;
const ok = (m) => console.log('OK   ', m);
const falla = (m) => { fallas += 1; console.error('FALLA', m); };

async function sesion({ email, password }) {
  const cliente = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await cliente.auth.signInWithPassword({ email, password });
  if (error) { console.error(`No se pudo iniciar sesión con ${email}:`, error.message); process.exit(1); }
  return { cliente, userId: data.user.id };
}

async function ids(consulta, columna) {
  const { data, error } = await consulta;
  if (error) throw error;
  return new Set(data.map((f) => f[columna]));
}

const subconjunto = (a, b) => [...a].every((x) => b.has(x));

async function rechaza(nombre, promesa) {
  const { error } = await promesa;
  if (error) ok(`${nombre} rechazado (${error.code ?? error.message})`);
  else falla(`${nombre} NO fue rechazado`);
}

async function verificarEntrenador() {
  console.log(`\n== Entrenador: ${entrenador.email}`);
  const { cliente, userId } = await sesion(entrenador);

  const { data: club } = await cliente.from('club').select('id').limit(1).single();
  const asignados = await ids(
    cliente.from('asignacion_plantel').select('plantel_id')
      .eq('miembro_club_user_id', userId).is('hasta', null),
    'plantel_id');
  console.log(`   ${asignados.size} categoría(s) asignada(s) vigente(s)`);

  const tablas = [
    ['plantel', 'id'],
    ['pertenencia', 'plantel_id'],
    ['partido', 'plantel_id'],
    ['sesion_medicion', 'plantel_id'],
  ];
  for (const [tabla, columna] of tablas) {
    const vistos = await ids(cliente.from(tabla).select(columna), columna);
    if (subconjunto(vistos, asignados)) ok(`${tabla}: todo lo que ve (${vistos.size}) es de sus categorías`);
    else falla(`${tabla}: ve planteles que no tiene asignados`);
  }

  const jugadores = await ids(cliente.from('jugador').select('id'), 'id');
  const deSusCategorias = await ids(
    cliente.from('pertenencia').select('jugador_id').is('hasta', null), 'jugador_id');
  if (subconjunto(jugadores, deSusCategorias)) ok(`jugador: los ${jugadores.size} que ve están en sus categorías`);
  else falla('jugador: ve chicos fuera de sus categorías');

  await rechaza('usuarios_pendientes', cliente.rpc('usuarios_pendientes'));
  await rechaza('miembros_del_club', cliente.rpc('miembros_del_club', { p_club_id: club.id }));
  await rechaza('panorama_del_club', cliente.rpc('panorama_del_club', { p_club_id: club.id }));
}

async function verificarCoordinador() {
  if (!coordinador.email || !coordinador.password) {
    console.log('\n(sin credenciales de coordinador: se saltea)');
    return;
  }
  console.log(`\n== Coordinador: ${coordinador.email}`);
  const { cliente } = await sesion(coordinador);
  const { data: club } = await cliente.from('club').select('id').limit(1).single();

  for (const tabla of ['jugador', 'pertenencia', 'partido', 'estadistica_jugador_partido',
    'sesion_medicion', 'medicion_tiro', 'medicion_velocidad', 'medicion_corporal']) {
    const { data, error } = await cliente.from(tabla).select('id').limit(1);
    if (error) falla(`${tabla}: error inesperado ${error.message}`);
    else if (data.length) falla(`${tabla}: el coordinador lee filas (¿0018 sin aplicar?)`);
    else ok(`${tabla}: 0 filas`);
  }

  const { data: panorama, error } = await cliente.rpc('panorama_del_club', { p_club_id: club.id });
  if (error) falla(`panorama_del_club: ${error.message}`);
  else ok(`panorama_del_club: ${panorama.planteles.length} plantel(es), ${panorama.tiro.length} fila(s) de tiro`);
}

await verificarEntrenador();
await verificarCoordinador();
console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
```

(Top-level `await` funciona: `package.json` tiene `"type": "module"`.)

- [ ] **Step 2: Chequear que al menos parsea**

Run: `node --check tests/verificarAccesoPorCategoria.js`
Expected: sin salida, exit 0.

- [ ] **Step 3: Commit**

```bash
git add tests/verificarAccesoPorCategoria.js
git commit -m "test: verificación de acceso por categoría con una sesión real"
```

---

### Tarea 11: Documentación

**Riesgo bajo.**

**Files:**
- Create: `docs/COORDINACION.md`
- Modify: `docs/CONFIGURAR-AUTH.md:122-140` (§6)
- Modify: `supabase/ESQUEMA.md`
- Modify: `tests/verificarAutorizacionPlantel.sql` (sólo el encabezado)

- [ ] **Step 1: `docs/COORDINACION.md`**

````markdown
# Coordinación: roles, asignaciones y despliegue

## Qué puede cada uno

| | Entrenador | Coordinador | Los dos roles |
|---|---|---|---|
| Jugadores, plantel, fichas, mediciones, partidos | sólo sus categorías asignadas | nada | sus categorías asignadas |
| Biblioteca de ejercicios y notas | todo el club | (no se muestra en su pantalla) | todo el club |
| Panorama agregado y Profes | no | sí | sí, con el botón **Coordinar** |
| Habilitar, asignar, quitar | nunca | a otros, en su club | a otros, en su club |

Todo esto lo hace cumplir la base (RLS), no la interfaz. Detalle en
`supabase/ESQUEMA.md`.

Lo que **no** se hace desde la app, a propósito:
- Crear un coordinador.
- Darle el rol de entrenador a alguien que ya es coordinador (ni a uno mismo).
- Sacar a alguien del club entero.

## Desplegar por primera vez

**En este orden.** Ningún paso se saltea.

### 1. Diagnóstico (sólo lectura)

En el SQL Editor de producción:

```sql
select
  to_regclass('public.asignacion_plantel') is not null               as hay_0016,
  exists (select 1 from pg_policies where policyname = 'plantel_ver') as policies_0016;

select u.email, m.club_id, m.rol,
       count(a.*) as asignaciones,
       string_agg(p.categoria, ', ' order by p.categoria) as categorias
from miembro_club m
join auth.users u on u.id = m.user_id
left join asignacion_plantel a
       on a.miembro_club_user_id = m.user_id and a.miembro_club_club_id = m.club_id
left join plantel p on p.id = a.plantel_id
group by u.email, m.club_id, m.rol
order by m.club_id, u.email;
```

Si `hay_0016` da false, la segunda falla; en ese caso:
`select u.email, m.club_id, m.rol from miembro_club m join auth.users u on u.id = m.user_id;`

### 2. Aplicar 0017

`npx supabase db push` (aplica lo que falte, cada migración en su transacción).
Conviene hacerlo cuando nadie esté usando la app.

Correr `tests/verificarCoordinacion.sql`: todo `OK`, salvo los casos 10 y 11
en `PENDIENTE`.

### 3. Primer coordinador

Si el diagnóstico no mostró a nadie con `rol = 'coordinador'`:

```sql
insert into miembro_club (user_id, club_id, es_coordinador)
values ('<uuid de Authentication → Users>', '<uuid de la tabla club>', true)
on conflict (user_id, club_id) do update set es_coordinador = true;
```

### 4. Deploy del frontend

### 5. Revisar asignaciones de la migración

Entrar como coordinador → **Profes**. Las marcadas *"asignada al activar el
panel"* las creó la migración para que nadie perdiera acceso: quitar las que
no correspondan.

### 6. Si el coordinador también entrena

Antes del paso 7, o se queda sin sus datos:

```sql
update miembro_club set es_entrenador = true
where user_id = '<uuid>' and club_id = '<uuid del club>';

insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen)
select '<uuid>', club_id, id, 'manual' from plantel
where club_id = '<uuid del club>' and categoria in ('U13M');   -- sus categorías
```

### 7. Aplicar 0018

Aborta sola si hay un club con miembros y sin coordinador. Correr de nuevo
`tests/verificarCoordinacion.sql`: todo `OK`, nada `PENDIENTE`.

Y con credenciales reales:

```bash
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... \
VERIFICAR_EMAIL=<entrenador> VERIFICAR_PASSWORD=... \
VERIFICAR_COORD_EMAIL=<coordinador> VERIFICAR_COORD_PASSWORD=... \
node tests/verificarAccesoPorCategoria.js
```

## Volver atrás

- `tests/rollback0018.sql` — el coordinador vuelve a leer datos individuales.
- `tests/rollback0017.sql` — vuelve a la forma de 0016. Aborta si hay alguien
  con los dos roles o asignaciones cerradas, y dice cuáles.

## Consultar la historia

Quién estuvo a cargo de cada categoría, incluidas las cerradas:

```sql
select p.categoria, t.nombre as temporada, u.email,
       a.desde, a.hasta, a.origen,
       ua.email as asignado_por, uc.email as cerrado_por
from asignacion_plantel a
join plantel p     on p.id = a.plantel_id
join temporada t   on t.id = p.temporada_id
join auth.users u  on u.id = a.miembro_club_user_id
left join auth.users ua on ua.id = a.asignado_por
left join auth.users uc on uc.id = a.cerrado_por
order by t.nombre desc, p.categoria, a.desde;
```

## Límite conocido

La lista de **Esperando acceso** muestra todas las cuentas confirmadas sin club
de toda la plataforma. Con un club es exacta; con un segundo club, un
coordinador vería los mails de quien se registró para el otro.
````

- [ ] **Step 2: `docs/CONFIGURAR-AUTH.md` §6** — reemplazar la sección entera por:

```markdown
## 6. Dar acceso a un club

Desde la app: el coordinador del club lo ve en **Profes → Esperando acceso**,
toca **Habilitar** y elige las categorías. Ninguna cuenta puede darse acceso a
sí misma, ni un entrenador dárselo a otro: lo impide la base, no la pantalla
(ver `supabase/ESQUEMA.md`).

Lo que sigue siendo a mano, por SQL, está en `docs/COORDINACION.md`: crear el
primer coordinador y darle además el rol de entrenador a un coordinador.

La persona, una vez habilitada, toca **"Ya me dieron el acceso, reintentar"** y entra.
```

- [ ] **Step 3: `supabase/ESQUEMA.md`**

- Línea 3: `Estado al día de la migración \`0018_endurecer_coordinador.sql\`.`
- `### miembro_club`: reemplazar el cuerpo por: `(user_id, club_id)` PK; `es_entrenador`, `es_coordinador` con `check (es_entrenador or es_coordinador)`; `habilitado_por`/`habilitado_en` (null = a mano o antes del panel). Por qué booleanos y no un rol (spec §1.1). `rol` se eliminó en 0017.
- `### asignacion_plantel`: sumar `desde`, `hasta` (null = vigente), `asignado_por`, `cerrado_por`, `origen` (`panel|manual|migracion`); índice único parcial de vigentes; FK `on delete restrict`; que no se borran (sin grant ni policy de delete, insert por columna, `update (hasta)` sellado por el trigger `asignacion_sellar_cierre`). Borrar la frase "Sin policy de insert/update/delete para el cliente autenticado".
- `## Políticas RLS`: reemplazar la tabla de `puede_ver_plantel`/`puede_escribir_plantel` por la tabla §2.1 del spec, y agregar las funciones `es_coordinador_de`, `es_entrenador_de`, `usuarios_pendientes`, `miembros_del_club`, `panorama_del_club` con una línea cada una.
- Reemplazar "El coordinador necesita la foto del club para controlar cómo va el trabajo…" por: *"Desde 0018 el coordinador no lee filas de datos de jugador: ve el panorama agregado (`panorama_del_club`), que devuelve sólo conteos y sumas. Menos gente con acceso a datos de menores, y la coordinación no lo necesita."*
- Sumar a "Dos formas que no siguen el patrón": el dedup desde 0018 exige `es_entrenador`.
- Reemplazar `miembro_club` y `asignacion_plantel` "sólo tienen policy de select de lo propio…" por la lista de policies del coordinador (spec §2.3).
- `### Dar acceso a una categoría`: remitir al panel y a `docs/COORDINACION.md`.
- `## Cómo probar localmente` pasos 4, 5 y 7: `rol` → `es_entrenador`/`es_coordinador`; paso 7: *"Para probar coordinación, `es_coordinador = true`: tiene que ver Panorama y Profes, y cero filas en las tablas de jugador (con 0018)."*
- Sumar al final: `### RPC asignar_planteles` con el comportamiento de spec §3.

- [ ] **Step 4: `tests/verificarAutorizacionPlantel.sql`** — agregar arriba de todo:

```sql
-- OBSOLETO desde 0017: usa miembro_club.rol, que ya no existe. Sirve sólo para
-- una base en el estado exacto de 0016. Para 0017/0018 usar
-- tests/verificarCoordinacion.sql.
```

- [ ] **Step 5: Commit**

```bash
git add docs/COORDINACION.md docs/CONFIGURAR-AUTH.md supabase/ESQUEMA.md tests/verificarAutorizacionPlantel.sql
git commit -m "docs: coordinación, primer coordinador y esquema al día de 0018"
```

---

### Tarea 12: Verificación final

- [ ] **Step 1: Tests**

Run: `npm test`
Expected: PASS completo. Anotar el número total de tests.

- [ ] **Step 2: Greps de alcance**

Run: `git diff --stat pre-coordinacion -- supabase/migrations/0001_esquema_inicial.sql supabase/migrations/0016_autorizacion_por_plantel.sql src/parser src/data/mapearImportacion.js src/data/prepararPayloadImportacion.js src/ui/pantallas/confirmacionImport.js`
Expected: vacío (no se tocó nada de eso).

Run: `git diff pre-coordinacion --name-only -- supabase/migrations`
Expected: sólo `0017_coordinacion.sql` y `0018_endurecer_coordinador.sql`.

Run: `grep -n "ejercicio\|nota_ejercicio" supabase/migrations/0017_coordinacion.sql supabase/migrations/0018_endurecer_coordinador.sql`
Expected: sin coincidencias (la biblioteca no se toca).

Run: `git diff pre-coordinacion -- package.json`
Expected: sólo los dos tests sumados al script; ninguna dependencia nueva.

- [ ] **Step 3: Revisión visual a 375px y escritorio** (con el skill `run` si hay sesión local; si no, queda para Tomás)

Sin credenciales no se puede entrar a la app; lo que se chequea sin sesión es que la landing y `v-sin-club` siguen igual. El resto va en la lista de verificación manual del resumen final.

- [ ] **Step 4: Review final de la rama** con el modelo más capaz (superpowers:requesting-code-review), foco en: RLS de la Tarea 1 contra spec §2, consistencia de nombres entre SQL y repositorio, y que ninguna pantalla de coordinación compare categorías.
