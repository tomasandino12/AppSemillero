-- Etapa 2B: datos mínimos reales de configuración para el piloto en
-- Newell's Old Boys. NO incluye jugadores (esos se cargan importando
-- partidos reales) ni la fila de miembro_club del entrenador (acto
-- administrativo manual, ver ESQUEMA.md "Cómo probar localmente").

insert into club (id, nombre) values
  ('20000000-0000-0000-0000-000000000001', 'Newell''s Old Boys');

insert into temporada (id, club_id, nombre) values
  ('20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '2026');

insert into plantel (id, club_id, temporada_id, categoria, codigo_cabb) values
  ('20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'U21M', 'U21M'),
  ('20000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'U17M', 'U17M');
