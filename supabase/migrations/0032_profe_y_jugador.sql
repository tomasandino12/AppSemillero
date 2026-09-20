-- Que una cuenta pueda pasar de jugador a profe, y que coordinación pueda
-- rechazar un pedido de acceso sin que sea para siempre.
--
-- Dos cosas que se hablaron al cerrar 0029/0030 y no quedaron escritas:
--
-- 1. Un jugador grande puede terminar siendo profe de los chicos (pasa con
--    jugadores de Primera y de U21). Hasta acá la lista "Esperando acceso" lo
--    escondía apenas tenía cuenta de jugador, así que coordinación no lo podía
--    habilitar. Ahora aparece, marcado como jugador, y habilitarlo le CIERRA la
--    cuenta de jugador (queda la historia: se cierra, no se borra). La app no
--    tiene un modo "profe y jugador a la vez": el shell del staff no muestra
--    la ficha del jugador, y dejar abierta una cuenta que nadie puede usar sólo
--    confunde. Si algún día hace falta tener las dos, se suma un modo en la app
--    y se levanta el cierre de acá.
-- 2. Rechazar a una cuenta que no es de acá (un mail equivocado, alguien que
--    no es profe). Rechazar es reversible: quien fue rechazado por error vuelve
--    a pedir desde su cuenta y reaparece en la lista. Nada se borra.

do $$
begin
  if to_regclass('public.cuenta_jugador') is null then
    raise exception '0032 necesita 0029 aplicada (no existe cuenta_jugador).';
  end if;
end $$;


/* =====================================================================
   1. Nunca profe y jugador con las dos cuentas vigentes
   ===================================================================== */

-- Al habilitar a alguien como staff se le cierra la cuenta de jugador vigente.
-- security definer: quien habilita es coordinador y no tiene update sobre
-- cuenta_jugador. El trigger de sellado de 0029 pone `revocado_por` con el
-- auth.uid() de quien habilitó, que es lo que tiene que quedar escrito.
create function cerrar_cuenta_jugador_al_habilitar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.cuenta_jugador
     set hasta = now()
   where user_id = new.user_id and hasta is null;
  return new;
end;
$fn$;

create trigger miembro_club_cierra_cuenta_jugador
  after insert on miembro_club
  for each row execute function cerrar_cuenta_jugador_al_habilitar();

-- La otra mitad: una solicitud de jugador que estaba pendiente cuando la
-- cuenta pasó a ser staff no se puede aprobar después. crear_solicitud_jugador
-- ya frena al staff al pedir, pero no al aprobar. security definer porque el
-- entrenador que aprueba no lee miembro_club.
create function impedir_cuenta_jugador_de_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if exists (select 1 from public.miembro_club m where m.user_id = new.user_id) then
    raise exception 'ES_DEL_CUERPO_TECNICO' using errcode = 'P0001';
  end if;
  return new;
end;
$fn$;

create trigger cuenta_jugador_no_de_staff
  before insert on cuenta_jugador
  for each row execute function impedir_cuenta_jugador_de_staff();

revoke execute on function cerrar_cuenta_jugador_al_habilitar() from public, anon, authenticated;
revoke execute on function impedir_cuenta_jugador_de_staff()    from public, anon, authenticated;


/* =====================================================================
   2. cuenta_descartada: coordinación rechazó este pedido de acceso
   ===================================================================== */

-- Con historia y sin borrar (como asignacion_plantel y cuenta_jugador): si
-- alguien vuelve a pedir, la fila se cierra con `reabierta_en` y queda escrito
-- cuándo y quién la había rechazado. Nadie lee la tabla desde la app: todo va
-- por funciones, y el rechazado ve sólo el hecho de que lo rechazaron.
create table cuenta_descartada (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  -- Club de quien rechazó: sirve para saber a quién preguntarle, no para
  -- autorizar nada.
  club_id uuid not null references club(id),
  descartado_por uuid not null default auth.uid() references auth.users(id),
  descartado_en timestamptz not null default now(),
  reabierta_en timestamptz
);

-- Un solo rechazo abierto por cuenta. Los cerrados pueden repetirse.
create unique index cuenta_descartada_abierta_por_cuenta
  on cuenta_descartada (user_id) where reabierta_en is null;

-- Sólo se puede cerrar, y una fila cerrada no se toca. La autoría del rechazo
-- la sella el servidor.
create function sellar_cuenta_descartada()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    new.descartado_por := auth.uid();
    new.descartado_en := now();
    new.reabierta_en := null;
    return new;
  end if;
  if old.reabierta_en is not null then
    raise exception 'DESCARTE_YA_CERRADO' using errcode = 'P0001';
  end if;
  if new.reabierta_en is null then
    raise exception 'SOLO_SE_PUEDE_CERRAR' using errcode = 'P0001';
  end if;
  new := old;
  new.reabierta_en := now();
  return new;
end;
$fn$;

