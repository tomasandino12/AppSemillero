-- Cuenta de jugador, parte 1: pedir acceso, aprobarlo y cerrarlo.
-- Ver docs/superpowers/specs/2026-09-20-cuenta-jugador-design.md (secciones 2 y 4).
--
-- Esta migración NO le da lectura de nada al jugador: eso es 0030. Acá sólo
-- está el alta. `miembro_club` no se toca —un jugador nunca es staff y su check
-- sigue igual— y tampoco `alta_jugador_manual`.
--
-- Todo el flujo del chico pasa por funciones: no recibe `select` sobre ninguna
-- tabla de esta migración. El staff sí lee y escribe, sujeto a RLS por plantel.

do $$
begin
  if to_regprocedure('public.puede_escribir_plantel(uuid)') is null then
    raise exception '0029 necesita 0016/0017 aplicadas (no existe puede_escribir_plantel).';
  end if;
end $$;


/* =====================================================================
   1. solicitud_jugador: "quiero entrar a esta categoría"
   ===================================================================== */

-- No guarda el nombre: ya está en los metadatos de Auth (0019) y una copia más
-- del nombre de un menor no aporta nada. solicitudes_del_plantel() lo lee de ahí.
create table solicitud_jugador (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id),
  club_id uuid not null references club(id),
  plantel_id uuid not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobada', 'rechazada')),
  creado_en timestamptz not null default now(),
  resuelto_por uuid references auth.users(id),
  resuelto_en timestamptz,
  -- El plantel tiene que ser del club que se pidió: mismo patrón que el resto.
  foreign key (club_id, plantel_id) references plantel (club_id, id),
  constraint solicitud_resuelta_con_fecha
    check (estado = 'pendiente' or resuelto_en is not null)
);

-- Una sola pendiente por cuenta. Las resueltas pueden repetirse: a un chico al
-- que le rechazaron una solicitud por error le queda pedir de nuevo.
create unique index solicitud_pendiente_unica
  on solicitud_jugador (user_id) where estado = 'pendiente';
create index solicitud_plantel_idx on solicitud_jugador (plantel_id);

-- El cliente sólo manda `estado` (ver grants). Quién resolvió y cuándo lo
-- sella el servidor, y una solicitud resuelta no se vuelve a tocar.
create function sellar_resolucion_solicitud()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  -- Se guarda antes de pisar `new` con `old`: después ya no se puede leer.
  v_estado text := new.estado;
begin
  if old.estado <> 'pendiente' then
    raise exception 'SOLICITUD_YA_RESUELTA' using errcode = 'P0001';
  end if;
  if v_estado = 'pendiente' then
    raise exception 'SOLO_SE_PUEDE_RESOLVER' using errcode = 'P0001';
  end if;
  new := old;
  new.estado := v_estado;
  new.resuelto_por := auth.uid();
  new.resuelto_en := now();
  return new;
end;
$fn$;

create trigger solicitud_sellar_resolucion
  before update on solicitud_jugador
  for each row execute function sellar_resolucion_solicitud();


/* =====================================================================
   2. cuenta_jugador: qué cuenta ve a qué jugador, con historia
   ===================================================================== */

create table cuenta_jugador (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  club_id uuid not null references club(id),
  jugador_id uuid not null,
  desde timestamptz not null default now(),
  hasta timestamptz,
  aprobado_por uuid not null default auth.uid() references auth.users(id),
  revocado_por uuid references auth.users(id),
  foreign key (club_id, jugador_id) references jugador (club_id, id) on delete restrict,
  constraint cuenta_fechas_validas check (hasta is null or hasta >= desde),
  constraint cuenta_cierre_con_fecha check (revocado_por is null or hasta is not null)
);

-- Una cuenta vigente por jugador y una por cuenta. Las cerradas pueden
-- repetirse: un chico que vuelve al club suma una fila.
create unique index cuenta_jugador_vigente_por_jugador
  on cuenta_jugador (jugador_id) where hasta is null;
create unique index cuenta_jugador_vigente_por_cuenta
  on cuenta_jugador (user_id) where hasta is null;

