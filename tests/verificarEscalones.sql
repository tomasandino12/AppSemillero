-- Verificación de 0023 + 0024 (escalones de fuerza) contra el Docker LOCAL.
--
-- CÓMO SE CORRE (nunca contra producción):
--   DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
--   docker exec -i "$DB" psql -U postgres -d postgres -X -q < tests/verificarEscalones.sql
--
-- Cada bloque dice qué se espera. Crea usuarios, un jugador y movimientos
-- sintéticos dentro de UNA transacción que termina en ROLLBACK: no deja nada.
-- La impersonación (role authenticated + request.jwt.claims) es como PostgREST
-- evalúa la RLS de una sesión real.
--
-- Desde 0024 el ejercicio tiene un paso (un número) y el chico un peso actual;
-- no hay lista de pesos válidos ni estado "fuera de la escalera". El paso puede
-- ser nulo: la fila existe para colgarle los movimientos aunque el profe todavía
-- no haya definido el escalón.

\set ON_ERROR_STOP off
begin;

\echo '===== 0023 + 0024 aplicadas (esperado: t t t t)'
select to_regclass('public.paso_fuerza') is not null as paso,
       to_regclass('public.escalera_fuerza') is null as escalera_ya_no_existe,
       to_regclass('public.movimiento_escalon') is not null as movimientos,
       to_regclass('public.escalon_actual') is not null as vista;

\echo '===== pesos_validos ya no existe (esperado: 0)'
select count(*) as pesos_validos_existe
from pg_proc where proname = 'pesos_validos';

\echo '===== escalon_kg (esperado: 0)'
select count(*) as escalon_kg_existe
from information_schema.columns
where table_schema = 'public' and table_name = 'ejercicio_asignado' and column_name = 'escalon_kg';

