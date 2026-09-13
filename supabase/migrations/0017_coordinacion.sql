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
-- todas las cuentas sin club de la plataforma. Hoy hay un solo club.
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
-- La base tampoco sabe qué posiciones son triples y cuál es libres: lo dice
-- posiciones.js.
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
--
-- En producción, al 2026-09-13, no hace nada: los dos entrenadores ya tienen
-- sus asignaciones (spec §9, P1). Queda porque es inocuo y cubre a alguien que
-- se habilite por SQL entre hoy y el día que se aplique. En local y en una base
-- nueva miembro_club está vacía y tampoco hace nada.
--
-- Quedan marcadas 'migracion' y el panel las señala: "todos ven todo" no queda
-- escondido, queda como una tarea visible del coordinador.
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
