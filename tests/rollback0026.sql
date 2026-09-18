-- Deshace 0026 en el Docker LOCAL. No se corre contra producción sin revisarlo:
-- borra el inventario cargado.
--
-- Borra también la fila de schema_migrations para poder volver a aplicar 0026
-- con `npx supabase migration up`.
begin;

drop table if exists material;
drop function if exists sellar_material();

delete from supabase_migrations.schema_migrations where version = '0026';
commit;
