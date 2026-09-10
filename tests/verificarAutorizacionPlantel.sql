-- Verificación de la migración 0016 (autorización por plantel).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, DESPUÉS de
-- aplicar 0016. Corre como service role, que es lo único que puede cambiar de
-- rol para impersonar usuarios y probar RLS de verdad.
--
-- LOS RESULTADOS SALEN COMO TABLA, en la pestaña Results: una fila por caso
-- con OK o FALLA, y abajo los INSERT de asignación listos para copiar. Nada
-- de RAISE NOTICE, que el editor del dashboard no muestra.
--
-- Los siete casos corren siempre, aunque alguno falle: es más útil ver el
-- cuadro completo que sólo el primer problema.
--
-- NO DEJA NADA. Las escrituras de prueba (jugadores sintéticos, sesiones,
-- asignaciones, el cambio de rol) ocurren dentro de un sub-bloque que al
-- terminar se deshace a propósito, lanzando un error con un SQLSTATE
-- reservado que el propio bloque atrapa. Los resultados sobreviven porque
-- viven en variables de plpgsql, y a esas un rollback de subtransacción no
-- las toca. Ningún dato real de ningún menor entra ni sale de este archivo.
--
-- No crea usuarios en auth.users a propósito: usa las dos cuentas que ya
-- existen en miembro_club del club del piloto.

-- La tabla de salida va SIN "on commit drop": así sobrevive aunque el editor
-- no comparta transacción entre sentencias, que es exactamente lo que rompía
-- la versión anterior con un 42P01.
drop table if exists verificacion_0016;
create temporary table verificacion_0016 (
  n integer primary key,
  caso text,
  estado text,
  detalle text
);

do $$
declare
  v_club      uuid := '20000000-0000-0000-0000-000000000001';
  v_otro_club uuid := '00000000-0000-0000-0000-000000000001';
  v_u17 uuid; v_u21 uuid; v_temporada uuid;
  v_entrenador uuid; v_coordinador uuid;
  v_jug_u17 uuid; v_jug_u21 uuid; v_jug_ambos uuid;
  v_rol_previo text := current_setting('role');
  v_miembros uuid[];
  n integer;
  i integer;
  ok boolean;
  pudo boolean;
  r record;

  nombres text[] := array[
    '1. Entrenador de U17M no ve pertenencias de U21M',
    '2. Entrenador escribe en U17M y no en U21M',
    '3. Coordinador ve todo el club y no escribe nada',
    '4. Entrenador no ve jugadores de otro plantel',
    '5. El dedup sí ve a todo el club',
    '6. Del chico citado, sólo los planteles propios',
    '7. Nadie ve nada del otro club'
  ];
  estados  text[] := array_fill('no corrió'::text, array[7]);
  detalles text[] := array_fill(''::text, array[7]);
  sugerencias text[] := '{}';
  falla_setup text := null;
