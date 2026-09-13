-- El nombre de cada persona, y las cuatro categorías que faltaban.
--
-- 1. EL NOMBRE deja de vivir en perfil_entrenador (0015). Esa tabla lleva
--    club_id y sólo se llenaba la primera vez que alguien cargaba un
--    ejercicio: un profe que nunca usó la biblioteca no tenía nombre, y el
--    panel de coordinación mostraba mails.
--
--    Pasa a los metadatos del usuario de Supabase Auth
--    (auth.users.raw_user_meta_data->>'nombre'). No es una tabla propia porque
--    al crear la cuenta todavía no hay sesión (la confirmación de mail está
--    activada): el cliente no puede escribir en ninguna tabla en ese momento,
--    así que el nombre tenía que viajar como metadato igual. Una tabla sólo
--    le sumaba un trigger sobre auth.users, policies y una copia más.
--
--    La persona lo edita con auth.updateUser. Los demás lo leen sólo a través
--    de las funciones de abajo, que exigen ser del mismo club.
--
-- 2. LAS CATEGORÍAS: el club tiene seis y en la base había dos.

do $$
begin
  if to_regprocedure('public.miembros_del_club(uuid)') is null then
    raise exception '0019 necesita 0017 aplicada (no existe miembros_del_club).';
  end if;
end $$;


/* =====================================================================
   1. Los nombres que ya existían
   ===================================================================== */

-- Se copian de perfil_entrenador a los metadatos, sin pisar un nombre que la
-- persona ya tenga. Si alguien tiene más de una fila (más de un club), gana
-- la más reciente.
update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
                         || jsonb_build_object('nombre', p.nombre)
from (
  select distinct on (pe.user_id) pe.user_id, btrim(pe.nombre) as nombre
  from public.perfil_entrenador pe
  where btrim(pe.nombre) <> ''
  order by pe.user_id, pe.creado_en desc
) p
where p.user_id = u.id
  and coalesce(btrim(u.raw_user_meta_data->>'nombre'), '') = '';

-- Las cuentas que ya existen y siguen sin nombre quedan marcadas. La app le
-- pide el nombre, antes de entrar, a toda cuenta sin nombre y SIN esta marca:
-- las nuevas. A las de antes no se las frena; lo cargan desde Mi perfil.
--
-- La marca la puede poner la propia persona con auth.updateUser: lo único
-- que se saltearía es escribir su nombre. No abre ningún acceso.
update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
                         || '{"cuenta_anterior_al_nombre": true}'::jsonb
where coalesce(btrim(u.raw_user_meta_data->>'nombre'), '') = '';

comment on table perfil_entrenador is
  'OBSOLETA desde 0019: el nombre vive en auth.users.raw_user_meta_data->>''nombre''. '
  'La app no la lee ni la escribe. Se conserva para no perder datos.';


/* =====================================================================
   2. Leer nombres ajenos
   ===================================================================== */

-- Los nombres de los miembros de un club, para mostrar quién cargó cada
-- ejercicio o nota. Reemplaza la lectura directa de perfil_entrenador.
-- Rechaza a quien no es del club: auth.users no tiene que quedar abierta.
create function nombres_del_club(p_club_id uuid)
returns table (user_id uuid, nombre text)
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
    select m.user_id, left(nullif(btrim(u.raw_user_meta_data->>'nombre'), ''), 80)
    from public.miembro_club m
    join auth.users u on u.id = m.user_id
    where m.club_id = p_club_id;
end;
$fn$;

revoke execute on function nombres_del_club(uuid) from public, anon;
grant  execute on function nombres_del_club(uuid) to authenticated;

-- Igual que en 0017; sólo cambia de dónde sale el nombre.
create or replace function miembros_del_club(p_club_id uuid)
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
    select m.user_id, u.email::text,
           left(nullif(btrim(u.raw_user_meta_data->>'nombre'), ''), 80),
           m.es_entrenador, m.es_coordinador, m.habilitado_en
    from public.miembro_club m
    join auth.users u on u.id = m.user_id
    where m.club_id = p_club_id
    order by coalesce(nullif(btrim(u.raw_user_meta_data->>'nombre'), ''), u.email::text);
end;
$fn$;

-- Suma el nombre: al habilitar, el coordinador reconoce a la persona por su
-- nombre y no sólo por el mail. Cambia la forma de lo que devuelve, así que
-- se reemplaza entera (create or replace no admite cambiar las columnas).
drop function usuarios_pendientes();

create function usuarios_pendientes()
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
    order by u.created_at desc;
end;
$fn$;

revoke execute on function usuarios_pendientes() from public, anon;
grant  execute on function usuarios_pendientes() to authenticated;


/* =====================================================================
   3. Las cuatro categorías que faltaban
   ===================================================================== */

-- Temporada 2026 de Newell's (0004), con la misma forma que U17M y U21M:
-- categoria y categoria_codigo con el código del catálogo (0016).
--
-- codigo_cabb queda NULL: no se conoce el texto exacto que traen las
-- planillas de la CABB para estas categorías. No rompe nada: si el título de
-- un partido no matchea ningún plantel, el import le pregunta al entrenador.
-- Cuando haya una planilla real de cada una, se completa por SQL.
--
-- No hay ningún flujo en la app para crear categorías, a propósito: son seis
-- conocidas y si alguna vez cambia una, se hace acá.
insert into plantel (club_id, temporada_id, categoria, categoria_codigo, codigo_cabb)
select t.club_id, t.id, c.codigo, c.codigo, null
from public.temporada t
cross join (values ('U13M'), ('U15M'), ('MAY_M'), ('MAY_F')) as c(codigo)
where t.id = '20000000-0000-0000-0000-000000000002'
on conflict (club_id, temporada_id, categoria) do nothing;
