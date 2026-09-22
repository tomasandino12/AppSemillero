-- Verificación de 0037 (pendientes sin chicos y código de solicitud).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role, después de aplicar 0037. O local:
--   docker exec -i supabase_db_modelo-datos-supabase psql -U postgres < tests/verificarPendientesYCodigo.sql
--
-- LOS RESULTADOS SALEN COMO TABLA, una fila por caso: OK o FALLA.
--
-- NO DEJA NADA: usuarios, fichas y solicitudes sintéticos dentro de un
-- sub-bloque que al final se deshace con un SQLSTATE reservado.

drop table if exists verificacion_0037;
create temporary table verificacion_0037 (
  n integer primary key, caso text, estado text, detalle text
);

do $$
declare
  v_club uuid := '20000000-0000-0000-0000-000000000001';
  v_rol_previo text := current_setting('role');
  v_u17 uuid; v_u21 uuid; v_t17 uuid;
  v_c  uuid := gen_random_uuid();   -- coordinación
  v_a  uuid := gen_random_uuid();   -- entrenador U17M
  v_b  uuid := gen_random_uuid();   -- entrenador U21M
  v_k1 uuid := gen_random_uuid();   -- chico con solicitud pendiente a U17M
  v_k2 uuid := gen_random_uuid();   -- chico con cuenta vigente
  v_k3 uuid := gen_random_uuid();   -- chico con la solicitud rechazada
  v_n  uuid := gen_random_uuid();   -- cuenta nueva que nunca pidió nada (un profe)
  v_j2 uuid; v_s1 uuid; v_s3 uuid;
  v_codigo text;
  n integer; txt text;

  nombres text[] := array[
    '1. Pendientes: aparece el profe nuevo, no los chicos',
    '2. Buscar por mail: sólo jugadores del club, sólo coordinación',
    '3. El profe no puede leer el código; ve el mail enmascarado',
    '4. El chico ve su código',
    '5. Aprobar sin el código o con otro: CODIGO_INCORRECTO, nada guardado',
    '6. Aprobar con el código (con espacios y minúsculas) funciona',
    '7. El profe de otro plantel, aun con el código, no aprueba'
  ];
  estados  text[] := array_fill('no corrió'::text, array[7]);
  detalles text[] := array_fill(''::text, array[7]);
  falla_setup text := null;
