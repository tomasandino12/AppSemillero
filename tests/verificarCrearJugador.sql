-- Verificación de 0036 (crear jugadores sin insert ... returning).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role, después de aplicar 0036. O local:
--   docker exec -i supabase_db_modelo-datos-supabase psql -U postgres < tests/verificarCrearJugador.sql
--
-- LOS RESULTADOS SALEN COMO TABLA, una fila por caso: OK o FALLA.
--
-- NO DEJA NADA. Todo ocurre dentro de un sub-bloque que al final se deshace a
-- propósito con un SQLSTATE reservado. La impersonación (role = authenticated
-- + request.jwt.claims) es la misma con la que PostgREST evalúa RLS: sin ella,
-- corriendo como service role, el defecto que arregla 0036 no se ve.

drop table if exists verificacion_crear_jugador;
create temporary table verificacion_crear_jugador (
  n integer primary key, caso text, estado text, detalle text
);

do $$
declare
  v_club uuid := '20000000-0000-0000-0000-000000000001';
  v_rol_previo text := current_setting('role');
  v_u17 uuid; v_u21 uuid; v_t17 uuid; v_t21 uuid;
  v_a uuid := gen_random_uuid();   -- entrenador de U17M
  v_existente uuid;                -- ficha que ya está en U21M
  v_res jsonb;
  n integer; txt text;

  nombres text[] := array[
    '1. Alta manual en un plantel propio: jugador y pertenencia',
    '2. Alta manual en un plantel ajeno: falla y no deja nada',
    '3. Alta manual con un nombre que ya existe: JUGADOR_YA_EXISTE',
    '4. Import con un jugador nuevo: partido, jugador, pertenencia y estadística',
    '5. Import con un "nuevo" que ya existe: JUGADOR_YA_EXISTE: <clave>, sin restos',
    '6. Import que repite una pertenencia vigente: PERTENENCIA_YA_VIGENTE, sin restos'
  ];
  estados  text[] := array_fill('no corrió'::text, array[6]);
  detalles text[] := array_fill(''::text, array[6]);
  falla_setup text := null;

  -- Payload de import con un jugador nuevo en U17M; cada caso cambia lo suyo.
  v_payload jsonb;
