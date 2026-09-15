-- Deshace 0023 en el Docker LOCAL. No se corre contra producción sin revisarlo.
-- Borra también la fila de schema_migrations para poder volver a aplicarla con
-- `npx supabase migration up`. Los movimientos y escaleras se pierden.
begin;
drop view if exists escalon_actual;
drop table if exists movimiento_escalon;
drop table if exists escalera_fuerza;
drop function if exists sellar_escalera_fuerza();
drop function if exists pesos_validos(numeric[]);
alter table ejercicio_asignado add column if not exists escalon_kg numeric;
delete from supabase_migrations.schema_migrations where version = '0023';
commit;
