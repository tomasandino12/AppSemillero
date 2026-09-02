-- Etapa 2A: Row Level Security.
--
-- Un usuario ve/edita únicamente lo de un club donde tiene una fila en
-- miembro_club. Como TODA tabla de dominio lleva club_id (0001), la misma
-- forma de política sirve para las ocho tablas de dominio (todas menos
-- miembro_club, que tiene su propia política más abajo).

alter table club enable row level security;
alter table temporada enable row level security;
alter table plantel enable row level security;
alter table jugador enable row level security;
alter table pertenencia enable row level security;
alter table miembro_club enable row level security;
alter table importacion enable row level security;
alter table partido enable row level security;
alter table estadistica_jugador_partido enable row level security;

create policy club_miembros on club
  for all
  using (exists (select 1 from miembro_club m where m.club_id = club.id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = club.id and m.user_id = auth.uid()));

create policy temporada_miembros on temporada
  for all
  using (exists (select 1 from miembro_club m where m.club_id = temporada.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = temporada.club_id and m.user_id = auth.uid()));

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

create policy importacion_miembros on importacion
  for all
  using (exists (select 1 from miembro_club m where m.club_id = importacion.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = importacion.club_id and m.user_id = auth.uid()));

create policy partido_miembros on partido
  for all
  using (exists (select 1 from miembro_club m where m.club_id = partido.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = partido.club_id and m.user_id = auth.uid()));

create policy estadistica_miembros on estadistica_jugador_partido
  for all
  using (exists (select 1 from miembro_club m where m.club_id = estadistica_jugador_partido.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = estadistica_jugador_partido.club_id and m.user_id = auth.uid()));

-- miembro_club es distinta: no tiene su propio club_id que apunte "hacia
-- afuera" de sí misma en el mismo sentido. Un usuario ve únicamente sus
-- propias filas de membresía. No hay política de insert/update/delete para
-- el cliente autenticado a propósito: dar de alta un entrenador en un club
-- es un acto administrativo (panel de Supabase o rol de servicio), nunca
-- algo que un usuario pueda hacerse a sí mismo.
create policy miembro_club_propio on miembro_club
  for select
  using (user_id = auth.uid());
