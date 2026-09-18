-- Verificación de 0027 (endurecimiento de seguridad) contra el Docker LOCAL.
--
-- CÓMO SE CORRE (nunca contra producción):
--   DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
--   docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/verificarSeguridad.sql
--
-- Cada línea es "qué se intenta | esperado | obtenido". Todo lo que no diga
-- OK al final es una falla. Crea usuarios y datos sintéticos dentro de UNA
-- transacción que termina en ROLLBACK: no deja nada.

\set ON_ERROR_STOP on
begin;

-- Ejecuta una sentencia y dice cómo terminó, sin abortar la transacción:
-- 'ok N' (filas afectadas) o el SQLSTATE del error.
create function pg_temp.intentar(p_sql text) returns text
language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return 'ok ' || n;
exception when others then
  return sqlstate;
end $$;

create temp table resultado (orden serial, caso text, esperado text, obtenido text);
grant all on resultado to authenticated, anon;
grant usage on sequence resultado_orden_seq to authenticated, anon;

create function pg_temp.caso(p_caso text, p_esperado text, p_sql text) returns void
language plpgsql as $$
begin
  insert into resultado (caso, esperado, obtenido) values (p_caso, p_esperado, pg_temp.intentar(p_sql));
end $$;

-- 42501 = sin privilegio o rechazado por RLS en un insert; 23514 = CHECK.
-- 'ok 0' en un update/delete = RLS no dejó ver la fila.

