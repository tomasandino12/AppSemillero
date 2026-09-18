-- Verificación de 0026 (inventario de material) contra el Docker LOCAL.
--
-- CÓMO SE CORRE (nunca contra producción):
--   DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
--   docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/verificarMaterial.sql
--
-- Cada bloque dice qué se espera. Crea usuarios, un club y material sintéticos
-- dentro de UNA transacción que termina en ROLLBACK: no deja nada. La
-- impersonación (role authenticated + request.jwt.claims) es como PostgREST
-- evalúa la RLS de una sesión real.

\set ON_ERROR_STOP off
begin;

\echo '===== 0026 aplicada (esperado: t)'
select to_regclass('public.material') is not null as material;

-- Coordinador puro (K), entrenador puro (E), los dos roles (D), todos de
-- Newell's; y un coordinador de otro club (X).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('66666666-6666-6666-6666-666666666601', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-inv-k@verificacion.invalid', now(), now(), now()),
  ('66666666-6666-6666-6666-666666666602', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-inv-e@verificacion.invalid', now(), now(), now()),
  ('66666666-6666-6666-6666-666666666603', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-inv-d@verificacion.invalid', now(), now(), now()),
  ('66666666-6666-6666-6666-666666666604', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-inv-x@verificacion.invalid', now(), now(), now());
insert into club (id, nombre) values
  ('66666666-6666-6666-6666-666666666600', 'ZZ Otro Club');
insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador) values
  ('66666666-6666-6666-6666-666666666601', '20000000-0000-0000-0000-000000000001', false, true),
  ('66666666-6666-6666-6666-666666666602', '20000000-0000-0000-0000-000000000001', true, false),
  ('66666666-6666-6666-6666-666666666603', '20000000-0000-0000-0000-000000000001', true, true),
  ('66666666-6666-6666-6666-666666666604', '66666666-6666-6666-6666-666666666600', false, true);

/* ---------- coordinador puro ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666601","role":"authenticated"}', true) \g /dev/null

\echo '===== coordinador agrega (esperado: mancuerna | 10 | 2 | t | t)'
insert into material (club_id, tipo, peso_kg, cantidad)
  values ('20000000-0000-0000-0000-000000000001', 'mancuerna', 10, 2)
  returning id \gset mancuerna_
select tipo, peso_kg, cantidad,
       creado_por = '66666666-6666-6666-6666-666666666601' as creado_por_k,
       actualizado_por = '66666666-6666-6666-6666-666666666601' as actualizado_por_k
from material where id = :'mancuerna_id';

\echo '===== coordinador edita la cantidad (esperado: 4)'
update material set cantidad = 4 where id = :'mancuerna_id' returning cantidad;

\echo '===== los tipos sin peso, con peso decimal y "otro" con y sin peso (esperado: 5 filas nuevas)'
insert into material (club_id, tipo, peso_kg, detalle, cantidad) values
  ('20000000-0000-0000-0000-000000000001', 'disco', 1.25, '', 4),
  ('20000000-0000-0000-0000-000000000001', 'pelota', null, 'N° 7', 15),
  ('20000000-0000-0000-0000-000000000001', 'cono', null, '', 20),
  ('20000000-0000-0000-0000-000000000001', 'otro', 5, 'Chaleco lastrado', 3),
  ('20000000-0000-0000-0000-000000000001', 'otro', null, 'Vallas', 8);
select count(*) as filas_del_club from material where club_id = '20000000-0000-0000-0000-000000000001';

\echo '===== mancuerna sin peso: esperado check violation'
savepoint c1;
insert into material (club_id, tipo, cantidad) values ('20000000-0000-0000-0000-000000000001', 'mancuerna', 1);
rollback to savepoint c1;

\echo '===== pesa rusa sin peso: esperado check violation'
savepoint c2;
insert into material (club_id, tipo, cantidad) values ('20000000-0000-0000-0000-000000000001', 'pesa_rusa', 1);
rollback to savepoint c2;

\echo '===== cono con peso: esperado check violation'
savepoint c3;
insert into material (club_id, tipo, peso_kg, cantidad) values ('20000000-0000-0000-0000-000000000001', 'cono', 1, 1);
rollback to savepoint c3;

\echo '===== otro sin nombre: esperado check violation'
savepoint c4;
insert into material (club_id, tipo, cantidad) values ('20000000-0000-0000-0000-000000000001', 'otro', 1);
rollback to savepoint c4;

\echo '===== peso 0: esperado check violation'
savepoint c5;
insert into material (club_id, tipo, peso_kg, cantidad) values ('20000000-0000-0000-0000-000000000001', 'disco', 0, 1);
rollback to savepoint c5;

\echo '===== cantidad 0: esperado check violation'
savepoint c6;
insert into material (club_id, tipo, peso_kg, cantidad) values ('20000000-0000-0000-0000-000000000001', 'disco', 20, 0);
rollback to savepoint c6;

\echo '===== detalle con espacios alrededor: esperado check violation'
savepoint c7;
insert into material (club_id, tipo, detalle, cantidad) values ('20000000-0000-0000-0000-000000000001', 'soga', ' larga ', 1);
rollback to savepoint c7;

\echo '===== tipo fuera de la lista: esperado check violation'
savepoint c8;
insert into material (club_id, tipo, cantidad) values ('20000000-0000-0000-0000-000000000001', 'valla', 1);
rollback to savepoint c8;

\echo '===== otra mancuerna de 10: esperado duplicate key (material_unico)'
savepoint u1;
insert into material (club_id, tipo, peso_kg, cantidad) values ('20000000-0000-0000-0000-000000000001', 'mancuerna', 10, 1);
rollback to savepoint u1;

\echo '===== otro cono sin detalle: esperado duplicate key (nulls not distinct)'
savepoint u2;
insert into material (club_id, tipo, cantidad) values ('20000000-0000-0000-0000-000000000001', 'cono', 5);
rollback to savepoint u2;

\echo '===== "vallas" en minúscula: esperado duplicate key (lower)'
savepoint u3;
insert into material (club_id, tipo, detalle, cantidad) values ('20000000-0000-0000-0000-000000000001', 'otro', 'vallas', 2);
rollback to savepoint u3;

\echo '===== cambiar el tipo: esperado permission denied'
savepoint g1;
update material set tipo = 'disco' where id = :'mancuerna_id';
rollback to savepoint g1;

\echo '===== mandar actualizado_por en el insert: esperado permission denied'
savepoint g2;
insert into material (club_id, tipo, peso_kg, cantidad, actualizado_por)
  values ('20000000-0000-0000-0000-000000000001', 'disco', 20, 2, '66666666-6666-6666-6666-666666666602');
rollback to savepoint g2;
reset role;

/* ---------- entrenador puro ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666602","role":"authenticated"}', true) \g /dev/null

\echo '===== entrenador lee todo el inventario (esperado: 6)'
select count(*) as ve_entrenador from material where club_id = '20000000-0000-0000-0000-000000000001';

\echo '===== entrenador edita y quita: no toca nada (esperado: 0 | 0)'
with e as (update material set cantidad = 99 where id = :'mancuerna_id' returning 1),
     q as (delete from material where id = :'mancuerna_id' returning 1)
select (select count(*) from e) as editadas, (select count(*) from q) as quitadas;

\echo '===== entrenador agrega: esperado row-level security'
savepoint r1;
insert into material (club_id, tipo, peso_kg, cantidad) values ('20000000-0000-0000-0000-000000000001', 'barra', 20, 1);
rollback to savepoint r1;
reset role;

/* ---------- los dos roles ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666603","role":"authenticated"}', true) \g /dev/null

\echo '===== los dos roles editan; el trigger sella al nuevo autor y creado_por queda (esperado: 3 | t | t)'
update material set cantidad = 3 where id = :'mancuerna_id'
  returning cantidad,
            actualizado_por = '66666666-6666-6666-6666-666666666603' as sellado_d,
            creado_por = '66666666-6666-6666-6666-666666666601' as creado_por_sigue_k;
reset role;

/* ---------- otro club ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666604","role":"authenticated"}', true) \g /dev/null

\echo '===== coordinador de otro club no ve nada (esperado: 0)'
select count(*) as ve_otro_club from material where club_id = '20000000-0000-0000-0000-000000000001';

\echo '===== coordinador de otro club agrega en Newell''s: esperado row-level security'
savepoint r2;
insert into material (club_id, tipo, peso_kg, cantidad) values ('20000000-0000-0000-0000-000000000001', 'barra', 20, 1);
rollback to savepoint r2;
reset role;

/* ---------- coordinador quita ---------- */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666601","role":"authenticated"}', true) \g /dev/null

\echo '===== coordinador quita la mancuerna (esperado: 1 | 0)'
-- El conteo va en otra sentencia: dentro del mismo WITH, el select lee la foto
-- de antes del delete y seguiría viendo la fila.
with q as (delete from material where id = :'mancuerna_id' returning 1)
select count(*) as quitadas from q;
select count(*) as quedan from material where id = :'mancuerna_id';
reset role;

/* ---------- anon ---------- */

\echo '===== anon: esperado permission denied'
set local role anon;
savepoint a1;
select count(*) from material;
rollback to savepoint a1;
reset role;

rollback;
\echo '===== fin: todo deshecho'
