-- Etapa 2A: datos de prueba para desarrollo local. NO son datos reales de
-- ningún club ni jugador — nombres e IDs inventados.
--
-- A propósito NO incluye filas de miembro_club: eso requiere un usuario real
-- de Supabase Auth. Después de correr esta seed, creá un usuario (signup
-- local) y agregá manualmente su fila, ver supabase/ESQUEMA.md.

insert into club (id, nombre) values
  ('00000000-0000-0000-0000-000000000001', 'Club de Prueba');

insert into temporada (id, club_id, nombre) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '2026');

insert into plantel (id, club_id, temporada_id, categoria, codigo_cabb) values
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'U21M', 'U21M'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'U17M', 'U17M');

insert into jugador (id, club_id, nombre_clave, nombre_limpio) values
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'PEREZ JUAN', 'PEREZ, JUAN'),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'GOMEZ LUIS', 'GOMEZ, LUIS');

insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '2026-03-01'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '2026-03-01');
