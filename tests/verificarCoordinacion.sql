-- Verificación de 0017 y 0018 (panel de coordinación).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role, después de aplicar 0017 y otra vez después de 0018.
--
-- LOS RESULTADOS SALEN COMO TABLA, una fila por caso: OK, FALLA o PENDIENTE.
-- PENDIENTE = el caso depende de 0018 y 0018 todavía no está aplicada.
--
-- NO DEJA NADA. Crea usuarios sintéticos en auth.users, membresías, jugadores,
-- mediciones y asignaciones dentro de un sub-bloque que al final se deshace a
-- propósito con un SQLSTATE reservado. Los resultados sobreviven en variables.
-- Ningún dato real de ningún menor entra ni sale de este archivo.
--
-- La impersonación (role = authenticated + request.jwt.claims) es exactamente
-- como PostgREST evalúa RLS para una sesión real.

drop table if exists verificacion_coordinacion;
create temporary table verificacion_coordinacion (
  n integer primary key, caso text, estado text, detalle text
);

do $$
declare
  v_club      uuid := '20000000-0000-0000-0000-000000000001';
  v_otro_club uuid := '00000000-0000-0000-0000-000000000001';
  v_rol_previo text := current_setting('role');
  v_hay_0018 boolean := coalesce(
    obj_description('public.puede_ver_plantel(uuid)'::regprocedure, 'pg_proc') like 'v0018%', false);

  v_u17 uuid; v_u21 uuid; v_t17 uuid; v_t21 uuid;
  v_a  uuid := gen_random_uuid();   -- entrenador U17M
  v_b  uuid := gen_random_uuid();   -- entrenador U21M
  v_c  uuid := gen_random_uuid();   -- coordinador
  v_d  uuid := gen_random_uuid();   -- entrenador U21M + coordinador
  v_p  uuid := gen_random_uuid();   -- pendiente confirmado
  v_q  uuid := gen_random_uuid();   -- pendiente SIN confirmar
  v_p2 uuid := gen_random_uuid();   -- pendiente para el caso de rollback

  v_j17 uuid; v_j17b uuid; v_j21 uuid;
  v_imp uuid; v_par uuid; v_ses21 uuid; v_ses17 uuid; v_ses_p uuid;
  v_imp17 uuid; v_par17 uuid; q integer;
  v_ej uuid; v_asig_b uuid;
  v_hasta timestamptz; v_cerrado uuid;
  v_json jsonb; v_res jsonb;
  n integer; m integer; k integer;
  pudo boolean; txt text;

  nombres text[] := array[
    '1. Entrenador de U17M no lee nada de U21M',
    '2. Entrenador ve toda la biblioteca',
    '3. Entrenador no tiene ninguna vía para asignar',
    '4. Coordinador ve pendientes confirmados',
    '5. Varios profes por categoría y varias categorías por profe',
    '6. Cerrar sin borrar: fecha y autor del servidor',
    '7. Límites del coordinador',
    '8. El RPC es todo o nada',
    '9. Panorama: sólo sumas correctas',
    '10. Coordinador sin datos individuales (0018)',
    '11. Persona con los dos roles',
    '12. Nadie ve el otro club'
  ];
  estados  text[] := array_fill('no corrió'::text, array[12]);
  detalles text[] := array_fill(''::text, array[12]);
  falla_setup text := null;
