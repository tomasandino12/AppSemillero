-- Guardados que se pueden reintentar sin duplicar (auditoría 2026-09-22, #6).
--
-- En el gimnasio pasa esto: guardar_sesion_medicion se confirma en la base,
-- pero la respuesta no llega (se cortó el wifi justo después). El profe ve
-- "sin conexión", reintenta desde el borrador, y queda una segunda sesión con
-- las mismas ~84 filas: el panorama y el progreso del chico cuentan todo dos
-- veces. Con guardar_recurso pasa lo mismo (un recurso repetido).
--
-- El arreglo es el de siempre para esto: el cliente genera el id UNA vez, lo
-- guarda con el borrador y lo manda en cada intento. Si la fila ya existe, es
-- el mismo guardado que llega de nuevo y se contesta como éxito sin escribir.
-- Sin id, las dos funciones hacen exactamente lo de antes.
--
-- Verificación: tests/verificarIdempotencia.sql.

create or replace function guardar_sesion_medicion(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_tipo text := payload->>'tipo';
  v_club_id uuid := (payload->>'clubId')::uuid;
  v_plantel_id uuid := (payload->>'plantelId')::uuid;
  v_sesion_id uuid := coalesce((payload->>'sesionId')::uuid, gen_random_uuid());
  v_existente record;
  m jsonb;
begin
  if v_tipo not in ('tiro', 'velocidad') then
    raise exception 'TIPO_DE_SESION_INVALIDO' using errcode = 'P0001';
  end if;

  begin
    insert into sesion_medicion (id, club_id, plantel_id, fecha, tipo)
    values (v_sesion_id, v_club_id, v_plantel_id, (payload->>'fecha')::date, v_tipo);
  exception when unique_violation then
    -- El id ya está. Si es una sesión de este mismo plantel y tipo, es este
    -- mismo guardado que vuelve: éxito, sin tocar nada. Si no se ve (RLS) o
    -- es de otro plantel, alguien mandó un id que no es suyo.
    select s.plantel_id, s.tipo into v_existente
    from sesion_medicion s where s.id = v_sesion_id;
    if found and v_existente.plantel_id = v_plantel_id and v_existente.tipo = v_tipo then
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
  else
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      insert into medicion_velocidad (club_id, sesion_id, jugador_id, segundos)
      values (v_club_id, v_sesion_id, (m->>'jugadorId')::uuid, (m->>'segundos')::numeric);
    end loop;
  end if;

  return jsonb_build_object(
    'sesionId', v_sesion_id,
    'filas', jsonb_array_length(coalesce(payload->'mediciones', '[]'::jsonb)),
    'yaGuardada', false
  );
end;
$$;

-- recursoId sigue siendo "agregar envíos a un recurso que ya existe" (0011).
-- recursoIdNuevo es el id que el cliente eligió para uno nuevo: si ya existe
-- en el club, es el mismo alta que vuelve y sólo se completan los envíos que
-- falten (que ya eran idempotentes por el on conflict).
create or replace function guardar_recurso(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_club_id uuid := (payload->>'clubId')::uuid;
  v_recurso_id uuid := (payload->>'recursoId')::uuid;
  v_ya_guardado boolean := false;
  j jsonb;
begin
  if v_recurso_id is null then
    v_recurso_id := coalesce((payload->>'recursoIdNuevo')::uuid, gen_random_uuid());
    begin
      insert into recurso (id, club_id, titulo, descripcion, enlace, tipo, frecuencia_semanal, minutos)
      values (
        v_recurso_id,
        v_club_id,
        payload->>'titulo',
        payload->>'descripcion',
        payload->>'enlace',
        payload->>'tipo',
        (payload->>'frecuenciaSemanal')::smallint,
        (payload->>'minutos')::smallint
      );
    exception when unique_violation then
      -- recurso_leer deja ver todo lo del club: si no se ve, es de otro club.
      if not exists (select 1 from recurso r where r.id = v_recurso_id and r.club_id = v_club_id) then
        raise exception 'RECURSO_AJENO' using errcode = 'P0001';
      end if;
      v_ya_guardado := true;
    end;
  end if;

  for j in select * from jsonb_array_elements(coalesce(payload->'jugadorIds', '[]'::jsonb))
  loop
    insert into envio_recurso (club_id, recurso_id, jugador_id, fecha)
    values (v_club_id, v_recurso_id, (j#>>'{}')::uuid, (payload->>'fecha')::date)
    on conflict (recurso_id, jugador_id) do nothing;
  end loop;

  return jsonb_build_object('recursoId', v_recurso_id, 'yaGuardado', v_ya_guardado);
end;
$$;

-- Los grants de recurso son por columna (0027): el id que manda el cliente
-- necesita el suyo. sesion_medicion conserva el grant de tabla de 0009.
grant insert (id) on recurso to authenticated;

revoke execute on function guardar_sesion_medicion(jsonb) from public, anon;
revoke execute on function guardar_recurso(jsonb)         from public, anon;
grant  execute on function guardar_sesion_medicion(jsonb) to authenticated;
grant  execute on function guardar_recurso(jsonb)         to authenticated;
