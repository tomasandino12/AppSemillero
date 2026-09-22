-- Verificación de 0039 (baja de un profe y ventana del historial corporal).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role, después de aplicar 0039. O local:
--   docker exec -i supabase_db_modelo-datos-supabase psql -U postgres < tests/verificarBajaProfe.sql
--
-- LOS RESULTADOS SALEN COMO TABLA, una fila por caso: OK o FALLA.
--
-- NO DEJA NADA: todo dentro de un sub-bloque que se deshace al final. Para
-- simular una medida cargada hace un mes (toda la verificación es una sola
-- transacción y now() no avanza), el setup apaga los triggers de sellado un
-- momento; el `alter table` también se deshace.

drop table if exists verificacion_0039;
create temporary table verificacion_0039 (
  n integer primary key, caso text, estado text, detalle text
);

do $$
declare
  v_club uuid := '20000000-0000-0000-0000-000000000001';
  v_rol_previo text := current_setting('role');
  v_u17 uuid; v_u21 uuid; v_t17 uuid; v_t21 uuid;
  v_c  uuid := gen_random_uuid();   -- coordinación
  v_c2 uuid := gen_random_uuid();   -- otra persona de coordinación
  v_a  uuid := gen_random_uuid();   -- profe de U17M que se va
  v_e  uuid := gen_random_uuid();   -- profe de U17M que se queda
  v_b  uuid := gen_random_uuid();   -- profe de U21M que "adopta"
  v_d  uuid := gen_random_uuid();   -- entrenador sin ninguna categoría vigente
  v_k uuid; v_vieja uuid; v_nueva uuid;
  v_res jsonb;
  n integer; txt text;

  nombres text[] := array[
    '1. Coordinación da de baja: categorías cerradas, rol apagado, autor sellado',
    '2. El dado de baja no lee chicos, recursos ni importaciones y no escribe',
    '3. Un entrenador sin categorías vigentes no lee el padrón',
    '4. Reglas de la baja y de la reasignación',
    '5. Sumar a un chico no abre sus medidas anteriores',
    '6. Su profe de siempre sigue viendo todo'
  ];
  estados  text[] := array_fill('no corrió'::text, array[6]);
  detalles text[] := array_fill(''::text, array[6]);
  falla_setup text := null;
