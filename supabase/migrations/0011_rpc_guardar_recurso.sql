-- Etapa 4: crear un recurso y sus envíos en una sola transacción.
--
-- Crear el recurso y no registrar a quién se le mandó deja exactamente el
-- agujero de memoria que la app existe para tapar. security invoker, igual
-- que el resto (ver 0005 y 0008).
create or replace function guardar_recurso(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_recurso_id uuid;
  v_club_id uuid;
  j jsonb;
begin
  v_club_id := (payload->>'clubId')::uuid;
  v_recurso_id := (payload->>'recursoId')::uuid;

  -- Sin recursoId se crea uno nuevo; con recursoId se agregan envíos a uno
  -- que ya existe (reenviar a más jugadores sin duplicar el recurso).
  if v_recurso_id is null then
    insert into recurso (club_id, titulo, descripcion, enlace)
    values (
      v_club_id,
      payload->>'titulo',
      payload->>'descripcion',
      payload->>'enlace'
    )
    returning id into v_recurso_id;
  end if;

  for j in select * from jsonb_array_elements(coalesce(payload->'jugadorIds', '[]'::jsonb))
  loop
    insert into envio_recurso (club_id, recurso_id, jugador_id, fecha)
    values (
      v_club_id,
      v_recurso_id,
      (j#>>'{}')::uuid,
      (payload->>'fecha')::date
    )
    -- Reenviar a quien ya lo tenía no es un error: la intención "estos
    -- jugadores tienen que tener este recurso" queda satisfecha igual.
    on conflict (recurso_id, jugador_id) do nothing;
  end loop;

  return jsonb_build_object('recursoId', v_recurso_id);
end;
$$;