-- K coordinador puro, E y F entrenadores, todos de Newell's. P, sin club.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('77777777-7777-7777-7777-777777777701', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-seg-k@verificacion.invalid', now(), now(), now()),
  ('77777777-7777-7777-7777-777777777702', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-seg-e@verificacion.invalid', now(), now(), now()),
  ('77777777-7777-7777-7777-777777777703', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-seg-f@verificacion.invalid', now(), now(), now()),
  ('77777777-7777-7777-7777-777777777704', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-seg-p@verificacion.invalid', now(), now(), now());
insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador) values
  ('77777777-7777-7777-7777-777777777701', '20000000-0000-0000-0000-000000000001', false, true),
  ('77777777-7777-7777-7777-777777777702', '20000000-0000-0000-0000-000000000001', true, false),
  ('77777777-7777-7777-7777-777777777703', '20000000-0000-0000-0000-000000000001', true, false);

-- Datos previos, cargados como postgres: un recurso y un ejercicio de E, una importación.
insert into recurso (id, club_id, titulo, descripcion, enlace, creado_por) values
  ('77777777-7777-7777-7777-7777777777a1', '20000000-0000-0000-0000-000000000001', 'zz rec', 'd', 'https://example.com', '77777777-7777-7777-7777-777777777702');
insert into ejercicio (id, club_id, titulo, tema, creado_por) values
  ('77777777-7777-7777-7777-7777777777b1', '20000000-0000-0000-0000-000000000001', 'zz ej', 'fundamentos', '77777777-7777-7777-7777-777777777702');
insert into importacion (id, club_id, hash_archivo, nombre_archivo) values
  ('77777777-7777-7777-7777-7777777777c1', '20000000-0000-0000-0000-000000000001', 'zz-hash', 'zz.xlsx');

/* ---------- entrenador E ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777702","role":"authenticated"}', true) \g /dev/null

select pg_temp.caso('E: recurso con javascript:', '23514', $q$
  insert into recurso (club_id, titulo, descripcion, enlace) values ('20000000-0000-0000-0000-000000000001', 't', 'd', 'javascript:alert(1)') $q$);
select pg_temp.caso('E: recurso con https', 'ok 1', $q$
  insert into recurso (club_id, titulo, descripcion, enlace) values ('20000000-0000-0000-0000-000000000001', 't', 'd', 'https://x.com') $q$);
select pg_temp.caso('E: guardar_recurso con javascript:', '23514', $q$
  select guardar_recurso('{"clubId":"20000000-0000-0000-0000-000000000001","titulo":"t","descripcion":"d","enlace":"javascript:x","jugadorIds":[],"fecha":"2026-09-18"}'::jsonb) $q$);
select pg_temp.caso('E: guardar_recurso con https', 'ok 1', $q$
  select guardar_recurso('{"clubId":"20000000-0000-0000-0000-000000000001","titulo":"t","descripcion":"d","enlace":"https://x.com","jugadorIds":[],"fecha":"2026-09-18"}'::jsonb) $q$);
select pg_temp.caso('E: recurso a nombre de otro', '42501', $q$
  insert into recurso (club_id, titulo, descripcion, creado_por) values ('20000000-0000-0000-0000-000000000001', 't', 'd', '77777777-7777-7777-7777-777777777703') $q$);
select pg_temp.caso('E: editar su recurso', '42501', $q$
  update recurso set enlace = 'https://otro.com' where id = '77777777-7777-7777-7777-7777777777a1' $q$);
select pg_temp.caso('E: borrar su recurso', '42501', $q$
  delete from recurso where id = '77777777-7777-7777-7777-7777777777a1' $q$);
select pg_temp.caso('E: ejercicio con javascript:', '23514', $q$
  insert into ejercicio (club_id, titulo, tema, enlace) values ('20000000-0000-0000-0000-000000000001', 't', 'fundamentos', 'javascript:x') $q$);
select pg_temp.caso('E: ejercicio_fuerza con javascript:', '23514', $q$
  insert into ejercicio_fuerza (club_id, clave, nombre, link) values ('20000000-0000-0000-0000-000000000001', 'zz clave', 'zz', 'javascript:x') $q$);
select pg_temp.caso('E: ejercicio_fuerza con https', 'ok 1', $q$
  insert into ejercicio_fuerza (club_id, clave, nombre, link) values ('20000000-0000-0000-0000-000000000001', 'zz clave 2', 'zz 2', 'https://x.com') $q$);
select pg_temp.caso('E: crear ejercicio', 'ok 1', $q$
  insert into ejercicio (club_id, titulo, tema, enlace) values ('20000000-0000-0000-0000-000000000001', 't', 'fundamentos', 'https://x.com') $q$);
select pg_temp.caso('E: editar su ejercicio', 'ok 1', $q$
  update ejercicio set titulo = 'nuevo', actualizado_en = now() where id = '77777777-7777-7777-7777-7777777777b1' $q$);
select pg_temp.caso('E: mover su ejercicio a otro club', '42501', $q$
  update ejercicio set club_id = '00000000-0000-0000-0000-000000000001' where id = '77777777-7777-7777-7777-7777777777b1' $q$);
select pg_temp.caso('E: crear nota', 'ok 1', $q$
  insert into nota_ejercicio (club_id, ejercicio_id, texto) values ('20000000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-7777777777b1', 'n') $q$);
select pg_temp.caso('E: crear importacion', 'ok 1', $q$
  insert into importacion (club_id, hash_archivo, nombre_archivo) values ('20000000-0000-0000-0000-000000000001', 'zz-hash-2', 'x.xlsx') $q$);
select pg_temp.caso('E: cambiar el hash de una importacion', '42501', $q$
  update importacion set hash_archivo = 'otro' where id = '77777777-7777-7777-7777-7777777777c1' $q$);
select pg_temp.caso('E: renombrar el club', '42501', $q$
  update club set nombre = 'x' where id = '20000000-0000-0000-0000-000000000001' $q$);
select pg_temp.caso('E: crear temporada', '42501', $q$
  insert into temporada (club_id, nombre) values ('20000000-0000-0000-0000-000000000001', '2099') $q$);
select pg_temp.caso('E: escribir perfil_entrenador', '42501', $q$
  insert into perfil_entrenador (club_id, user_id, nombre) values ('20000000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777702', 'x') $q$);
select pg_temp.caso('E: truncate', '42501', $q$ truncate nota_ejercicio $q$);

/* ---------- entrenador F, sobre lo de E ---------- */

select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777703","role":"authenticated"}', true) \g /dev/null
select pg_temp.caso('F: editar el ejercicio de E', 'ok 0', $q$
  update ejercicio set titulo = 'mío' where id = '77777777-7777-7777-7777-7777777777b1' $q$);
select pg_temp.caso('F: borrar el ejercicio de E', 'ok 0', $q$
  delete from ejercicio where id = '77777777-7777-7777-7777-7777777777b1' $q$);

/* ---------- coordinador puro K: lee, no escribe ---------- */

select set_config('request.jwt.claims', '{"sub":"77777777-7777-7777-7777-777777777701","role":"authenticated"}', true) \g /dev/null
select pg_temp.caso('K: lee el club', 'ok 1', $q$ select 1 from club where id = '20000000-0000-0000-0000-000000000001' $q$);
select pg_temp.caso('K: lee temporadas', 'ok 1', $q$ select 1 from temporada where club_id = '20000000-0000-0000-0000-000000000001' limit 1 $q$);
select pg_temp.caso('K: lee recursos', 'ok 1', $q$ select 1 from recurso where id = '77777777-7777-7777-7777-7777777777a1' $q$);
select pg_temp.caso('K: lee la biblioteca', 'ok 1', $q$ select 1 from ejercicio where id = '77777777-7777-7777-7777-7777777777b1' $q$);
select pg_temp.caso('K: lee importaciones', 'ok 1', $q$ select 1 from importacion where id = '77777777-7777-7777-7777-7777777777c1' $q$);
select pg_temp.caso('K: panorama del club', 'ok 1', $q$ select panorama_del_club('20000000-0000-0000-0000-000000000001') $q$);
select pg_temp.caso('K: crear recurso', '42501', $q$
  insert into recurso (club_id, titulo, descripcion) values ('20000000-0000-0000-0000-000000000001', 't', 'd') $q$);
select pg_temp.caso('K: crear ejercicio', '42501', $q$
  insert into ejercicio (club_id, titulo, tema) values ('20000000-0000-0000-0000-000000000001', 't', 'fundamentos') $q$);
select pg_temp.caso('K: crear nota', '42501', $q$
  insert into nota_ejercicio (club_id, ejercicio_id, texto) values ('20000000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-7777777777b1', 'n') $q$);
select pg_temp.caso('K: crear importacion', '42501', $q$
  insert into importacion (club_id, hash_archivo, nombre_archivo) values ('20000000-0000-0000-0000-000000000001', 'zz-hash-3', 'x.xlsx') $q$);
select pg_temp.caso('K: renombrar el club', '42501', $q$
  update club set nombre = 'x' where id = '20000000-0000-0000-0000-000000000001' $q$);
select pg_temp.caso('K: agrega material (sigue pudiendo)', 'ok 1', $q$
  insert into material (club_id, tipo, cantidad) values ('20000000-0000-0000-0000-000000000001', 'cono', 99) $q$);
select pg_temp.caso('K: habilita un profe (sigue pudiendo)', 'ok 1', $q$
  insert into miembro_club (user_id, club_id, es_entrenador) values ('77777777-7777-7777-7777-777777777704', '20000000-0000-0000-0000-000000000001', true) $q$);

/* ---------- anon ---------- */

reset role;
set local role anon;
select pg_temp.caso('anon: lee club', '42501', $q$ select 1 from club $q$);
select pg_temp.caso('anon: puede_ver_plantel', '42501', $q$ select puede_ver_plantel('20000000-0000-0000-0000-000000000003') $q$);
reset role;

\echo '===== resultado (todo tiene que decir OK)'
select caso, esperado, obtenido, case when obtenido = esperado then 'OK' else 'FALLA' end as estado
from resultado order by orden;
select count(*) filter (where obtenido <> esperado) as fallas from resultado;

rollback;
\echo '===== fin: todo deshecho'
