-- Verificación de 0029 y 0030 (cuenta de jugador).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role, después de aplicar 0029 y otra vez después de 0030. Los casos de
-- lectura (8 en adelante) dicen PENDIENTE hasta que 0030 esté aplicada.
--
-- LOS RESULTADOS SALEN COMO TABLA, una fila por caso: OK, FALLA o PENDIENTE.
--
-- NO DEJA NADA. Crea usuarios sintéticos en auth.users, membresías, fichas y
-- solicitudes dentro de un sub-bloque que al final se deshace a propósito con
-- un SQLSTATE reservado. Ningún dato real de ningún menor entra ni sale de acá.
--
-- La impersonación (role = authenticated + request.jwt.claims) es exactamente
-- como PostgREST evalúa RLS para una sesión real.

drop table if exists verificacion_cuenta_jugador;
create temporary table verificacion_cuenta_jugador (
  n integer primary key, caso text, estado text, detalle text
);

do $$
declare
  v_club uuid := '20000000-0000-0000-0000-000000000001';
  v_rol_previo text := current_setting('role');

  v_u17 uuid; v_u21 uuid; v_t17 uuid; v_t21 uuid;
  v_a  uuid := gen_random_uuid();   -- entrenador U17M
  v_b  uuid := gen_random_uuid();   -- entrenador U21M
  v_k1 uuid := gen_random_uuid();   -- chico que pide U17M, ficha nueva
  v_k2 uuid := gen_random_uuid();   -- chico que pide U17M, ficha existente
  v_k3 uuid := gen_random_uuid();   -- chico que pide U17M, casos de error

  v_j_exist uuid;   -- ficha que ya existía en U17M
  v_j21 uuid;       -- ficha de U21M
  v_s1 uuid; v_s2 uuid; v_s3 uuid;
  v_jug1 uuid;
  v_res jsonb;
  n integer; m integer; k integer;
  txt text; txt2 text;
  v_hasta timestamptz; v_revocado uuid;

  nombres text[] := array[
    '1. El chico pide una vez; el staff y quien ya pidió no',
    '2. Un entrenador sin asignación al plantel no ve ni aprueba la solicitud',
    '3. Aprobar creando la ficha: jugador + pertenencia + cuenta, todo junto',
    '4. Aprobar eligiendo una ficha existente',
    '5. Los errores no dejan nada a medias',
    '6. Revocar cierra, no borra',
    '7. Vincular por la libre no se puede'
  ];
  estados  text[] := array_fill('no corrió'::text, array[7]);
  detalles text[] := array_fill(''::text, array[7]);
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

    insert into jugador (club_id, nombre_clave, nombre_limpio)
      values (v_club, 'ZZTEST CUENTA EXISTENTE', 'ZZTEST, CUENTA EXISTENTE') returning id into v_j_exist;
    insert into jugador (club_id, nombre_clave, nombre_limpio)
      values (v_club, 'ZZTEST CUENTA VEINTIUNO', 'ZZTEST, CUENTA VEINTIUNO') returning id into v_j21;
    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde) values
      (v_club, v_j_exist, v_u17, v_t17, '2026-03-01'),
      (v_club, v_j21,     v_u21, v_t21, '2026-03-01');


    /* ---------- 1: pedir acceso ---------- */

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_k1, 'role', 'authenticated')::text, true);

    txt := '';
    select count(*) into n from clubes_para_solicitar() where plantel_id = v_u17;
    if n <> 1 then txt := txt || 'el catálogo no ofrece U17M; '; end if;

    v_res := crear_solicitud_jugador(v_club, v_u17);
    v_s1 := (v_res->>'solicitudId')::uuid;

    begin
      perform crear_solicitud_jugador(v_club, v_u21);
      txt := txt || 'una segunda pendiente pasó; ';
    exception when others then
      if sqlerrm <> 'SOLICITUD_YA_PENDIENTE' then txt := txt || 'segunda pendiente: ' || sqlerrm || '; '; end if;
    end;

    select count(*) into n from mi_solicitud_jugador() where estado = 'pendiente';
    if n <> 1 then txt := txt || 'mi_solicitud_jugador no la muestra; '; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    begin
      perform crear_solicitud_jugador(v_club, v_u17);
      txt := txt || 'un entrenador pudo pedir ser jugador; ';
    exception when others then
      if sqlerrm <> 'ES_DEL_CUERPO_TECNICO' then txt := txt || 'entrenador: ' || sqlerrm || '; '; end if;
    end;

    if txt = '' then
      estados[1] := 'OK'; detalles[1] := 'Una pendiente por cuenta; el staff rechazado; el chico la ve.';
    else
      estados[1] := 'FALLA'; detalles[1] := txt;
    end if;


    /* ---------- 2: un entrenador ajeno al plantel ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    begin
      perform 1 from solicitudes_del_plantel(v_u17);
      txt := txt || 'listó solicitudes de un plantel ajeno; ';
    exception when others then null; end;
    select count(*) into n from solicitud_jugador where id = v_s1;
    if n <> 0 then txt := txt || 've la solicitud; '; end if;
    begin
      perform aprobar_solicitud_jugador(jsonb_build_object('solicitudId', v_s1, 'jugadorId', v_j_exist));
      txt := txt || 'aprobó; ';
    exception when others then
      if sqlerrm <> 'SOLICITUD_NO_ENCONTRADA' then txt := txt || 'aprobar: ' || sqlerrm || '; '; end if;
    end;
    begin
      perform rechazar_solicitud_jugador(v_s1);
      txt := txt || 'rechazó; ';
    exception when others then null; end;

    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    select count(*) into n from solicitudes_del_plantel(v_u17) where id = v_s1 and nombre = 'ZZTEST Nombre k1';
    if n <> 1 then txt := txt || 'el entrenador del plantel no la ve con el nombre; '; end if;

    if txt = '' then
      estados[2] := 'OK'; detalles[2] := 'El de U21M no la lista, no la ve, no la aprueba ni la rechaza; el de U17M sí, con nombre.';
    else
      estados[2] := 'FALLA'; detalles[2] := txt;
    end if;


    /* ---------- 3: aprobar creando la ficha ---------- */

    txt := '';
    v_res := aprobar_solicitud_jugador(jsonb_build_object(
      'solicitudId', v_s1, 'nombreClave', 'ZZTEST CUENTA UNO', 'nombreLimpio', 'ZZTEST, CUENTA UNO'));
    v_jug1 := (v_res->>'jugadorId')::uuid;

    perform set_config('role', v_rol_previo, true);
    select count(*) into n from jugador where id = v_jug1 and nombre_clave = 'ZZTEST CUENTA UNO';
    if n <> 1 then txt := txt || 'no hay ficha; '; end if;
    select count(*) into n from pertenencia
      where jugador_id = v_jug1 and plantel_id = v_u17 and temporada_id = v_t17 and hasta is null;
    if n <> 1 then txt := txt || 'no hay pertenencia vigente al plantel; '; end if;
    select count(*) into n from cuenta_jugador
      where jugador_id = v_jug1 and user_id = v_k1 and hasta is null and aprobado_por = v_a;
    if n <> 1 then txt := txt || 'la cuenta no quedó vinculada por quien aprobó; '; end if;
    select count(*) into n from solicitud_jugador
      where id = v_s1 and estado = 'aprobada' and resuelto_por = v_a and resuelto_en is not null;
    if n <> 1 then txt := txt || 'la solicitud no quedó aprobada y sellada; '; end if;

    if txt = '' then
      estados[3] := 'OK'; detalles[3] := 'Ficha, pertenencia vigente, cuenta y solicitud sellada.';
    else
      estados[3] := 'FALLA'; detalles[3] := txt;
    end if;


    /* ---------- 4: aprobar con una ficha existente ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_k2, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_s2 := (crear_solicitud_jugador(v_club, v_u17)->>'solicitudId')::uuid;

    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    select count(*) into m from jugador where club_id = v_club;
    perform aprobar_solicitud_jugador(jsonb_build_object('solicitudId', v_s2, 'jugadorId', v_j_exist));
    select count(*) into k from jugador where club_id = v_club;
    if k <> m then txt := txt || 'creó una ficha de más; '; end if;

    perform set_config('role', v_rol_previo, true);
    select count(*) into n from cuenta_jugador
      where jugador_id = v_j_exist and user_id = v_k2 and hasta is null;
    if n <> 1 then txt := txt || 'no vinculó a la ficha elegida; '; end if;

    if txt = '' then
      estados[4] := 'OK'; detalles[4] := 'Vinculó a la ficha elegida sin crear otra.';
    else
      estados[4] := 'FALLA'; detalles[4] := txt;
    end if;


    /* ---------- 5: los errores no dejan nada a medias ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_k3, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_s3 := (crear_solicitud_jugador(v_club, v_u17)->>'solicitudId')::uuid;

    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

    -- (a) nombre que ya existe: JUGADOR_YA_EXISTE y nada nuevo.
    begin
      perform aprobar_solicitud_jugador(jsonb_build_object(
        'solicitudId', v_s3, 'nombreClave', 'ZZTEST CUENTA EXISTENTE', 'nombreLimpio', 'ZZTEST, CUENTA EXISTENTE'));
      txt := txt || 'creó una ficha repetida; ';
    exception when others then
      if sqlerrm <> 'JUGADOR_YA_EXISTE' then txt := txt || '(a) ' || sqlerrm || '; '; end if;
    end;
    -- (b) ficha de otro plantel.
    begin
      perform aprobar_solicitud_jugador(jsonb_build_object('solicitudId', v_s3, 'jugadorId', v_j21));
      txt := txt || 'vinculó una ficha de otro plantel; ';
    exception when others then
      if sqlerrm <> 'FICHA_FUERA_DEL_PLANTEL' then txt := txt || '(b) ' || sqlerrm || '; '; end if;
    end;
    -- (c) ficha que ya tiene cuenta vigente.
    begin
      perform aprobar_solicitud_jugador(jsonb_build_object('solicitudId', v_s3, 'jugadorId', v_j_exist));
      txt := txt || 'le colgó dos cuentas a una ficha; ';
    exception when others then
      if sqlerrm <> 'JUGADOR_YA_TIENE_CUENTA' then txt := txt || '(c) ' || sqlerrm || '; '; end if;
    end;

    perform set_config('role', v_rol_previo, true);
    select count(*) into n from solicitud_jugador where id = v_s3 and estado = 'pendiente';
    if n <> 1 then txt := txt || 'la solicitud dejó de estar pendiente; '; end if;
    select count(*) into n from cuenta_jugador where user_id = v_k3;
    if n <> 0 then txt := txt || 'quedó una cuenta; '; end if;
    select count(*) into n from jugador where club_id = v_club and nombre_clave = 'ZZTEST CUENTA EXISTENTE';
    if n <> 1 then txt := txt || 'la ficha existente se duplicó; '; end if;
    select count(*) into n from pertenencia where jugador_id = v_j_exist and hasta is null;
    if n <> 1 then txt := txt || 'la ficha existente quedó con pertenencias de más; '; end if;

    if txt = '' then
      estados[5] := 'OK'; detalles[5] := 'Ficha repetida, ficha ajena y ficha con cuenta: error claro y nada guardado.';
    else
      estados[5] := 'FALLA'; detalles[5] := txt;
    end if;


    /* ---------- 6: revocar cierra, no borra ---------- */

    txt := '';
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    begin
      perform revocar_cuenta_jugador(v_jug1);
      txt := txt || 'un entrenador ajeno revocó; ';
    exception when others then null; end;

    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform revocar_cuenta_jugador(v_jug1);

    begin
      update cuenta_jugador set hasta = '2000-01-01' where jugador_id = v_jug1;
      get diagnostics n = row_count;
      if n > 0 then txt := txt || 'reescribió la fecha de un cierre; '; end if;
    exception when others then null; end;
    begin
      delete from cuenta_jugador where jugador_id = v_jug1;
      txt := txt || 'pudo borrar; ';
    exception when others then null; end;
    begin
      perform revocar_cuenta_jugador(v_jug1);
      txt := txt || 'revocó dos veces; ';
    exception when others then
      if sqlerrm <> 'SIN_CUENTA_VIGENTE' then txt := txt || 'revocar de nuevo: ' || sqlerrm || '; '; end if;
    end;

    perform set_config('role', v_rol_previo, true);
    select hasta, revocado_por into v_hasta, v_revocado from cuenta_jugador where jugador_id = v_jug1;
    select count(*) into n from cuenta_jugador where jugador_id = v_jug1;
    if n <> 1 then txt := txt || 'la fila no quedó (se borró o se duplicó); '; end if;
    if v_hasta is null or v_hasta < now() - interval '1 minute' then
      txt := txt || 'no se selló hasta = ahora; ';
    end if;
    if v_revocado is distinct from v_a then txt := txt || 'no se selló quién revocó; '; end if;

    if txt = '' then
      estados[6] := 'OK'; detalles[6] := 'Cerrada con fecha y autor del servidor; sin delete, sin reescribir, sin revocar dos veces.';
    else
      estados[6] := 'FALLA'; detalles[6] := txt;
    end if;


    /* ---------- 7: vincular por la libre ---------- */

    txt := '';
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    -- (a) una cuenta que no pidió nada.
    begin
      insert into cuenta_jugador (user_id, club_id, jugador_id) values (v_b, v_club, v_j_exist);
      txt := txt || 'vinculó una cuenta sin solicitud; ';
    exception when others then null; end;
    -- (b) una cuenta con solicitud pendiente, a una ficha de otro plantel.
    begin
      insert into cuenta_jugador (user_id, club_id, jugador_id) values (v_k3, v_club, v_j21);
      txt := txt || 'vinculó a una ficha que no es del plantel pedido; ';
    exception when others then null; end;
    -- (c) antedatar. Con v_jug1 (su cuenta ya está cerrada) el resto del insert
    -- sería válido: lo único que lo frena es el grant por columna.
    begin
      insert into cuenta_jugador (user_id, club_id, jugador_id, desde) values (v_k3, v_club, v_jug1, '2000-01-01');
      txt := txt || 'mandó la fecha de alta; ';
    exception when others then null; end;

    if txt = '' then
      estados[7] := 'OK'; detalles[7] := 'El insert directo exige solicitud pendiente y ficha del plantel, y no acepta fechas.';
    else
      estados[7] := 'FALLA'; detalles[7] := txt;
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
    insert into verificacion_cuenta_jugador values
      (0, 'SETUP', 'ERROR', falla_setup || '  (los casos que no llegaron a correr dicen "no corrió")');
  end if;

  for i in 1..7 loop
    insert into verificacion_cuenta_jugador values (i, nombres[i], estados[i], detalles[i]);
  end loop;
end $$;

select n as "#", caso, estado, detalle
from verificacion_cuenta_jugador
order by n;
