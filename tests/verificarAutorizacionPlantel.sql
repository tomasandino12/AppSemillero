-- Verificación de la migración 0016 (autorización por plantel).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, DESPUÉS de
-- aplicar 0016. Corre como service role, que es lo único que puede cambiar de
-- rol para impersonar usuarios y probar RLS de verdad.
--
-- NO DEJA NADA: todo pasa dentro de una transacción que termina en rollback.
-- Los jugadores, sesiones y asignaciones que crea son sintéticos y
-- desaparecen. Ningún dato real de ningún menor entra ni sale de este archivo.
--
-- No crea usuarios en auth.users a propósito: usa las dos cuentas que ya
-- existen en miembro_club del club del piloto, y le cambia el rol a una de
-- ellas sólo adentro de la transacción.
--
-- Si termina sin errores, los siete casos pasaron. Al final imprime por
-- NOTICE los INSERT de asignación listos para pegar.

begin;

/* =====================================================================
   Setup — como service role, antes de impersonar a nadie
   ===================================================================== */

create temporary table ctx (
  club uuid, otro_club uuid,
  u17 uuid, u21 uuid, temporada uuid,
  entrenador uuid, coordinador uuid,
  jug_u17 uuid, jug_u21 uuid, jug_ambos uuid,
  rol_previo text
) on commit drop;

do $$
declare
  v_club uuid := '20000000-0000-0000-0000-000000000001';
  v_otro uuid := '00000000-0000-0000-0000-000000000001';
  v_u17 uuid; v_u21 uuid; v_temporada uuid;
  v_miembros uuid[];
  a uuid; b uuid; d uuid;
begin
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

  insert into ctx (club, otro_club, u17, u21, temporada, entrenador, coordinador, rol_previo)
  values (v_club, v_otro, v_u17, v_u21, v_temporada,
          v_miembros[1], v_miembros[2], current_setting('role'));

  -- Sólo dentro de esta transacción: la segunda cuenta pasa a coordinador.
  update miembro_club set rol = 'entrenador'  where club_id = v_club and user_id = v_miembros[1];
  update miembro_club set rol = 'coordinador' where club_id = v_club and user_id = v_miembros[2];

  -- El entrenador queda asignado SOLO a U17M. El coordinador, a nada.
  insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id)
  values (v_miembros[1], v_club, v_u17);

  -- Tres jugadores sintéticos: uno sólo en U17M, uno sólo en U21M, y uno
  -- citado en las dos — que es el caso que el dedup tiene que resolver bien.
  insert into jugador (club_id, nombre_clave, nombre_limpio)
    values (v_club, 'ZZTEST SOLOUDIECISIETE', 'ZZTEST, SOLOUDIECISIETE') returning id into a;
  insert into jugador (club_id, nombre_clave, nombre_limpio)
    values (v_club, 'ZZTEST SOLOUVEINTIUNO', 'ZZTEST, SOLOUVEINTIUNO') returning id into b;
  insert into jugador (club_id, nombre_clave, nombre_limpio)
    values (v_club, 'ZZTEST CITADO', 'ZZTEST, CITADO') returning id into d;

  insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
    values (v_club, a, v_u17, v_temporada, '2026-03-01'),
           (v_club, b, v_u21, v_temporada, '2026-03-01'),
           (v_club, d, v_u17, v_temporada, '2026-03-01'),
           (v_club, d, v_u21, v_temporada, '2026-03-01');

  update ctx set jug_u17 = a, jug_u21 = b, jug_ambos = d;
end $$;


/* =====================================================================
   Casos 1, 2, 4, 5, 6 y 7 — como el ENTRENADOR asignado sólo a U17M
   ===================================================================== */

do $$
declare
  c ctx%rowtype;
  n integer;
  ok boolean;
  pudo boolean;
