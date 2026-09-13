-- El paso restrictivo: el coordinador deja de leer datos individuales.
--
-- Se aplica DESPUÉS de 0017, del deploy del panel, y de que el coordinador
-- revisó las asignaciones 'migracion'. Si el coordinador también entrena,
-- tiene que tener es_entrenador y sus categorías ANTES de esto, o se queda sin
-- sus datos. Ver docs/superpowers/specs/2026-09-13-panel-coordinacion-design.md
-- §5, pasos 5 a 7.

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
    -- Orden estable: quien consume esto pagina de a 1000.
    order by j.id;
end;
$fn$;
