-- Etapa 7: el peso inicial de cada chico lo siembra el import.
--
-- El número que el profe escribió como carga sugerida ("Barra Ol + 10 kg") es
-- su decisión sobre con cuánto arranca el grupo en ese ejercicio, no algo que la
-- app deduzca. Hasta ahora sólo se ofrecía al ponerle el peso a un chico, de a
-- uno; ahora se anota solo, en el momento del import, para todos.
--
-- Esto es un `create or replace` de la función de 0021: todo lo del plan, las
-- sesiones, los ejercicios asignados y la biblioteca de videos queda igual. Lo
-- único que se agrega es el bloque de siembra del final y el contador que
-- devuelve.
--
-- Qué siembra, y qué no:
--   * `payload.pesosIniciales` trae un ejercicio por nombre normalizado, con el
--     número de la sesión más temprana del import. Lo resuelve
--     prepararPayloadPlanFisico.js, que es donde vive `clavearNombre`: en SQL no
--     se normaliza ningún nombre, para que no haya dos criterios.
--   * Sólo los chicos con pertenencia vigente al plantel del plan, y sólo los
--     que todavía no tienen ningún peso en ese ejercicio. Una progresión ya
--     empezada no se pisa con el número del archivo.
--   * Todo en la misma transacción: si la siembra falla, no queda nada del
--     import, igual que cualquier otra parte de esta RPC.
--
-- Permisos: no hace falta tocar ninguno. Sigue siendo `security invoker`, y
-- quien importa ya necesita `puede_escribir_plantel` sobre ese plantel, que es
-- exactamente lo que pide la policy de insert de `movimiento_escalon`; los
-- grants de 0023 sobre `paso_fuerza` y `movimiento_escalon` ya alcanzan.
create or replace function importar_plan_fisico(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_club_id uuid;
  v_plantel_id uuid;
  v_plan_id uuid;
  v_sesion_id uuid;
  v_ejercicio_id uuid;
  v_paso_id uuid;
  v_sesiones int := 0;
  v_ejercicios int := 0;
  v_pendientes int := 0;
  v_sembrados int := 0;
  v_nuevos int;
  e jsonb;
  s jsonb;
  a jsonb;
  p jsonb;
begin
  v_club_id := (payload->>'clubId')::uuid;
  v_plantel_id := (payload->>'plantelId')::uuid;

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
      v_plantel_id,
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
      -- escalon_kg NO está en esta lista a propósito: la columna ya no existe
      -- (0023) y el peso es por jugador. pesoSugerido tampoco: no se guarda en
      -- la línea, se siembra abajo como movimiento de cada chico.
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

  -- La siembra va al final: no depende de nada del plan recién escrito, sólo
  -- del plantel y de lo que ya tenga cada chico.
  for p in select * from jsonb_array_elements(coalesce(payload->'pesosIniciales', '[]'::jsonb))
  loop
    -- La fila del ejercicio en paso_fuerza puede venir de un import anterior o
    -- de la pantalla de escalones. Si no está, se crea SIN escalón (paso null):
    -- el archivo dice con cuánto se arranca, no de a cuánto se sube. Es el mismo
    -- mecanismo que usa la pantalla cuando el profe anota un peso antes de
    -- definir el escalón (0024).
    select id into v_paso_id
    from paso_fuerza
    where club_id = v_club_id and clave = p->>'clave';

    if v_paso_id is null then
      begin
        insert into paso_fuerza (club_id, clave, nombre)
        values (v_club_id, p->>'clave', p->>'nombre')
        returning id into v_paso_id;
      exception when unique_violation then
        -- Otro import la creó en el medio: es la misma fila del mismo ejercicio.
        select id into v_paso_id
        from paso_fuerza
        where club_id = v_club_id and clave = p->>'clave';
      end;
    end if;

    -- `distinct`: un chico citado dos veces al mismo plantel (dos temporadas
    -- abiertas) es un solo jugador y un solo movimiento.
    --
    -- `not exists`: sólo arranca quien todavía no tiene ningún peso en este
    -- ejercicio. El que ya venía trabajando conserva el suyo, sin importar qué
    -- número traiga el archivo nuevo. La RLS no puede esconderle un movimiento
    -- a quien importa: son chicos con pertenencia vigente a un plantel que este
    -- profe puede escribir, así que ve toda su historia.
    insert into movimiento_escalon (club_id, jugador_id, escalera_id, kg)
    select distinct v_club_id, pe.jugador_id, v_paso_id, (p->>'kg')::numeric
    from pertenencia pe
    where pe.club_id = v_club_id
      and pe.plantel_id = v_plantel_id
      and pe.hasta is null
      and not exists (
        select 1
        from movimiento_escalon m
        where m.jugador_id = pe.jugador_id and m.escalera_id = v_paso_id
      );

    get diagnostics v_nuevos = row_count;
    v_sembrados := v_sembrados + v_nuevos;
  end loop;

  return jsonb_build_object(
    'planId', v_plan_id,
    'sesiones', v_sesiones,
    'ejercicios', v_ejercicios,
    'pendientes', v_pendientes,
    'pesosSembrados', v_sembrados
  );
end;
$$;
