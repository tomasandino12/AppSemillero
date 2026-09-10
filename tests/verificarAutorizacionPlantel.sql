-- Verificación de la migración 0016 (autorización por plantel).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, DESPUÉS de
-- aplicar 0016. Corre como service role, que es lo único que puede cambiar de
-- rol para impersonar usuarios y probar RLS de verdad.
--
-- NO DEJA NADA: todo pasa dentro de una transacción que termina en rollback.
-- Los jugadores, sesiones y asignaciones que crea son sintéticos y
-- desaparecen. Ningún dato real de ningún menor entra ni sale de este archivo.
-- Si algo falla, la excepción aborta la transacción, que es otra forma de no
-- dejar nada.
--
-- No crea usuarios en auth.users a propósito: usa las dos cuentas que ya
-- existen en miembro_club del club del piloto, y le cambia el rol a una de
-- ellas sólo adentro de la transacción.
--
-- TODO en un único bloque do. La versión anterior guardaba el contexto en una
-- tabla temporal y fallaba con 42P01 "relation ctx does not exist": el editor
-- de Supabase no garantiza que varias sentencias compartan la misma
-- transacción, y una temporal creada con on commit drop se evapora apenas la
-- primera termina. Con variables de plpgsql el problema no existe.
--
-- Si termina sin errores, los siete casos pasaron, y por NOTICE salen los
-- INSERT de asignación listos para pegar.