begin

  -- Todo lo que escribe vive acá adentro y se deshace al salir.
  begin

    /* ---------- setup, todavía como service role ---------- */

    select id into v_u17 from plantel where club_id = v_club and categoria = 'U17M';
    select id into v_u21 from plantel where club_id = v_club and categoria = 'U21M';
    select id into v_temporada from temporada where club_id = v_club limit 1;
    if v_u17 is null or v_u21 is null or v_temporada is null then
      raise exception 'No encontré U17M, U21M y una temporada en el club del piloto.';
    end if;

    select array_agg(user_id order by user_id) into v_miembros
    from miembro_club where club_id = v_club;
    if coalesce(array_length(v_miembros, 1), 0) <> 2 then
      raise exception 'Esperaba exactamente 2 miembros en el club del piloto, encontré %.',
        coalesce(array_length(v_miembros, 1), 0);
    end if;
    v_entrenador  := v_miembros[1];
    v_coordinador := v_miembros[2];

    update miembro_club set rol = 'entrenador'  where club_id = v_club and user_id = v_entrenador;
    update miembro_club set rol = 'coordinador' where club_id = v_club and user_id = v_coordinador;

    insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id)
    values (v_entrenador, v_club, v_u17);

    insert into jugador (club_id, nombre_clave, nombre_limpio)
      values (v_club, 'ZZTEST SOLOUDIECISIETE', 'ZZTEST, SOLOUDIECISIETE') returning id into v_jug_u17;
    insert into jugador (club_id, nombre_clave, nombre_limpio)
      values (v_club, 'ZZTEST SOLOUVEINTIUNO', 'ZZTEST, SOLOUVEINTIUNO') returning id into v_jug_u21;
    insert into jugador (club_id, nombre_clave, nombre_limpio)
      values (v_club, 'ZZTEST CITADO', 'ZZTEST, CITADO') returning id into v_jug_ambos;

    insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
      values (v_club, v_jug_u17,   v_u17, v_temporada, '2026-03-01'),
             (v_club, v_jug_u21,   v_u21, v_temporada, '2026-03-01'),
             (v_club, v_jug_ambos, v_u17, v_temporada, '2026-03-01'),
             (v_club, v_jug_ambos, v_u21, v_temporada, '2026-03-01');


    /* ---------- como el ENTRENADOR asignado sólo a U17M ---------- */

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_entrenador)::text, true);

    -- 1
    select count(*) into n from pertenencia where plantel_id = v_u21;
    if n <> 0 then
      estados[1] := 'FALLA'; detalles[1] := format('Ve %s pertenencia(s) de U21M, esperaba 0.', n);
    else
      select count(*) into n from pertenencia where plantel_id = v_u17;
      if n = 0 then
        estados[1] := 'FALLA'; detalles[1] := 'No ve NINGUNA pertenencia de U17M, que sí tiene asignado.';
      else
        estados[1] := 'OK'; detalles[1] := format('0 de U21M, %s de U17M.', n);
      end if;
    end if;

    -- 2
    estados[2] := 'OK'; detalles[2] := 'Insertó en U17M, rechazado en U21M.';
    begin
      insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
      values (v_club, v_u17, current_date, 'tiro');
    exception when insufficient_privilege then
      estados[2] := 'FALLA'; detalles[2] := 'No pudo insertar una sesión en su propio plantel.';
    end;
    if estados[2] = 'OK' then
      pudo := false;
      begin
        insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
        values (v_club, v_u21, current_date, 'tiro');
        pudo := true;
      exception when insufficient_privilege then
        null;
      end;
      if pudo then
        estados[2] := 'FALLA'; detalles[2] := 'Pudo insertar una sesión en U21M, que no tiene asignado.';
      end if;
    end if;

    -- 4
    select count(*) into n from jugador where id = v_jug_u21;
    if n <> 0 then
      estados[4] := 'FALLA'; detalles[4] := 'Ve un jugador que sólo está en U21M.';
    else
      select count(*) into n from jugador where id = v_jug_u17;
      if n <> 1 then
        estados[4] := 'FALLA'; detalles[4] := 'NO ve al jugador de su propio plantel.';
      else
        estados[4] := 'OK'; detalles[4] := 'Ve al de U17M, no al de U21M.';
      end if;
    end if;

    -- 5
    select count(*) into n from jugadores_del_club_para_dedup(v_club)
    where id in (v_jug_u17, v_jug_u21, v_jug_ambos);
    if n <> 3 then
      estados[5] := 'FALLA';
      detalles[5] := format('Devuelve %s de 3. Un chico citado desde otra categoría se duplicaría al importar.', n);
    else
      estados[5] := 'OK'; detalles[5] := 'Los 3 jugadores del club, aunque sólo vea un plantel.';
    end if;

    -- 6
    select planteles_visibles = array[v_u17] into ok
    from jugadores_del_club_para_dedup(v_club) where id = v_jug_ambos;
    if not coalesce(ok, false) then
      estados[6] := 'FALLA'; detalles[6] := 'planteles_visibles tendría que traer sólo U17M.';
    else
      estados[6] := 'OK'; detalles[6] := 'Está en U17M y U21M; sólo se le muestra U17M.';
    end if;

    -- 7
    estados[7] := 'OK'; detalles[7] := 'Ni planteles, ni jugadores, ni dedup del otro club.';
    select count(*) into n from plantel where club_id = v_otro_club;
    if n <> 0 then estados[7] := 'FALLA'; detalles[7] := 'Ve planteles del otro club.'; end if;
    if estados[7] = 'OK' then
      select count(*) into n from jugador where club_id = v_otro_club;
      if n <> 0 then estados[7] := 'FALLA'; detalles[7] := 'Ve jugadores del otro club.'; end if;
    end if;
    if estados[7] = 'OK' then
      -- Para un club ajeno la función no devuelve cero: rechaza con 42501.
      pudo := false;
      begin
        select count(*) into n from jugadores_del_club_para_dedup(v_otro_club);
        pudo := true;
      exception when insufficient_privilege then
        null;
      end;
      if pudo then
        estados[7] := 'FALLA'; detalles[7] := 'El dedup no rechazó una consulta sobre el otro club.';
      end if;
    end if;


    /* ---------- como el COORDINADOR ---------- */

    perform set_config('request.jwt.claims', json_build_object('sub', v_coordinador)::text, true);

    estados[3] := 'OK'; detalles[3] := 'Ve los 2 planteles; insert y update rechazados.';
    select count(*) into n from plantel where club_id = v_club;
    if n < 2 then
      estados[3] := 'FALLA'; detalles[3] := format('Ve %s plantel(es) de su club, esperaba 2.', n);
    end if;

    if estados[3] = 'OK' then
      foreach i in array array[1, 2] loop
        pudo := false;
        begin
          insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
          values (v_club, case when i = 1 then v_u17 else v_u21 end, current_date, 'tiro');
          pudo := true;
        exception when insufficient_privilege then
          null;
        end;
        if pudo then
          estados[3] := 'FALLA'; detalles[3] := format('Pudo insertar una sesión (plantel %s).', i);
        end if;
      end loop;
    end if;

    if estados[3] = 'OK' then
      -- Con RLS un update que no matchea filas no da error: afecta cero filas.
      pudo := false;
      begin
        update pertenencia set hasta = current_date where plantel_id = v_u17;
        if found then pudo := true; end if;
      exception when insufficient_privilege then
        null;
      end;
      if pudo then
        estados[3] := 'FALLA'; detalles[3] := 'Pudo hacer update sobre una pertenencia.';
      end if;
    end if;


    /* ---------- las asignaciones sugeridas ---------- */

    perform set_config('role', v_rol_previo, true);

    for r in
      select m.user_id, p.id as plantel_id, p.categoria
      from miembro_club m
      cross join plantel p
      where m.club_id = v_club and p.club_id = v_club
      order by m.user_id, p.categoria
    loop
      sugerencias := sugerencias || format(
        'insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id) values (''%s'', ''%s'', ''%s'');  -- %s',
        r.user_id, v_club, r.plantel_id, r.categoria);
    end loop;

    -- Fin del sub-bloque: este error deshace TODO lo que se escribió arriba.
    -- El SQLSTATE es reservado para esto y no lo produce ninguna otra cosa.
    raise exception using errcode = 'ZY001', message = 'fin';

  exception
    when sqlstate 'ZY001' then
      null;  -- salida normal: las escrituras de prueba quedaron deshechas
    when others then
      falla_setup := sqlerrm;
  end;

  -- A partir de acá nada está dentro del sub-bloque, así que estas filas sí
  -- persisten. Los valores vienen de variables, que el rollback no tocó.
  perform set_config('role', v_rol_previo, true);

  if falla_setup is not null then
    insert into verificacion_0016 values
      (0, 'SETUP', 'ERROR', falla_setup || '  (los casos no llegaron a correr)');
  end if;

  for i in 1..7 loop
    insert into verificacion_0016 values (i, nombres[i], estados[i], detalles[i]);
  end loop;

  insert into verificacion_0016 values
    (98, '', '', ''),
    (99, 'ASIGNACIONES', 'copiar',
     'Una por profe y su categoría real. Borrá las que no correspondan: pegarlas todas '
     'reinstala justo el problema que 0016 arregla.');

  for i in 1..coalesce(array_length(sugerencias, 1), 0) loop
    insert into verificacion_0016 values (99 + i, '', '', sugerencias[i]);
  end loop;
end $$;

select n as "#", caso, estado, detalle
from verificacion_0016
order by n;
