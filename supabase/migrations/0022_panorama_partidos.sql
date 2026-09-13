-- Panorama de coordinación: tiro en partidos, además del de batería.
-- Ver docs/superpowers/specs/2026-09-13-panorama-partidos-design.md.
--
-- Desde 0018 el coordinador no lee partido ni estadistica_jugador_partido: la
-- serie no se puede armar en el cliente. Llega por panorama_del_club, que ya
-- es la única puerta del panorama: security definer, sólo coordinación de ese
-- club, sólo sumas.
--
-- Misma firma y mismas dos claves que en 0017 ('planteles' y 'tiro', copiadas
-- sin cambios); se agrega 'partidos'. create or replace conserva los grants.

do $$
begin
  if to_regprocedure('public.panorama_del_club(uuid)') is null then
    raise exception '0022 necesita 0017 aplicada (no existe panorama_del_club).';
  end if;
end $$;

-- partidos: una fila por partido de los planteles del club, con los tiros
-- sumados entre los jugadores de ese partido.
--
-- Anotados e intentados se suman DE A PARES: una fila entra a la suma de un
-- tipo sólo si trae los dos números. Una fracción tiene que salir de las
-- mismas filas arriba y abajo; un jugador con intentados leídos y anotados no
-- leídos inflaría el denominador.
--
-- left join: un partido importado sin ninguna estadística aparece igual, con
-- las sumas en null. No genera punto en la serie, pero existe.
--
-- rival es información pública de competencia (ver ESQUEMA.md, partido), no
-- un dato de menores. Ningún nombre de jugador sale de acá.
create or replace function panorama_del_club(p_club_id uuid)
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
    ), '[]'::jsonb),
    'partidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plantelId', p.plantel_id,
        'partidoId', p.partido_id,
        'fecha', p.fecha,
        'rival', p.rival,
        'tresAnotados', p.tres_anotados,
        'tresIntentados', p.tres_intentados,
        'libresAnotados', p.libres_anotados,
        'libresIntentados', p.libres_intentados
      ) order by p.fecha, p.partido_id)
      from (
        select pa.plantel_id, pa.id as partido_id, pa.fecha, pa.rival_nombre as rival,
               (sum(e.tres_anotados)
                  filter (where e.tres_anotados is not null and e.tres_intentados is not null))::int
                 as tres_anotados,
               (sum(e.tres_intentados)
                  filter (where e.tres_anotados is not null and e.tres_intentados is not null))::int
                 as tres_intentados,
               (sum(e.libres_anotados)
                  filter (where e.libres_anotados is not null and e.libres_intentados is not null))::int
                 as libres_anotados,
               (sum(e.libres_intentados)
                  filter (where e.libres_anotados is not null and e.libres_intentados is not null))::int
                 as libres_intentados
        from public.partido pa
        join public.plantel pl on pl.id = pa.plantel_id and pl.club_id = p_club_id
        left join public.estadistica_jugador_partido e on e.partido_id = pa.id
        group by pa.plantel_id, pa.id, pa.fecha, pa.rival_nombre
      ) p
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;
