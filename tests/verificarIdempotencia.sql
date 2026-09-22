-- Verificación de 0038 (guardados idempotentes).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role, después de aplicar 0038. O local:
--   docker exec -i supabase_db_modelo-datos-supabase psql -U postgres < tests/verificarIdempotencia.sql
--
-- LOS RESULTADOS SALEN COMO TABLA, una fila por caso: OK o FALLA.
--
-- NO DEJA NADA: todo dentro de un sub-bloque que se deshace al final.

drop table if exists verificacion_0038;
create temporary table verificacion_0038 (
  n integer primary key, caso text, estado text, detalle text
);

do $$
declare
  v_club uuid := '20000000-0000-0000-0000-000000000001';
  v_otro_club uuid := '00000000-0000-0000-0000-000000000001';
  v_rol_previo text := current_setting('role');
  v_u17 uuid; v_u21 uuid; v_t17 uuid;
  v_a uuid := gen_random_uuid();   -- entrenador U17M
  v_j uuid;
  v_ses_u21 uuid; v_rec_ajeno uuid;
  v_id uuid := gen_random_uuid();
  v_payload jsonb; v_res jsonb; v_res2 jsonb;
  n integer; txt text;

  nombres text[] := array[
    '1. La misma sesión mandada dos veces queda una sola vez',
    '2. Un sesionId de otro plantel: SESION_AJENA, nada escrito',
    '3. Sin sesionId, como antes',
    '4. El mismo recurso nuevo mandado dos veces queda uno, sin envíos repetidos',
    '5. Un recursoIdNuevo de otro club: RECURSO_AJENO'
  ];
  estados  text[] := array_fill('no corrió'::text, array[5]);
  detalles text[] := array_fill(''::text, array[5]);
  falla_setup text := null;
