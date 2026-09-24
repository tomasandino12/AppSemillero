-- Sprint de ida y vuelta (30 + 30 m): cada intento tiene dos tiempos desde el
-- pitido de salida. El profe toca *Giró* cuando el chico frena para dar la
-- vuelta y *Llegó* cuando vuelve a la línea de salida.
--
--   tiempo_ms   = el total (ida y vuelta), el dato principal: sobre ~10 s el
--                 error de un toque pesa menos que sobre ~5 s.
--   parcial_ms  = el de la ida (los primeros 20 o 30 m). La vuelta, con el
--                 giro adentro, es la resta y no se guarda.
--
-- `distancia_sprint_m` (0048) pasa a ser el largo de CADA tramo. Las filas de
-- antes (un solo tramo, sin parcial) quedan válidas: parcial NULL.
--
-- Los rangos están también en JS (sprint.js): tests/contratoSprint.test.js
-- compara los dos lados. guardar_sesion_medicion y mi_progreso se reemplazan
-- enteras partiendo de 0049 (tests/contratoRpc*.test.js las leen).


/* ---------- medicion_sprint: parcial y total más largo ---------- */

alter table medicion_sprint
  add column parcial_ms integer check (parcial_ms is null or parcial_ms between 2500 and 12000);

-- El total de un ida y vuelta pasa de 12 s: se ensancha el tope.
alter table medicion_sprint drop constraint medicion_sprint_tiempo_ms_check;
alter table medicion_sprint add constraint medicion_sprint_tiempo_ms_check
  check (tiempo_ms is null or tiempo_ms between 2500 and 30000);

-- Sin total no hay parcial (un ausente es una fila sin ningún tiempo), y la
-- vuelta no puede durar cero o menos.
alter table medicion_sprint add constraint medicion_sprint_parcial_menor_al_total
  check (parcial_ms is null or (tiempo_ms is not null and parcial_ms < tiempo_ms));

-- medicion_sprint conserva su revoke all (0048): la columna nueva se concede aparte.
grant insert (parcial_ms) on medicion_sprint to authenticated;

comment on column medicion_sprint.tiempo_ms is
  'Total del intento (ida y vuelta) en ms, desde el pitido. NULL = ausente (fila única, intento 1). v0048, ensanchado en 0050.';
comment on column medicion_sprint.parcial_ms is
  'Tiempo de la ida (cuando frena para girar), en ms desde el pitido. La vuelta es tiempo_ms - parcial_ms. NULL en las filas de antes de 0050. v0050.';


/* ---------- guardar_sesion_medicion: el sprint lleva el parcial ---------- */