create trigger cuenta_descartada_sellar
  before insert or update on cuenta_descartada
  for each row execute function sellar_cuenta_descartada();

alter table cuenta_descartada enable row level security;
-- Sin policies y sin grants: la tabla es sólo de las funciones de abajo.
revoke all on cuenta_descartada from anon, authenticated;

comment on table cuenta_descartada is
  'Coordinación rechazó el pedido de acceso de esta cuenta. Reversible: quien fue rechazado vuelve a pedir y se cierra (reabierta_en). Sólo por funciones. v0032.';


/* =====================================================================
   3. La lista de pendientes: con jugadores, sin rechazados
   ===================================================================== */

-- Cambia el tipo de retorno (suma es_jugador): create or replace no alcanza.
drop function usuarios_pendientes();

-- Igual que en 0029, con dos cambios:
--  - un jugador con cuenta vigente en un club que el que llama coordina SÍ
--    aparece, con es_jugador = true, para poder habilitarlo como profe. Los
--    jugadores de clubes ajenos siguen escondidos: coordinación de un club no
--    tiene por qué saber quién juega en otro.
--  - los rechazados (cuenta_descartada abierta) no aparecen hasta que vuelvan
--    a pedir.
create function usuarios_pendientes()
returns table (user_id uuid, email text, nombre text, registrado_en timestamptz, es_jugador boolean)
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
    select u.id, u.email::text,
           left(nullif(btrim(u.raw_user_meta_data->>'nombre'), ''), 80),
           u.created_at,
           exists (select 1 from public.cuenta_jugador c
                   where c.user_id = u.id and c.hasta is null)
    from auth.users u
    where u.email_confirmed_at is not null
      and not exists (select 1 from public.miembro_club m2 where m2.user_id = u.id)
      and not exists (
        select 1 from public.cuenta_descartada d
        where d.user_id = u.id and d.reabierta_en is null)
      -- Se descartan los jugadores cuyo club no coordina quien llama.
      and not exists (
        select 1 from public.cuenta_jugador c
        where c.user_id = u.id and c.hasta is null
          and not exists (
            select 1 from public.miembro_club mc
            where mc.user_id = auth.uid() and mc.club_id = c.club_id and mc.es_coordinador))
    order by u.created_at desc;
end;
$fn$;


/* =====================================================================
   4. Rechazar y volver a pedir
   ===================================================================== */

-- Rechaza a una cuenta de la lista de pendientes. Sólo coordinación. No sirve
-- para un jugador con cuenta (a ése se lo habilita o se lo deja), ni para
-- alguien que ya es del club, ni para uno mismo.
create function descartar_cuenta(p_user_id uuid, p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not exists (
    select 1 from public.miembro_club m
    where m.user_id = auth.uid() and m.club_id = p_club_id and m.es_coordinador
  ) then
    raise exception 'Sólo coordinación.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'NO_ES_UNO_MISMO' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.miembro_club m where m.user_id = p_user_id) then
    raise exception 'YA_ES_DEL_CLUB' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cuenta_jugador c where c.user_id = p_user_id and c.hasta is null) then
    raise exception 'ES_JUGADOR' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null
  ) then
    raise exception 'CUENTA_NO_ENCONTRADA' using errcode = 'P0001';
  end if;

  begin
    insert into public.cuenta_descartada (user_id, club_id) values (p_user_id, p_club_id);
  exception when unique_violation then
    -- Ya estaba rechazada (otro coordinador, o un doble toque): no hay nada
    -- más que hacer y no es un error para quien llama.
    null;
  end;
end;
$fn$;

-- ¿Me rechazaron? Es lo único que ve el rechazado: el hecho, no quién ni por
-- qué. Como mi_solicitud_jugador: función y no select, porque no lee tablas.
create function mi_pedido_descartado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.cuenta_descartada d
    where d.user_id = auth.uid() and d.reabierta_en is null);
$fn$;

-- "Fue un error, pedilo de nuevo": cierra el rechazo y la cuenta vuelve a la
-- lista de pendientes.
create function volver_a_pedir_acceso()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión.' using errcode = '42501';
  end if;
  update public.cuenta_descartada
     set reabierta_en = now()
   where user_id = auth.uid() and reabierta_en is null;
  if not found then
    raise exception 'SIN_RECHAZO' using errcode = 'P0001';
  end if;
end;
$fn$;

revoke execute on function usuarios_pendientes()            from public, anon;
revoke execute on function descartar_cuenta(uuid, uuid)     from public, anon;
revoke execute on function mi_pedido_descartado()           from public, anon;
revoke execute on function volver_a_pedir_acceso()          from public, anon;
revoke execute on function sellar_cuenta_descartada()       from public, anon, authenticated;

grant execute on function usuarios_pendientes()             to authenticated;
grant execute on function descartar_cuenta(uuid, uuid)      to authenticated;
grant execute on function mi_pedido_descartado()            to authenticated;
grant execute on function volver_a_pedir_acceso()           to authenticated;