begin
  begin

    /* ---------- setup, como service role ---------- */

    select id, temporada_id into v_u17, v_t17 from plantel where club_id = v_club and categoria = 'U17M';
    select id into v_u21 from plantel where club_id = v_club and categoria = 'U21M';

    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    values (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'zztest-a@verificacion.invalid', now(), now(), now());
    insert into miembro_club (user_id, club_id, es_entrenador) values (v_a, v_club, true);
    insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen)
      values (v_a, v_club, v_u17, 'manual');

    v_j := gen_random_uuid();
    insert into jugador (id, club_id, nombre_clave, nombre_limpio) values (v_j, v_club, 'ZZTEST IDEM', 'ZZTEST, IDEM');
    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
      values (v_club, v_j, v_u17, v_t17, '2026-03-01');

    v_ses_u21 := gen_random_uuid();
    insert into sesion_medicion (id, club_id, plantel_id, fecha, tipo) values (v_ses_u21, v_club, v_u21, '2026-09-01', 'tiro');
    v_rec_ajeno := gen_random_uuid();
    insert into recurso (id, club_id, titulo, descripcion, creado_por)
      values (v_rec_ajeno, v_otro_club, 'ZZTEST', 'ZZTEST', v_a);

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

    v_payload := jsonb_build_object('clubId', v_club, 'plantelId', v_u17, 'fecha', '2026-09-22', 'tipo', 'tiro',
      'mediciones', jsonb_build_array(
        jsonb_build_object('jugadorId', v_j, 'posicion', 'frontal', 'anotados', 4),
        jsonb_build_object('jugadorId', v_j, 'posicion', 'libres', 'anotados', 7)));


    /* ---------- 1: la misma sesión dos veces ---------- */

    txt := '';
    v_res  := guardar_sesion_medicion(v_payload || jsonb_build_object('sesionId', v_id));
    v_res2 := guardar_sesion_medicion(v_payload || jsonb_build_object('sesionId', v_id));
    if (v_res->>'yaGuardada')::boolean or (v_res->>'filas')::int <> 2 then txt := txt || 'la primera no guardó normal; '; end if;
    if not (v_res2->>'yaGuardada')::boolean then txt := txt || 'la segunda no avisó yaGuardada; '; end if;
    select count(*) into n from medicion_tiro where sesion_id = v_id;
    if n <> 2 then txt := txt || n || ' filas en vez de 2; '; end if;
    estados[1] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[1] := case when txt = '' then 'Una sesión, dos filas; el reintento contesta yaGuardada.' else txt end;


    /* ---------- 2: sesionId de otro plantel ---------- */

    begin
      perform guardar_sesion_medicion(v_payload || jsonb_build_object('sesionId', v_ses_u21));
      txt := 'aceptó una sesión de U21M';
    exception when others then
      txt := case when sqlerrm = 'SESION_AJENA' then '' else sqlerrm end;
    end;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from medicion_tiro where sesion_id = v_ses_u21;
    if n <> 0 then txt := txt || '; escribió en la sesión ajena'; end if;
    perform set_config('role', 'authenticated', true);
    estados[2] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[2] := case when txt = '' then 'Rechazada, sin filas en la sesión de U21M.' else txt end;


    /* ---------- 3: sin sesionId ---------- */

    v_res  := guardar_sesion_medicion(v_payload);
    v_res2 := guardar_sesion_medicion(v_payload);
    estados[3] := case when v_res->>'sesionId' <> v_res2->>'sesionId' then 'OK' else 'FALLA' end;
    detalles[3] := case when estados[3] = 'OK' then 'Dos sesiones distintas, como antes de 0038.' else 'mismo id dos veces' end;


    /* ---------- 4: el mismo recurso nuevo dos veces ---------- */

    txt := '';
    v_id := gen_random_uuid();
    v_payload := jsonb_build_object('clubId', v_club, 'recursoIdNuevo', v_id, 'titulo', 'ZZTEST recurso',
      'descripcion', 'ZZTEST', 'fecha', '2026-09-22', 'jugadorIds', jsonb_build_array(v_j));
    v_res  := guardar_recurso(v_payload);
    v_res2 := guardar_recurso(v_payload);
    if v_res->>'recursoId' <> v_id::text or (v_res->>'yaGuardado')::boolean then txt := txt || 'la primera no usó el id o dijo yaGuardado; '; end if;
    if not (v_res2->>'yaGuardado')::boolean then txt := txt || 'la segunda no avisó yaGuardado; '; end if;
    select count(*) into n from recurso where id = v_id;
    if n <> 1 then txt := txt || n || ' recursos; '; end if;
    select count(*) into n from envio_recurso where recurso_id = v_id;
    if n <> 1 then txt := txt || n || ' envíos; '; end if;
    estados[4] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[4] := case when txt = '' then 'Un recurso y un envío; el reintento contesta yaGuardado.' else txt end;


    /* ---------- 5: recursoIdNuevo de otro club ---------- */

    begin
      perform guardar_recurso(v_payload || jsonb_build_object('recursoIdNuevo', v_rec_ajeno));
      txt := 'aceptó el id de un recurso de otro club';
    exception when others then
      txt := case when sqlerrm = 'RECURSO_AJENO' then '' else sqlerrm end;
    end;
    estados[5] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[5] := case when txt = '' then 'Rechazado sin mandar envíos.' else txt end;

    raise exception using errcode = 'ZY001', message = 'fin';

  exception
    when sqlstate 'ZY001' then null;
    when others then falla_setup := sqlerrm;
  end;

  perform set_config('role', v_rol_previo, true);

  if falla_setup is not null then
    insert into verificacion_0038 values
      (0, 'SETUP', 'ERROR', falla_setup || '  (los casos que no llegaron a correr dicen "no corrió")');
  end if;
  for i in 1..5 loop
    insert into verificacion_0038 values (i, nombres[i], estados[i], detalles[i]);
  end loop;
end $$;

select n as "#", caso, estado, detalle
from verificacion_0038
order by n;
