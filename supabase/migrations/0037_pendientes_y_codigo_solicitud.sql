-- Dos agujeros del alta masiva de octubre (auditoría 2026-09-22, #2 y #3).
--
-- 1. "Esperando acceso" de coordinación listaba a cada chico: los que tienen
--    cuenta de jugador (marcados, desde 0032) y los que tienen una solicitud
--    pendiente (sin ninguna marca). Con 120 chicos, los 10 profes quedaban
--    enterrados y un toque en "Habilitar" convertía a un menor en entrenador
--    con acceso a los datos de sus compañeros. Ahora la lista es sólo de
--    cuentas que nunca pasaron por el flujo del jugador; el caso real de
--    "un jugador que va a ser profe" (0032) entra por buscar_jugador_para_habilitar,
--    con el mail exacto.
--
-- 2. Al aprobar una solicitud, el profe veía sólo el nombre que la persona
--    escribió al registrarse, que es texto libre: cualquiera que leyera una
--    planilla de la CABB podía pedir entrar como "Pérez, Juan" y ver los
--    partidos, el tiro y el plan de ese chico. Ahora cada solicitud tiene un
--    código que ve SÓLO el chico, en su pantalla; el profe se lo pide en la
--    práctica y la base no aprueba sin él. El profe además ve el mail
--    enmascarado, para distinguir dos cuentas con el mismo nombre.
--
-- Verificación: tests/verificarPendientesYCodigo.sql.

do $$
begin
  if to_regprocedure('public.descartar_cuenta(uuid, uuid)') is null then
    raise exception '0037 necesita 0032 aplicada (no existe descartar_cuenta).';
  end if;
end $$;


/* =====================================================================
   1. Pendientes de coordinación: sin chicos
   ===================================================================== */

-- Misma firma que 0032, así el cliente no cambia. es_jugador queda siempre
-- false: los jugadores ya no se listan acá.
--
-- Se excluye a quien tenga CUALQUIER solicitud o cuenta de jugador, no sólo
-- las vigentes: un chico al que el profe le rechazó la solicitud por error
-- sigue siendo un chico, no un profe esperando acceso.
create or replace function usuarios_pendientes()
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
           false
    from auth.users u
    where u.email_confirmed_at is not null
      and not exists (select 1 from public.miembro_club m2 where m2.user_id = u.id)
      and not exists (
        select 1 from public.cuenta_descartada d
        where d.user_id = u.id and d.reabierta_en is null)
      and not exists (select 1 from public.solicitud_jugador s where s.user_id = u.id)
      and not exists (select 1 from public.cuenta_jugador c where c.user_id = u.id)
    order by u.created_at desc;
end;
$fn$;

-- La puerta para el jugador que pasa a profe: coordinación escribe el mail
-- que le dio la persona. Sólo encuentra a alguien que pasó por el flujo del
-- jugador EN ESTE club (solicitud o cuenta, de cualquier estado) y que todavía
-- no es staff. Misma forma que usuarios_pendientes, con es_jugador = true, para
-- que la pantalla lo habilite con el mismo formulario.
create function buscar_jugador_para_habilitar(p_club_id uuid, p_email text)
returns table (user_id uuid, email text, nombre text, registrado_en timestamptz, es_jugador boolean)
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
    select u.id, u.email::text,
           left(nullif(btrim(u.raw_user_meta_data->>'nombre'), ''), 80),
           u.created_at,
           true
    from auth.users u
    where lower(u.email) = lower(btrim(p_email))
      and u.email_confirmed_at is not null
      and not exists (select 1 from public.miembro_club m where m.user_id = u.id)
      and (exists (select 1 from public.solicitud_jugador s
                   where s.user_id = u.id and s.club_id = p_club_id)
           or exists (select 1 from public.cuenta_jugador c
                      where c.user_id = u.id and c.club_id = p_club_id));
end;
$fn$;


/* =====================================================================
   2. El código de cada solicitud
   ===================================================================== */

-- Al azar y no derivado del id: el profe recibe el id de la solicitud
-- (solicitudes_del_plantel), así que un código calculable desde el id no
-- obligaría a pedírselo a nadie. 6 caracteres hexadecimales: se dictan en
-- voz alta sin confundir letras. Las filas que ya existen reciben uno cada
-- una (el default es volátil, se evalúa fila por fila).
alter table solicitud_jugador
  add column codigo text not null
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

-- El staff lee la tabla (solicitud_ver_staff, 0029) con un grant de tabla, que
-- incluye todas las columnas: se pasa a grant por columna, sin `codigo`. El
-- update sigue siendo sólo de `estado` (0029).
revoke select on solicitud_jugador from authenticated;
grant select (id, user_id, club_id, plantel_id, estado, creado_en, resuelto_por, resuelto_en)
  on solicitud_jugador to authenticated;

comment on column solicitud_jugador.codigo is
  'Lo ve sólo el chico (mi_solicitud_jugador). El profe se lo pide en persona y aprobar_solicitud_jugador lo exige. Sin grant de select. v0037.';

-- ¿Este código es el de esa solicitud? Corre como dueño porque quien aprueba
-- no lee la columna. Sólo contesta a quien puede escribir el plantel de la
-- solicitud; a cualquier otro, false.
create function codigo_de_solicitud_valido(p_solicitud uuid, p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.solicitud_jugador s
    where s.id = p_solicitud
      and s.codigo = upper(replace(coalesce(p_codigo, ''), ' ', ''))
      and public.puede_escribir_plantel(s.plantel_id)
  );
$fn$;

-- Cambian las columnas que devuelve: create or replace no alcanza.
drop function mi_solicitud_jugador();

create function mi_solicitud_jugador()
returns table (
  id uuid, estado text, club_nombre text, categoria_nombre text, creado_en timestamptz, codigo text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.id, s.estado, c.nombre, ca.nombre, s.creado_en, s.codigo
  from public.solicitud_jugador s
  join public.club c on c.id = s.club_id
  join public.plantel pl on pl.id = s.plantel_id
  join public.categoria ca on ca.codigo = pl.categoria_codigo
  where s.user_id = auth.uid()
  order by s.creado_en desc
  limit 1;
$fn$;

drop function solicitudes_del_plantel(uuid);

-- Suma el mail enmascarado ("j***@gmail.com"): alcanza para distinguir dos
-- cuentas con el mismo nombre sin darle al profe el mail de un menor.
create function solicitudes_del_plantel(p_plantel_id uuid)
returns table (id uuid, user_id uuid, nombre text, creado_en timestamptz, email_enmascarado text)
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
           left(u.email::text, 1) || '***@' || split_part(u.email::text, '@', 2)
    from public.solicitud_jugador s
    join auth.users u on u.id = s.user_id
    where s.plantel_id = p_plantel_id and s.estado = 'pendiente'
    order by s.creado_en;
end;
$fn$;

-- Igual que 0029 con dos cambios: exige el código, y lee la solicitud por
-- columnas (quien aprueba ya no tiene select sobre `codigo`, y `select *`
-- fallaría por permiso).
create or replace function aprobar_solicitud_jugador(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $fn$
declare
  v_sol record;
  v_jugador uuid;
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
    -- Sin `returning`: ver 0029 y 0036.
    v_jugador := gen_random_uuid();
    begin
      insert into jugador (id, club_id, nombre_clave, nombre_limpio, desambiguador)
      values (
        v_jugador, v_sol.club_id,
        payload->>'nombreClave', payload->>'nombreLimpio',
        coalesce(payload->>'desambiguador', '')
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

revoke execute on function buscar_jugador_para_habilitar(uuid, text) from public, anon;
revoke execute on function codigo_de_solicitud_valido(uuid, text)    from public, anon;
revoke execute on function mi_solicitud_jugador()                    from public, anon;
revoke execute on function solicitudes_del_plantel(uuid)             from public, anon;

grant execute on function buscar_jugador_para_habilitar(uuid, text) to authenticated;
-- La llama aprobar_solicitud_jugador, que es invoker: la necesita quien aprueba.
grant execute on function codigo_de_solicitud_valido(uuid, text)    to authenticated;
grant execute on function mi_solicitud_jugador()                    to authenticated;
grant execute on function solicitudes_del_plantel(uuid)             to authenticated;