begin
  begin

    /* ---------- setup, como service role ---------- */

    select id, temporada_id into v_u17, v_t17 from plantel where club_id = v_club and categoria = 'U17M';
    select id into v_u21 from plantel where club_id = v_club and categoria = 'U21M';
    if v_u17 is null or v_u21 is null then
      raise exception 'No encontré U17M y U21M en el club del piloto.';
    end if;

    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
    select u.id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
           'zztest-' || u.etiqueta || '@verificacion.invalid', now(), now(), now(),
           jsonb_build_object('nombre', 'ZZTEST ' || u.etiqueta)
    from (values (v_c,'c'), (v_a,'a'), (v_b,'b'), (v_k1,'k1'), (v_k2,'k2'), (v_k3,'k3'), (v_n,'n')) as u(id, etiqueta);

    insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador) values
      (v_c, v_club, false, true), (v_a, v_club, true, false), (v_b, v_club, true, false);
    insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen) values
      (v_a, v_club, v_u17, 'manual'), (v_b, v_club, v_u21, 'manual');

    insert into jugador (id, club_id, nombre_clave, nombre_limpio)
      values (gen_random_uuid(), v_club, 'ZZTEST CON CUENTA', 'ZZTEST, CON CUENTA') returning id into v_j2;
    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
      values (v_club, v_j2, v_u17, v_t17, '2026-03-01');
    insert into cuenta_jugador (user_id, club_id, jugador_id, aprobado_por) values (v_k2, v_club, v_j2, v_a);

    insert into solicitud_jugador (user_id, club_id, plantel_id) values (v_k3, v_club, v_u17) returning id into v_s3;
    update solicitud_jugador set estado = 'rechazada' where id = v_s3;

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_k1, 'role', 'authenticated')::text, true);
    v_s1 := (crear_solicitud_jugador(v_club, v_u17)->>'solicitudId')::uuid;


    /* ---------- 1: pendientes ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
    select count(*) into n from usuarios_pendientes() where user_id = v_n;
    if n <> 1 then txt := txt || 'no aparece la cuenta nueva; '; end if;
    select count(*) into n from usuarios_pendientes() where user_id in (v_k1, v_k2, v_k3);
    if n <> 0 then txt := txt || n || ' chico(s) en la lista; '; end if;
    select count(*) into n from usuarios_pendientes() where es_jugador;
    if n <> 0 then txt := txt || 'alguien marcado como jugador; '; end if;
    estados[1] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[1] := case when txt = '' then 'Sale la cuenta nueva; no el pendiente, ni el que tiene cuenta, ni el rechazado.' else txt end;


    /* ---------- 2: buscar por mail ---------- */

    txt := '';
    select count(*) into n from buscar_jugador_para_habilitar(v_club, '  ZZTEST-K2@verificacion.INVALID ') where user_id = v_k2 and es_jugador;
    if n <> 1 then txt := txt || 'no encuentra al chico con cuenta; '; end if;
    select count(*) into n from buscar_jugador_para_habilitar(v_club, 'zztest-k1@verificacion.invalid');
    if n <> 1 then txt := txt || 'no encuentra al que tiene una solicitud; '; end if;
    select count(*) into n from buscar_jugador_para_habilitar(v_club, 'zztest-n@verificacion.invalid');
    if n <> 0 then txt := txt || 'encuentra a una cuenta que no es jugador; '; end if;
    select count(*) into n from buscar_jugador_para_habilitar(v_club, 'zztest-a@verificacion.invalid');
    if n <> 0 then txt := txt || 'encuentra a un profe; '; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    begin
      perform buscar_jugador_para_habilitar(v_club, 'zztest-k2@verificacion.invalid');
      txt := txt || 'un entrenador pudo buscar; ';
    exception when others then null;
    end;
    estados[2] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[2] := case when txt = '' then 'Mail exacto (sin importar mayúsculas), sólo jugadores del club, sólo coordinación.' else txt end;


    /* ---------- 3: el profe no lee el código ---------- */

    txt := '';
    begin
      perform codigo from solicitud_jugador where id = v_s1;
      txt := txt || 'leyó la columna codigo; ';
    exception when insufficient_privilege then null;
    end;
    select count(*) into n from solicitud_jugador where id = v_s1;
    if n <> 1 then txt := txt || 'ya no ve la solicitud; '; end if;
    select count(*) into n from solicitudes_del_plantel(v_u17)
      where id = v_s1 and email_enmascarado = 'z***@verificacion.invalid';
    if n <> 1 then txt := txt || 'sin el mail enmascarado; '; end if;
    estados[3] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[3] := case when txt = '' then 'Permiso denegado sobre codigo; ve la solicitud y z***@dominio.' else txt end;


    /* ---------- 4: el chico ve su código ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_k1, 'role', 'authenticated')::text, true);
    select codigo into v_codigo from mi_solicitud_jugador();
    estados[4] := case when v_codigo ~ '^[0-9A-F]{6}$' then 'OK' else 'FALLA' end;
    detalles[4] := case when estados[4] = 'OK' then 'Seis caracteres hexadecimales.' else coalesce(v_codigo, 'null') end;


    /* ---------- 5: sin código o con otro ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    begin
      perform aprobar_solicitud_jugador(jsonb_build_object('solicitudId', v_s1,
        'nombreClave', 'ZZTEST NUEVO', 'nombreLimpio', 'ZZTEST, NUEVO'));
      txt := txt || 'aprobó sin código; ';
    exception when others then
      if sqlerrm <> 'CODIGO_INCORRECTO' then txt := txt || 'sin código: ' || sqlerrm || '; '; end if;
    end;
    begin
      perform aprobar_solicitud_jugador(jsonb_build_object('solicitudId', v_s1, 'codigo', 'ZZZZZZ',
        'nombreClave', 'ZZTEST NUEVO', 'nombreLimpio', 'ZZTEST, NUEVO'));
      txt := txt || 'aprobó con otro código; ';
    exception when others then
      if sqlerrm <> 'CODIGO_INCORRECTO' then txt := txt || 'otro código: ' || sqlerrm || '; '; end if;
    end;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from jugador where club_id = v_club and nombre_clave = 'ZZTEST NUEVO';
    if n <> 0 then txt := txt || 'quedó la ficha; '; end if;
    select count(*) into n from cuenta_jugador where user_id = v_k1;
    if n <> 0 then txt := txt || 'quedó la cuenta; '; end if;
    perform set_config('role', 'authenticated', true);
    estados[5] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[5] := case when txt = '' then 'Los dos rechazados y ni ficha ni cuenta.' else txt end;


    /* ---------- 7: el profe de otro plantel (antes del 6, que la resuelve) ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    begin
      perform aprobar_solicitud_jugador(jsonb_build_object('solicitudId', v_s1, 'codigo', v_codigo,
        'nombreClave', 'ZZTEST NUEVO', 'nombreLimpio', 'ZZTEST, NUEVO'));
      txt := 'aprobó una solicitud de U17M';
    exception when others then
      txt := case when sqlerrm = 'SOLICITUD_NO_ENCONTRADA' then '' else sqlerrm end;
    end;
    estados[7] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[7] := case when txt = '' then 'No la ve: SOLICITUD_NO_ENCONTRADA.' else txt end;


    /* ---------- 6: con el código ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    begin
      perform aprobar_solicitud_jugador(jsonb_build_object('solicitudId', v_s1,
        'codigo', ' ' || lower(left(v_codigo, 3)) || ' ' || lower(right(v_codigo, 3)),
        'nombreClave', 'ZZTEST NUEVO', 'nombreLimpio', 'ZZTEST, NUEVO'));
    exception when others then
      txt := sqlerrm;
    end;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from cuenta_jugador where user_id = v_k1 and hasta is null;
    if txt = '' and n <> 1 then txt := 'aprobó pero no quedó la cuenta'; end if;
    estados[6] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[6] := case when txt = '' then 'Ficha y cuenta creadas.' else txt end;

    raise exception using errcode = 'ZY001', message = 'fin';

  exception
    when sqlstate 'ZY001' then null;
    when others then falla_setup := sqlerrm;
  end;

  perform set_config('role', v_rol_previo, true);

  if falla_setup is not null then
    insert into verificacion_0037 values
      (0, 'SETUP', 'ERROR', falla_setup || '  (los casos que no llegaron a correr dicen "no corrió")');
  end if;
  for i in 1..7 loop
    insert into verificacion_0037 values (i, nombres[i], estados[i], detalles[i]);
  end loop;
end $$;

select n as "#", caso, estado, detalle
from verificacion_0037
order by n;
