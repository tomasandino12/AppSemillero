-- Rollback de 0017: vuelve a la forma de 0016.
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role, DESPUÉS de rollback0018.sql si 0018 estaba aplicada. Commitea.
--
-- ABORTA, sin adivinar, si la forma de 0016 no puede representar lo que hay:
--   - alguien con los dos roles (0016 admite un rol por persona);
--   - alguna asignación cerrada (0016 no tiene "hasta": conservarla reabriría
--     un acceso, borrarla perdería historia).
-- El mensaje dice cuáles son, para resolverlos a mano.
--
-- Las asignaciones con origen 'migracion' QUEDAN como asignaciones de 0016.
-- Si hay que sacarlas, descomentar el delete marcado abajo — ANTES del
-- set_config de los conteos. Son filas que creó la propia migración, no
-- historia.

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

-- delete from asignacion_plantel where origen = 'migracion';   -- sólo si se decide sacarlas

select set_config('verif.miembro_club',       (select count(*) from miembro_club)::text,       false),
       set_config('verif.asignacion_plantel', (select count(*) from asignacion_plantel)::text, false),
       set_config('verif.plantel',            (select count(*) from plantel)::text,            false),
       set_config('verif.jugador',            (select count(*) from jugador)::text,            false),
       set_config('verif.sesion_medicion',    (select count(*) from sesion_medicion)::text,    false);


/* =====================================================================
   1. Fuera lo nuevo
   ===================================================================== */

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


/* =====================================================================
   2. Vuelve `rol`
   ===================================================================== */

alter table miembro_club add column rol text;
update miembro_club set rol = case when es_coordinador then 'coordinador' else 'entrenador' end;
alter table miembro_club alter column rol set not null;
alter table miembro_club add constraint miembro_club_rol_valido check (rol in ('entrenador','coordinador'));


/* =====================================================================
   3. Funciones y la policy de 0016, tal cual
   ===================================================================== */

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

-- 0018 (o su rollback) deja jugadores_del_club_para_dedup llamando a
-- es_entrenador_de o con el chequeo de membresía de 0016. Se restaura la de
-- 0016 antes de dropear es_entrenador_de.
create or replace function jugadores_del_club_para_dedup(p_club_id uuid)
returns table (id uuid, nombre_clave text, nombre_limpio text, planteles_visibles uuid[])
language plpgsql stable security definer set search_path = ''
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

drop function if exists es_coordinador_de(uuid);
drop function if exists es_entrenador_de(uuid);


/* =====================================================================
   4. Columnas, índice y constraints de asignacion_plantel
   ===================================================================== */

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


/* =====================================================================
   5. Columnas de miembro_club
   ===================================================================== */

alter table miembro_club
  drop constraint if exists miembro_club_con_rol,
  drop column es_entrenador, drop column es_coordinador,
  drop column habilitado_por, drop column habilitado_en;


/* =====================================================================
   6. Grants como los declaraban 0006 y 0016
   ===================================================================== */

grant select, insert, update, delete on miembro_club to authenticated;
revoke all on asignacion_plantel from authenticated;
grant select on asignacion_plantel to authenticated;


/* =====================================================================
   7. Nada se perdió
   ===================================================================== */

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