begin
  begin

    /* ---------- setup, como service role ---------- */

    select id, temporada_id into v_u17, v_t17 from plantel where club_id = v_club and categoria = 'U17M';
    select id, temporada_id into v_u21, v_t21 from plantel where club_id = v_club and categoria = 'U21M';

    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
           'zztest-' || u.etiqueta || '@verificacion.invalid', now(), now(), now()
    from (values (v_c,'c'), (v_c2,'c2'), (v_a,'a'), (v_e,'e'), (v_b,'b'), (v_d,'d')) as u(id, etiqueta);

    insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador) values
      (v_c, v_club, false, true), (v_c2, v_club, true, true),
      (v_a, v_club, true, false), (v_e, v_club, true, false), (v_b, v_club, true, false), (v_d, v_club, true, false);
    insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen) values
      (v_a, v_club, v_u17, 'manual'), (v_e, v_club, v_u17, 'manual'), (v_b, v_club, v_u21, 'manual'),
      (v_d, v_club, v_u21, 'manual');
    update asignacion_plantel set hasta = now()
      where miembro_club_user_id = v_d and hasta is null;

    -- Un chico de U17M desde antes de 0039, con una medida cargada hace un mes.
    v_k := gen_random_uuid();
    insert into jugador (id, club_id, nombre_clave, nombre_limpio) values (v_k, v_club, 'ZZTEST VENTANA', 'ZZTEST, VENTANA');
    alter table pertenencia disable trigger pertenencia_sellar;
    alter table medicion_corporal disable trigger medicion_corporal_sellar;
    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde, registrada_en)
      values (v_club, v_k, v_u17, v_t17, '2026-03-01', '-infinity');
    v_vieja := gen_random_uuid();
    insert into medicion_corporal (id, club_id, jugador_id, fecha_medicion, altura_cm, creado_en, creado_por)
      values (v_vieja, v_club, v_k, '2026-08-20', 170, now() - interval '30 days', v_e);
    alter table pertenencia enable trigger pertenencia_sellar;
    alter table medicion_corporal enable trigger medicion_corporal_sellar;

    perform set_config('role', 'authenticated', true);


    /* ---------- 1: la baja ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
    v_res := dar_de_baja_profe(v_a, v_club);
    if (v_res->>'asignacionesCerradas')::int <> 1 then txt := txt || 'cerró ' || (v_res->>'asignacionesCerradas') || ' categorías; '; end if;
    select count(*) into n from miembros_del_club(v_club)
      where user_id = v_a and not es_entrenador and baja_en is not null;
    if n <> 1 then txt := txt || 'el panel no lo muestra dado de baja; '; end if;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from miembro_club where user_id = v_a and baja_por = v_c;
    if n <> 1 then txt := txt || 'sin autor de la baja; '; end if;
    select count(*) into n from asignacion_plantel where miembro_club_user_id = v_a and hasta is not null and cerrado_por = v_c;
    if n <> 1 then txt := txt || 'la categoría no quedó cerrada por coordinación; '; end if;
    perform set_config('role', 'authenticated', true);
    estados[1] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[1] := case when txt = '' then 'Una categoría cerrada con autor C, es_entrenador = false, baja_en y baja_por.' else txt end;


    /* ---------- 2: el dado de baja ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    begin
      perform jugadores_del_club_para_dedup(v_club);
      txt := txt || 'leyó el padrón; ';
    exception when insufficient_privilege then null;
    end;
    select count(*) into n from jugador where id = v_k;
    if n <> 0 then txt := txt || 've al chico; '; end if;
    select count(*) into n from recurso where club_id = v_club;
    if n <> 0 then txt := txt || 've recursos; '; end if;
    select count(*) into n from importacion where club_id = v_club;
    if n <> 0 then txt := txt || 've importaciones; '; end if;
    begin
      insert into jugador (club_id, nombre_clave, nombre_limpio) values (v_club, 'ZZTEST BAJA', 'ZZTEST, BAJA');
      txt := txt || 'creó una ficha; ';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into importacion (club_id, hash_archivo, nombre_archivo) values (v_club, 'zztest-baja', 'x.xlsx');
      txt := txt || 'creó una importación; ';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into recurso (club_id, titulo, descripcion) values (v_club, 'ZZTEST', 'ZZTEST');
      txt := txt || 'creó un recurso; ';
    exception when insufficient_privilege then null;
    end;
    estados[2] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[2] := case when txt = '' then 'Padrón rechazado, 0 filas, y las tres escrituras rechazadas por RLS.' else txt end;


    /* ---------- 3: entrenador sin categorías ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
    begin
      perform jugadores_del_club_para_dedup(v_club);
      txt := 'leyó el padrón sin ninguna categoría';
    exception when insufficient_privilege then
      txt := '';
    end;
    estados[3] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[3] := case when txt = '' then 'Rechazado (42501).' else txt end;


    /* ---------- 4: reglas ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
    begin perform dar_de_baja_profe(v_c, v_club); txt := txt || 'se dio de baja a sí mismo; ';
    exception when others then if sqlerrm <> 'NO_ES_UNO_MISMO' then txt := txt || sqlerrm || '; '; end if; end;
    begin perform dar_de_baja_profe(v_c2, v_club); txt := txt || 'dio de baja a coordinación; ';
    exception when others then if sqlerrm <> 'ES_COORDINACION' then txt := txt || sqlerrm || '; '; end if; end;
    begin perform dar_de_baja_profe(v_a, v_club); txt := txt || 'dos bajas seguidas; ';
    exception when others then if sqlerrm <> 'YA_DADO_DE_BAJA' then txt := txt || sqlerrm || '; '; end if; end;
    begin perform asignar_planteles(v_a, v_club, array[v_u17]); txt := txt || 'lo reasignó; ';
    exception when others then if sqlerrm <> 'DADO_DE_BAJA' then txt := txt || sqlerrm || '; '; end if; end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    begin perform dar_de_baja_profe(v_e, v_club); txt := txt || 'un entrenador dio de baja a otro; ';
    exception when insufficient_privilege then null; end;
    estados[4] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[4] := case when txt = '' then 'Ni a uno mismo, ni a coordinación, ni dos veces, ni por un entrenador; no se reasigna.' else txt end;


    /* ---------- 5: la adopción ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde, registrada_en)
      values (v_club, v_k, v_u21, v_t21, '2020-01-01', '-infinity');
    select count(*) into n from medicion_corporal where id = v_vieja;
    if n <> 0 then txt := txt || 've la medida anterior; '; end if;
    v_nueva := gen_random_uuid();
    insert into medicion_corporal (id, club_id, jugador_id, fecha_medicion, altura_cm, creado_en)
      values (v_nueva, v_club, v_k, '2026-03-10', 171, now() - interval '1 year');
    select count(*) into n from medicion_corporal where id = v_nueva;
    if n <> 1 then txt := txt || 'no ve la que cargó (con fecha de marzo); '; end if;
    update medicion_corporal set altura_cm = 199;
    delete from medicion_corporal;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from medicion_corporal where id = v_vieja and altura_cm = 170;
    if n <> 1 then txt := txt || 'tocó la medida anterior con un update o delete sin filtro; '; end if;
    select count(*) into n from pertenencia where jugador_id = v_k and plantel_id = v_u21 and registrada_en > '-infinity';
    if n <> 1 then txt := txt || 'la pertenencia aceptó registrada_en del cliente; '; end if;
    perform set_config('role', 'authenticated', true);
    estados[5] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[5] := case when txt = '' then 'No ve ni toca la de hace un mes; ve la que cargó hoy aunque su fecha sea de marzo.' else txt end;


    /* ---------- 6: el profe de siempre ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_e, 'role', 'authenticated')::text, true);
    select count(*) into n from medicion_corporal where jugador_id = v_k;
    -- La nueva la borró el delete del caso 5 (era de B, dentro de su ventana):
    -- queda la vieja.
    estados[6] := case when n = 1 then 'OK' else 'FALLA' end;
    detalles[6] := case when n = 1 then 'Ve la medida de hace un mes (pertenencia anterior a 0039).' else 've ' || n || ' medidas' end;

    raise exception using errcode = 'ZY001', message = 'fin';

  exception
    when sqlstate 'ZY001' then null;
    when others then falla_setup := sqlerrm;
  end;

  perform set_config('role', v_rol_previo, true);

  if falla_setup is not null then
    insert into verificacion_0039 values
      (0, 'SETUP', 'ERROR', falla_setup || '  (los casos que no llegaron a correr dicen "no corrió")');
  end if;
  for i in 1..6 loop
    insert into verificacion_0039 values (i, nombres[i], estados[i], detalles[i]);
  end loop;
end $$;

select n as "#", caso, estado, detalle
from verificacion_0039
order by n;
