-- Deshace 0027 en el Docker LOCAL: vuelve a las policies y grants de
-- 0002/0009/0015. No se corre contra producción: reabre lo que 0027 cierra.
--
-- Borra también la fila de schema_migrations para poder volver a aplicar 0027
-- con `npx supabase migration up`. La normalización de links (btrim) no se
-- deshace: no cambia qué abre cada link.
begin;

alter table recurso          drop constraint if exists recurso_enlace_web;
alter table ejercicio        drop constraint if exists ejercicio_enlace_web;
alter table ejercicio_fuerza drop constraint if exists ejercicio_fuerza_link_web;

drop policy if exists club_leer on club;
create policy club_miembros on club
  for all
  using (exists (select 1 from miembro_club m where m.club_id = club.id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = club.id and m.user_id = auth.uid()));

drop policy if exists temporada_leer on temporada;
create policy temporada_miembros on temporada
  for all
  using (exists (select 1 from miembro_club m where m.club_id = temporada.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = temporada.club_id and m.user_id = auth.uid()));

drop policy if exists importacion_leer on importacion;
drop policy if exists importacion_crear on importacion;
create policy importacion_miembros on importacion
  for all
  using (exists (select 1 from miembro_club m where m.club_id = importacion.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = importacion.club_id and m.user_id = auth.uid()));

drop policy if exists recurso_leer on recurso;
drop policy if exists recurso_crear on recurso;
create policy recurso_miembros on recurso
  for all
  using (exists (select 1 from miembro_club m where m.club_id = recurso.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = recurso.club_id and m.user_id = auth.uid()));

drop policy ejercicio_crear on ejercicio;
drop policy ejercicio_editar_lo_propio on ejercicio;
drop policy ejercicio_borrar_lo_propio on ejercicio;
create policy ejercicio_crear on ejercicio
  for insert
  with check (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = ejercicio.club_id and m.user_id = auth.uid()));
create policy ejercicio_editar_lo_propio on ejercicio
  for update
  using (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = ejercicio.club_id and m.user_id = auth.uid()))
  with check (creado_por = auth.uid());
create policy ejercicio_borrar_lo_propio on ejercicio
  for delete
  using (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = ejercicio.club_id and m.user_id = auth.uid()));

drop policy nota_crear on nota_ejercicio;
drop policy nota_borrar_lo_propio on nota_ejercicio;
create policy nota_crear on nota_ejercicio
  for insert
  with check (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = nota_ejercicio.club_id and m.user_id = auth.uid()));
create policy nota_borrar_lo_propio on nota_ejercicio
  for delete
  using (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = nota_ejercicio.club_id and m.user_id = auth.uid()));

create policy perfil_entrenador_propio on perfil_entrenador
  for all
  using (user_id = auth.uid() and exists (select 1 from miembro_club m where m.club_id = perfil_entrenador.club_id and m.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists (select 1 from miembro_club m where m.club_id = perfil_entrenador.club_id and m.user_id = auth.uid()));

grant select, insert, update, delete on
  club, temporada, importacion, recurso, ejercicio, nota_ejercicio, perfil_entrenador
to authenticated;

-- Los privilegios por defecto de Supabase (ALL a anon, TRUNCATE a
-- authenticated) no se reponen: no hay nada en la app que los use.
alter default privileges in schema public grant all on tables to anon;
alter default privileges in schema public grant truncate, references, trigger on tables to authenticated;
grant execute on function puede_ver_plantel(uuid) to anon;
grant execute on function puede_escribir_plantel(uuid) to anon;
grant execute on function jugadores_del_club_para_dedup(uuid) to anon;

delete from supabase_migrations.schema_migrations where version = '0027';
commit;
