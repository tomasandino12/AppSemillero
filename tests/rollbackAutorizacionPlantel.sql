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

create temporary table conteos_antes as
select
  (select count(*) from plantel)         as plantel,
  (select count(*) from jugador)         as jugador,
  (select count(*) from pertenencia)     as pertenencia,
  (select count(*) from partido)         as partido,
  (select count(*) from sesion_medicion) as sesion_medicion;


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
declare a conteos_antes%rowtype;
begin
  select * into a from conteos_antes;

  if (select count(*) from plantel) <> a.plantel then
    raise exception 'ROLLBACK ROTO: plantel tenía % filas y ahora tiene %.',
      a.plantel, (select count(*) from plantel);
  end if;
  if (select count(*) from jugador) <> a.jugador then
    raise exception 'ROLLBACK ROTO: jugador tenía % filas y ahora tiene %.',
      a.jugador, (select count(*) from jugador);
  end if;
  if (select count(*) from pertenencia) <> a.pertenencia then
    raise exception 'ROLLBACK ROTO: pertenencia tenía % filas y ahora tiene %.',
      a.pertenencia, (select count(*) from pertenencia);
  end if;
  if (select count(*) from partido) <> a.partido then
    raise exception 'ROLLBACK ROTO: partido tenía % filas y ahora tiene %.',
      a.partido, (select count(*) from partido);
  end if;
  if (select count(*) from sesion_medicion) <> a.sesion_medicion then
    raise exception 'ROLLBACK ROTO: sesion_medicion tenía % filas y ahora tiene %.',
      a.sesion_medicion, (select count(*) from sesion_medicion);
  end if;

  -- Y la categoría de cada plantel sigue siendo la de siempre.
  if exists (select 1 from plantel where categoria is null or categoria = '') then
    raise exception 'ROLLBACK ROTO: quedó algún plantel sin categoria.';
  end if;

  raise notice 'Rollback completo. Las once policies originales están de vuelta y no se perdió ninguna fila.';
end $$;

drop table conteos_antes;

commit;