-- Dar de baja un acceso es cerrarlo, no borrarlo (como asignacion_plantel,
-- 0017): dentro de dos años tiene que poder saberse quién le dio acceso a qué
-- chico. El cierre lo sella el servidor y una fila cerrada no se toca.
create function sellar_cierre_cuenta_jugador()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if old.hasta is not null then
    raise exception 'CUENTA_YA_CERRADA' using errcode = 'P0001';
  end if;
  if new.hasta is null then
    raise exception 'SOLO_SE_PUEDE_CERRAR' using errcode = 'P0001';
  end if;
  new := old;
  new.hasta := now();
  new.revocado_por := auth.uid();
  return new;
end;
$fn$;

create trigger cuenta_jugador_sellar_cierre
  before update on cuenta_jugador
  for each row execute function sellar_cierre_cuenta_jugador();


/* =====================================================================
   3. RLS: sólo el cuerpo técnico, y por plantel
   ===================================================================== */

alter table solicitud_jugador enable row level security;
alter table cuenta_jugador enable row level security;

-- El chico no lee la tabla: ve su solicitud por mi_solicitud_jugador(), y la
-- crea por crear_solicitud_jugador() (que corre como dueño).
create policy solicitud_ver_staff on solicitud_jugador
  for select using (puede_escribir_plantel(solicitud_jugador.plantel_id));

create policy solicitud_resolver on solicitud_jugador
  for update
  using (puede_escribir_plantel(solicitud_jugador.plantel_id)
         and solicitud_jugador.estado = 'pendiente')
  with check (puede_escribir_plantel(solicitud_jugador.plantel_id)
              and solicitud_jugador.estado in ('aprobada', 'rechazada'));

-- Un entrenador ve las cuentas de los chicos de sus planteles (para mostrar
-- "tiene acceso" y poder revocar). Nadie más: ni coordinación, ni el chico.
create policy cuenta_jugador_ver on cuenta_jugador
  for select using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = cuenta_jugador.jugador_id and pe.hasta is null
      and puede_ver_plantel(pe.plantel_id)));

-- Vincular: sólo contra una solicitud PENDIENTE de esa misma cuenta, y sólo a
-- una ficha con pertenencia vigente al plantel al que pidió entrar. Así, aunque
-- alguien llame al insert por su cuenta, no puede colgarle una cuenta a
-- cualquier ficha ni a una cuenta que no la pidió.
create policy cuenta_jugador_vincular on cuenta_jugador
  for insert with check (
    cuenta_jugador.hasta is null
    and cuenta_jugador.aprobado_por = auth.uid()
    and exists (
      select 1 from solicitud_jugador s
      where s.user_id = cuenta_jugador.user_id
        and s.club_id = cuenta_jugador.club_id
        and s.estado = 'pendiente'
        and puede_escribir_plantel(s.plantel_id)
        and exists (
          select 1 from pertenencia pe
          where pe.jugador_id = cuenta_jugador.jugador_id
            and pe.plantel_id = s.plantel_id
            and pe.hasta is null)));

-- Cerrar. El with check corre DESPUÉS del trigger, que ya puso hasta.
create policy cuenta_jugador_cerrar on cuenta_jugador
  for update
  using (cuenta_jugador.hasta is null and exists (
    select 1 from pertenencia pe
    where pe.jugador_id = cuenta_jugador.jugador_id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)))
  with check (cuenta_jugador.hasta is not null);

-- Supabase concede ALL por defecto sobre tablas nuevas (ver 0017): se revoca
-- todo y se concede lo mínimo, por columna. Sin delete en ninguna. El cliente
-- no manda fechas ni autoría.
revoke all on solicitud_jugador, cuenta_jugador from anon, authenticated;
grant select on solicitud_jugador to authenticated;
grant update (estado) on solicitud_jugador to authenticated;
grant select on cuenta_jugador to authenticated;
grant insert (user_id, club_id, jugador_id) on cuenta_jugador to authenticated;
grant update (hasta) on cuenta_jugador to authenticated;

comment on table solicitud_jugador is
  'Un chico pide entrar a un plantel; el entrenador de ese plantel la aprueba o la rechaza. No guarda el nombre (vive en los metadatos de Auth). v0029.';
comment on table cuenta_jugador is
  'Qué cuenta de Auth ve a qué jugador. Con historia: se cierra (hasta), no se borra. La lectura del chico va por funciones (0030), no por esta tabla. v0029.';


/* =====================================================================
   4. Funciones del alta (las llama quien todavía no tiene club)
   ===================================================================== */

