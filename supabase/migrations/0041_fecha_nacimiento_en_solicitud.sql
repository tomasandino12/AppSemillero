-- La fecha de nacimiento la carga el chico al pedir acceso, no el profe a
-- mano por cada jugador (auditoría 2026-09-22, seguimiento de #9).
--
-- Antes sólo se cargaba desde la ficha (0012), jugador por jugador — con un
-- plantel de 25 y dos categorías, eso son horas de tipeo para el profe. Ahora
-- sigue el mismo camino que el nombre (0019/0029): el chico la escribe al
-- pedir acceso, el profe la ve precargada al aprobar y la puede corregir si
-- se equivocó (o hizo un chiste con la fecha) antes de confirmar — pero no
-- puede dejarla vacía: a diferencia del nombre, acá no hay "no se sabe"
-- razonable para alguien que está pidiendo entrar ahora mismo.
--
-- El campo de la ficha (0012, ahora detrás de un lápiz) sigue estando para
-- los jugadores que entraron por planilla CABB o alta manual, que nunca
-- pasaron por este formulario.

alter table solicitud_jugador add column fecha_nacimiento date;

alter table solicitud_jugador
  add constraint solicitud_fecha_nacimiento_no_futura
    check (fecha_nacimiento is null or fecha_nacimiento <= (now() at time zone 'America/Argentina/Buenos_Aires')::date);

-- Sin grant de select, igual que `codigo` (0037): sólo la leen las funciones
-- de abajo, que corren como dueño.


/* =====================================================================
   1. Pedir acceso: la fecha pasa a ser obligatoria
   ===================================================================== */

-- Firma nueva (se suma un parámetro): create or replace no alcanza.
drop function crear_solicitud_jugador(uuid, uuid);

create function crear_solicitud_jugador(p_club_id uuid, p_plantel_id uuid, p_fecha_nacimiento date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión.' using errcode = '42501';
  end if;
  if p_fecha_nacimiento is null then
    raise exception 'FECHA_NACIMIENTO_REQUERIDA' using errcode = 'P0001';
  end if;
  if p_fecha_nacimiento > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'FECHA_NACIMIENTO_FUTURA' using errcode = 'P0001';
  end if;
  -- Cualquiera crea una cuenta con un mail ajeno: sin confirmar, no pide nada.
  if not exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null
  ) then
    raise exception 'MAIL_SIN_CONFIRMAR' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.miembro_club m where m.user_id = auth.uid()) then
    raise exception 'ES_DEL_CUERPO_TECNICO' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.cuenta_jugador c
    where c.user_id = auth.uid() and c.hasta is null
  ) then
    raise exception 'YA_TIENE_CUENTA' using errcode = 'P0001';
  end if;
  -- Sólo los planteles que el formulario ofrece (los de la temporada vigente).
  if not exists (
    select 1 from public.plantel pl
    where pl.id = p_plantel_id and pl.club_id = p_club_id
      and pl.temporada_id = public.temporada_vigente_de(pl.club_id)
  ) then
    raise exception 'PLANTEL_INVALIDO' using errcode = 'P0001';
  end if;

  begin
    insert into public.solicitud_jugador (club_id, plantel_id, fecha_nacimiento)
    values (p_club_id, p_plantel_id, p_fecha_nacimiento)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'SOLICITUD_YA_PENDIENTE' using errcode = 'P0001';
  end;

  return jsonb_build_object('solicitudId', v_id);
end;
$fn$;


/* =====================================================================
   2. Aprobar: el profe la ve precargada y la puede corregir
   ===================================================================== */

-- Suma fecha_nacimiento al final: create or replace alcanza (misma firma).
drop function solicitudes_del_plantel(uuid);

