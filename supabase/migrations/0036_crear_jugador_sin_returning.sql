-- Crear jugadores sin `insert ... returning`.
--
-- Desde 0016, un profe no puede dar de alta a nadie a mano ni importar una
-- planilla con un jugador nuevo: `alta_jugador_manual` (0008) e
-- `importar_partido` (0005) hacen `insert into jugador ... returning id`, y un
-- RETURNING obliga a que la fila nueva pase la policy de LECTURA de jugador
-- (jugador_ver, 0016), que pide una pertenencia vigente a un plantel propio.
-- La pertenencia se inserta en la línea siguiente, así que Postgres corta con
-- "new row violates row-level security policy for table jugador" (42501) y
-- la pantalla lo mostraba como falta de permiso.
--
-- Arreglo: el id se genera antes del insert, igual que aprobar_solicitud_jugador
-- (0029). Nada más cambia de permisos: siguen siendo security invoker y la
-- pertenencia sigue exigiendo puede_escribir_plantel.
--
-- De paso, importar_partido deja de devolver un 23505 crudo cuando alguien
-- cargó al mismo chico mientras el import estaba abierto (otro profe con otra
-- planilla, o el mismo desde "Agregar jugador"): responde un código propio
-- para que la pantalla vuelva a leer el club y remapee.
--
-- Verificación: tests/verificarCrearJugador.sql, corriendo como authenticated.

create or replace function alta_jugador_manual(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_jugador_id uuid := gen_random_uuid();
begin
  begin
    insert into jugador (id, club_id, nombre_clave, nombre_limpio, desambiguador)
    values (
      v_jugador_id,
      (payload->>'clubId')::uuid,
      payload->>'nombreClave',
      payload->>'nombreLimpio',
      coalesce(payload->>'desambiguador', '')
    );
  exception when unique_violation then
    -- unique (club_id, nombre_clave, desambiguador) de 0001: la pantalla
    -- ofrece sumarlo a esta categoría en vez de mostrar un error crudo.
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

-- Igual que 0005 salvo por el id del jugador y los dos códigos de choque.
-- importacion y partido pueden seguir con returning: sus policies de lectura
-- (miembro del club; plantel propio) ya las cumple la fila recién escrita.
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

  -- `if not exists` + truncate: dos imports en la misma transacción (la
  -- verificación los encadena) no chocan con la tabla del anterior.
  create temporary table if not exists jugadores_resueltos (
    nombre_clave text primary key,
    jugador_id uuid not null
  ) on commit drop;
  truncate jugadores_resueltos;

  for j in select * from jsonb_array_elements(coalesce(payload->'jugadoresNuevos', '[]'::jsonb))
  loop
    v_jugador_id := gen_random_uuid();
    begin
      insert into jugador (id, club_id, nombre_clave, nombre_limpio, desambiguador)
      values (
        v_jugador_id,
        (payload->>'clubId')::uuid,
        j->>'nombreClave',
        j->>'nombreLimpio',
        coalesce(j->>'desambiguador', '')
      );
    exception when unique_violation then
      -- Lo cargaron en el club después de que la pantalla leyó la lista. Con
      -- la clave, la pantalla sabe a quién remapear.
      raise exception 'JUGADOR_YA_EXISTE: %', j->>'nombreClave' using errcode = 'P0001';
    end;

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
    begin
      insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
      values (
        (payload->>'clubId')::uuid,
        (j->>'jugadorId')::uuid,
        (j->>'plantelId')::uuid,
        (j->>'temporadaId')::uuid,
        (j->>'desde')::date
      );
    exception when unique_violation then
      -- pertenencia_activa_unica (0001): alguien ya lo sumó a este plantel
      -- mientras el import estaba abierto.
      raise exception 'PERTENENCIA_YA_VIGENTE' using errcode = 'P0001';
    end;
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

-- create or replace conserva los permisos de 0028; se repiten para que esta
-- migración se lea sola.
revoke execute on function alta_jugador_manual(jsonb) from public, anon;
revoke execute on function importar_partido(jsonb)    from public, anon;
grant  execute on function alta_jugador_manual(jsonb) to authenticated;
grant  execute on function importar_partido(jsonb)    to authenticated;
