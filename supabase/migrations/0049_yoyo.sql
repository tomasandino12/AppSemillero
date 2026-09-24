-- Yo-Yo Endurance Test nivel 1 (idas de 20 m, con pitidos de la app).
-- Ver docs/superpowers/specs/2026-09-24-sprint-y-yoyo-design.md (etapa B).
--
-- Se guardan las idas completas, nunca el nivel ni los metros: los calcula
-- src/data/yoyo.js (así una corrección de la tabla recalcula todo el
-- histórico). `origen` como en medicion_sprint (0048): la app siempre inserta
-- 'propio'.
--
-- El tope de idas (223) está también en JS (yoyo.js, IDAS_MAX):
-- tests/contratoYoyo.test.js compara los dos lados. guardar_sesion_medicion y
-- mi_progreso se reemplazan enteras partiendo de 0048 (tests/contratoRpcYoyo.test.js).


/* ---------- sesion_medicion: el tipo 'yoyo' ---------- */

-- Sin columna propia: el yoyo no tiene test ni distancia (los checks de 0043 y
-- 0048 ya los prohíben en los demás tipos).
alter table sesion_medicion drop constraint sesion_medicion_tipo_check;
alter table sesion_medicion add constraint sesion_medicion_tipo_check
  check (tipo in ('tiro', 'salto', 'sprint', 'yoyo'));


/* ---------- medicion_yoyo ---------- */

create table medicion_yoyo (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  sesion_id uuid not null,
  jugador_id uuid not null,
  -- NULL = el chico estuvo en la sesión pero no corrió (ausente), NUNCA 0:
  -- 0 idas es un dato real (quedó afuera en la primera).
  idas smallint check (idas is null or idas between 0 and 223),
  origen text not null default 'propio' check (origen in ('propio', 'crear')),
  creado_por uuid default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (sesion_id, jugador_id),
  -- FKs compuestas: el club de la sesión y del jugador tiene que ser el de la fila (0009).
  foreign key (club_id, sesion_id) references sesion_medicion (club_id, id) on delete cascade,
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);

create index medicion_yoyo_club_id_idx on medicion_yoyo(club_id);
create index medicion_yoyo_jugador_id_idx on medicion_yoyo(jugador_id);

-- La autoría y la fecha las pone el servidor. Sin sesión (SQL del
-- dashboard) se respeta el autor que se mande, como en 0039.
create function sellar_medicion_yoyo()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.creado_en := now();
  new.creado_por := coalesce(auth.uid(), new.creado_por);
  return new;
end;
$fn$;

create trigger medicion_yoyo_sellar
  before insert on medicion_yoyo
  for each row execute function sellar_medicion_yoyo();

revoke execute on function sellar_medicion_yoyo() from public, anon, authenticated;


/* ---------- RLS: por el plantel de la sesión, como medicion_sprint (0048) ---------- */

alter table medicion_yoyo enable row level security;

create policy medicion_yoyo_ver on medicion_yoyo
  for select using (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_yoyo.sesion_id and puede_ver_plantel(s.plantel_id)));

create policy medicion_yoyo_crear on medicion_yoyo
  for insert with check (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_yoyo.sesion_id and s.tipo = 'yoyo'
      and puede_escribir_plantel(s.plantel_id)));

-- Sin update ni delete (se vuelve a medir). Supabase concede ALL por defecto
-- sobre tablas nuevas (0017): se revoca todo y se concede lo mínimo. El insert
-- no incluye `origen`: la app siempre inserta 'propio' (el default).
revoke all on medicion_yoyo from anon, authenticated;
grant select on medicion_yoyo to authenticated;
grant insert (club_id, sesion_id, jugador_id, idas) on medicion_yoyo to authenticated;

comment on table medicion_yoyo is
  'Yo-Yo Endurance L1 (idas de 20 m): idas completas por jugador. Nivel y metros se calculan en src/data/yoyo.js. v0049.';
comment on column medicion_yoyo.idas is
  'Idas de 20 m completadas antes de quedar afuera. NULL = ausente, nunca 0.';
comment on column medicion_yoyo.origen is
  'propio = medido con la app; crear = dato traído del CReAR (más exacto). La app sólo inserta propio.';


/* ---------- guardar_sesion_medicion: suma la rama 'yoyo' ---------- */

