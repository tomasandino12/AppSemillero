-- Verificación de 0034 (aperturas anónimas de recursos).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role, DESPUÉS de aplicar 0034 (y 0030, de la que depende).
--
-- LOS RESULTADOS SALEN COMO TABLA, una fila por caso: OK, FALLA o "no corrió".
--
-- NO DEJA NADA. Crea usuarios sintéticos, fichas, un recurso y sus envíos
-- dentro de un sub-bloque que al final se deshace a propósito con un SQLSTATE
-- reservado. Ningún dato real de ningún menor entra ni sale de acá.
--
-- La impersonación (role = authenticated + request.jwt.claims) es exactamente
-- como PostgREST evalúa RLS para una sesión real.

drop table if exists verificacion_apertura_recurso;
create temporary table verificacion_apertura_recurso (
  n integer primary key, caso text, estado text, detalle text
);

do $$
declare
  v_club uuid := '20000000-0000-0000-0000-000000000001';
  v_rol_previo text := current_setting('role');

  v_u17 uuid; v_u21 uuid; v_t17 uuid; v_t21 uuid;
  v_a  uuid := gen_random_uuid();   -- entrenador U17M
  v_b  uuid := gen_random_uuid();   -- entrenador U21M
  v_k1 uuid := gen_random_uuid();   -- jugadores con cuenta en U17M
  v_k2 uuid := gen_random_uuid();
  v_k3 uuid := gen_random_uuid();
  v_k4 uuid := gen_random_uuid();   -- jugador con cuenta al que NO se le envía nada

  v_j1 uuid; v_j2 uuid; v_j3 uuid; v_j4 uuid; v_sin uuid;
  v_recurso uuid; v_ajeno uuid;
  v_res jsonb;
  n integer;
  txt text;

  nombres text[] := array[
    '1. El jugador anota la apertura de un recurso que le enviaron, una sola vez',
    '2. El jugador no anota la apertura de un recurso que no le enviaron',
    '3. Nadie lee ni escribe la tabla directo (ni jugador ni entrenador)',
    '4. El entrenador del plantel ve conteos y ningún id de jugador',
    '5. Con menos de 3 cuentas no se informa cuántos abrieron',
    '6. Un entrenador de otro plantel no ve el resumen',
    '7. Sin cuenta vigente, registrar_apertura no anota nada'
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
    from (values (v_a,'a'), (v_b,'b'), (v_k1,'k1'), (v_k2,'k2'), (v_k3,'k3'), (v_k4,'k4')) as u(id, etiqueta);

    insert into miembro_club (user_id, club_id, es_entrenador) values
      (v_a, v_club, true), (v_b, v_club, true);
    insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen) values
      (v_a, v_club, v_u17, 'manual'), (v_b, v_club, v_u21, 'manual');

    insert into jugador (club_id, nombre_clave, nombre_limpio) values
      (v_club, 'ZZTEST APERTURA UNO',    'ZZTEST, APERTURA UNO'),
      (v_club, 'ZZTEST APERTURA DOS',    'ZZTEST, APERTURA DOS'),
      (v_club, 'ZZTEST APERTURA TRES',   'ZZTEST, APERTURA TRES'),
      (v_club, 'ZZTEST APERTURA CUATRO', 'ZZTEST, APERTURA CUATRO'),
      (v_club, 'ZZTEST APERTURA SIN CUENTA', 'ZZTEST, APERTURA SIN CUENTA');
    select id into v_j1  from jugador where club_id = v_club and nombre_clave = 'ZZTEST APERTURA UNO';
    select id into v_j2  from jugador where club_id = v_club and nombre_clave = 'ZZTEST APERTURA DOS';
    select id into v_j3  from jugador where club_id = v_club and nombre_clave = 'ZZTEST APERTURA TRES';
    select id into v_j4  from jugador where club_id = v_club and nombre_clave = 'ZZTEST APERTURA CUATRO';
    select id into v_sin from jugador where club_id = v_club and nombre_clave = 'ZZTEST APERTURA SIN CUENTA';

    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
    select v_club, j, v_u17, v_t17, '2026-03-01' from unnest(array[v_j1, v_j2, v_j3, v_j4, v_sin]) as j;
    insert into cuenta_jugador (user_id, club_id, jugador_id, aprobado_por) values
      (v_k1, v_club, v_j1, v_a), (v_k2, v_club, v_j2, v_a), (v_k3, v_club, v_j3, v_a), (v_k4, v_club, v_j4, v_a);

    insert into recurso (club_id, titulo, descripcion, creado_por)
      values (v_club, 'ZZTEST recurso', 'ZZTEST', v_a) returning id into v_recurso;
    insert into recurso (club_id, titulo, descripcion, creado_por)
      values (v_club, 'ZZTEST recurso ajeno', 'ZZTEST', v_a) returning id into v_ajeno;
    -- k1, k2, k3 y el chico sin cuenta reciben el recurso; k4 no.
    insert into envio_recurso (club_id, recurso_id, jugador_id, fecha)
    select v_club, v_recurso, j, current_date from unnest(array[v_j1, v_j2, v_j3, v_sin]) as j;


    /* ---------- 1 y 2: registrar_apertura ---------- */

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_k1, 'role', 'authenticated')::text, true);
    perform registrar_apertura(v_recurso);
    perform registrar_apertura(v_recurso);
    perform set_config('request.jwt.claims', json_build_object('sub', v_k2, 'role', 'authenticated')::text, true);
    perform registrar_apertura(v_recurso);

    -- k4 no recibió el recurso: intenta anotarlo igual. Y k1 intenta uno ajeno.
    perform set_config('request.jwt.claims', json_build_object('sub', v_k4, 'role', 'authenticated')::text, true);
    perform registrar_apertura(v_recurso);
    perform set_config('request.jwt.claims', json_build_object('sub', v_k1, 'role', 'authenticated')::text, true);
    perform registrar_apertura(v_ajeno);

    perform set_config('role', v_rol_previo, true);
    txt := '';
    select count(*) into n from apertura_recurso where recurso_id = v_recurso and jugador_id = v_j1;
    if n <> 1 then txt := txt || 'k1 quedó con ' || n || ' filas (esperaba 1, sin duplicar); '; end if;
    select count(*) into n from apertura_recurso where recurso_id = v_recurso and jugador_id = v_j2;
    if n <> 1 then txt := txt || 'k2 no quedó anotado; '; end if;
    if txt = '' then
      estados[1] := 'OK'; detalles[1] := 'Una fila por par recurso-jugador, aunque abra dos veces.';
    else
      estados[1] := 'FALLA'; detalles[1] := txt;
    end if;

    txt := '';
    select count(*) into n from apertura_recurso where recurso_id = v_recurso and jugador_id = v_j4;
    if n <> 0 then txt := txt || 'k4 anotó un recurso que no le enviaron; '; end if;
    select count(*) into n from apertura_recurso where recurso_id = v_ajeno;
    if n <> 0 then txt := txt || 'k1 anotó un recurso que no le enviaron; '; end if;
    if txt = '' then
      estados[2] := 'OK'; detalles[2] := 'Sin envío no hay apertura, y no da error (no revela qué recursos existen).';
    else
      estados[2] := 'FALLA'; detalles[2] := txt;
    end if;


    /* ---------- 3: la tabla está cerrada ---------- */

    txt := '';
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    begin
      perform 1 from apertura_recurso;
      txt := txt || 'el entrenador pudo leer la tabla; ';
    exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_k1, 'role', 'authenticated')::text, true);
    begin
      perform 1 from apertura_recurso;
      txt := txt || 'el jugador pudo leer la tabla; ';
    exception when insufficient_privilege then null; end;
    begin
      insert into apertura_recurso (recurso_id, jugador_id, club_id) values (v_ajeno, v_j1, v_club);
      txt := txt || 'el jugador pudo insertar directo; ';
    exception when insufficient_privilege then null; end;
    if txt = '' then
      estados[3] := 'OK'; detalles[3] := 'select e insert directos dan permiso denegado.';
    else
      estados[3] := 'FALLA'; detalles[3] := txt;
    end if;


    /* ---------- 4: el resumen del entrenador ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_res := resumen_recursos(v_u17);
    -- 4 cuentas en el plantel (k1..k4); el recurso se envió a 4 fichas (3 con cuenta + 1 sin).
    if (v_res->>'conCuenta')::int is distinct from 4 then txt := txt || 'conCuenta = ' || coalesce(v_res->>'conCuenta', 'null') || ' (esperaba 4); '; end if;
    if (v_res->>'abrieronAlguno')::int is distinct from 2 then txt := txt || 'abrieronAlguno = ' || coalesce(v_res->>'abrieronAlguno', 'null') || ' (esperaba 2); '; end if;
    select count(*) into n from jsonb_array_elements(v_res->'recursos') r
      where r->>'recursoId' = v_recurso::text
        and (r->>'enviados')::int = 4 and (r->>'conCuenta')::int = 3 and (r->>'abrieron')::int = 2;
    if n <> 1 then txt := txt || 'el recurso no sale con 4 enviados, 3 con cuenta y 2 que abrieron; '; end if;
    if v_res::text ~* ('(' || v_j1 || '|' || v_j2 || '|' || v_j3 || '|' || v_j4 || '|' || v_sin || '|' || v_k1 || '|ZZTEST)') then
      txt := txt || 'el resumen contiene un id o un nombre; ';
    end if;
    if txt = '' then
      estados[4] := 'OK'; detalles[4] := 'Sólo conteos: 4 cuentas, 2 abrieron alguno, el recurso a 4 (3 con cuenta, 2 abrieron).';
    else
      estados[4] := 'FALLA'; detalles[4] := txt;
    end if;


    /* ---------- 6: otro plantel ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    if resumen_recursos(v_u17) is null then
      estados[6] := 'OK'; detalles[6] := 'El entrenador de U21M recibe null.';
    else
      estados[6] := 'FALLA'; detalles[6] := 'El entrenador de U21M vio el resumen de U17M.';
    end if;


    /* ---------- 7: cuenta cerrada ---------- */

    perform set_config('role', v_rol_previo, true);
    update cuenta_jugador set hasta = now(), revocado_por = v_a where jugador_id = v_j3;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_k3, 'role', 'authenticated')::text, true);
    perform registrar_apertura(v_recurso);
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from apertura_recurso where recurso_id = v_recurso and jugador_id = v_j3;
    if n = 0 then
      estados[7] := 'OK'; detalles[7] := 'Con la cuenta cerrada no anota.';
    else
      estados[7] := 'FALLA'; detalles[7] := 'Una cuenta cerrada anotó una apertura.';
    end if;


    /* ---------- 5: piso de 3 cuentas ---------- */

    -- Con k3 cerrada y k4 cerrada quedan 2 cuentas vigentes: el resumen no
    -- puede decir cuántos abrieron.
    update cuenta_jugador set hasta = now(), revocado_por = v_a where jugador_id = v_j4;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_res := resumen_recursos(v_u17);
    perform set_config('role', v_rol_previo, true);
    txt := '';
    if (v_res->>'conCuenta')::int is distinct from 2 then txt := txt || 'conCuenta = ' || coalesce(v_res->>'conCuenta', 'null') || ' (esperaba 2); '; end if;
    if jsonb_typeof(v_res->'abrieronAlguno') <> 'null' then txt := txt || 'abrieronAlguno informa un número; '; end if;
    select count(*) into n from jsonb_array_elements(v_res->'recursos') r where jsonb_typeof(r->'abrieron') <> 'null';
    if n <> 0 then txt := txt || 'un recurso informa cuántos abrieron; '; end if;
    if txt = '' then
      estados[5] := 'OK'; detalles[5] := 'Con 2 cuentas vigentes, abrieron y abrieronAlguno salen null.';
    else
      estados[5] := 'FALLA'; detalles[5] := txt;
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
    insert into verificacion_apertura_recurso values
      (0, 'SETUP', 'ERROR', falla_setup || '  (los casos que no llegaron a correr dicen "no corrió")');
  end if;

  for i in 1..7 loop
    insert into verificacion_apertura_recurso values (i, nombres[i], estados[i], detalles[i]);
  end loop;
end $$;

select n as "#", caso, estado, detalle
from verificacion_apertura_recurso
order by n;
