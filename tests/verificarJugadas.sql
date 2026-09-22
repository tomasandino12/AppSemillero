-- Verificación de 0035 (jugadas).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role, DESPUÉS de aplicar 0035 (y 0030, de la que depende).
--
-- LOS RESULTADOS SALEN COMO TABLA, una fila por caso: OK, FALLA o "no corrió".
--
-- NO DEJA NADA. Crea usuarios sintéticos, fichas y jugadas dentro de un
-- sub-bloque que al final se deshace a propósito con un SQLSTATE reservado.
-- Ningún dato real de ningún menor entra ni sale de acá.
--
-- La impersonación (role = authenticated + request.jwt.claims) es exactamente
-- como PostgREST evalúa RLS para una sesión real.

drop table if exists verificacion_jugadas;
create temporary table verificacion_jugadas (
  n integer primary key, caso text, estado text, detalle text
);

do $$
declare
  v_club uuid := '20000000-0000-0000-0000-000000000001';
  v_rol_previo text := current_setting('role');
  v_vacia jsonb := '{"cancha": "media", "fichas": [], "pelota": null, "pasos": []}';

  v_u17 uuid; v_u21 uuid; v_t17 uuid; v_t21 uuid;
  v_a  uuid := gen_random_uuid();   -- entrenador U17M, autor
  v_b  uuid := gen_random_uuid();   -- entrenador U21M
  v_k1 uuid := gen_random_uuid();   -- jugador con cuenta en U17M
  v_k2 uuid := gen_random_uuid();   -- jugador con cuenta en U21M
  v_k3 uuid := gen_random_uuid();   -- jugador con cuenta y pertenencia CERRADA en U17M

  v_j1 uuid; v_j2 uuid; v_j3 uuid;
  v_de_a uuid; v_otra_de_a uuid;
  n integer;
  txt text;

  nombres text[] := array[
    '1. El entrenador crea una jugada y la autoría la pone el servidor',
    '2. Un profe no edita ni borra una jugada ajena',
    '3. Un profe no asigna a un plantel que no es suyo',
    '4. Un profe asigna una jugada ajena a su propio plantel',
    '5. Un jugador no lee jugada ni jugada_plantel directo',
    '6. El jugador ve por mis_jugadas() lo asignado a su plantel, sin autor',
    '7. Un jugador de otro plantel, o con pertenencia cerrada, no la ve',
    '8. La base rechaza notas largas, datos que no son objeto y tipos desconocidos',
    '9. Nadie cambia el club ni la autoría de una jugada'
  ];
  estados  text[] := array_fill('no corrió'::text, array[9]);
  detalles text[] := array_fill(''::text, array[9]);
  falla_setup text := null;
