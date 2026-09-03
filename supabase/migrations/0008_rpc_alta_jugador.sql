-- Etapa 3: alta manual de jugador, transaccional.
--
-- Regla del proyecto: cualquier operación que inserte más de una fila va en
-- una única transacción. Acá son dos (jugador + su pertenencia): si la
-- segunda falla, la primera no puede quedar. El entrenador está en el
-- gimnasio con wifi inestable y no puede arreglar una fila huérfana desde
-- el celular.
--
-- security invoker: sigue sujeta a las mismas políticas RLS que un insert
-- directo del cliente (ver 0002_rls.sql). Sin elevación de privilegios.
create or replace function alta_jugador_manual(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_jugador_id uuid;
begin
  begin
    insert into jugador (club_id, nombre_clave, nombre_limpio, desambiguador)
    values (
      (payload->>'clubId')::uuid,
      payload->>'nombreClave',
      payload->>'nombreLimpio',
      coalesce(payload->>'desambiguador', '')
    )
    returning id into v_jugador_id;
  exception when unique_violation then
    -- unique (club_id, nombre_clave, desambiguador) en 0001_esquema_inicial.sql.
    -- Se relanza con un código propio para que la UI ofrezca "sumarlo a esta
    -- categoría" en vez de mostrar un error de Postgres crudo.
    raise exception 'JUGADOR_YA_EXISTE' using errcode = 'P0001';
  end;

  insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
  values (
    (payload->>'clubId')::uuid,
    v_jugador_id,
    (payload->>'plantelId')::uuid,
    (payload->>'temporadaId')::uuid,
    (payload->>'desde')::date
  );

  return jsonb_build_object('jugadorId', v_jugador_id);
end;
$$;
