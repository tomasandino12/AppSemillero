-- Verificación de 0064 (noticias del portal).
--
-- CÓMO SE CORRE: después de aplicar 0064 (no hay base local en esta rama: se
-- corre recién con la base real, tras el `db push`):
--   docker exec -i <contenedor supabase_db_...> psql -U postgres < tests/verificarNoticias.sql
-- En producción, pegado entero en el SQL Editor como service role: no deja
-- nada (ver abajo), pero usa el club de prueba de 0003.
--
-- LOS RESULTADOS SALEN COMO TABLA, una fila por caso: OK o FALLA.
--
-- NO DEJA NADA: todo va dentro de un sub-bloque que se deshace al final con
-- un SQLSTATE reservado. Usuarios y clubes sintéticos (ZZTEST, dominio
-- .invalid). Ningún dato real entra ni sale de acá. Los archivos del bucket
-- no se prueban desde SQL: se prueban a mano desde el panel (Task 15).
--
-- La impersonación (role = authenticated o anon + request.jwt.claims) es como
-- PostgREST evalúa RLS y permisos para una sesión real o sin sesión.

drop table if exists verificacion_0064;
create temporary table verificacion_0064 (
  n integer primary key, caso text, estado text, detalle text
);

do $$
declare
  v_club uuid := '00000000-0000-0000-0000-000000000001';   -- club de prueba (0003)
  v_otro_club uuid := gen_random_uuid();
  v_rol_previo text := current_setting('role');

  v_co  uuid := gen_random_uuid();   -- coordinador del club
  v_pr  uuid := gen_random_uuid();   -- entrenador del club, sin coordinación
  v_co2 uuid := gen_random_uuid();   -- coordinador de OTRO club

  v_n1 uuid := gen_random_uuid();    -- noticia que se publica
  v_n2 uuid := gen_random_uuid();    -- noticia que se borra
  v_n3 uuid := gen_random_uuid();    -- borrador
  v_foto text;
  v_fecha timestamptz;
  v_fecha2 timestamptz;
  n integer;
  txt text;
  r record;
  siete jsonb;

  nombres text[] := array[
    '1. Coordinación crea, edita, publica y borra; la base sella autoría y fecha de publicación',
    '2. La fecha de publicación no cambia al despublicar y volver a publicar',
    '3. Un entrenador del club y la coordinación de otro club no leen, no escriben ni borran',
    '4. Sin sesión (anon): ningún permiso sobre la tabla; las funciones devuelven sólo publicadas del club',
    '5. Con fotos sin autorización de imagen: rechazado',
    '6. Fotos mal formadas (otra carpeta, sin alt, 7 fotos, clave de más): rechazadas',
    '7. El cliente no fija autoría, fecha de publicación ni club'
  ];
  estados  text[] := array_fill('no corrió'::text, array[7]);
  detalles text[] := array_fill(''::text, array[7]);
  falla_setup text := null;