begin

  begin

    /* ---------- setup, como service role ---------- */

    select id, temporada_id into v_u17, v_t17 from plantel where club_id = v_club and categoria = 'U17M';
    select id, temporada_id into v_u21, v_t21 from plantel where club_id = v_club and categoria = 'U21M';
    if v_u17 is null or v_u21 is null then
      raise exception 'No encontré U17M y U21M en el club del piloto.';
    end if;

    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at,
                            raw_user_meta_data)
    select u.id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
           'zztest-' || u.etiqueta || '@verificacion.invalid', now(), now(), now(),
           jsonb_build_object('nombre', 'ZZTEST Nombre ' || u.etiqueta)
    from (values (v_a,'a'), (v_b,'b'), (v_k1,'k1'), (v_k2,'k2'), (v_k3,'k3')) as u(id, etiqueta);

    insert into miembro_club (user_id, club_id, es_entrenador) values
      (v_a, v_club, true), (v_b, v_club, true);
    insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen) values
      (v_a, v_club, v_u17, 'manual'), (v_b, v_club, v_u21, 'manual');

    insert into jugador (club_id, nombre_clave, nombre_limpio) values
      (v_club, 'ZZTEST JUGADAS UNO',  'ZZTEST, JUGADAS UNO'),
      (v_club, 'ZZTEST JUGADAS DOS',  'ZZTEST, JUGADAS DOS'),
      (v_club, 'ZZTEST JUGADAS TRES', 'ZZTEST, JUGADAS TRES');
    select id into v_j1 from jugador where club_id = v_club and nombre_clave = 'ZZTEST JUGADAS UNO';
    select id into v_j2 from jugador where club_id = v_club and nombre_clave = 'ZZTEST JUGADAS DOS';
    select id into v_j3 from jugador where club_id = v_club and nombre_clave = 'ZZTEST JUGADAS TRES';

    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde, hasta) values
      (v_club, v_j1, v_u17, v_t17, '2026-03-01', null),
      (v_club, v_j2, v_u21, v_t21, '2026-03-01', null),
      (v_club, v_j3, v_u17, v_t17, '2026-03-01', '2026-06-01');
    insert into cuenta_jugador (user_id, club_id, jugador_id, aprobado_por) values
      (v_k1, v_club, v_j1, v_a), (v_k2, v_club, v_j2, v_b), (v_k3, v_club, v_j3, v_a);


    /* ---------- 1: crear ---------- */

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    insert into jugada (club_id, nombre, tipo, datos)
      values (v_club, 'ZZTEST 1-4 alto', 'ataque', v_vacia) returning id into v_de_a;
    insert into jugada (club_id, nombre, tipo, datos)
      values (v_club, 'ZZTEST zona', 'defensa', v_vacia) returning id into v_otra_de_a;
    perform set_config('role', v_rol_previo, true);

    select count(*) into n from jugada where id in (v_de_a, v_otra_de_a) and creado_por = v_a;
    if n = 2 then
      estados[1] := 'OK'; detalles[1] := 'Las dos quedaron con creado_por = el entrenador, sin mandarlo.';
    else
      estados[1] := 'FALLA'; detalles[1] := 'creado_por no quedó sellado con quien llama.';
    end if;


    /* ---------- 2: jugada ajena ---------- */

    txt := '';
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    select count(*) into n from jugada where id = v_de_a;
    if n <> 1 then txt := txt || 'el otro profe del club no ve la jugada en la biblioteca; '; end if;
    update jugada set nombre = 'ZZTEST pisada' where id = v_de_a;
    delete from jugada where id = v_de_a;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from jugada where id = v_de_a and nombre = 'ZZTEST 1-4 alto';
    if n <> 1 then txt := txt || 'el otro profe la cambió o la borró; '; end if;
    if txt = '' then
      estados[2] := 'OK'; detalles[2] := 'La ve, pero update y delete no tocan ninguna fila.';
    else
      estados[2] := 'FALLA'; detalles[2] := txt;
    end if;


    /* ---------- 3: plantel ajeno ---------- */

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    begin
      insert into jugada_plantel (club_id, jugada_id, plantel_id) values (v_club, v_de_a, v_u17);
      estados[3] := 'FALLA'; detalles[3] := 'El entrenador de U21M asignó a U17M.';
    exception when insufficient_privilege then
      estados[3] := 'OK'; detalles[3] := 'La RLS rechaza la fila (42501).';
    end;


    /* ---------- 4: asignar lo ajeno a lo propio ---------- */

    -- b asigna la zona de a a U21M; a asigna su 1-4 alto a U17M.
    begin
      insert into jugada_plantel (club_id, jugada_id, plantel_id) values (v_club, v_otra_de_a, v_u21);
      perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
      insert into jugada_plantel (club_id, jugada_id, plantel_id) values (v_club, v_de_a, v_u17);
      perform set_config('role', v_rol_previo, true);
      select count(*) into n from jugada_plantel
        where (jugada_id, plantel_id, creado_por) in ((v_otra_de_a, v_u21, v_b), (v_de_a, v_u17, v_a));
      if n = 2 then
        estados[4] := 'OK'; detalles[4] := 'Las dos asignaciones quedaron, cada una a nombre de quien asignó.';
      else
        estados[4] := 'FALLA'; detalles[4] := 'Faltan asignaciones o el creado_por no es de quien asignó.';
      end if;
    exception when insufficient_privilege then
      estados[4] := 'FALLA'; detalles[4] := 'Se rechazó asignar a un plantel propio: ' || sqlerrm;
    end;
    perform set_config('role', v_rol_previo, true);


    /* ---------- 5: el jugador no lee las tablas ---------- */

    txt := '';
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_k1, 'role', 'authenticated')::text, true);
    begin
      select count(*) into n from jugada;
      if n <> 0 then txt := txt || 've ' || n || ' filas de jugada; '; end if;
    exception when insufficient_privilege then null; end;
    begin
      select count(*) into n from jugada_plantel;
      if n <> 0 then txt := txt || 've ' || n || ' filas de jugada_plantel; '; end if;
    exception when insufficient_privilege then null; end;
    begin
      insert into jugada (club_id, nombre, tipo, datos) values (v_club, 'ZZTEST del jugador', 'otro', v_vacia);
      txt := txt || 'pudo crear una jugada; ';
    exception when insufficient_privilege then null; end;
    if txt = '' then
      estados[5] := 'OK'; detalles[5] := 'Cero filas en las dos tablas y el insert se rechaza.';
    else
      estados[5] := 'FALLA'; detalles[5] := txt;
    end if;


    /* ---------- 6: mis_jugadas ---------- */

    txt := '';
    select count(*) into n from mis_jugadas();
    if n <> 1 then txt := txt || 'devolvió ' || n || ' jugadas (esperaba 1); '; end if;
    select count(*) into n from mis_jugadas() where jugada_id = v_de_a and nombre = 'ZZTEST 1-4 alto';
    if n <> 1 then txt := txt || 'no devolvió la jugada de U17M; '; end if;
    if (select coalesce(string_agg(to_jsonb(m)::text, ''), '') from mis_jugadas() m) ~* v_a::text then
      txt := txt || 'la salida contiene el id del autor; ';
    end if;
    if txt = '' then
      estados[6] := 'OK'; detalles[6] := 'Sólo el 1-4 alto de U17M, con nombre, tipo y datos.';
    else
      estados[6] := 'FALLA'; detalles[6] := txt;
    end if;


    /* ---------- 7: otro plantel y pertenencia cerrada ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_k2, 'role', 'authenticated')::text, true);
    select count(*) into n from mis_jugadas() where jugada_id = v_de_a;
    if n <> 0 then txt := txt || 'el jugador de U21M ve la jugada de U17M; '; end if;
    select count(*) into n from mis_jugadas() where jugada_id = v_otra_de_a;
    if n <> 1 then txt := txt || 'el jugador de U21M no ve la zona asignada a U21M; '; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_k3, 'role', 'authenticated')::text, true);
    select count(*) into n from mis_jugadas();
    if n <> 0 then txt := txt || 'con la pertenencia cerrada ve ' || n || ' jugadas; '; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    select count(*) into n from mis_jugadas();
    if n <> 0 then txt := txt || 'un profe sin cuenta de jugador recibe filas; '; end if;
    if txt = '' then
      estados[7] := 'OK'; detalles[7] := 'U21M ve sólo lo suyo; pertenencia cerrada y profe reciben cero filas.';
    else
      estados[7] := 'FALLA'; detalles[7] := txt;
    end if;


    /* ---------- 8: checks ---------- */

    txt := '';
    begin
      insert into jugada (club_id, nombre, tipo, datos) values (v_club, 'ZZTEST nota larga', 'ataque',
        jsonb_build_object('cancha', 'media', 'fichas', '[]'::jsonb, 'pelota', null,
          'pasos', jsonb_build_array(jsonb_build_object('acciones', '[]'::jsonb, 'nota', repeat('ñ', 301)))));
      txt := txt || 'aceptó una nota de 301 caracteres; ';
    exception when check_violation then null; end;
    begin
      insert into jugada (club_id, nombre, tipo, datos) values (v_club, 'ZZTEST nota justa', 'ataque',
        jsonb_build_object('cancha', 'media', 'fichas', '[]'::jsonb, 'pelota', null,
          'pasos', jsonb_build_array(jsonb_build_object('acciones', '[]'::jsonb, 'nota', repeat('ñ', 300)))));
    exception when check_violation then
      txt := txt || 'rechazó una nota de 300 caracteres; ';
    end;
    begin
      insert into jugada (club_id, nombre, tipo, datos) values (v_club, 'ZZTEST arreglo', 'ataque', '[]');
      txt := txt || 'aceptó datos que no son objeto; ';
    exception when check_violation then null; end;
    begin
      insert into jugada (club_id, nombre, tipo, datos) values (v_club, 'ZZTEST tipo', 'contraataque', v_vacia);
      txt := txt || 'aceptó un tipo desconocido; ';
    exception when check_violation then null; end;
    begin
      insert into jugada (club_id, nombre, tipo, datos) values (v_club, 'ZZTEST grande', 'ataque',
        jsonb_build_object('cancha', 'media', 'relleno', repeat('x', 70000)));
      txt := txt || 'aceptó más de 65536 bytes; ';
    exception when check_violation then null; end;
    if txt = '' then
      estados[8] := 'OK'; detalles[8] := 'Nota de 301 no, de 300 sí; arreglo, tipo desconocido y 70 KB no.';
    else
      estados[8] := 'FALLA'; detalles[8] := txt;
    end if;


    /* ---------- 9: club y autoría inmutables ---------- */

    txt := '';
    begin
      update jugada set creado_por = v_b where id = v_de_a;
      txt := txt || 'pudo mandar creado_por; ';
    exception when insufficient_privilege then null; end;
    begin
      update jugada set club_id = gen_random_uuid() where id = v_de_a;
      txt := txt || 'pudo mandar club_id; ';
    exception when insufficient_privilege then null; end;
    update jugada set nombre = 'ZZTEST 1-4 alto v2' where id = v_de_a;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from jugada
      where id = v_de_a and nombre = 'ZZTEST 1-4 alto v2' and creado_por = v_a and club_id = v_club
        and actualizado_en >= creado_en;
    if n <> 1 then txt := txt || 'el autor no pudo renombrar, o cambió la autoría; '; end if;
    if txt = '' then
      estados[9] := 'OK'; detalles[9] := 'club_id y creado_por dan permiso denegado; el autor sí renombra.';
    else
      estados[9] := 'FALLA'; detalles[9] := txt;
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
    insert into verificacion_jugadas values
      (0, 'SETUP', 'ERROR', falla_setup || '  (los casos que no llegaron a correr dicen "no corrió")');
  end if;

  for i in 1..9 loop
    insert into verificacion_jugadas values (i, nombres[i], estados[i], detalles[i]);
  end loop;
end $$;

select n as "#", caso, estado, detalle
from verificacion_jugadas
order by n;
