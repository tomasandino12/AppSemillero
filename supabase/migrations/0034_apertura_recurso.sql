-- RECURSOS: cuántos jugadores abrieron cada recurso, nunca quiénes.
--
-- La regla que pone la pantalla ("ves cuántos, no quién") se hace cumplir acá,
-- no en la interfaz:
--   * apertura_recurso NO tiene grants ni policies: ni el jugador ni el cuerpo
--     técnico pueden leerla ni escribirla directo.
--   * El jugador escribe por registrar_apertura(), que sólo anota recursos que
--     se le enviaron a él.
--   * El cuerpo técnico lee por resumen_recursos(), que devuelve conteos y
--     ningún id de jugador. Con menos de 3 cuentas en el plantel no devuelve
--     cuántos abrieron: con 1 o 2, el profe sabe quiénes son y el "conteo"
--     sería un nombre.
--
-- Sólo cuenta a los jugadores CON CUENTA en la app (cuenta_jugador vigente):
-- de los demás no hay dato, y el resumen lo dice en vez de inventarlo.

do $$
begin
  if to_regprocedure('public.mi_jugador()') is null then
    raise exception '0034 necesita 0030 aplicada (no existe mi_jugador()).';
  end if;
end $$;


/* =====================================================================
   1. La tabla: cerrada a todos
   ===================================================================== */

create table apertura_recurso (
  recurso_id uuid not null,
  jugador_id uuid not null,
  club_id uuid not null references club(id),
  -- Sólo la primera vez: abrir el mismo recurso diez veces no suma. Nada de
  -- contadores ni de "última vez": no hay sello de actualización porque la
  -- fila no se modifica nunca (y nadie tiene update).
  primera_vez timestamptz not null default now(),
  primary key (recurso_id, jugador_id),
  foreign key (club_id, recurso_id) references recurso (club_id, id) on delete cascade,
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);

create index apertura_recurso_jugador_id_idx on apertura_recurso(jugador_id);

alter table apertura_recurso enable row level security;
revoke all on apertura_recurso from public, anon, authenticated;
-- Sin grant y sin policy a propósito. Las dos funciones de abajo corren como
-- dueño de la tabla.


/* =====================================================================
   2. registrar_apertura(): lo llama el jugador
   ===================================================================== */

-- Sin cuenta vigente, o con un recurso que no se le envió, no hace nada y no
-- avisa: el cliente la llama sin esperar respuesta y no debe poder averiguar
-- qué recursos existen.
create function registrar_apertura(p_recurso_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_jugador uuid := public.mi_jugador();
begin
  if v_jugador is null then
    return;
  end if;

  insert into public.apertura_recurso (recurso_id, jugador_id, club_id)
  select e.recurso_id, e.jugador_id, e.club_id
  from public.envio_recurso e
  where e.recurso_id = p_recurso_id and e.jugador_id = v_jugador
  on conflict do nothing;
end;
$fn$;


/* =====================================================================
   3. resumen_recursos(): lo lee el entrenador del plantel
   ===================================================================== */

-- Del plantel: cuántos jugadores tienen cuenta, cuántos abrieron algo y, por
-- cada recurso enviado a jugadores del plantel, a cuántos se envió, cuántos de
-- ésos tienen cuenta y cuántos lo abrieron. Cuenta también las primeras
-- aperturas de este mes y del anterior (hora de Argentina), para la tendencia.
--
-- Devuelve null a quien no es entrenador vigente del plantel. Los conteos de
-- aperturas salen null si hay menos de 3 cuentas (ver arriba).
create function resumen_recursos(p_plantel_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  c_minimo constant integer := 3;
  v_ahora timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_ini_mes timestamptz := date_trunc('month', v_ahora) at time zone 'America/Argentina/Buenos_Aires';
  v_ini_ant timestamptz := (date_trunc('month', v_ahora) - interval '1 month') at time zone 'America/Argentina/Buenos_Aires';
begin
  if not public.puede_ver_plantel(p_plantel_id) then
    return null;
  end if;

  return (
    with en_plantel as (
      select pe.jugador_id
      from public.pertenencia pe
      where pe.plantel_id = p_plantel_id and pe.hasta is null
    ),
    con_cuenta as (
      select p.jugador_id
      from en_plantel p
      join public.cuenta_jugador c on c.jugador_id = p.jugador_id and c.hasta is null
    ),
    por_recurso as (
      select e.recurso_id,
             count(*)::int as enviados,
             count(cc.jugador_id)::int as con_cuenta,
             count(a.jugador_id)::int as abrieron,
             (count(a.jugador_id) filter (where a.primera_vez >= v_ini_mes))::int as este_mes,
             (count(a.jugador_id) filter (where a.primera_vez >= v_ini_ant and a.primera_vez < v_ini_mes))::int as mes_anterior
      from public.envio_recurso e
      join en_plantel p on p.jugador_id = e.jugador_id
      left join con_cuenta cc on cc.jugador_id = e.jugador_id
      left join public.apertura_recurso a
        on a.recurso_id = e.recurso_id and a.jugador_id = cc.jugador_id
      group by e.recurso_id
    ),
    alguno as (
      select count(distinct a.jugador_id)::int as n
      from public.apertura_recurso a
      join con_cuenta cc on cc.jugador_id = a.jugador_id
    )
    select jsonb_build_object(
      'conCuenta', (select count(*)::int from con_cuenta),
      'abrieronAlguno', case when (select count(*) from con_cuenta) >= c_minimo then (select n from alguno) end,
      'recursos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'recursoId', r.recurso_id,
          'enviados', r.enviados,
          'conCuenta', r.con_cuenta,
          'abrieron', case when r.con_cuenta >= c_minimo then r.abrieron end,
          'primerasEsteMes', case when r.con_cuenta >= c_minimo then r.este_mes end,
          'primerasMesAnterior', case when r.con_cuenta >= c_minimo then r.mes_anterior end
        ))
        from por_recurso r
      ), '[]'::jsonb)
    )
  );
end;
$fn$;


/* =====================================================================
   4. Permisos de ejecución
   ===================================================================== */

revoke execute on function registrar_apertura(uuid) from public, anon;
revoke execute on function resumen_recursos(uuid)   from public, anon;

grant execute on function registrar_apertura(uuid) to authenticated;
grant execute on function resumen_recursos(uuid)   to authenticated;