begin

  begin

    /* ---------- setup, como service role ---------- */

    select id, temporada_id into v_u17, v_t17 from plantel where club_id = v_club and categoria = 'U17M';
    select id, temporada_id into v_u21, v_t21 from plantel where club_id = v_club and categoria = 'U21M';
    if v_u17 is null or v_u21 is null then
      raise exception 'No encontré U17M y U21M en el club del piloto.';
    end if;

    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
           'zztest-' || u.etiqueta || '@verificacion.invalid',
           case when u.etiqueta = 'q' then null else now() end, now(), now()
    from (values (v_a,'a'), (v_b,'b'), (v_c,'c'), (v_d,'d'), (v_p,'p'), (v_q,'q'), (v_p2,'p2'))
         as u(id, etiqueta);

    insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador) values
      (v_a, v_club, true,  false),
      (v_b, v_club, true,  false),
      (v_c, v_club, false, true),
      (v_d, v_club, true,  true);

    insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen)
    values (v_a, v_club, v_u17, 'manual'), (v_d, v_club, v_u21, 'manual');
    insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen)
    values (v_b, v_club, v_u21, 'manual') returning id into v_asig_b;

    insert into jugador (club_id, nombre_clave, nombre_limpio)
      values (v_club, 'ZZTEST COORD DIECISIETE', 'ZZTEST, COORD DIECISIETE') returning id into v_j17;
    insert into jugador (club_id, nombre_clave, nombre_limpio)
      values (v_club, 'ZZTEST COORD DIECISIETE DOS', 'ZZTEST, COORD DIECISIETE DOS') returning id into v_j17b;
    insert into jugador (club_id, nombre_clave, nombre_limpio)
      values (v_club, 'ZZTEST COORD VEINTIUNO', 'ZZTEST, COORD VEINTIUNO') returning id into v_j21;

    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde) values
      (v_club, v_j17,  v_u17, v_t17, '2026-03-01'),
      (v_club, v_j17b, v_u17, v_t17, '2026-03-01'),
      (v_club, v_j21,  v_u21, v_t21, '2026-03-01');

    insert into importacion (club_id, hash_archivo, nombre_archivo)
      values (v_club, 'zztest-coord-' || gen_random_uuid(), 'zztest.xlsx') returning id into v_imp;
    insert into partido (club_id, plantel_id, importacion_id, fecha, condicion_propia)
      values (v_club, v_u21, v_imp, '2026-04-01', 'local') returning id into v_par;
    insert into estadistica_jugador_partido (club_id, partido_id, jugador_id, nombre_crudo)
      values (v_club, v_par, v_j21, 'ZZTEST');

    insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
      values (v_club, v_u21, '2026-04-02', 'tiro') returning id into v_ses21;
    insert into medicion_tiro (club_id, sesion_id, jugador_id, posicion, anotados)
      values (v_club, v_ses21, v_j21, 'frontal', 4);
    insert into medicion_corporal (club_id, jugador_id, fecha_medicion, altura_cm)
      values (v_club, v_j21, '2026-04-04', 180);

    -- Sesión de U17M para el panorama: 3/10 + 5/10 en frontal, 7/10 en libres,
    -- y una posición sin medir que NO tiene que aparecer.
    insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
      values (v_club, v_u17, '2020-01-01', 'tiro') returning id into v_ses17;
    insert into medicion_tiro (club_id, sesion_id, jugador_id, posicion, anotados) values
      (v_club, v_ses17, v_j17,  'frontal', 3),
      (v_club, v_ses17, v_j17b, 'frontal', 5),
      (v_club, v_ses17, v_j17,  'libres',  7),
      (v_club, v_ses17, v_j17b, 'esq_izq', null);

    -- Partido de U17M para el panorama (0022): triples 2/5 + 1/4 = 3/9; libres
    -- 3/4 y un par con intentados en null, que NO tiene que sumar: 3/4.
    insert into importacion (club_id, hash_archivo, nombre_archivo)
      values (v_club, 'zztest-coord17-' || gen_random_uuid(), 'zztest17.xlsx') returning id into v_imp17;
    insert into partido (club_id, plantel_id, importacion_id, fecha, condicion_propia, rival_nombre)
      values (v_club, v_u17, v_imp17, '2020-01-02', 'local', 'ZZTEST RIVAL') returning id into v_par17;
    insert into estadistica_jugador_partido
      (club_id, partido_id, jugador_id, nombre_crudo, tres_anotados, tres_intentados, libres_anotados, libres_intentados)
    values
      (v_club, v_par17, v_j17,  'ZZTEST', 2, 5, 3, 4),
      (v_club, v_par17, v_j17b, 'ZZTEST', 1, 4, 2, null);

    insert into ejercicio (club_id, titulo, tema, creado_por)
      values (v_club, 'ZZTEST ejercicio', 'tiro', v_b) returning id into v_ej;
    insert into nota_ejercicio (club_id, ejercicio_id, texto, creado_por)
      values (v_club, v_ej, 'ZZTEST nota', v_b);


    /* ---------- como A: entrenador de U17M ---------- */

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

    -- 1
    select (select count(*) from jugador where id = v_j21)
         + (select count(*) from pertenencia where plantel_id = v_u21)
         + (select count(*) from partido where plantel_id = v_u21)
         + (select count(*) from estadistica_jugador_partido where partido_id = v_par)
         + (select count(*) from sesion_medicion where plantel_id = v_u21)
         + (select count(*) from medicion_tiro where sesion_id = v_ses21)
         + (select count(*) from medicion_corporal where jugador_id = v_j21)
      into n;
    select count(*) into m from jugador where id = v_j17;
    if n <> 0 then
      estados[1] := 'FALLA'; detalles[1] := format('Ve %s fila(s) de U21M.', n);
    elsif m <> 1 then
      estados[1] := 'FALLA'; detalles[1] := 'No ve al jugador de su propia categoría.';
    else
      estados[1] := 'OK'; detalles[1] := '0 filas de U21M en las 7 tablas; ve lo suyo.';
    end if;

    -- 2
    select count(*) into n from ejercicio where id = v_ej;
    select count(*) into m from nota_ejercicio where ejercicio_id = v_ej;
    if n = 1 and m = 1 then
      estados[2] := 'OK'; detalles[2] := 'Lee el ejercicio y la nota que cargó el profe de U21M.';
    else
      estados[2] := 'FALLA'; detalles[2] := format('Ejercicio %s/1, nota %s/1.', n, m);
    end if;

    -- 3
    txt := '';
    begin
      insert into miembro_club (user_id, club_id, es_entrenador) values (v_p, v_club, true);
      txt := txt || 'habilitó a otro; ';
    exception when others then null; end;
    begin
      insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id)
      values (v_a, v_club, v_u21);
      txt := txt || 'se asignó U21M; ';
    exception when others then null; end;
    begin
      update asignacion_plantel set hasta = now() where id = v_asig_b;
      get diagnostics n = row_count;
      if n > 0 then txt := txt || 'cerró la asignación de otro; '; end if;
    exception when others then null; end;
    begin
      perform asignar_planteles(v_p, v_club, array[v_u17]);
      txt := txt || 'RPC para otro; ';
    exception when others then null; end;
    begin
      perform asignar_planteles(v_a, v_club, array[v_u21]);
      txt := txt || 'RPC para sí; ';
    exception when others then null; end;
    begin
      perform 1 from usuarios_pendientes();
      txt := txt || 'leyó pendientes; ';
    exception when others then null; end;
    begin
      perform 1 from miembros_del_club(v_club);
      txt := txt || 'leyó miembros; ';
    exception when others then null; end;
    begin
      perform panorama_del_club(v_club);
      txt := txt || 'leyó el panorama; ';
    exception when others then null; end;
    if txt = '' then
      estados[3] := 'OK'; detalles[3] := 'Las 8 vías rechazadas.';
    else
      estados[3] := 'FALLA'; detalles[3] := txt;
    end if;


    /* ---------- como C: coordinador ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);

    -- 4
    select count(*) filter (where user_id = v_p), count(*) filter (where user_id = v_q)
      into n, m from usuarios_pendientes();
    if n = 1 and m = 0 then
      estados[4] := 'OK'; detalles[4] := 'Ve al confirmado, no al que no confirmó el mail.';
    else
      estados[4] := 'FALLA'; detalles[4] := format('Confirmado %s/1, sin confirmar %s/0.', n, m);
    end if;

    -- 5
    begin
      v_res := asignar_planteles(v_p, v_club, array[v_u17, v_u21]);
      perform set_config('role', v_rol_previo, true);
      select count(*) into n from miembro_club where user_id = v_p and club_id = v_club and es_entrenador;
      select count(*) into m from asignacion_plantel where miembro_club_user_id = v_p and hasta is null;
      select count(*) into k from asignacion_plantel
        where plantel_id = v_u17 and hasta is null and miembro_club_user_id in (v_a, v_p);
      if n = 1 and m = 2 and k = 2 and (v_res->>'habilitado')::boolean then
        estados[5] := 'OK'; detalles[5] := 'Habilitado con 2 categorías; U17M queda con 2 profes.';
      else
        estados[5] := 'FALLA';
        detalles[5] := format('membresía %s/1, vigentes %s/2, profes en U17M %s/2, respuesta %s', n, m, k, v_res);
      end if;
    exception when others then
      estados[5] := 'FALLA'; detalles[5] := 'El RPC falló: ' || sqlerrm;
    end;
    perform set_config('role', 'authenticated', true);

    -- 6
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_p, 'role', 'authenticated')::text, true);
      insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
        values (v_club, v_u21, '2026-05-01', 'tiro') returning id into v_ses_p;

      perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
      update asignacion_plantel set hasta = '2020-01-01'
        where miembro_club_user_id = v_p and plantel_id = v_u21 and hasta is null;
      get diagnostics n = row_count;

      perform set_config('request.jwt.claims', json_build_object('sub', v_p, 'role', 'authenticated')::text, true);
      select count(*) into m from sesion_medicion where plantel_id = v_u21;

      perform set_config('role', v_rol_previo, true);
      select hasta, cerrado_por into v_hasta, v_cerrado
        from asignacion_plantel where miembro_club_user_id = v_p and plantel_id = v_u21;
      select count(*) into k from sesion_medicion where id = v_ses_p;

      if n = 1 and v_hasta > '2021-01-01' and v_cerrado = v_c and m = 0 and k = 1 then
        estados[6] := 'OK'; detalles[6] := 'Fila cerrada con now() y autor C; P ya no ve U21M; su sesión sigue.';
      else
        estados[6] := 'FALLA';
        detalles[6] := format('filas %s/1, hasta %s, cerrado_por ok %s, P ve %s/0, sesión existe %s/1',
                              n, v_hasta, v_cerrado = v_c, m, k);
      end if;
    exception when others then
      estados[6] := 'FALLA'; detalles[6] := 'Error: ' || sqlerrm;
    end;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);

    -- 7
    txt := '';
    begin
      delete from asignacion_plantel where miembro_club_user_id = v_p and plantel_id = v_u21;
      get diagnostics n = row_count;
      if n > 0 then txt := txt || 'borró una asignación; '; end if;
    exception when others then null; end;
    begin
      update asignacion_plantel set hasta = null where miembro_club_user_id = v_p and plantel_id = v_u21;
      get diagnostics n = row_count;
      if n > 0 then txt := txt || 'reabrió una cerrada; '; end if;
    exception when others then null; end;
    begin
      insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, desde)
      values (v_b, v_club, v_u17, '2020-01-01');
      txt := txt || 'antedató una asignación; ';
    exception when others then null; end;
    begin
      insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador)
      values (v_p2, v_club, true, true);
      txt := txt || 'creó un coordinador; ';
    exception when others then null; end;
    begin
      insert into miembro_club (user_id, club_id, es_entrenador) values (v_p2, v_otro_club, true);
      txt := txt || 'habilitó en otro club; ';
    exception when others then null; end;

    perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
    begin
      insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id)
      values (v_d, v_club, v_u17);
      txt := txt || 'se autoasignó (insert); ';
    exception when others then null; end;
    begin
      perform asignar_planteles(v_d, v_club, array[v_u17]);
      txt := txt || 'se autoasignó (RPC); ';
    exception when others then null; end;

    if txt = '' then
      estados[7] := 'OK'; detalles[7] := 'Las 7 vías rechazadas.';
    else
      estados[7] := 'FALLA'; detalles[7] := txt;
    end if;

    -- 8
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
    pudo := false;
    txt := '';
    begin
      -- El segundo plantel no existe: rompe la FK compuesta DESPUÉS de haber
      -- insertado la membresía y la asignación a U17M.
      perform asignar_planteles(v_p2, v_club, array[v_u17, gen_random_uuid()]);
      pudo := true;
    exception when others then
      txt := sqlerrm;
    end;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from miembro_club where user_id = v_p2;
    select count(*) into m from asignacion_plantel where miembro_club_user_id = v_p2;
    if pudo then
      estados[8] := 'FALLA'; detalles[8] := 'El RPC no falló con un plantel inexistente.';
    elsif n + m <> 0 then
      estados[8] := 'FALLA'; detalles[8] := format('Quedaron %s membresía(s) y %s asignación(es).', n, m);
    else
      estados[8] := 'OK'; detalles[8] := 'Falló (' || left(txt, 60) || ') y no dejó nada.';
    end if;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);

    -- 9
    begin
      v_json := panorama_del_club(v_club);
      txt := '';
      select (e->>'anotados')::int, (e->>'intentos')::int, (e->>'jugadoresQueMidieron')::int
        into n, m, k
        from jsonb_array_elements(v_json->'tiro') e
       where e->>'sesionId' = v_ses17::text and e->>'posicion' = 'frontal';
      if n is distinct from 8 or m is distinct from 20 or k is distinct from 2 then
        txt := txt || format('frontal %s/%s con %s jugadores, esperaba 8/20 con 2; ', n, m, k);
      end if;
      select (e->>'anotados')::int, (e->>'intentos')::int
        into n, m
        from jsonb_array_elements(v_json->'tiro') e
       where e->>'sesionId' = v_ses17::text and e->>'posicion' = 'libres';
      if n is distinct from 7 or m is distinct from 10 then
        txt := txt || format('libres %s/%s, esperaba 7/10; ', n, m);
      end if;
      if exists (select 1 from jsonb_array_elements(v_json->'tiro') e
                 where e->>'sesionId' = v_ses17::text and e->>'posicion' = 'esq_izq') then
        txt := txt || 'trae una posición sin medir; ';
      end if;
      -- 0022: tiro en partidos, sumado de a pares.
      select (e->>'tresAnotados')::int, (e->>'tresIntentados')::int,
             (e->>'libresAnotados')::int, (e->>'libresIntentados')::int
        into n, m, k, q
        from jsonb_array_elements(v_json->'partidos') e
       where e->>'partidoId' = v_par17::text;
      if n is distinct from 3 or m is distinct from 9 or k is distinct from 3 or q is distinct from 4 then
        txt := txt || format('partido U17M triples %s/%s libres %s/%s, esperaba 3/9 y 3/4; ', n, m, k, q);
      end if;
      select count(*) into n
        from jsonb_array_elements(v_json->'partidos') e
       where e->>'partidoId' = v_par::text
         and e->'tresIntentados' = 'null'::jsonb and e->'libresIntentados' = 'null'::jsonb;
      if n <> 1 then
        txt := txt || 'el partido sin estadísticas no aparece con sumas null; ';
      end if;
      if exists (select 1 from jsonb_array_elements(v_json->'tiro') e, jsonb_object_keys(e) clave
                 where clave not in ('plantelId','sesionId','fecha','posicion','anotados','intentos','jugadoresQueMidieron'))
      or exists (select 1 from jsonb_array_elements(v_json->'planteles') e, jsonb_object_keys(e) clave
                 where clave not in ('plantelId','jugadores','partidos','ultimaMedicion','ultimoPartido'))
      or exists (select 1 from jsonb_array_elements(v_json->'partidos') e, jsonb_object_keys(e) clave
                 where clave not in ('plantelId','partidoId','fecha','rival','tresAnotados','tresIntentados','libresAnotados','libresIntentados'))
      or exists (select 1 from jsonb_object_keys(v_json) clave
                 where clave not in ('planteles','tiro','partidos')) then
        txt := txt || 'trae claves fuera de la lista; ';
      end if;
      if txt = '' then
        estados[9] := 'OK'; detalles[9] := 'Batería frontal 8/20 (2 jug.), libres 7/10; partido 3/9 y 3/4 por pares; partido sin datos en null; sólo claves permitidas.';
      else
        estados[9] := 'FALLA'; detalles[9] := txt;
      end if;
    exception when others then
      estados[9] := 'FALLA'; detalles[9] := 'Error: ' || sqlerrm;
    end;

    -- 10
    select (select count(*) from jugador where id in (v_j17, v_j17b, v_j21))
         + (select count(*) from pertenencia where plantel_id in (v_u17, v_u21))
         + (select count(*) from partido where plantel_id in (v_u17, v_u21))
         + (select count(*) from estadistica_jugador_partido where partido_id in (v_par, v_par17))
         + (select count(*) from sesion_medicion where plantel_id in (v_u17, v_u21))
         + (select count(*) from medicion_tiro where sesion_id in (v_ses17, v_ses21))
         + (select count(*) from medicion_corporal where jugador_id = v_j21)
      into n;
    select count(*) into m from plantel where club_id = v_club;
    pudo := false;
    begin
      perform 1 from jugadores_del_club_para_dedup(v_club);
      pudo := true;
    exception when others then null; end;
    if m < 2 then
      estados[10] := 'FALLA'; detalles[10] := format('Ve %s plantel(es) de su club, esperaba al menos 2.', m);
    elsif not v_hay_0018 then
      estados[10] := 'PENDIENTE';
      detalles[10] := format('Sin 0018 el coordinador todavía lee %s fila(s) individuales. Ve los planteles.', n);
    elsif n <> 0 or pudo then
      estados[10] := 'FALLA'; detalles[10] := format('Lee %s fila(s) individuales; dedup permitido: %s.', n, pudo);
    else
      estados[10] := 'OK'; detalles[10] := '0 filas individuales, dedup rechazado, ve los planteles.';
    end if;


    /* ---------- como D: los dos roles ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);

    -- 11
    begin
      txt := '';
      select count(*) into n from jugador where id = v_j21;
      if n <> 1 then txt := txt || 'no ve su categoría; '; end if;
      insert into sesion_medicion (club_id, plantel_id, fecha, tipo) values (v_club, v_u21, '2026-05-02', 'tiro');
      perform 1 from miembros_del_club(v_club);
      select count(*) into m from jugador where id = v_j17;
      if v_hay_0018 and m <> 0 then txt := txt || 've U17M, que no tiene asignada; '; end if;
      if txt <> '' then
        estados[11] := 'FALLA'; detalles[11] := txt;
      elsif not v_hay_0018 then
        estados[11] := 'PENDIENTE'; detalles[11] := 'Ve y escribe U21M y usa el panel. Sin 0018 todavía ve U17M.';
      else
        estados[11] := 'OK'; detalles[11] := 'Ve y escribe U21M, usa el panel, no ve U17M.';
      end if;
    exception when others then
      estados[11] := 'FALLA'; detalles[11] := 'Error: ' || sqlerrm;
    end;


    /* ---------- 12: el otro club ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
    begin perform panorama_del_club(v_otro_club); txt := txt || 'panorama del otro club; ';
    exception when others then null; end;
    begin perform 1 from miembros_del_club(v_otro_club); txt := txt || 'miembros del otro club; ';
    exception when others then null; end;
    select count(*) into n from plantel where club_id = v_otro_club;
    if n <> 0 then txt := txt || 'el coordinador ve planteles del otro club; '; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    select count(*) into n from plantel where club_id = v_otro_club;
    select count(*) into m from jugador where club_id = v_otro_club;
    if n + m <> 0 then txt := txt || 'el entrenador ve datos del otro club; '; end if;

    if txt = '' then
      estados[12] := 'OK'; detalles[12] := 'Ni tablas ni funciones del panel.';
    else
      estados[12] := 'FALLA'; detalles[12] := txt;
    end if;

    raise exception using errcode = 'ZY001', message = 'fin';

  exception
    when sqlstate 'ZY001' then
      null;  -- salida normal: todo lo escrito arriba quedó deshecho
    when others then
      falla_setup := sqlerrm;
  end;

  perform set_config('role', v_rol_previo, true);

  if falla_setup is not null then
    insert into verificacion_coordinacion values
      (0, 'SETUP', 'ERROR', falla_setup || '  (los casos que no llegaron a correr dicen "no corrió")');
  end if;

  for i in 1..12 loop
    insert into verificacion_coordinacion values (i, nombres[i], estados[i], detalles[i]);
  end loop;

  insert into verificacion_coordinacion values
    (99, '0018 aplicada', case when v_hay_0018 then 'sí' else 'no' end, '');
end $$;

select n as "#", caso, estado, detalle
from verificacion_coordinacion
order by n;
