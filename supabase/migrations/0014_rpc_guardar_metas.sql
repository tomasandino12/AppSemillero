-- Guardar las metas de un plantel en una sola transacción.
--
-- Son hasta 6 filas (5 zonas del arco más libres). La regla del proyecto es
-- que toda escritura de más de una fila va en una transacción: media tabla de
-- metas guardada y media vieja le mostraría al entrenador una mezcla de dos
-- decisiones distintas.
--
-- Una zona con objetivoPct null BORRA su meta. "Sin meta" es la ausencia de
-- fila, nunca un cero: 0% es una meta válida y distinta de no tener ninguna.
--
-- security invoker: corre con los permisos del que llama, sujeto a las mismas
-- políticas RLS que un insert directo (0013). Sin elevación.
create or replace function guardar_metas_plantel(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_club_id uuid;
  v_plantel_id uuid;
  v_guardadas int := 0;
  v_borradas int := 0;
  m jsonb;
  v_pct int;
begin
  v_club_id := (payload->>'clubId')::uuid;
  v_plantel_id := (payload->>'plantelId')::uuid;

  for m in select * from jsonb_array_elements(coalesce(payload->'metas', '[]'::jsonb))
  loop
    -- m->>'objetivoPct' da NULL tanto si la clave falta como si su valor es
    -- JSON null; los dos casos significan "sin meta".
    v_pct := (m->>'objetivoPct')::int;

    if v_pct is null then
      delete from meta_zona
      where club_id = v_club_id
        and plantel_id = v_plantel_id
        and zona = m->>'zona';
      v_borradas := v_borradas + 1;
    else
      insert into meta_zona (club_id, plantel_id, zona, objetivo_pct)
      values (v_club_id, v_plantel_id, m->>'zona', v_pct)
      on conflict (plantel_id, zona)
      do update set objetivo_pct = excluded.objetivo_pct;
      v_guardadas := v_guardadas + 1;
    end if;
  end loop;

  return jsonb_build_object('guardadas', v_guardadas, 'borradas', v_borradas);
end;
$$;
