-- Verificación de 0051 (constancia de aceptación de Términos y Privacidad).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role, después de aplicar 0051. O local:
--   docker exec -i supabase_db_modelo-datos-supabase psql -U postgres < tests/verificarAceptacionLegal.sql
--
-- LOS RESULTADOS SALEN COMO TABLA, una fila por caso: OK o FALLA.
--
-- NO DEJA NADA: todo dentro de un sub-bloque que se deshace al final.

drop table if exists verificacion_0051;
create temporary table verificacion_0051 (
  n integer primary key, caso text, estado text, detalle text
);

do $$
declare
  v_rol_previo text := current_setting('role');
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_usuario uuid; v_en timestamptz;
  n integer; txt text;

  nombres text[] := array[
    '1. Aceptar deja una fila sellada con el usuario y la hora del servidor',
    '2. No se puede elegir el usuario ni la fecha al insertar',
    '3. Aceptar dos veces la misma versión choca con el unique',
    '4. Cada uno ve sólo sus aceptaciones',
    '5. Nadie edita ni borra una aceptación',
    '6. anon no lee ni escribe'
  ];
  estados  text[] := array_fill('no corrió'::text, array[6]);
  detalles text[] := array_fill(''::text, array[6]);
  falla_setup text := null;
begin
  begin

    /* ---------- setup, como service role ---------- */

    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
    select u.id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
           'zztest-' || u.etiqueta || '@verificacion.invalid', now(), now(), now()
    from (values (v_a, 'a'), (v_b, 'b')) as u(id, etiqueta);

    perform set_config('role', 'authenticated', true);

    /* ---------- 1: aceptar ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    insert into aceptacion_legal (version) values ('2026-09-26');
    perform set_config('role', v_rol_previo, true);
    select usuario, aceptado_en into v_usuario, v_en from aceptacion_legal where usuario = v_a;
    perform set_config('role', 'authenticated', true);
    estados[1] := case when v_usuario = v_a and v_en = now() then 'OK' else 'FALLA' end;
    detalles[1] := coalesce('usuario ' || (v_usuario = v_a)::text || ', hora del servidor ' || (v_en = now())::text, 'no se guardó');

    /* ---------- 2: columnas selladas ---------- */

    txt := '';
    begin
      insert into aceptacion_legal (version, usuario) values ('2026-01-01', v_b);
      txt := txt || 'insertó con usuario ajeno; ';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into aceptacion_legal (version, aceptado_en) values ('2026-01-02', now() - interval '1 year');
      txt := txt || 'insertó con fecha elegida; ';
    exception when insufficient_privilege then null;
    end;
    estados[2] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[2] := case when txt = '' then 'Los dos rechazados (42501).' else txt end;

    /* ---------- 3: unique ---------- */

    begin
      insert into aceptacion_legal (version) values ('2026-09-26');
      estados[3] := 'FALLA'; detalles[3] := 'se duplicó';
    exception when unique_violation then
      estados[3] := 'OK'; detalles[3] := 'Rechazado (23505): la app lo toma como ya aceptado.';
    end;

    /* ---------- 4: cada uno lo suyo ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    select count(*) into n from aceptacion_legal;
    estados[4] := case when n = 0 then 'OK' else 'FALLA' end;
    detalles[4] := case when n = 0 then 'B no ve la aceptación de A.' else 'B ve ' || n || ' filas' end;

    /* ---------- 5: sin update ni delete ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    txt := '';
    begin
      update aceptacion_legal set version = '2020-01-01';
      txt := txt || 'pudo editar; ';
    exception when insufficient_privilege then null;
    end;
    begin
      delete from aceptacion_legal;
      txt := txt || 'pudo borrar; ';
    exception when insufficient_privilege then null;
    end;
    estados[5] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[5] := case when txt = '' then 'Update y delete rechazados (42501).' else txt end;

    /* ---------- 6: anon ---------- */

    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    txt := '';
    begin
      select count(*) into n from aceptacion_legal;
      txt := txt || 'anon leyó; ';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into aceptacion_legal (version) values ('2026-09-26');
      txt := txt || 'anon escribió; ';
    exception when insufficient_privilege then null;
    end;
    estados[6] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[6] := case when txt = '' then 'Lectura y escritura rechazadas (42501).' else txt end;

    raise exception using errcode = 'ZY001', message = 'fin';

  exception
    when sqlstate 'ZY001' then null;
    when others then falla_setup := sqlerrm;
  end;

  perform set_config('role', v_rol_previo, true);

  if falla_setup is not null then
    insert into verificacion_0051 values
      (0, 'SETUP', 'ERROR', falla_setup || '  (los casos que no llegaron a correr dicen "no corrió")');
  end if;
  for i in 1..6 loop
    insert into verificacion_0051 values (i, nombres[i], estados[i], detalles[i]);
  end loop;
end $$;

select n as "#", caso, estado, detalle
from verificacion_0051
order by n;
