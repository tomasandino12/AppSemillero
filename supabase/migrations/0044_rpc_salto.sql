-- Salto (0043): guardar una sesión de salto y que el jugador vea la suya.
--
-- Las dos funciones se reemplazan enteras, partiendo de su última versión:
-- guardar_sesion_medicion de 0038 (idempotente por sesionId) y mi_progreso
-- de 0030. Lo único nuevo es la rama 'salto' y la clave 'saltos'; el resto
-- es copia textual. tests/contratoRpcSalto.test.js verifica que no se haya
-- perdido ninguna rama ni ninguna garantía de 0030.


/* ---------- guardar_sesion_medicion: rama 'salto' ---------- */

-- Payload de salto: testSalto ('cmj' | 'abalakov') y mediciones con
-- { jugadorId, intento, tiempoVueloMs, fpsCaptura }. Un ausente es
-- { jugadorId, intento: 1 } sin tiempo ni fps (lo arma prepararPayloadSalto).
create or replace function guardar_sesion_medicion(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_tipo text := payload->>'tipo';
  v_test_salto text := payload->>'testSalto';
  v_club_id uuid := (payload->>'clubId')::uuid;
  v_plantel_id uuid := (payload->>'plantelId')::uuid;
  v_sesion_id uuid := coalesce((payload->>'sesionId')::uuid, gen_random_uuid());
  v_existente record;
  m jsonb;
begin
  if v_tipo not in ('tiro', 'velocidad', 'salto') then
    raise exception 'TIPO_DE_SESION_INVALIDO' using errcode = 'P0001';
  end if;
  -- El test va sólo en salto, y ahí es obligatorio. Qué tests existen lo dice
  -- el check de sesion_medicion.test_salto (0043), no esta función.
  if (v_tipo = 'salto') <> (v_test_salto is not null) then
    raise exception 'TEST_DE_SALTO_INVALIDO' using errcode = 'P0001';
  end if;

  begin
    insert into sesion_medicion (id, club_id, plantel_id, fecha, tipo, test_salto)
    values (v_sesion_id, v_club_id, v_plantel_id, (payload->>'fecha')::date, v_tipo, v_test_salto);
  exception when unique_violation then
    -- El id ya está. Si es una sesión de este mismo plantel, tipo y test, es
    -- este mismo guardado que vuelve: éxito, sin tocar nada. Si no se ve (RLS)
    -- o es de otro plantel, alguien mandó un id que no es suyo.
    select s.plantel_id, s.tipo, s.test_salto into v_existente
    from sesion_medicion s where s.id = v_sesion_id;
    if found and v_existente.plantel_id = v_plantel_id and v_existente.tipo = v_tipo
       and v_existente.test_salto is not distinct from v_test_salto then
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
  elsif v_tipo = 'velocidad' then
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      insert into medicion_velocidad (club_id, sesion_id, jugador_id, segundos)
      values (v_club_id, v_sesion_id, (m->>'jugadorId')::uuid, (m->>'segundos')::numeric);
    end loop;
  else
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


/* ---------- mi_progreso: suma 'saltos' ---------- */

-- Partidos, tiro, velocidad, saltos y la historia de pesos, todo de este
-- jugador. No hay ranking ni promedio del plantel, y por eso ninguna consulta
-- de acá suma filas de otros. Las medidas corporales (peso, altura, pierna)
-- quedan afuera a propósito (spec de 0030, sección 1): por eso los saltos
-- van sin potencia, que sale del peso.
--
-- Los porcentajes y la altura del salto no se calculan acá: los calculan
-- estadisticas.js y salto.js, que es donde viven las reglas y el redondeo.
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
    'velocidad', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sesionId', s.id, 'fecha', s.fecha, 'segundos', mv.segundos
      ) order by s.fecha)
      from public.medicion_velocidad mv
      join public.sesion_medicion s on s.id = mv.sesion_id
      where mv.jugador_id = v_jugador and s.tipo = 'velocidad'
    ), '[]'::jsonb),
    -- Una entrada por sesión, con sus intentos. Un ausente llega como un
    -- intento con tiempoVueloMs null, igual que velocidad con segundos null.
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
