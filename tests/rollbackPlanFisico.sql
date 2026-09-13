-- Deshace 0020 y 0021 para poder reintentar en local. NUNCA contra producción.
drop function if exists importar_plan_fisico(jsonb);
drop table if exists ejercicio_asignado;
drop table if exists sesion_fisico;
drop table if exists plan_fisico;
drop table if exists ejercicio_fuerza;