begin;

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

  -- Sólo dentro de esta transacción: la segunda cuenta pasa a coordinador.
  update miembro_club set rol = 'entrenador'  where club_id = v_club and user_id = v_entrenador;
  update miembro_club set rol = 'coordinador' where club_id = v_club and user_id = v_coordinador;

  -- El entrenador queda asignado SOLO a U17M. El coordinador, a nada.
  insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id)
  values (v_entrenador, v_club, v_u17);

  -- Tres jugadores sintéticos: uno sólo en U17M, uno sólo en U21M, y uno
  -- citado en las dos — que es el caso que el dedup tiene que resolver bien.
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


  /* ---------- casos 1, 2, 4, 5, 6 y 7: el ENTRENADOR de U17M ---------- */

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_entrenador)::text, true);

  -- 1. No ve pertenencias de U21M, y sí las de U17M.
  select count(*) into n from pertenencia where plantel_id = v_u21;
  if n <> 0 then
    raise exception 'CASO 1 FALLA: ve % pertenencia(s) de U21M, esperaba 0.', n;
  end if;
  select count(*) into n from pertenencia where plantel_id = v_u17;
  if n = 0 then
    raise exception 'CASO 1 FALLA: no ve NINGUNA pertenencia de U17M, que sí tiene asignado.';
  end if;

  -- 2. Puede insertar una sesión en U17M y no en U21M.
  begin
    insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
    values (v_club, v_u17, current_date, 'tiro');
  exception when insufficient_privilege then
    raise exception 'CASO 2 FALLA: no pudo insertar una sesión en su propio plantel.';
  end;

  pudo := false;
  begin
    insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
    values (v_club, v_u21, current_date, 'tiro');
    pudo := true;
  exception when insufficient_privilege then
    null;  -- esperado
  end;
  if pudo then
    raise exception 'CASO 2 FALLA: pudo insertar una sesión en U21M, que no tiene asignado.';
  end if;

  -- 4. No ve al jugador que sólo está en U21M, sí al de U17M.
  select count(*) into n from jugador where id = v_jug_u21;
  if n <> 0 then
    raise exception 'CASO 4 FALLA: ve un jugador que sólo está en U21M.';
  end if;
  select count(*) into n from jugador where id = v_jug_u17;
  if n <> 1 then
    raise exception 'CASO 4 FALLA: NO ve al jugador de su propio plantel.';
  end if;

  -- 5. El dedup sí ve a los tres, que es lo que evita duplicar a un citado.
  select count(*) into n from jugadores_del_club_para_dedup(v_club)
  where id in (v_jug_u17, v_jug_u21, v_jug_ambos);
  if n <> 3 then
    raise exception
      'CASO 5 FALLA: el dedup devuelve % de 3. Sin esto, un chico citado desde otra '
      'categoría se cargaría como jugador nuevo al importar.', n;
  end if;

  -- 6. Y para el citado, los planteles vienen filtrados a los suyos.
  select planteles_visibles = array[v_u17] into ok
  from jugadores_del_club_para_dedup(v_club) where id = v_jug_ambos;
  if not coalesce(ok, false) then
    raise exception
      'CASO 6 FALLA: planteles_visibles del chico citado tendría que traer sólo U17M.';
  end if;

  -- 7. Nada del otro club.
  select count(*) into n from plantel where club_id = v_otro_club;
  if n <> 0 then raise exception 'CASO 7 FALLA: ve planteles del otro club.'; end if;
  select count(*) into n from jugador where club_id = v_otro_club;
  if n <> 0 then raise exception 'CASO 7 FALLA: ve jugadores del otro club.'; end if;

  -- La función NO devuelve cero para un club ajeno: lo rechaza con 42501. Si
  -- alguna vez devolviera filas en vez de rechazar, sería un agujero abierto,
  -- porque security definer saltea RLS por definición.
  pudo := false;
  begin
    select count(*) into n from jugadores_del_club_para_dedup(v_otro_club);
    pudo := true;
  exception when insufficient_privilege then
    null;  -- esperado
  end;
  if pudo then
    raise exception 'CASO 7 FALLA: el dedup no rechazó una consulta sobre el otro club.';
  end if;


  /* ---------- caso 3: el COORDINADOR ve todo y no escribe nada ---------- */

  perform set_config('request.jwt.claims', json_build_object('sub', v_coordinador)::text, true);

  select count(*) into n from plantel where club_id = v_club;
  if n < 2 then
    raise exception 'CASO 3 FALLA: el coordinador ve % plantel(es) de su club, esperaba 2.', n;
  end if;
  select count(*) into n from pertenencia where plantel_id in (v_u17, v_u21);
  if n = 0 then
    raise exception 'CASO 3 FALLA: el coordinador no ve ninguna pertenencia de su club.';
  end if;

  -- Y no escribe en ninguno de los dos, ni siquiera en el que ve.
  foreach i in array array[1, 2] loop
    pudo := false;
    begin
      insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
      values (v_club, case when i = 1 then v_u17 else v_u21 end, current_date, 'tiro');
      pudo := true;
    exception when insufficient_privilege then
      null;  -- esperado
    end;
    if pudo then
      raise exception 'CASO 3 FALLA: el coordinador pudo insertar una sesión (plantel %).', i;
    end if;
  end loop;

  -- Con RLS, un update que no matchea ninguna fila no tira error: afecta cero
  -- filas. Por eso lo que se mira acá es si llegó a tocar algo.
  pudo := false;
  begin
    update pertenencia set hasta = current_date where plantel_id = v_u17;
    if found then pudo := true; end if;
  exception when insufficient_privilege then
    null;  -- esperado
  end;
  if pudo then
    raise exception 'CASO 3 FALLA: el coordinador pudo hacer update sobre una pertenencia.';
  end if;


  /* ---------- los INSERT de asignación para el piloto ---------- */

  perform set_config('role', v_rol_previo, true);

  raise notice '';
  raise notice '=== Los siete casos pasaron. ===';
  raise notice '';
  raise notice 'Asignaciones para pegar (una por cada profe y su categoría real).';
  raise notice 'Ojo: esto NO se sembró solo a propósito — sembrar "todos ven todo"';
  raise notice 'reinstala justo el problema que 0016 arregla. Borrá las que no correspondan.';
  raise notice '';
  for r in
    select m.user_id, p.id as plantel_id, p.categoria
    from miembro_club m
    cross join plantel p
    where m.club_id = v_club and p.club_id = v_club
    order by m.user_id, p.categoria
  loop
    raise notice 'insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id) values (''%'', ''%'', ''%''); -- %',
      r.user_id, v_club, r.plantel_id, r.categoria;
  end loop;
  raise notice '';

end $$;

rollback;
