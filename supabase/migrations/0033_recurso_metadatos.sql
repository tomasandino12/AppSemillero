-- Rediseño de RECURSOS: tipo, veces por semana y minutos de cada recurso.
-- Los tres los carga el profe y son opcionales: NULL es "no lo dijo", no un
-- valor. Los recursos viejos quedan con los tres en NULL y se muestran igual.
--
-- La lista de tipos y los rangos también viven en src/data/recursos.js;
-- tests/contratoRecurso.test.js compara las dos copias.

alter table recurso
  add column tipo text
    constraint recurso_tipo_lista check (tipo in (
      'tiro', 'pies', 'manejo', 'fisico', 'lectura', 'otro')),
  add column frecuencia_semanal smallint
    constraint recurso_frecuencia_rango check (frecuencia_semanal between 1 and 7),
  add column minutos smallint
    constraint recurso_minutos_rango check (minutos between 1 and 180);

-- Los grants de escritura de `recurso` son por columna (0027): las nuevas hay
-- que sumarlas a mano o la RPC, que corre como el usuario, no puede llenarlas.
grant insert (tipo, frecuencia_semanal, minutos) on recurso to authenticated;

-- Misma función que 0011 con las tres claves nuevas del payload. Una clave
-- ausente o null deja la columna en NULL.
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
    insert into recurso (club_id, titulo, descripcion, enlace, tipo, frecuencia_semanal, minutos)
    values (
      v_club_id,
      payload->>'titulo',
      payload->>'descripcion',
      payload->>'enlace',
      payload->>'tipo',
      (payload->>'frecuenciaSemanal')::smallint,
      (payload->>'minutos')::smallint
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

revoke execute on function guardar_recurso(jsonb) from public, anon;
grant execute on function guardar_recurso(jsonb) to authenticated;