begin

  begin

    /* ---------- setup, como service role ---------- */

    if not exists (select 1 from club where id = v_club) then
      raise exception 'No encontré el club de prueba (0003).';
    end if;

    v_foto := v_club || '/' || v_n1 || '/' || gen_random_uuid() || '.webp';

    insert into club (id, nombre) values (v_otro_club, 'ZZTEST Otro club de noticias');

    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at,
                            raw_user_meta_data)
    select u.id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
           'zztest-' || u.etiqueta || '@noticias.invalid', now(), now(), now(),
           jsonb_build_object('nombre', 'ZZTEST Nombre ' || u.etiqueta)
    from (values (v_co,'co'), (v_pr,'pr'), (v_co2,'co2')) as u(id, etiqueta);

    insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador) values
      (v_co, v_club, false, true), (v_pr, v_club, true, false), (v_co2, v_otro_club, false, true);

    perform set_config('role', 'authenticated', true);

    /* ---------- 1: coordinación crea, edita, publica y borra ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_co, 'role', 'authenticated')::text, true);
    insert into noticia (id, club_id, titulo, resumen, cuerpo, etiqueta)
      values (v_n1, v_club, 'ZZTEST Título', 'Resumen', 'Cuerpo', 'club');
    insert into noticia (id, club_id, titulo, resumen, cuerpo, etiqueta)
      values (v_n2, v_club, 'ZZTEST Para borrar', 'Resumen', 'Cuerpo', 'eventos');
    insert into noticia (id, club_id, titulo, resumen, cuerpo, etiqueta)
      values (v_n3, v_club, 'ZZTEST Borrador', 'Resumen', 'Cuerpo', 'partidos');
    update noticia set titulo = 'ZZTEST Título editado' where id = v_n1;
    update noticia set publicada = true where id = v_n1;
    perform set_config('role', v_rol_previo, true);
    select count(*) into n from noticia
      where id = v_n1 and creado_por = v_co and actualizado_por = v_co and publicada_en is not null;
    perform set_config('role', 'authenticated', true);
    if n <> 1 then txt := txt || 'autoría o fecha de publicación sin sellar; '; end if;
    delete from noticia where id = v_n2;
    get diagnostics n = row_count;
    if n <> 1 then txt := txt || 'la coordinación no pudo borrar (' || n || '); '; end if;
    estados[1] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[1] := case when txt = '' then 'Alta, edición, publicación y borrado; autoría y fecha selladas por la base.' else txt end;

    /* ---------- 2: la fecha no cambia ---------- */

    txt := '';
    select publicada_en into v_fecha from noticia where id = v_n1;
    update noticia set publicada = false where id = v_n1;
    update noticia set publicada = true where id = v_n1;
    select publicada_en into v_fecha2 from noticia where id = v_n1;
    if v_fecha2 is distinct from v_fecha then txt := txt || 'la fecha cambió al volver a publicar; '; end if;
    estados[2] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[2] := case when txt = '' then 'Despublicar y volver a publicar deja la fecha de la primera vez.' else txt end;

    /* ---------- 3: entrenador y coordinación ajena ---------- */

    txt := '';
    for r in select * from (values (v_pr, 'el entrenador'), (v_co2, 'la coordinación de otro club')) as q(quien, que) loop
      perform set_config('request.jwt.claims', json_build_object('sub', r.quien, 'role', 'authenticated')::text, true);
      select count(*) into n from noticia where club_id = v_club;
      if n <> 0 then txt := txt || r.que || ' lee ' || n || ' filas; '; end if;
      begin
        insert into noticia (club_id, titulo, resumen, cuerpo, etiqueta)
          values (v_club, 'ZZTEST Intruso', 'x', 'x', 'club');
        txt := txt || r.que || ' agregó una noticia; ';
      exception when insufficient_privilege then null;
      end;
      update noticia set titulo = 'ZZTEST pisada' where id = v_n1;
      get diagnostics n = row_count;
      if n <> 0 then txt := txt || r.que || ' editó; '; end if;
      delete from noticia where id = v_n1;
      get diagnostics n = row_count;
      if n <> 0 then txt := txt || r.que || ' borró; '; end if;
    end loop;
    estados[3] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[3] := case when txt = '' then 'No ven filas, no agregan, y su update y su delete no tocan nada.' else txt end;

    /* ---------- 4: anon ---------- */

    txt := '';
    perform set_config('role', v_rol_previo, true);
    if has_table_privilege('anon', 'public.noticia', 'select')
       or has_table_privilege('anon', 'public.noticia', 'insert')
       or has_table_privilege('anon', 'public.noticia', 'update')
       or has_table_privilege('anon', 'public.noticia', 'delete') then
      txt := txt || 'anon tiene algún permiso sobre la tabla; ';
    end if;
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    select count(*) into n from public.noticias_publicas(v_club) where titulo like 'ZZTEST %';
    if n <> 1 then txt := txt || 'noticias_publicas devolvió ' || n || ' (esperaba 1: sólo la publicada); '; end if;
    select count(*) into n from public.noticia_publica(v_club, v_n3);
    if n <> 0 then txt := txt || 'noticia_publica devolvió un borrador; '; end if;
    select count(*) into n from public.noticia_publica(v_club, v_n1);
    if n <> 1 then txt := txt || 'noticia_publica no devolvió la publicada; '; end if;
    select count(*) into n from public.noticias_publicas(v_otro_club);
    if n <> 0 then txt := txt || 'el otro club devolvió ' || n || '; '; end if;
    select count(*) into n from public.noticia_publica(v_otro_club, v_n1);
    if n <> 0 then txt := txt || 'pidiendo una noticia con el club equivocado, devolvió algo; '; end if;
    begin
      select count(*) into n from noticia;
      txt := txt || 'anon leyó la tabla (' || n || '); ';
    exception when insufficient_privilege then null;
    end;
    perform set_config('role', 'authenticated', true);
    estados[4] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[4] := case when txt = '' then 'Sin permisos sobre la tabla; las funciones sólo dan publicadas del club pedido.' else txt end;

    /* ---------- 5: fotos sin autorización ---------- */

    txt := '';
    perform set_config('request.jwt.claims', json_build_object('sub', v_co, 'role', 'authenticated')::text, true);
    begin
      update noticia
        set fotos = jsonb_build_array(jsonb_build_object('ruta', v_foto, 'alt', 'La cancha')), autorizacion_imagen = false
        where id = v_n1;
      txt := txt || 'aceptó fotos sin autorización de imagen; ';
    exception when check_violation then
      if sqlerrm not like '%noticia_fotos_autorizadas%' then txt := txt || 'falló por otro check: ' || sqlerrm || '; '; end if;
    end;
    begin
      update noticia
        set fotos = jsonb_build_array(jsonb_build_object('ruta', v_foto, 'alt', 'La cancha')), autorizacion_imagen = true
        where id = v_n1;
    exception when others then
      txt := txt || 'rechazó fotos con autorización: ' || sqlerrm || '; ';
    end;
    estados[5] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[5] := case when txt = '' then 'Con fotos exige autorización de imagen; con ella, pasa.' else txt end;

    /* ---------- 6: fotos mal formadas ---------- */

    txt := '';
    siete := (select jsonb_agg(jsonb_build_object('ruta', v_club || '/' || v_n1 || '/' || gen_random_uuid() || '.webp', 'alt', 'x')) from generate_series(1, 7));
    for r in select * from (values
        (jsonb_build_array(jsonb_build_object('ruta', v_club || '/' || gen_random_uuid() || '/' || gen_random_uuid() || '.webp', 'alt', 'x')), 'ruta de otra noticia'),
        (jsonb_build_array(jsonb_build_object('ruta', v_foto, 'alt', '')), 'alt vacío'),
        (jsonb_build_array(jsonb_build_object('ruta', v_foto, 'alt', ' con espacios ')), 'alt sin recortar'),
        (siete, '7 fotos'),
        (jsonb_build_array(jsonb_build_object('ruta', v_foto, 'alt', 'x', 'extra', 'y')), 'clave de más'),
        (jsonb_build_array(jsonb_build_object('ruta', v_foto || '.exe', 'alt', 'x')), 'extensión rara')
      ) as c(fotos, que) loop
      begin
        update noticia set fotos = r.fotos, autorizacion_imagen = true where id = v_n1;
        txt := txt || 'aceptó ' || r.que || '; ';
      exception when check_violation then
        if sqlerrm not like '%noticia_fotos_validas%' then txt := txt || r.que || ' falló por otro check: ' || sqlerrm || '; '; end if;
      end;
    end loop;
    estados[6] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[6] := case when txt = '' then 'Otra carpeta, alt vacío o sin recortar, 7 fotos, clave de más y extensión rara: rechazadas.' else txt end;

    /* ---------- 7: autoría, fecha y club fuera del alcance ---------- */

    txt := '';
    begin
      insert into noticia (club_id, titulo, resumen, cuerpo, etiqueta, creado_por)
        values (v_club, 'ZZTEST Falsa', 'x', 'x', 'club', v_pr);
      txt := txt || 'fijó creado_por; ';
    exception when insufficient_privilege then null;
    end;
    begin
      update noticia set publicada_en = now() where id = v_n1;
      txt := txt || 'fijó publicada_en; ';
    exception when insufficient_privilege then null;
    end;
    begin
      update noticia set club_id = v_otro_club where id = v_n1;
      txt := txt || 'cambió el club; ';
    exception when insufficient_privilege then null;
    end;
    begin
      update noticia set actualizado_por = v_pr where id = v_n1;
      txt := txt || 'fijó actualizado_por; ';
    exception when insufficient_privilege then null;
    end;
    estados[7] := case when txt = '' then 'OK' else 'FALLA' end;
    detalles[7] := case when txt = '' then 'creado_por, publicada_en, club_id y actualizado_por fuera del alcance del cliente.' else txt end;

    raise exception using errcode = 'ZY001', message = 'fin';

  exception
    when sqlstate 'ZY001' then null;
    when others then falla_setup := sqlerrm;
  end;

  perform set_config('role', v_rol_previo, true);

  if falla_setup is not null then
    insert into verificacion_0064 values
      (0, 'SETUP', 'ERROR', falla_setup || '  (los casos que no llegaron a correr dicen "no corrió")');
  end if;
  for i in 1..7 loop
    insert into verificacion_0064 values (i, nombres[i], estados[i], detalles[i]);
  end loop;
end $$;

select n as "#", caso, estado, detalle
from verificacion_0064
order by n;
