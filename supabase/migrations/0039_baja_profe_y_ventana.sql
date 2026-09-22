-- Dar de baja a un profe, y que sumar a un chico no abra su historial físico
-- (auditoría 2026-09-22, #7 y #8).
--
-- 1. BAJA. Hasta acá coordinación sólo podía cerrarle las categorías a un
--    profe que se iba: su fila de miembro_club quedaba con es_entrenador para
--    siempre (no hay delete, y la historia de asignaciones la ata con
--    restrict). Con eso seguía pidiendo jugadores_del_club_para_dedup —los
--    nombres de todos los chicos del club— y seguía pudiendo crear fichas,
--    importaciones y recursos. La baja apaga el rol en vez de borrar la fila:
--    es_entrenador = false basta para que caigan es_entrenador_de,
--    puede_ver_plantel, puede_escribir_plantel y las policies que miran el
--    rol directo. Queda escrito quién lo dio de baja y cuándo. Volver a
--    habilitarlo es SQL, como dar el rol de coordinación.
--
--    Aparte de la baja, el dedup pasa a exigir una categoría vigente: un
--    entrenador al que le cerraron todo, sin baja formal, tampoco lo lee.
--
-- 2. VENTANA. Cualquier profe con una categoría puede sumar a su plantel a un
--    chico de otra (es el flujo legítimo del citado) y, con eso, leía toda la
--    historia de altura y peso de ese chico, sin que su profe se enterara.
--    Ahora una pertenencia da acceso a las medidas CARGADAS desde que existe,
--    no a las anteriores. Se mide por cuándo se cargó la fila (creado_en), no
--    por fecha_medicion: así el profe que hoy carga la revisión médica de
--    marzo de un chico que sumó hoy la ve igual. Las pertenencias que ya
--    existen quedan con -infinity: nadie deja de ver nada de lo que ve hoy.
--
-- Verificación: tests/verificarBajaProfe.sql.


/* =====================================================================
   1. La baja
   ===================================================================== */

alter table miembro_club
  add column baja_en  timestamptz,
  add column baja_por uuid references auth.users(id);

-- Una fila dada de baja ya no tiene rol: el check de 0017 lo prohibía.
alter table miembro_club drop constraint miembro_club_con_rol;
alter table miembro_club add constraint miembro_club_con_rol
  check (es_entrenador or es_coordinador or baja_en is not null);
alter table miembro_club add constraint miembro_club_baja_con_autor
  check ((baja_en is null) = (baja_por is null));

-- Sin grants nuevos: el cliente sólo tiene insert de tres columnas y select
-- (0017), así que baja_en/baja_por los escribe únicamente la función.

-- Sólo a un entrenador puro: a otro coordinador se lo toca por SQL (0017,
-- spec P3), y a uno mismo tampoco.
create function dar_de_baja_profe(p_user_id uuid, p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_m public.miembro_club;
  v_cerradas integer;
begin
  if not public.es_coordinador_de(p_club_id) then
    raise exception 'Sólo coordinación de ese club.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'NO_ES_UNO_MISMO' using errcode = 'P0001';
  end if;

  select * into v_m from public.miembro_club m
  where m.user_id = p_user_id and m.club_id = p_club_id
  for update;
  if not found then
    raise exception 'NO_ES_DEL_CLUB' using errcode = 'P0001';
  end if;
  if v_m.baja_en is not null then
    raise exception 'YA_DADO_DE_BAJA' using errcode = 'P0001';
  end if;
  if v_m.es_coordinador then
    raise exception 'ES_COORDINACION' using errcode = 'P0001';
  end if;

  -- El trigger de 0017 sella hasta = now() y cerrado_por = quien llama.
  update public.asignacion_plantel
     set hasta = now()
   where miembro_club_user_id = p_user_id
     and miembro_club_club_id = p_club_id
     and hasta is null;
  get diagnostics v_cerradas = row_count;

  update public.miembro_club
     set es_entrenador = false, baja_en = now(), baja_por = auth.uid()
   where user_id = p_user_id and club_id = p_club_id;

  return jsonb_build_object('asignacionesCerradas', v_cerradas);
end;
$fn$;

-- Suma baja_en para que el panel muestre a los dados de baja como tales.
-- Cambian las columnas: drop y create.
drop function miembros_del_club(uuid);

create function miembros_del_club(p_club_id uuid)
returns table (
  user_id uuid, email text, nombre text,
  es_entrenador boolean, es_coordinador boolean, habilitado_en timestamptz, baja_en timestamptz
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
    select m.user_id, u.email::text,
           left(nullif(btrim(u.raw_user_meta_data->>'nombre'), ''), 80),
           m.es_entrenador, m.es_coordinador, m.habilitado_en, m.baja_en
    from public.miembro_club m
    join auth.users u on u.id = m.user_id
    where m.club_id = p_club_id
    order by coalesce(nullif(btrim(u.raw_user_meta_data->>'nombre'), ''), u.email::text);
end;
$fn$;

-- Igual que 0017, salvo que a alguien dado de baja no se lo reasigna desde la
-- app: el mensaje de "es de coordinación" era falso para ese caso.
create or replace function asignar_planteles(p_user_id uuid, p_club_id uuid, p_plantel_ids uuid[])
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_es_entrenador boolean;
  v_baja timestamptz;
  v_habilitado boolean := false;
  v_asignadas integer := 0;
  v_ya_vigentes integer := 0;
  v_plantel uuid;
begin
  if p_plantel_ids is null or cardinality(p_plantel_ids) = 0 then
    raise exception 'SIN_CATEGORIAS' using errcode = 'P0001';
  end if;

  select m.es_entrenador, m.baja_en into v_es_entrenador, v_baja
  from miembro_club m
  where m.user_id = p_user_id and m.club_id = p_club_id;

  if not found then
    insert into miembro_club (user_id, club_id, es_entrenador)
    values (p_user_id, p_club_id, true);
    v_habilitado := true;
  elsif v_baja is not null then
    raise exception 'DADO_DE_BAJA' using errcode = 'P0001';
  elsif not v_es_entrenador then
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

-- El padrón de chicos, sólo para quien tiene hoy alguna categoría: es para el
-- dedup del import y del alta, que sin categoría no se pueden hacer. El
-- cuerpo es el de 0018 con otro chequeo de entrada.
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
  if not exists (
    select 1
    from public.miembro_club m
    join public.asignacion_plantel a
      on a.miembro_club_user_id = m.user_id
     and a.miembro_club_club_id = m.club_id
     and a.hasta is null
    where m.club_id = p_club_id and m.user_id = auth.uid() and m.es_entrenador
  ) then
    raise exception 'Sólo entrenadores con una categoría de ese club.' using errcode = '42501';
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

-- importacion (nombres de archivo, advertencias del parser) y recurso eran
-- legibles por cualquier fila de miembro_club; un dado de baja sigue teniendo
-- la suya. Ahora, sólo quien tiene un rol activo.
drop policy importacion_leer on importacion;
create policy importacion_leer on importacion
  for select using (es_entrenador_de(importacion.club_id) or es_coordinador_de(importacion.club_id));

drop policy recurso_leer on recurso;
create policy recurso_leer on recurso
  for select using (es_entrenador_de(recurso.club_id) or es_coordinador_de(recurso.club_id));


/* =====================================================================
   2. La ventana del historial corporal
   ===================================================================== */

-- Desde cuándo existe la pertenencia en la base (no `desde`, que es la fecha
-- deportiva y la elige quien la crea). La sella el servidor.
alter table pertenencia add column registrada_en timestamptz;
update pertenencia set registrada_en = '-infinity';
alter table pertenencia alter column registrada_en set not null;
alter table pertenencia alter column registrada_en set default now();

create function sellar_pertenencia()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    new.registrada_en := now();
  else
    new.registrada_en := old.registrada_en;
  end if;
  return new;
end;
$fn$;

create trigger pertenencia_sellar
  before insert or update on pertenencia
  for each row execute function sellar_pertenencia();

-- La ventana compara contra creado_en, así que creado_en no puede venir del
-- cliente ni reescribirse (el grant de medicion_corporal es de tabla, 0012).
-- Sin sesión (SQL del dashboard) se respeta el autor que se mande.
create function sellar_medicion_corporal()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    new.creado_en := now();
    new.creado_por := coalesce(auth.uid(), new.creado_por);
  else
    new.creado_en := old.creado_en;
    new.creado_por := old.creado_por;
  end if;
  return new;
end;
$fn$;

create trigger medicion_corporal_sellar
  before insert or update on medicion_corporal
  for each row execute function sellar_medicion_corporal();

revoke execute on function sellar_pertenencia()       from public, anon, authenticated;
revoke execute on function sellar_medicion_corporal() from public, anon, authenticated;

-- Ver, editar y borrar: sólo lo cargado desde que existe la pertenencia que
-- da acceso, o lo que cargó uno mismo. Crear no cambia (una fila nueva es de
-- ahora). Editar y borrar llevan la misma ventana que ver: un UPDATE sin
-- WHERE no pasa por la policy de lectura, y sin esto alcanzaba para "traer"
-- filas viejas a la ventana.
drop policy corporal_ver on medicion_corporal;
drop policy corporal_editar on medicion_corporal;
drop policy corporal_borrar on medicion_corporal;

create policy corporal_ver on medicion_corporal
  for select using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = medicion_corporal.jugador_id and pe.hasta is null
      and puede_ver_plantel(pe.plantel_id)
      and (medicion_corporal.creado_en >= pe.registrada_en
           or medicion_corporal.creado_por = auth.uid())));

create policy corporal_editar on medicion_corporal
  for update using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = medicion_corporal.jugador_id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)
      and (medicion_corporal.creado_en >= pe.registrada_en
           or medicion_corporal.creado_por = auth.uid())))
  with check (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = medicion_corporal.jugador_id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)));

create policy corporal_borrar on medicion_corporal
  for delete using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = medicion_corporal.jugador_id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)
      and (medicion_corporal.creado_en >= pe.registrada_en
           or medicion_corporal.creado_por = auth.uid())));

comment on column pertenencia.registrada_en is
  'Cuándo se creó la fila (lo sella el servidor). Las medidas corporales cargadas antes no se ven por esta pertenencia. -infinity en las anteriores a 0039.';


/* =====================================================================
   3. Permisos de ejecución
   ===================================================================== */

revoke execute on function dar_de_baja_profe(uuid, uuid) from public, anon;
revoke execute on function miembros_del_club(uuid)       from public, anon;
grant  execute on function dar_de_baja_profe(uuid, uuid) to authenticated;
grant  execute on function miembros_del_club(uuid)       to authenticated;