create function solicitudes_del_plantel(p_plantel_id uuid)
returns table (
  id uuid, user_id uuid, nombre text, creado_en timestamptz, email_enmascarado text, fecha_nacimiento date
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.puede_escribir_plantel(p_plantel_id) then
    raise exception 'Sólo el entrenador de ese plantel.' using errcode = '42501';
  end if;

  return query
    select s.id, s.user_id,
           left(nullif(btrim(u.raw_user_meta_data->>'nombre'), ''), 80),
           s.creado_en,
           left(u.email::text, 1) || '***@' || split_part(u.email::text, '@', 2),
           s.fecha_nacimiento
    from public.solicitud_jugador s
    join auth.users u on u.id = s.user_id
    where s.plantel_id = p_plantel_id and s.estado = 'pendiente'
    order by s.creado_en;
end;
$fn$;

-- Igual que 0037, pero exige fecha_nacimiento al crear una ficha nueva (el
-- payload trae lo que el profe confirmó o corrigió en la pantalla de
-- aprobar). Vincular a una ficha existente no la toca: esa ficha tiene su
-- propio dato, editable desde su ficha.
create or replace function aprobar_solicitud_jugador(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $fn$
declare
  v_sol record;
  v_jugador uuid;
  v_fecha_nacimiento date;
  v_indice text;
begin
  select s.id, s.user_id, s.club_id, s.plantel_id into v_sol
  from solicitud_jugador s
  where s.id = (payload->>'solicitudId')::uuid and s.estado = 'pendiente';
  if not found then
    raise exception 'SOLICITUD_NO_ENCONTRADA' using errcode = 'P0001';
  end if;

  if not public.codigo_de_solicitud_valido(v_sol.id, payload->>'codigo') then
    raise exception 'CODIGO_INCORRECTO' using errcode = 'P0001';
  end if;

  if payload->>'jugadorId' is not null then
    v_jugador := (payload->>'jugadorId')::uuid;
    if not exists (
      select 1 from pertenencia pe
      where pe.jugador_id = v_jugador and pe.plantel_id = v_sol.plantel_id and pe.hasta is null
    ) then
      raise exception 'FICHA_FUERA_DEL_PLANTEL' using errcode = 'P0001';
    end if;
  else
    v_fecha_nacimiento := (payload->>'fechaNacimiento')::date;
    if v_fecha_nacimiento is null then
      raise exception 'FECHA_NACIMIENTO_REQUERIDA' using errcode = 'P0001';
    end if;

    -- Sin `returning`: ver 0029 y 0036.
    v_jugador := gen_random_uuid();
    begin
      insert into jugador (id, club_id, nombre_clave, nombre_limpio, desambiguador, fecha_nacimiento)
      values (
        v_jugador, v_sol.club_id,
        payload->>'nombreClave', payload->>'nombreLimpio',
        coalesce(payload->>'desambiguador', ''),
        v_fecha_nacimiento
      );
    exception when unique_violation then
      raise exception 'JUGADOR_YA_EXISTE' using errcode = 'P0001';
    end;

    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
    select pl.club_id, v_jugador, pl.id, pl.temporada_id,
           (now() at time zone 'America/Argentina/Buenos_Aires')::date
    from plantel pl
    where pl.id = v_sol.plantel_id;
  end if;

  begin
    insert into cuenta_jugador (user_id, club_id, jugador_id)
    values (v_sol.user_id, v_sol.club_id, v_jugador);
  exception when unique_violation then
    get stacked diagnostics v_indice = constraint_name;
    raise exception '%', case v_indice
      when 'cuenta_jugador_vigente_por_jugador' then 'JUGADOR_YA_TIENE_CUENTA'
      else 'CUENTA_YA_VINCULADA' end
      using errcode = 'P0001';
  end;

  update solicitud_jugador set estado = 'aprobada' where id = v_sol.id;

  return jsonb_build_object('jugadorId', v_jugador);
end;
$fn$;


/* =====================================================================
   3. Permisos de ejecución
   ===================================================================== */

revoke execute on function crear_solicitud_jugador(uuid, uuid, date) from public, anon;
revoke execute on function solicitudes_del_plantel(uuid)             from public, anon;

grant execute on function crear_solicitud_jugador(uuid, uuid, date) to authenticated;
grant execute on function solicitudes_del_plantel(uuid)             to authenticated;

comment on column solicitud_jugador.fecha_nacimiento is
  'La escribe el chico al pedir acceso (crear_solicitud_jugador la exige). El profe la ve y la puede corregir en aprobar_solicitud_jugador. Sin grant de select: sólo la leen las funciones. v0041.';