-- La temporada de un club que vale hoy: la de nombre más alto ("2026" > "2025").
-- No hay una marca de "vigente" en `temporada`; si algún día hace falta otra
-- regla, se cambia acá y las dos funciones de abajo la siguen. Interna: no se
-- otorga a nadie, la llaman otras funciones que corren como dueño.
create function temporada_vigente_de(p_club_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select t.id from public.temporada t
  where t.club_id = p_club_id
  order by t.nombre desc
  limit 1;
$fn$;

revoke execute on function temporada_vigente_de(uuid) from public, anon, authenticated;

-- El catálogo del formulario "Soy jugador de un club". Nombres de club y de
-- categoría son información pública. Sólo para cuentas sin club.
create function clubes_para_solicitar()
returns table (
  club_id uuid, club_nombre text, plantel_id uuid,
  categoria_codigo text, categoria_nombre text, categoria_orden integer
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if auth.uid() is null
     or exists (select 1 from public.miembro_club m where m.user_id = auth.uid()) then
    raise exception 'Sólo para cuentas sin club.' using errcode = '42501';
  end if;

  return query
    select c.id, c.nombre, pl.id, pl.categoria_codigo, ca.nombre, ca.orden
    from public.club c
    join public.plantel pl
      on pl.club_id = c.id and pl.temporada_id = public.temporada_vigente_de(c.id)
    join public.categoria ca on ca.codigo = pl.categoria_codigo
    order by c.nombre, ca.orden;
end;
$fn$;

-- Deja la solicitud pendiente. Corre como dueño porque el chico no tiene
-- ningún permiso sobre la tabla. Rechaza al staff y a quien ya tiene cuenta.
create function crear_solicitud_jugador(p_club_id uuid, p_plantel_id uuid)
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
    insert into public.solicitud_jugador (club_id, plantel_id)
    values (p_club_id, p_plantel_id)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'SOLICITUD_YA_PENDIENTE' using errcode = 'P0001';
  end;

  return jsonb_build_object('solicitudId', v_id);
end;
$fn$;

-- La última solicitud de quien llama, para mostrar "pendiente" al volver a
-- entrar. Función y no `select` sobre la tabla: el chico no lee tablas.
create function mi_solicitud_jugador()
returns table (
  id uuid, estado text, club_nombre text, categoria_nombre text, creado_en timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.id, s.estado, c.nombre, ca.nombre, s.creado_en
  from public.solicitud_jugador s
  join public.club c on c.id = s.club_id
  join public.plantel pl on pl.id = s.plantel_id
  join public.categoria ca on ca.codigo = pl.categoria_codigo
  where s.user_id = auth.uid()
  order by s.creado_en desc
  limit 1;
$fn$;


/* =====================================================================
   5. Funciones del cuerpo técnico
   ===================================================================== */

-- Las solicitudes pendientes de un plantel, con el nombre que escribió el chico
-- al registrarse. Como usuarios_pendientes() (0019): auth.users no se lee desde
-- el cliente, así que va por una función que exige ser entrenador del plantel.
create function solicitudes_del_plantel(p_plantel_id uuid)
returns table (id uuid, user_id uuid, nombre text, creado_en timestamptz)
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
           s.creado_en
    from public.solicitud_jugador s
    join auth.users u on u.id = s.user_id
    where s.plantel_id = p_plantel_id and s.estado = 'pendiente'
    order by s.creado_en;
end;
$fn$;

-- Aprueba una solicitud por uno de dos caminos, en UNA transacción:
--   { solicitudId, jugadorId }                       -> vincula a una ficha existente
--   { solicitudId, nombreClave, nombreLimpio, ... }  -> crea la ficha y su pertenencia
--                                                       al plantel de la solicitud, y vincula
-- El sistema nunca compara nombres para decidir qué ficha es cuál: lo decide
-- el profe (spec, sección 2).
--
-- security invoker: sujeta a RLS como cualquier cliente. Un entrenador que no
-- tiene asignado el plantel de la solicitud ni siquiera la ve, y falla acá.
create function aprobar_solicitud_jugador(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $fn$
declare
  v_sol public.solicitud_jugador;
  v_jugador uuid;
  v_indice text;
begin
  select * into v_sol
  from solicitud_jugador s
  where s.id = (payload->>'solicitudId')::uuid and s.estado = 'pendiente';
  if not found then
    raise exception 'SOLICITUD_NO_ENCONTRADA' using errcode = 'P0001';
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
    -- El id se genera acá y no con `returning`: un insert...returning exige que
    -- la fila nueva pase la policy de lectura de `jugador`, que pide una
    -- pertenencia vigente, y la pertenencia se inserta justo después.
    v_jugador := gen_random_uuid();
    begin
      insert into jugador (id, club_id, nombre_clave, nombre_limpio, desambiguador)
      values (
        v_jugador, v_sol.club_id,
        payload->>'nombreClave', payload->>'nombreLimpio',
        coalesce(payload->>'desambiguador', '')
      );
    exception when unique_violation then
      -- unique (club_id, nombre_clave, desambiguador) de 0001. Mismo código que
      -- alta_jugador_manual: la pantalla ofrece elegir la ficha existente.
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

create function rechazar_solicitud_jugador(p_id uuid)
returns void
language plpgsql
security invoker
as $fn$
begin
  update solicitud_jugador set estado = 'rechazada'
  where id = p_id and estado = 'pendiente';
  if not found then
    raise exception 'SOLICITUD_NO_ENCONTRADA' using errcode = 'P0001';
  end if;
end;
$fn$;

-- Cierra la cuenta vigente de un jugador. No borra nada: el chico deja de ver
-- todo y queda escrito quién le dio y quién le sacó el acceso.
create function revocar_cuenta_jugador(p_jugador uuid)
returns void
language plpgsql
security invoker
as $fn$
begin
  update cuenta_jugador set hasta = now()
  where jugador_id = p_jugador and hasta is null;
  if not found then
    raise exception 'SIN_CUENTA_VIGENTE' using errcode = 'P0001';
  end if;
end;
$fn$;


/* =====================================================================
   6. Que un jugador no aparezca como "cuenta sin club" del panel
   ===================================================================== */

-- Igual que en 0019, salvo por el último filtro. Sin él, un chico con cuenta
-- vigente (que no está en miembro_club) figuraría en la lista de "pendientes de
-- habilitar" de coordinación, a un toque de quedar como entrenador con acceso a
-- datos de otros menores.
create or replace function usuarios_pendientes()
returns table (user_id uuid, email text, nombre text, registrado_en timestamptz)
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
           u.created_at
    from auth.users u
    where u.email_confirmed_at is not null
      and not exists (select 1 from public.miembro_club m2 where m2.user_id = u.id)
      and not exists (
        select 1 from public.cuenta_jugador c where c.user_id = u.id and c.hasta is null)
    order by u.created_at desc;
end;
$fn$;


/* =====================================================================
   7. Permisos de ejecución
   ===================================================================== */

-- Postgres le da EXECUTE a PUBLIC por defecto y Supabase a anon aparte: se
-- revoca y se otorga sólo a authenticated, como desde 0017. Las funciones que
-- corren como dueño se cierran solas contra quien no corresponde (chequean
-- auth.uid()); las invoker las frena RLS.
revoke execute on function clubes_para_solicitar()                 from public, anon;
revoke execute on function crear_solicitud_jugador(uuid, uuid)     from public, anon;
revoke execute on function mi_solicitud_jugador()                  from public, anon;
revoke execute on function solicitudes_del_plantel(uuid)           from public, anon;
revoke execute on function aprobar_solicitud_jugador(jsonb)        from public, anon;
revoke execute on function rechazar_solicitud_jugador(uuid)        from public, anon;
revoke execute on function revocar_cuenta_jugador(uuid)            from public, anon;
revoke execute on function sellar_resolucion_solicitud()           from public, anon, authenticated;
revoke execute on function sellar_cierre_cuenta_jugador()          from public, anon, authenticated;

grant execute on function clubes_para_solicitar()                  to authenticated;
grant execute on function crear_solicitud_jugador(uuid, uuid)      to authenticated;
grant execute on function mi_solicitud_jugador()                   to authenticated;
grant execute on function solicitudes_del_plantel(uuid)            to authenticated;
grant execute on function aprobar_solicitud_jugador(jsonb)         to authenticated;
grant execute on function rechazar_solicitud_jugador(uuid)         to authenticated;
grant execute on function revocar_cuenta_jugador(uuid)             to authenticated;
