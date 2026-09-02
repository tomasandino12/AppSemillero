-- Etapa 2B: cierra la deuda de atomicidad de la Etapa 2A (ver ESQUEMA.md
-- "Orden de persistencia de una importación" / "Gap de atomicidad conocido").
-- Una llamada RPC vía PostgREST es una única transacción: cualquier
-- excepción no capturada aborta todo el bloque, sin datos parciales.
--
-- security invoker: corre con los permisos del usuario que llama, sujeto
-- a las mismas políticas RLS que si insertara cada fila por separado
-- (ver 0002_rls.sql) — no hay elevación de privilegios acá.
create or replace function importar_partido(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_importacion_id uuid;
  v_partido_id uuid;
  v_jugador_id uuid;
  j jsonb;
  e jsonb;
begin
  begin
    insert into importacion (club_id, hash_archivo, id_partido_cabb, nombre_archivo, advertencias)
    values (
      (payload->>'clubId')::uuid,
      payload->>'hashArchivo',
      payload->>'idPartidoCabb',
      payload->>'nombreArchivo',
      coalesce(payload->'advertencias', '[]'::jsonb)
    )
    returning id into v_importacion_id;
  exception when unique_violation then
    raise exception 'IMPORTACION_DUPLICADA' using errcode = 'P0001';
  end;

  insert into partido (club_id, plantel_id, importacion_id, fecha, condicion_propia, rival_nombre, puntos_propios, puntos_rival)
  values (
    (payload->>'clubId')::uuid,
    (payload->'partido'->>'plantelId')::uuid,
    v_importacion_id,
    (payload->'partido'->>'fecha')::date,
    payload->'partido'->>'condicionPropia',
    payload->'partido'->>'rivalNombre',
    (payload->'partido'->>'puntosPropios')::int,
    (payload->'partido'->>'puntosRival')::int
  )
  returning id into v_partido_id;

  create temporary table jugadores_resueltos (
    nombre_clave text primary key,
    jugador_id uuid not null
  ) on commit drop;

  for j in select * from jsonb_array_elements(coalesce(payload->'jugadoresNuevos', '[]'::jsonb))
  loop
    insert into jugador (club_id, nombre_clave, nombre_limpio, desambiguador)
    values (
      (payload->>'clubId')::uuid,
      j->>'nombreClave',
      j->>'nombreLimpio',
      coalesce(j->>'desambiguador', '')
    )
    returning id into v_jugador_id;

    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
    values (
      (payload->>'clubId')::uuid,
      v_jugador_id,
      (j->'pertenenciaPropuesta'->>'plantelId')::uuid,
      (j->'pertenenciaPropuesta'->>'temporadaId')::uuid,
      (j->'pertenenciaPropuesta'->>'desde')::date
    );

    insert into jugadores_resueltos (nombre_clave, jugador_id) values (j->>'nombreClave', v_jugador_id);
  end loop;

  for j in select * from jsonb_array_elements(coalesce(payload->'pertenenciasNuevas', '[]'::jsonb))
  loop
    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
    values (
      (payload->>'clubId')::uuid,
      (j->>'jugadorId')::uuid,
      (j->>'plantelId')::uuid,
      (j->>'temporadaId')::uuid,
      (j->>'desde')::date
    );
  end loop;

  for e in select * from jsonb_array_elements(payload->'estadisticas')
  loop
    insert into estadistica_jugador_partido (
      club_id, partido_id, jugador_id, numero, nombre_crudo, min_segundos, pts,
      dos_anotados, dos_intentados, dos_porcentaje,
      tres_anotados, tres_intentados, tres_porcentaje,
      libres_anotados, libres_intentados, libres_porcentaje,
      reb_def, reb_of, reb_tot, ast, rec, per,
      tap_cometidos, tap_recibidos, fal_cometidas, fal_recibidas, val, mas_menos
    )
    values (
      (payload->>'clubId')::uuid,
      v_partido_id,
      coalesce(
        (e->>'jugadorId')::uuid,
        (select jugador_id from jugadores_resueltos where nombre_clave = e->>'nombreClave')
      ),
      e->>'numero', e->>'nombreCrudo', (e->>'minSegundos')::int, (e->>'pts')::int,
      (e->>'dosAnotados')::int, (e->>'dosIntentados')::int, (e->>'dosPorcentaje')::int,
      (e->>'tresAnotados')::int, (e->>'tresIntentados')::int, (e->>'tresPorcentaje')::int,
      (e->>'libresAnotados')::int, (e->>'libresIntentados')::int, (e->>'libresPorcentaje')::int,
      (e->>'rebDef')::int, (e->>'rebOf')::int, (e->>'rebTot')::int,
      (e->>'ast')::int, (e->>'rec')::int, (e->>'per')::int,
      (e->>'tapCometidos')::int, (e->>'tapRecibidos')::int,
      (e->>'falCometidas')::int, (e->>'falRecibidas')::int,
      (e->>'val')::int, (e->>'masMenos')::int
    );
  end loop;

  return jsonb_build_object('partidoId', v_partido_id, 'importacionId', v_importacion_id);
end;
$$;