begin
  begin

    /* ---------- setup, como service role ---------- */

    select id, temporada_id into v_u17, v_t17 from plantel where club_id = v_club and categoria = 'U17M';
    select id, temporada_id into v_u21, v_t21 from plantel where club_id = v_club and categoria = 'U21M';
    if v_u17 is null or v_u21 is null then
      raise exception 'No encontré U17M y U21M en el club del piloto.';
    end if;

    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    values (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'zztest-a@verificacion.invalid', now(), now(), now());
    insert into miembro_club (user_id, club_id, es_entrenador) values (v_a, v_club, true);
    insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen)
      values (v_a, v_club, v_u17, 'manual');

    insert into jugador (club_id, nombre_clave, nombre_limpio)
      values (v_club, 'ZZTEST EXISTENTE', 'ZZTEST, EXISTENTE') returning id into v_existente;
    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
      values (v_club, v_existente, v_u21, v_t21, '2026-03-01');

    v_payload := jsonb_build_object(
      'clubId', v_club, 'hashArchivo', 'zztest-hash-1', 'idPartidoCabb', null,
      'nombreArchivo', 'zztest.xlsx', 'advertencias', '[]'::jsonb,
      'partido', jsonb_build_object('plantelId', v_u17, 'fecha', '2026-09-20',
        'condicionPropia', 'local', 'rivalNombre', 'ZZTEST RIVAL', 'puntosPropios', 70, 'puntosRival', 60),
      'jugadoresNuevos', jsonb_build_array(jsonb_build_object(
        'nombreClave', 'ZZTEST IMPORTADO', 'nombreLimpio', 'ZZTEST, IMPORTADO',
        'pertenenciaPropuesta', jsonb_build_object('plantelId', v_u17, 'temporadaId', v_t17, 'desde', '2026-09-20'))),
      'pertenenciasNuevas', '[]'::jsonb,
      'estadisticas', jsonb_build_array(jsonb_build_object(
        'nombreClave', 'ZZTEST IMPORTADO', 'nombreCrudo', 'ZZTEST, IMPORTADO', 'numero', '7', 'pts', 12)));

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);


    /* ---------- 1: alta manual propia ---------- */

    txt := '';
    begin
      v_res := alta_jugador_manual(jsonb_build_object(
        'clubId', v_club, 'nombreClave', 'ZZTEST MANUAL', 'nombreLimpio', 'ZZTEST, MANUAL',
        'plantelId', v_u17, 'temporadaId', v_t17, 'desde', '2026-09-22'));
      select count(*) into n from pertenencia
        where jugador_id = (v_res->>'jugadorId')::uuid and plantel_id = v_u17 and hasta is null;
      if n <> 1 then txt := 'el jugador quedó sin su pertenencia'; end if;
    exception when others then
      txt := sqlerrm;
    end;
    estados[1] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[1] := case when txt = '' then 'El profe de U17M da de alta y ve al chico en su plantel.' else txt end;


    /* ---------- 2: alta manual ajena ---------- */

    txt := '';
    begin
      perform alta_jugador_manual(jsonb_build_object(
        'clubId', v_club, 'nombreClave', 'ZZTEST AJENO', 'nombreLimpio', 'ZZTEST, AJENO',
        'plantelId', v_u21, 'temporadaId', v_t21, 'desde', '2026-09-22'));
      txt := 'dio de alta en U21M sin tenerlo asignado; ';
    exception when others then null;
    end;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from jugador where club_id = v_club and nombre_clave = 'ZZTEST AJENO';
    if n <> 0 then txt := txt || 'quedó un jugador suelto; '; end if;
    perform set_config('role', 'authenticated', true);
    estados[2] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[2] := case when txt = '' then 'Rechazado por RLS y sin jugador huérfano.' else txt end;


    /* ---------- 3: alta manual repetida ---------- */

    begin
      perform alta_jugador_manual(jsonb_build_object(
        'clubId', v_club, 'nombreClave', 'ZZTEST EXISTENTE', 'nombreLimpio', 'ZZTEST, EXISTENTE',
        'plantelId', v_u17, 'temporadaId', v_t17, 'desde', '2026-09-22'));
      txt := 'creó un duplicado';
    exception when others then
      txt := case when sqlerrm = 'JUGADOR_YA_EXISTE' then '' else sqlerrm end;
    end;
    estados[3] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[3] := case when txt = '' then 'Mismo nombre en el club: código propio, sin duplicar.' else txt end;


    /* ---------- 4: import con un jugador nuevo ---------- */

    txt := '';
    begin
      v_res := importar_partido(v_payload);
      select count(*) into n
      from estadistica_jugador_partido e
      join jugador j on j.id = e.jugador_id
      join pertenencia pe on pe.jugador_id = j.id and pe.plantel_id = v_u17 and pe.hasta is null
      where e.partido_id = (v_res->>'partidoId')::uuid and j.nombre_clave = 'ZZTEST IMPORTADO';
      if n <> 1 then txt := 'faltan el jugador, su pertenencia o su estadística'; end if;
    exception when others then
      txt := sqlerrm;
    end;
    estados[4] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[4] := case when txt = '' then 'El import crea al jugador nuevo con todo lo suyo.' else txt end;


    /* ---------- 5: import con un "nuevo" que ya existe ---------- */

    begin
      perform importar_partido(jsonb_set(jsonb_set(jsonb_set(v_payload,
        '{hashArchivo}', '"zztest-hash-2"'),
        '{jugadoresNuevos,0,nombreClave}', '"ZZTEST EXISTENTE"'),
        '{estadisticas,0,nombreClave}', '"ZZTEST EXISTENTE"'));
      txt := 'creó un duplicado';
    exception when others then
      txt := case when sqlerrm = 'JUGADOR_YA_EXISTE: ZZTEST EXISTENTE' then '' else sqlerrm end;
    end;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from importacion where club_id = v_club and hash_archivo = 'zztest-hash-2';
    if n <> 0 then txt := txt || '; quedó la importación'; end if;
    perform set_config('role', 'authenticated', true);
    estados[5] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[5] := case when txt = '' then 'Código con la clave del jugador y nada a medias.' else txt end;


    /* ---------- 6: import que repite una pertenencia vigente ---------- */

    begin
      perform importar_partido(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_payload,
        '{hashArchivo}', '"zztest-hash-3"'),
        '{jugadoresNuevos}', '[]'),
        '{pertenenciasNuevas}', jsonb_build_array(jsonb_build_object(
          'jugadorId', (select id from jugador where club_id = v_club and nombre_clave = 'ZZTEST IMPORTADO'),
          'plantelId', v_u17, 'temporadaId', v_t17, 'desde', '2026-09-20'))),
        '{estadisticas}', '[]'));
      txt := 'duplicó la pertenencia';
    exception when others then
      txt := case when sqlerrm = 'PERTENENCIA_YA_VIGENTE' then '' else sqlerrm end;
    end;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from importacion where club_id = v_club and hash_archivo = 'zztest-hash-3';
    if n <> 0 then txt := txt || '; quedó la importación'; end if;
    estados[6] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[6] := case when txt = '' then 'Código propio (el profe sumó al chico mientras importaba) y nada a medias.' else txt end;

    raise exception using errcode = 'ZY001', message = 'fin';

  exception
    when sqlstate 'ZY001' then null;
    when others then falla_setup := sqlerrm;
  end;

  perform set_config('role', v_rol_previo, true);

  if falla_setup is not null then
    insert into verificacion_crear_jugador values
      (0, 'SETUP', 'ERROR', falla_setup || '  (los casos que no llegaron a correr dicen "no corrió")');
  end if;
  for i in 1..6 loop
    insert into verificacion_crear_jugador values (i, nombres[i], estados[i], detalles[i]);
  end loop;
end $$;

select n as "#", caso, estado, detalle
from verificacion_crear_jugador
order by n;
