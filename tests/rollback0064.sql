-- Deshace 0064 en una base de PRUEBA. No se corre contra producción sin
-- revisarlo: borra todas las noticias. Las FOTOS no se pueden borrar desde
-- SQL (Storage lo impide): vaciar antes el bucket `noticias` desde el panel
-- de Supabase (Storage → noticias → seleccionar todo → borrar), o este script
-- falla en el delete del bucket.
--
-- El portal sigue andando sin 0064: sin las funciones, la sección de noticias
-- queda oculta. Borra también la fila de schema_migrations para poder volver
-- a aplicar 0064.
begin;

drop policy if exists noticias_fotos_coordinador_sube on storage.objects;
drop policy if exists noticias_fotos_coordinador_ve on storage.objects;
drop policy if exists noticias_fotos_coordinador_borra on storage.objects;
delete from storage.buckets where id = 'noticias';

drop function if exists noticia_publica(uuid, uuid);
drop function if exists noticias_publicas(uuid, integer, timestamptz);
drop table if exists noticia;
drop function if exists sellar_noticia();
drop function if exists fotos_de_noticia_validas(jsonb, uuid, uuid);
drop function if exists club_de_ruta_noticia(text);

delete from supabase_migrations.schema_migrations where version = '0064';
commit;
