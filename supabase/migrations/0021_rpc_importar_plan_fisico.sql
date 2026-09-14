-- Etapa 6: un import de plan físico, entero o nada.
--
-- Mismo molde que importar_partido (0005): una llamada RPC vía PostgREST es
-- una única transacción, cualquier excepción aborta todo. security invoker,
-- sujeta a las mismas policies que un insert directo (0020) — sin elevación.
create or replace function importar_plan_fisico(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_club_id uuid;
  v_plan_id uuid;
  v_sesion_id uuid;
  v_ejercicio_id uuid;
  v_sesiones int := 0;
  v_ejercicios int := 0;
  v_pendientes int := 0;
  e jsonb;
  s jsonb;
  a jsonb;
begin
  v_club_id := (payload->>'clubId')::uuid;

  if coalesce(jsonb_array_length(payload->'sesiones'), 0) = 0 then
    raise exception 'PLAN_VACIO' using errcode = 'P0001';
  end if;

  -- EL PLAN PRIMERO, y no la biblioteca. El plan no depende de la biblioteca
  -- (sólo ejercicio_asignado la necesita, y va después), así que el orden se
  -- puede invertir sin romper nada.
  --
  -- El motivo es el mensaje: con la biblioteca primero, reimportar el mismo
  -- archivo choca antes con una clave de ejercicio ya cargada y responde
  -- EJERCICIO_DUPLICADO, que habla de un ejercicio cuando el problema es que
  -- el archivo ya está importado. Así, la colisión que salta primero es la
  -- que describe lo que realmente pasó.
  begin
    insert into plan_fisico (club_id, plantel_id, nombre_archivo, hash_archivo, advertencias)
    values (
      v_club_id,
      (payload->>'plantelId')::uuid,
      payload->>'nombreArchivo',
      payload->>'hashArchivo',
      coalesce(payload->'advertencias', '[]'::jsonb)
    )
    returning id into v_plan_id;
  exception when unique_violation then
    raise exception 'PLAN_DUPLICADO' using errcode = 'P0001';
  end;

  -- Después la biblioteca: los ejercicios de las sesiones la referencian.
  create temporary table ejercicios_nuevos_resueltos (
    clave text primary key,
    ejercicio_id uuid not null
  ) on commit drop;

  for e in select * from jsonb_array_elements(coalesce(payload->'ejerciciosNuevos', '[]'::jsonb))
  loop
    begin
      insert into ejercicio_fuerza (club_id, clave, nombre, bloque, link)
      values (v_club_id, e->>'clave', e->>'nombre', e->>'bloque', e->>'link')
      returning id into v_ejercicio_id;
    exception when unique_violation then
      raise exception 'EJERCICIO_DUPLICADO: %', e->>'nombre' using errcode = 'P0001';
    end;
    insert into ejercicios_nuevos_resueltos values (e->>'clave', v_ejercicio_id);
  end loop;

  for s in select * from jsonb_array_elements(payload->'sesiones')
  loop
    insert into sesion_fisico (club_id, plan_id, fecha)
    values (v_club_id, v_plan_id, (s->>'fecha')::date)
    returning id into v_sesion_id;
    v_sesiones := v_sesiones + 1;

    for a in select * from jsonb_array_elements(coalesce(s->'ejercicios', '[]'::jsonb))
    loop
      -- escalon_kg NO está en esta lista a propósito: queda NULL aunque el
      -- payload la traiga. El manejo de peso es por jugador y todavía no existe.
      insert into ejercicio_asignado (
        club_id, sesion_id, ejercicio_fuerza_id, orden, bloque,
        nombre_original, series, reps, carga_sugerida, pausa, notas
      )
      values (
        v_club_id,
        v_sesion_id,
        coalesce(
          (a->>'ejercicioFuerzaId')::uuid,
          (select ejercicio_id from ejercicios_nuevos_resueltos where clave = a->>'claveNueva')
        ),
        (a->>'orden')::int,
        a->>'bloque',
        a->>'nombreOriginal',
        (a->>'series')::int,
        a->>'reps',
        a->>'cargaSugerida',
        a->>'pausa',
        a->>'notas'
      );
      v_ejercicios := v_ejercicios + 1;
      if a->>'ejercicioFuerzaId' is null and a->>'claveNueva' is null then
        v_pendientes := v_pendientes + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'planId', v_plan_id,
    'sesiones', v_sesiones,
    'ejercicios', v_ejercicios,
    'pendientes', v_pendientes
  );
end;
$$;