create or replace function guardar_sesion_medicion(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_tipo text := payload->>'tipo';
  v_test_salto text := payload->>'testSalto';
  v_distancia smallint := (payload->>'distanciaSprintM')::smallint;
  v_club_id uuid := (payload->>'clubId')::uuid;
  v_plantel_id uuid := (payload->>'plantelId')::uuid;
  v_sesion_id uuid := coalesce((payload->>'sesionId')::uuid, gen_random_uuid());
  v_existente record;
  m jsonb;
begin
  if v_tipo not in ('tiro', 'salto', 'sprint', 'yoyo') then
    raise exception 'TIPO_DE_SESION_INVALIDO' using errcode = 'P0001';
  end if;
  -- El test va sólo en salto, y ahí es obligatorio. Qué tests existen lo dice
  -- el check de sesion_medicion.test_salto (0043), no esta función.
  if (v_tipo = 'salto') <> (v_test_salto is not null) then
    raise exception 'TEST_DE_SALTO_INVALIDO' using errcode = 'P0001';
  end if;
  -- La distancia va sólo en sprint, y ahí es obligatoria. Cuáles existen lo
  -- dice el check de sesion_medicion.distancia_sprint_m (0048).
  if (v_tipo = 'sprint') <> (v_distancia is not null) then
    raise exception 'DISTANCIA_DE_SPRINT_INVALIDA' using errcode = 'P0001';
  end if;

  begin
    insert into sesion_medicion (id, club_id, plantel_id, fecha, tipo, test_salto, distancia_sprint_m)
    values (v_sesion_id, v_club_id, v_plantel_id, (payload->>'fecha')::date, v_tipo, v_test_salto, v_distancia);
  exception when unique_violation then
    -- El id ya está. Si es una sesión de este mismo plantel, tipo, test y
    -- distancia, es este mismo guardado que vuelve: éxito, sin tocar nada. Si
    -- no se ve (RLS) o es de otro plantel, alguien mandó un id que no es suyo.
    select s.plantel_id, s.tipo, s.test_salto, s.distancia_sprint_m into v_existente
    from sesion_medicion s where s.id = v_sesion_id;
    if found and v_existente.plantel_id = v_plantel_id and v_existente.tipo = v_tipo
       and v_existente.test_salto is not distinct from v_test_salto
       and v_existente.distancia_sprint_m is not distinct from v_distancia then
      return jsonb_build_object('sesionId', v_sesion_id, 'filas', 0, 'yaGuardada', true);
    end if;
    raise exception 'SESION_AJENA' using errcode = 'P0001';
  end;

  if v_tipo = 'tiro' then
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      -- m->>'anotados' NULL (clave ausente o JSON null) es "no midió" (0010).
      insert into medicion_tiro (club_id, sesion_id, jugador_id, posicion, anotados, intentos)
      values (
        v_club_id,
        v_sesion_id,
        (m->>'jugadorId')::uuid,
        m->>'posicion',
        (m->>'anotados')::int,
        coalesce((m->>'intentos')::int, 10)
      );
    end loop;
  elsif v_tipo = 'salto' then
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      -- Sin coalesce en intento: si falta, que lo rechace el not null, no
      -- que se guarde como el 1 y choque con otro intento. Tiempo y fps NULL
      -- es ausente; los checks de 0043 exigen que vayan juntos.
      insert into medicion_salto (club_id, sesion_id, jugador_id, intento, tiempo_vuelo_ms, fps_captura)
      values (
        v_club_id,
        v_sesion_id,
        (m->>'jugadorId')::uuid,
        (m->>'intento')::smallint,
        (m->>'tiempoVueloMs')::numeric,
        (m->>'fpsCaptura')::numeric
      );
    end loop;
  elsif v_tipo = 'sprint' then
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      -- Igual que en salto: sin coalesce en intento. Tiempo NULL es ausente.
      -- tiempoMs es el total (ida y vuelta) y parcialMs el de la ida (0050).
      insert into medicion_sprint (club_id, sesion_id, jugador_id, intento, tiempo_ms, parcial_ms)
      values (
        v_club_id,
        v_sesion_id,
        (m->>'jugadorId')::uuid,
        (m->>'intento')::smallint,
        (m->>'tiempoMs')::int,
        (m->>'parcialMs')::int
      );
    end loop;
  else
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      -- Una fila por jugador (sin intentos). Idas NULL (clave ausente o JSON
      -- null) es "no corrió": ausente, nunca 0.
      insert into medicion_yoyo (club_id, sesion_id, jugador_id, idas)
      values (
        v_club_id,
        v_sesion_id,
        (m->>'jugadorId')::uuid,
        (m->>'idas')::smallint
      );
    end loop;
  end if;

  return jsonb_build_object(
    'sesionId', v_sesion_id,
    'filas', jsonb_array_length(coalesce(payload->'mediciones', '[]'::jsonb)),
    'yaGuardada', false
  );
end;
$$;

revoke execute on function guardar_sesion_medicion(jsonb) from public, anon;
grant  execute on function guardar_sesion_medicion(jsonb) to authenticated;


/* ---------- mi_progreso: los sprints traen el parcial ---------- */

-- Partidos, tiro, saltos, sprints, yoyos y la historia de pesos, todo de este
-- jugador. No hay ranking ni promedio del plantel, y por eso ninguna consulta
-- de acá suma filas de otros. Las medidas corporales (peso, altura, pierna)
-- quedan afuera a propósito (spec de 0030, sección 1).
--
-- Los porcentajes, la altura del salto y la velocidad del sprint no se
-- calculan acá: los calculan estadisticas.js, salto.js, sprint.js y yoyo.js.
create or replace function mi_progreso()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_jugador uuid := public.mi_jugador();
begin
  if v_jugador is null then
    return null;
  end if;

  return jsonb_build_object(
    'partidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'partidoId', pa.id,
        'fecha', pa.fecha,
        'rivalNombre', pa.rival_nombre,
        'condicion', pa.condicion_propia,
        'puntosPropios', pa.puntos_propios,
        'puntosRival', pa.puntos_rival,
        'minSegundos', e.min_segundos,
        'pts', e.pts,
        'dosAnotados', e.dos_anotados, 'dosIntentados', e.dos_intentados,
        'tresAnotados', e.tres_anotados, 'tresIntentados', e.tres_intentados,
        'libresAnotados', e.libres_anotados, 'libresIntentados', e.libres_intentados,
        'rebTot', e.reb_tot, 'ast', e.ast, 'val', e.val
      ) order by pa.fecha desc)
      from public.estadistica_jugador_partido e
      join public.partido pa on pa.id = e.partido_id
      where e.jugador_id = v_jugador
    ), '[]'::jsonb),
    'tiro', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sesionId', s.id, 'fecha', s.fecha, 'posicion', mt.posicion,
        'anotados', mt.anotados, 'intentos', mt.intentos
      ) order by s.fecha, mt.posicion)
      from public.medicion_tiro mt
      join public.sesion_medicion s on s.id = mt.sesion_id
      where mt.jugador_id = v_jugador and s.tipo = 'tiro'
    ), '[]'::jsonb),
    -- Una entrada por sesión, con sus intentos. Un ausente llega como un
    -- intento con tiempoVueloMs null, nunca como 0.
    'saltos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sesionId', s.id, 'fecha', s.fecha, 'test', s.test_salto,
        'intentos', (
          select jsonb_agg(jsonb_build_object(
            'intento', ms.intento, 'tiempoVueloMs', ms.tiempo_vuelo_ms
          ) order by ms.intento)
          from public.medicion_salto ms
          where ms.sesion_id = s.id and ms.jugador_id = v_jugador
        )
      ) order by s.fecha)
      from public.sesion_medicion s
      where s.tipo = 'salto'
        and exists (
          select 1 from public.medicion_salto ms
          where ms.sesion_id = s.id and ms.jugador_id = v_jugador)
    ), '[]'::jsonb),
    -- Igual que saltos. `origen` va porque la ficha rotula "CReAR · más exacto".
    'sprints', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sesionId', s.id, 'fecha', s.fecha, 'distanciaM', s.distancia_sprint_m,
        'intentos', (
          select jsonb_agg(jsonb_build_object(
            'intento', mp.intento, 'tiempoMs', mp.tiempo_ms, 'parcialMs', mp.parcial_ms, 'origen', mp.origen
          ) order by mp.intento)
          from public.medicion_sprint mp
          where mp.sesion_id = s.id and mp.jugador_id = v_jugador
        )
      ) order by s.fecha)
      from public.sesion_medicion s
      where s.tipo = 'sprint'
        and exists (
          select 1 from public.medicion_sprint mp
          where mp.sesion_id = s.id and mp.jugador_id = v_jugador)
    ), '[]'::jsonb),
    -- Una entrada por sesión en que corrió (o estuvo ausente: idas null).
    'yoyos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sesionId', s.id, 'fecha', s.fecha, 'idas', my.idas, 'origen', my.origen
      ) order by s.fecha)
      from public.sesion_medicion s
      join public.medicion_yoyo my on my.sesion_id = s.id
      where s.tipo = 'yoyo' and my.jugador_id = v_jugador
    ), '[]'::jsonb),
    'escalones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clave', pf.clave, 'nombre', pf.nombre, 'kg', m.kg, 'creadoEn', m.creado_en
      ) order by m.orden)
      from public.movimiento_escalon m
      join public.paso_fuerza pf on pf.id = m.escalera_id
      where m.jugador_id = v_jugador
    ), '[]'::jsonb)
  );
end;
$fn$;

revoke execute on function mi_progreso() from public, anon;
grant  execute on function mi_progreso() to authenticated;
