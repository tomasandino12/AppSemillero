-- Etapa 4: guardar una sesión de medición entera en una transacción.
--
-- Una batería de 14 jugadores son ~84 filas. El entrenador está en el
-- gimnasio con wifi inestable: o se guarda todo, o no se guarda nada y el
-- borrador local sigue intacto para reintentar. Una llamada RPC vía
-- PostgREST es una única transacción: cualquier excepción no capturada
-- aborta el bloque completo, incluida la sesión ya insertada.
--
-- security invoker: corre con los permisos del que llama, sujeto a las
-- mismas políticas RLS que un insert directo (0009). Sin elevación.
create or replace function guardar_sesion_medicion(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_sesion_id uuid;
  v_tipo text;
  v_club_id uuid;
  m jsonb;
begin
  v_tipo := payload->>'tipo';
  v_club_id := (payload->>'clubId')::uuid;

  if v_tipo not in ('tiro', 'velocidad') then
    raise exception 'TIPO_DE_SESION_INVALIDO' using errcode = 'P0001';
  end if;

  insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
  values (
    v_club_id,
    (payload->>'plantelId')::uuid,
    (payload->>'fecha')::date,
    v_tipo
  )
  returning id into v_sesion_id;

  if v_tipo = 'tiro' then
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      -- m->>'anotados' devuelve NULL tanto si la clave falta como si su
      -- valor es JSON null: los dos casos son "no midió", y NULL::int es NULL.
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
      values (
        v_club_id,
        v_sesion_id,
        (m->>'jugadorId')::uuid,
        (m->>'segundos')::numeric
      );
    end loop;
  end if;

  return jsonb_build_object(
    'sesionId', v_sesion_id,
    'filas', jsonb_array_length(coalesce(payload->'mediciones', '[]'::jsonb))
  );
end;
$$;