begin
  select * into c from ctx;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c.entrenador)::text, true);

  -- 1. No ve pertenencias de U21M, y sí las de U17M.
  select count(*) into n from pertenencia where plantel_id = c.u21;
  if n <> 0 then
    raise exception 'CASO 1 FALLA: ve % pertenencia(s) de U21M, esperaba 0.', n;
  end if;
  select count(*) into n from pertenencia where plantel_id = c.u17;
  if n = 0 then
    raise exception 'CASO 1 FALLA: no ve NINGUNA pertenencia de U17M, que sí tiene asignado.';
  end if;

  -- 2. Puede insertar una sesión en U17M y no en U21M.
  begin
    insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
    values (c.club, c.u17, current_date, 'tiro');
  exception when insufficient_privilege then
    raise exception 'CASO 2 FALLA: no pudo insertar una sesión en su propio plantel.';
  end;

  pudo := false;
  begin
    insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
    values (c.club, c.u21, current_date, 'tiro');
    pudo := true;
  exception when insufficient_privilege then
    null;  -- esperado
  end;
  if pudo then
    raise exception 'CASO 2 FALLA: pudo insertar una sesión en U21M, que no tiene asignado.';
  end if;

  -- 4. No ve al jugador que sólo está en U21M, sí al de U17M.
  select count(*) into n from jugador where id = c.jug_u21;
  if n <> 0 then
    raise exception 'CASO 4 FALLA: ve un jugador que sólo está en U21M.';
  end if;
  select count(*) into n from jugador where id = c.jug_u17;
  if n <> 1 then
    raise exception 'CASO 4 FALLA: NO ve al jugador de su propio plantel.';
  end if;

  -- 5. El dedup sí ve a los tres, que es lo que evita duplicar a un citado.
  select count(*) into n from jugadores_del_club_para_dedup(c.club)
  where id in (c.jug_u17, c.jug_u21, c.jug_ambos);
  if n <> 3 then
    raise exception
      'CASO 5 FALLA: el dedup devuelve % de 3. Sin esto, un chico citado desde otra '
      'categoría se cargaría como jugador nuevo al importar.', n;
  end if;

  -- 6. Y para el citado, los planteles vienen filtrados a los suyos.
  select planteles_visibles = array[c.u17] into ok
  from jugadores_del_club_para_dedup(c.club) where id = c.jug_ambos;
  if not coalesce(ok, false) then
    raise exception
      'CASO 6 FALLA: planteles_visibles del chico citado tendría que traer sólo U17M.';
  end if;

  -- 7. Nada del otro club.
  select count(*) into n from plantel where club_id = c.otro_club;
  if n <> 0 then raise exception 'CASO 7 FALLA: ve planteles del otro club.'; end if;
  select count(*) into n from jugador where club_id = c.otro_club;
  if n <> 0 then raise exception 'CASO 7 FALLA: ve jugadores del otro club.'; end if;
  -- La función NO devuelve cero para un club ajeno: lo rechaza con 42501. Si
  -- alguna vez devolviera filas en vez de rechazar, sería un agujero abierto,
  -- porque security definer saltea RLS por definición.
  pudo := false;
  begin
    select count(*) into n from jugadores_del_club_para_dedup(c.otro_club);
    pudo := true;
  exception when insufficient_privilege then
    null;  -- esperado
  end;
  if pudo then
    raise exception 'CASO 7 FALLA: el dedup no rechazó una consulta sobre el otro club.';
  end if;

  perform set_config('role', c.rol_previo, true);
end $$;


/* =====================================================================
   Caso 3 — como el COORDINADOR, que ve todo el club y no escribe nada
   ===================================================================== */

do $$
declare
  c ctx%rowtype;
  n integer;
  pudo boolean;
begin
  select * into c from ctx;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c.coordinador)::text, true);

  -- Ve los dos planteles aunque no tenga ninguna asignación.
  select count(*) into n from plantel where club_id = c.club;
  if n < 2 then
    raise exception 'CASO 3 FALLA: el coordinador ve % plantel(es) de su club, esperaba 2.', n;
  end if;
  select count(*) into n from pertenencia where plantel_id in (c.u17, c.u21);
  if n = 0 then
    raise exception 'CASO 3 FALLA: el coordinador no ve ninguna pertenencia de su club.';
  end if;

  -- Y no escribe en ninguno de los dos, ni en el que ve.
  foreach n in array array[1, 2] loop
    pudo := false;
    begin
      insert into sesion_medicion (club_id, plantel_id, fecha, tipo)
      values (c.club, case when n = 1 then c.u17 else c.u21 end, current_date, 'tiro');
      pudo := true;
    exception when insufficient_privilege then
      null;  -- esperado
    end;
    if pudo then
      raise exception 'CASO 3 FALLA: el coordinador pudo insertar una sesión (plantel %).', n;
    end if;
  end loop;

  pudo := false;
  begin
    update pertenencia set hasta = current_date where plantel_id = c.u17;
    if found then pudo := true; end if;
  exception when insufficient_privilege then
    null;  -- esperado
  end;
  if pudo then
    raise exception 'CASO 3 FALLA: el coordinador pudo hacer update sobre una pertenencia.';
  end if;

  perform set_config('role', c.rol_previo, true);
end $$;


/* =====================================================================
   Los INSERT de asignación para el piloto
   ===================================================================== */

do $$
declare
  c ctx%rowtype;
  r record;
begin
  select * into c from ctx;
  raise notice '';
  raise notice '=== Los siete casos pasaron. ===';
  raise notice '';
  raise notice 'Asignaciones para pegar (una por cada profe y su categoría real).';
  raise notice 'Ojo: esto NO se sembró solo a propósito — sembrar "todos ven todo"';
  raise notice 'reinstala justo el bug que 0016 arregla. Borrá las que no correspondan.';
  raise notice '';
  for r in
    select m.user_id, p.id as plantel_id, p.categoria
    from miembro_club m
    cross join plantel p
    where m.club_id = c.club and p.club_id = c.club
    order by m.user_id, p.categoria
  loop
    raise notice 'insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id) values (''%'', ''%'', ''%''); -- %',
      r.user_id, c.club, r.plantel_id, r.categoria;
  end loop;
  raise notice '';
end $$;

rollback;
