-- Rollback de 0018: el coordinador vuelve a leer lo que leía con 0017.
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role. Commitea. No toca ninguna fila.

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
