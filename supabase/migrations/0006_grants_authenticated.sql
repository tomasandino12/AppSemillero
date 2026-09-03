-- Etapa 2B: cierra un gap de infraestructura encontrado durante la
-- verificación real de Task 7 contra el proyecto de Supabase real — todas
-- las tablas de dominio devolvían "permission denied" (42501) para el rol
-- authenticated, un privilegio de tabla faltante, no un resultado de RLS
-- filtrando filas (RLS ya está bien en 0002_rls.sql; Postgres exige AMBAS
-- cosas: el GRANT de tabla y una policy de RLS que lo permita).
--
-- Solo a "authenticated", nunca a "anon" — coincide con la decisión de
-- diseño "solo el entrenador se autentica" (ESQUEMA.md). Las políticas de
-- RLS existentes siguen siendo la barrera real fila por fila: en particular,
-- miembro_club solo tiene política de "select" (0002_rls.sql) — un GRANT de
-- tabla amplio acá no habilita insert/update/delete en esa tabla, porque
-- RLS exige una policy que cubra esa operación específica y no existe
-- ninguna para insert/update/delete en miembro_club.
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  club,
  temporada,
  plantel,
  jugador,
  pertenencia,
  miembro_club,
  importacion,
  partido,
  estadistica_jugador_partido
to authenticated;
