-- Rollback de la migración 0016 (autorización por plantel).
--
-- CÓMO SE CORRE: pegado entero en el SQL Editor de Supabase, como service
-- role. Deja la base exactamente como estaba antes de 0016: vuelven las once
-- policies "miembro del club" con su forma original, y desaparece todo lo que
-- la migración agregó.
--
-- A DIFERENCIA del script de verificación, este SÍ commitea. Es un rollback
-- de verdad, no una prueba.
--
-- Qué NO deshace, porque 0016 nunca lo tocó: plantel.categoria conserva sus
-- valores originales (la migración sólo la copió a una columna nueva y le
-- puso un comment). Ninguna fila de ninguna tabla se borra.
--
-- Antes de terminar compara los conteos de las cinco tablas con datos de
-- jugador contra los que había al empezar, y aborta si alguno cambió.

begin;

-- Los conteos de antes van a GUCs de sesión y no a una tabla temporal: una
-- temporal depende de que todas las sentencias compartan transacción, cosa que
-- el editor de Supabase no garantiza, y ahí falla con 42P01.
select set_config('verif.plantel',         (select count(*) from plantel)::text,         false),
       set_config('verif.jugador',         (select count(*) from jugador)::text,         false),
       set_config('verif.pertenencia',     (select count(*) from pertenencia)::text,     false),
       set_config('verif.partido',         (select count(*) from partido)::text,         false),
       set_config('verif.sesion_medicion', (select count(*) from sesion_medicion)::text, false);


/* =====================================================================
   1. Fuera las policies nuevas
   ===================================================================== */

drop policy if exists plantel_ver on plantel;

drop policy if exists pertenencia_ver    on pertenencia;
drop policy if exists pertenencia_crear  on pertenencia;
drop policy if exists pertenencia_editar on pertenencia;
drop policy if exists pertenencia_borrar on pertenencia;

drop policy if exists partido_ver    on partido;
drop policy if exists partido_crear  on partido;
drop policy if exists partido_editar on partido;
drop policy if exists partido_borrar on partido;

drop policy if exists sesion_medicion_ver    on sesion_medicion;
drop policy if exists sesion_medicion_crear  on sesion_medicion;
drop policy if exists sesion_medicion_editar on sesion_medicion;
drop policy if exists sesion_medicion_borrar on sesion_medicion;

drop policy if exists meta_zona_ver    on meta_zona;
drop policy if exists meta_zona_crear  on meta_zona;
drop policy if exists meta_zona_editar on meta_zona;
drop policy if exists meta_zona_borrar on meta_zona;

drop policy if exists estadistica_ver    on estadistica_jugador_partido;
drop policy if exists estadistica_crear  on estadistica_jugador_partido;
drop policy if exists estadistica_editar on estadistica_jugador_partido;
drop policy if exists estadistica_borrar on estadistica_jugador_partido;

drop policy if exists medicion_tiro_ver    on medicion_tiro;
drop policy if exists medicion_tiro_crear  on medicion_tiro;
drop policy if exists medicion_tiro_editar on medicion_tiro;
drop policy if exists medicion_tiro_borrar on medicion_tiro;

drop policy if exists medicion_velocidad_ver    on medicion_velocidad;
drop policy if exists medicion_velocidad_crear  on medicion_velocidad;
drop policy if exists medicion_velocidad_editar on medicion_velocidad;
drop policy if exists medicion_velocidad_borrar on medicion_velocidad;

drop policy if exists corporal_ver    on medicion_corporal;
drop policy if exists corporal_crear  on medicion_corporal;
drop policy if exists corporal_editar on medicion_corporal;
drop policy if exists corporal_borrar on medicion_corporal;

drop policy if exists envio_ver    on envio_recurso;
drop policy if exists envio_crear  on envio_recurso;
drop policy if exists envio_editar on envio_recurso;
drop policy if exists envio_borrar on envio_recurso;

drop policy if exists jugador_ver    on jugador;
drop policy if exists jugador_crear  on jugador;
drop policy if exists jugador_editar on jugador;


/* =====================================================================
   2. Vuelven las once originales, textuales de 0002 / 0009 / 0012 / 0013
   ===================================================================== */

create policy plantel_miembros on plantel
  for all
  using (exists (select 1 from miembro_club m where m.club_id = plantel.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = plantel.club_id and m.user_id = auth.uid()));

create policy jugador_miembros on jugador
  for all
  using (exists (select 1 from miembro_club m where m.club_id = jugador.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = jugador.club_id and m.user_id = auth.uid()));

create policy pertenencia_miembros on pertenencia
  for all
  using (exists (select 1 from miembro_club m where m.club_id = pertenencia.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = pertenencia.club_id and m.user_id = auth.uid()));

create policy partido_miembros on partido
  for all
  using (exists (select 1 from miembro_club m where m.club_id = partido.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = partido.club_id and m.user_id = auth.uid()));