create or replace function guardar_sesion_medicion(payload jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_tipo text := payload->>'tipo';
  v_test_salto text := payload->>'testSalto';
  v_distancia smallint := (payload->>'distanciaSprintM')::smallint;
  v_club_id uuid := (payload->>'clubId')::uuid;
  v_plantel_id uuid := (payload->>'plantelId')::uuid;
  v_sesion_id uuid := coalesce((payload->>'sesionId')::uuid, gen_random_uuid());
  v_existente record;
  m jsonb;
begin
  if v_tipo not in ('tiro', 'salto', 'sprint', 'yoyo') then
    raise exception 'TIPO_DE_SESION_INVALIDO' using errcode = 'P0001';
  end if;
  -- El test va sólo en salto, y ahí es obligatorio. Qué tests existen lo dice
  -- el check de sesion_medicion.test_salto (0043), no esta función.
  if (v_tipo = 'salto') <> (v_test_salto is not null) then
    raise exception 'TEST_DE_SALTO_INVALIDO' using errcode = 'P0001';
  end if;
  -- La distancia va sólo en sprint, y ahí es obligatoria. Cuáles existen lo
  -- dice el check de sesion_medicion.distancia_sprint_m (0048).
  if (v_tipo = 'sprint') <> (v_distancia is not null) then
    raise exception 'DISTANCIA_DE_SPRINT_INVALIDA' using errcode = 'P0001';
  end if;

  begin
    insert into sesion_medicion (id, club_id, plantel_id, fecha, tipo, test_salto, distancia_sprint_m)
    values (v_sesion_id, v_club_id, v_plantel_id, (payload->>'fecha')::date, v_tipo, v_test_salto, v_distancia);
  exception when unique_violation then
    -- El id ya está. Si es una sesión de este mismo plantel, tipo, test y
    -- distancia, es este mismo guardado que vuelve: éxito, sin tocar nada. Si
    -- no se ve (RLS) o es de otro plantel, alguien mandó un id que no es suyo.
    select s.plantel_id, s.tipo, s.test_salto, s.distancia_sprint_m into v_existente
    from sesion_medicion s where s.id = v_sesion_id;
    if found and v_existente.plantel_id = v_plantel_id and v_existente.tipo = v_tipo
       and v_existente.test_salto is not distinct from v_test_salto
       and v_existente.distancia_sprint_m is not distinct from v_distancia then
      return jsonb_build_object('sesionId', v_sesion_id, 'filas', 0, 'yaGuardada', true);
    end if;
    raise exception 'SESION_AJENA' using errcode = 'P0001';
  end;

  if v_tipo = 'tiro' then
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      -- m->>'anotados' NULL (clave ausente o JSON null) es "no midió" (0010).
      insert into medicion_tiro (club_id, sesion_id, jugador_id, posicion, anotados, intentos)
      values (
        v_club_id,
        v_sesion_id,
        (m->>'jugadorId')::uuid,
        m->>'posicion',
        (m->>'anotados')::int,
        coalesce((m->>'intentos')::int, 10)
      );
    end loop;
  elsif v_tipo = 'salto' then
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      -- Sin coalesce en intento: si falta, que lo rechace el not null, no
      -- que se guarde como el 1 y choque con otro intento. Tiempo y fps NULL
      -- es ausente; los checks de 0043 exigen que vayan juntos.
      insert into medicion_salto (club_id, sesion_id, jugador_id, intento, tiempo_vuelo_ms, fps_captura)
      values (
        v_club_id,
        v_sesion_id,
        (m->>'jugadorId')::uuid,
        (m->>'intento')::smallint,
        (m->>'tiempoVueloMs')::numeric,
        (m->>'fpsCaptura')::numeric
      );
    end loop;
  elsif v_tipo = 'sprint' then
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      -- Igual que en salto: sin coalesce en intento. Tiempo NULL es ausente.
      insert into medicion_sprint (club_id, sesion_id, jugador_id, intento, tiempo_ms)
      values (
        v_club_id,
        v_sesion_id,
        (m->>'jugadorId')::uuid,
        (m->>'intento')::smallint,
        (m->>'tiempoMs')::int
      );
    end loop;
  else
    for m in select * from jsonb_array_elements(coalesce(payload->'mediciones', '[]'::jsonb))
    loop
      -- Una fila por jugador (sin intentos). Idas NULL (clave ausente o JSON
      -- null) es "no corrió": ausente, nunca 0.
      insert into medicion_yoyo (club_id, sesion_id, jugador_id, idas)
      values (
        v_club_id,
        v_sesion_id,
        (m->>'jugadorId')::uuid,
        (m->>'idas')::smallint
      );
    end loop;
  end if;

  return jsonb_build_object(
    'sesionId', v_sesion_id,
    'filas', jsonb_array_length(coalesce(payload->'mediciones', '[]'::jsonb)),
    'yaGuardada', false
  );
end;
$$;

revoke execute on function guardar_sesion_medicion(jsonb) from public, anon;
grant  execute on function guardar_sesion_medicion(jsonb) to authenticated;


/* ---------- mi_progreso: suma la clave 'yoyos' ---------- */

-- Partidos, tiro, saltos, sprints, yoyos y la historia de pesos, todo de este
-- jugador. No hay ranking ni promedio del plantel, y por eso ninguna consulta
-- de acá suma filas de otros. Las medidas corporales (peso, altura, pierna)
-- quedan afuera a propósito (spec de 0030, sección 1).
--
-- Los porcentajes, la altura del salto y la velocidad del sprint no se
-- calculan acá: los calculan estadisticas.js, salto.js, sprint.js y yoyo.js.
create or replace function mi_progreso()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_jugador uuid := public.mi_jugador();
begin
  if v_jugador is null then
    return null;
  end if;

  return jsonb_build_object(
    'partidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'partidoId', pa.id,
        'fecha', pa.fecha,
        'rivalNombre', pa.rival_nombre,
        'condicion', pa.condicion_propia,
        'puntosPropios', pa.puntos_propios,
        'puntosRival', pa.puntos_rival,
        'minSegundos', e.min_segundos,
        'pts', e.pts,
        'dosAnotados', e.dos_anotados, 'dosIntentados', e.dos_intentados,
        'tresAnotados', e.tres_anotados, 'tresIntentados', e.tres_intentados,
        'libresAnotados', e.libres_anotados, 'libresIntentados', e.libres_intentados,
        'rebTot', e.reb_tot, 'ast', e.ast, 'val', e.val
      ) order by pa.fecha desc)
      from public.estadistica_jugador_partido e
      join public.partido pa on pa.id = e.partido_id
      where e.jugador_id = v_jugador
    ), '[]'::jsonb),
    'tiro', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sesionId', s.id, 'fecha', s.fecha, 'posicion', mt.posicion,
        'anotados', mt.anotados, 'intentos', mt.intentos
      ) order by s.fecha, mt.posicion)
      from public.medicion_tiro mt
      join public.sesion_medicion s on s.id = mt.sesion_id
      where mt.jugador_id = v_jugador and s.tipo = 'tiro'
    ), '[]'::jsonb),
    -- Una entrada por sesión, con sus intentos. Un ausente llega como un
    -- intento con tiempoVueloMs null, nunca como 0.
    'saltos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sesionId', s.id, 'fecha', s.fecha, 'test', s.test_salto,
        'intentos', (
          select jsonb_agg(jsonb_build_object(
            'intento', ms.intento, 'tiempoVueloMs', ms.tiempo_vuelo_ms
          ) order by ms.intento)
          from public.medicion_salto ms
          where ms.sesion_id = s.id and ms.jugador_id = v_jugador
        )
      ) order by s.fecha)
      from public.sesion_medicion s
      where s.tipo = 'salto'
        and exists (
          select 1 from public.medicion_salto ms
          where ms.sesion_id = s.id and ms.jugador_id = v_jugador)
    ), '[]'::jsonb),
    -- Igual que saltos. `origen` va porque la ficha rotula "CReAR · más exacto".
    'sprints', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sesionId', s.id, 'fecha', s.fecha, 'distanciaM', s.distancia_sprint_m,
        'intentos', (
          select jsonb_agg(jsonb_build_object(
            'intento', mp.intento, 'tiempoMs', mp.tiempo_ms, 'origen', mp.origen
          ) order by mp.intento)
          from public.medicion_sprint mp
          where mp.sesion_id = s.id and mp.jugador_id = v_jugador
        )
      ) order by s.fecha)
      from public.sesion_medicion s
      where s.tipo = 'sprint'
        and exists (
          select 1 from public.medicion_sprint mp
          where mp.sesion_id = s.id and mp.jugador_id = v_jugador)
    ), '[]'::jsonb),
    -- Una entrada por sesión en que corrió (o estuvo ausente: idas null).
    'yoyos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sesionId', s.id, 'fecha', s.fecha, 'idas', my.idas, 'origen', my.origen
      ) order by s.fecha)
      from public.sesion_medicion s
      join public.medicion_yoyo my on my.sesion_id = s.id
      where s.tipo = 'yoyo' and my.jugador_id = v_jugador
    ), '[]'::jsonb),
    'escalones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clave', pf.clave, 'nombre', pf.nombre, 'kg', m.kg, 'creadoEn', m.creado_en
      ) order by m.orden)
      from public.movimiento_escalon m
      join public.paso_fuerza pf on pf.id = m.escalera_id
      where m.jugador_id = v_jugador
    ), '[]'::jsonb)
  );
end;
$fn$;

revoke execute on function mi_progreso() from public, anon;
grant  execute on function mi_progreso() to authenticated;