-- Entrenador de U17M (C), coordinador puro (K), entrenador de U21M (O) y un
-- jugador (J) con pertenencia vigente a U17M.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('55555555-5555-5555-5555-555555555501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-c@verificacion.invalid', now(), now(), now()),
  ('55555555-5555-5555-5555-555555555502', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-k@verificacion.invalid', now(), now(), now()),
  ('55555555-5555-5555-5555-555555555503', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-o@verificacion.invalid', now(), now(), now());
insert into miembro_club (user_id, club_id, es_entrenador, es_coordinador) values
  ('55555555-5555-5555-5555-555555555501', '20000000-0000-0000-0000-000000000001', true, false),
  ('55555555-5555-5555-5555-555555555502', '20000000-0000-0000-0000-000000000001', false, true),
  ('55555555-5555-5555-5555-555555555503', '20000000-0000-0000-0000-000000000001', true, false);
insert into asignacion_plantel (miembro_club_user_id, miembro_club_club_id, plantel_id, origen) values
  ('55555555-5555-5555-5555-555555555501', '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'manual'),
  ('55555555-5555-5555-5555-555555555503', '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'manual');
insert into jugador (id, club_id, nombre_clave, nombre_limpio) values
  ('44444444-4444-4444-4444-444444444401', '20000000-0000-0000-0000-000000000001', 'ZZTEST JUGADOR', 'ZZTEST, JUGADOR');
insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
  select p.club_id, '44444444-4444-4444-4444-444444444401', p.id, p.temporada_id, current_date
  from plantel p where p.id = '20000000-0000-0000-0000-000000000004';

\echo '===== entrenador de U17M: define el paso, ubica y sube; dos movimientos en la misma transacción (esperado: 12)'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555501","role":"authenticated"}', true) \g /dev/null
insert into paso_fuerza (club_id, clave, nombre, paso)
  values ('20000000-0000-0000-0000-000000000001', 'ZZTEST PRESS', 'ZZtest Press', 2)
  returning id \gset paso_
insert into movimiento_escalon (club_id, jugador_id, escalera_id, kg)
  values ('20000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', :'paso_id', 10);
insert into movimiento_escalon (club_id, jugador_id, escalera_id, kg)
  values ('20000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', :'paso_id', 12);
select kg as escalon_actual from escalon_actual where jugador_id = '44444444-4444-4444-4444-444444444401';

\echo '===== el trigger sella también el insert, aunque el cliente mande otro autor (esperado: t)'
insert into paso_fuerza (club_id, clave, nombre, paso, actualizado_por)
  values ('20000000-0000-0000-0000-000000000001', 'ZZTEST SELLO', 'ZZtest Sello', 5, '55555555-5555-5555-5555-555555555503')
  returning actualizado_por = '55555555-5555-5555-5555-555555555501' as sellado_en_el_insert;

\echo '===== editar el paso: permitido, y el trigger sella (esperado: 2.5 | t)'
update paso_fuerza set paso = 2.5 where id = :'paso_id'
  returning paso, actualizado_por = '55555555-5555-5555-5555-555555555501' as sellado_por_trigger;

\echo '===== editar nombre: esperado permission denied'
savepoint s1;
update paso_fuerza set nombre = 'Otro nombre' where id = :'paso_id';
rollback to savepoint s1;

\echo '===== update de un movimiento: esperado permission denied'
savepoint s2;
update movimiento_escalon set kg = 99 where jugador_id = '44444444-4444-4444-4444-444444444401';
rollback to savepoint s2;

\echo '===== delete de un movimiento: esperado permission denied'
savepoint s3;
delete from movimiento_escalon where jugador_id = '44444444-4444-4444-4444-444444444401';
rollback to savepoint s3;

\echo '===== movimiento a nombre de otro: esperado row-level security'
savepoint s4;
insert into movimiento_escalon (club_id, jugador_id, escalera_id, kg, creado_por)
  values ('20000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', :'paso_id', 8, '55555555-5555-5555-5555-555555555503');
rollback to savepoint s4;

\echo '===== kg 0: esperado check violation'
savepoint s5;
insert into movimiento_escalon (club_id, jugador_id, escalera_id, kg)
  values ('20000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', :'paso_id', 0);
rollback to savepoint s5;

\echo '===== ubicar sin escalón definido: la fila existe con paso nulo (esperado: 7 | t)'
insert into paso_fuerza (club_id, clave, nombre)
  values ('20000000-0000-0000-0000-000000000001', 'ZZTEST SIN PASO', 'ZZtest Sin Paso')
  returning id \gset sinpaso_
insert into movimiento_escalon (club_id, jugador_id, escalera_id, kg)
  values ('20000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', :'sinpaso_id', 7);
select (select kg from escalon_actual where escalera_id = :'sinpaso_id') as peso_sin_escalon,
       (select paso is null from paso_fuerza where id = :'sinpaso_id') as escalon_sin_definir;

\echo '===== paso 0: esperado check violation'
savepoint s6;
insert into paso_fuerza (club_id, clave, nombre, paso)
  values ('20000000-0000-0000-0000-000000000001', 'ZZTEST OTRO', 'ZZtest Otro', 0);
rollback to savepoint s6;
reset role;

\echo '===== entrenador de U21M sin el chico (esperado: 0 | 0 | 1, y el insert con row-level security)'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555503","role":"authenticated"}', true) \g /dev/null
select (select count(*) from movimiento_escalon where jugador_id = '44444444-4444-4444-4444-444444444401') as ve_movimientos,
       (select count(*) from escalon_actual where jugador_id = '44444444-4444-4444-4444-444444444401') as ve_escalon,
       (select count(*) from paso_fuerza where clave = 'ZZTEST PRESS') as ve_paso;
savepoint s7;
insert into movimiento_escalon (club_id, jugador_id, escalera_id, kg)
  values ('20000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', :'paso_id', 8);
rollback to savepoint s7;
reset role;

\echo '===== coordinador puro (esperado: 0 | 0 | 1)'
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555502","role":"authenticated"}', true) \g /dev/null
select (select count(*) from movimiento_escalon) as ve_movimientos,
       (select count(*) from escalon_actual) as ve_escalon,
       (select count(*) from paso_fuerza where clave = 'ZZTEST PRESS') as ve_paso;
reset role;

\echo '===== citado también a U21M: el profe de U21M lo ve con el mismo peso (esperado: 12)'
insert into pertenencia (club_id, jugador_id, plantel_id, temporada_id, desde)
  select p.club_id, '44444444-4444-4444-4444-444444444401', p.id, p.temporada_id, current_date
  from plantel p where p.id = '20000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555503","role":"authenticated"}', true) \g /dev/null
select kg as peso_desde_u21m from escalon_actual
where jugador_id = '44444444-4444-4444-4444-444444444401' and escalera_id = :'paso_id';
reset role;

\echo '===== anon: esperado permission denied'
set local role anon;
savepoint s8;
select count(*) from escalon_actual;
rollback to savepoint s8;
reset role;

rollback;
\echo '===== fin: todo deshecho'