create policy estadistica_miembros on estadistica_jugador_partido
  for all
  using (exists (select 1 from miembro_club m where m.club_id = estadistica_jugador_partido.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = estadistica_jugador_partido.club_id and m.user_id = auth.uid()));

create policy sesion_medicion_miembros on sesion_medicion
  for all
  using (exists (select 1 from miembro_club m where m.club_id = sesion_medicion.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = sesion_medicion.club_id and m.user_id = auth.uid()));

create policy medicion_tiro_miembros on medicion_tiro
  for all
  using (exists (select 1 from miembro_club m where m.club_id = medicion_tiro.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = medicion_tiro.club_id and m.user_id = auth.uid()));

create policy medicion_velocidad_miembros on medicion_velocidad
  for all
  using (exists (select 1 from miembro_club m where m.club_id = medicion_velocidad.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = medicion_velocidad.club_id and m.user_id = auth.uid()));

create policy medicion_corporal_miembros on medicion_corporal
  for all
  using (exists (select 1 from miembro_club m where m.club_id = medicion_corporal.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = medicion_corporal.club_id and m.user_id = auth.uid()));

create policy envio_recurso_miembros on envio_recurso
  for all
  using (exists (select 1 from miembro_club m where m.club_id = envio_recurso.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = envio_recurso.club_id and m.user_id = auth.uid()));

create policy meta_zona_miembros on meta_zona
  for all
  using (exists (select 1 from miembro_club m where m.club_id = meta_zona.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = meta_zona.club_id and m.user_id = auth.uid()));


/* =====================================================================
   3. Fuera las funciones — recién ahora, cuando ya nadie las referencia
   ===================================================================== */

drop function if exists jugadores_del_club_para_dedup(uuid);
drop function if exists puede_escribir_plantel(uuid);
drop function if exists puede_ver_plantel(uuid);


/* =====================================================================
   4. Fuera las tablas y constraints nuevas
   ===================================================================== */

drop table if exists asignacion_plantel;

alter table miembro_club drop constraint if exists miembro_club_rol_valido;

alter table plantel drop constraint if exists plantel_categoria_fk;
alter table plantel drop column if exists categoria_codigo;

-- plantel.categoria nunca se tocó: sólo se le puso un comment, que se saca.
comment on column plantel.categoria is null;

drop policy if exists categoria_lectura on categoria;
drop table if exists categoria;


/* =====================================================================
   5. Ninguna fila se perdió
   ===================================================================== */

do $$
declare
  t text;
  antes bigint;
  ahora bigint;
begin
  foreach t in array array['plantel','jugador','pertenencia','partido','sesion_medicion'] loop
    antes := current_setting('verif.' || t)::bigint;
    execute format('select count(*) from %I', t) into ahora;
    if ahora <> antes then
      raise exception 'ROLLBACK ROTO: % tenía % filas y ahora tiene %.', t, antes, ahora;
    end if;
  end loop;

  -- Y la categoría de cada plantel sigue siendo la de siempre.
  if exists (select 1 from plantel where categoria is null or categoria = '') then
    raise exception 'ROLLBACK ROTO: quedó algún plantel sin categoria.';
  end if;
end $$;

commit;

-- El resultado sale como tabla y no por RAISE NOTICE: el SQL Editor del
-- dashboard no muestra los notices. Un fallo sí se ve, porque el bloque de
-- arriba lanza una excepción y eso el editor lo muestra como error.
select * from (values
  ('Policies en public',
   (select count(*) from pg_policies where schemaname = 'public')::text,
   '25 = el estado previo a 0016'),
  ('De ésas, las "_miembros"',
   (select count(*) from pg_policies where schemaname = 'public' and policyname like '%\_miembros')::text,
   '15 = las 11 restauradas + las 4 que nunca se tocaron'),
  ('Tablas nuevas que quedaron',
   coalesce((select string_agg(tablename, ', ') from pg_tables
             where schemaname = 'public' and tablename in ('categoria','asignacion_plantel')), 'ninguna'),
   'tiene que decir ninguna'),
  ('Funciones que quedaron',
   coalesce((select string_agg(proname, ', ') from pg_proc
             where proname in ('puede_ver_plantel','puede_escribir_plantel','jugadores_del_club_para_dedup')), 'ninguna'),
   'tiene que decir ninguna'),
  ('Columna plantel.categoria_codigo',
   coalesce((select 'TODAVÍA EXISTE' from information_schema.columns
             where table_name = 'plantel' and column_name = 'categoria_codigo'), 'borrada'),
   'tiene que decir borrada'),
  ('Filas (plantel/jugador/pertenencia/partido/sesion)',
   (select count(*) from plantel)::text || '/' || (select count(*) from jugador)::text || '/' ||
   (select count(*) from pertenencia)::text || '/' || (select count(*) from partido)::text || '/' ||
   (select count(*) from sesion_medicion)::text,
   'iguales a antes, o el bloque de arriba habría abortado')
) as t(que, valor, esperado);
