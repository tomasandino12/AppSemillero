-- Rollback de 0022: panorama_del_club vuelve a su forma de 0017 (sin la clave
-- 'partidos'). Pegado entero en el SQL Editor, como service role. Commitea.
-- No toca ninguna fila.

begin;

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
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$fn$;

commit;
