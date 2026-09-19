-- Límites de largo de los textos y RPC sin acceso anónimo (auditoría de seguridad
-- previa al lanzamiento, 2026-09-19).
--
-- 1. Largo máximo de cada texto que escribe un usuario. Hasta ahora sólo había
--    checks numéricos: un usuario habilitado podía guardar un texto de
--    megabytes en un título, una nota o un nombre, y esa fila se le manda a
--    todo el club en cada lectura. Los números son los mismos que los de
--    src/data/limites.js: tests/contratoLimites.test.js los compara y falla si
--    alguno cambia de un lado sólo.
--
--    Los checks van `not valid`, como en 0027: valen para toda fila nueva o
--    modificada, y no revisan (ni frenan la migración por) lo que ya está
--    guardado. Los límites son holgados a propósito: el objetivo es cortar el
--    abuso, no recortar lo que la gente escribe de verdad. Para revisar lo
--    viejo, después: alter table <t> validate constraint <c>;
--
-- 2. Los RPC con `security invoker` heredaban EXECUTE para `anon` (Supabase lo
--    concede por defecto a las funciones nuevas). No filtraban nada, porque
--    RLS ya frena a anon en las tablas, pero anon no tiene por qué poder
--    invocarlos. Se les hace lo mismo que a los demás desde 0017.


/* =====================================================================
   1. Largo máximo de los textos
   ===================================================================== */

alter table jugador add constraint jugador_nombre_clave_largo    check (char_length(nombre_clave) <= 150) not valid;
alter table jugador add constraint jugador_nombre_limpio_largo   check (char_length(nombre_limpio) <= 150) not valid;
alter table jugador add constraint jugador_desambiguador_largo   check (char_length(desambiguador) <= 60) not valid;

alter table importacion add constraint importacion_nombre_archivo_largo check (char_length(nombre_archivo) <= 255) not valid;
alter table partido add constraint partido_rival_nombre_largo check (char_length(rival_nombre) <= 120) not valid;
alter table estadistica_jugador_partido add constraint estadistica_jugador_partido_nombre_crudo_largo check (char_length(nombre_crudo) <= 150) not valid;
alter table estadistica_jugador_partido add constraint estadistica_jugador_partido_numero_largo check (char_length(numero) <= 20) not valid;

alter table recurso add constraint recurso_titulo_largo      check (char_length(titulo) <= 150) not valid;
alter table recurso add constraint recurso_descripcion_largo check (char_length(descripcion) <= 2000) not valid;
alter table recurso add constraint recurso_enlace_largo      check (char_length(enlace) <= 2048) not valid;

alter table ejercicio add constraint ejercicio_titulo_largo      check (char_length(titulo) <= 150) not valid;
alter table ejercicio add constraint ejercicio_tema_largo        check (char_length(tema) <= 100) not valid;
alter table ejercicio add constraint ejercicio_descripcion_largo check (char_length(descripcion) <= 2000) not valid;
alter table ejercicio add constraint ejercicio_enlace_largo      check (char_length(enlace) <= 2048) not valid;
alter table ejercicio add constraint ejercicio_material_largo    check (char_length(material) <= 200) not valid;
alter table ejercicio add constraint ejercicio_jugadores_largo   check (char_length(jugadores) <= 200) not valid;
alter table ejercicio add constraint ejercicio_categorias_largo  check (char_length(categorias) <= 200) not valid;

alter table nota_ejercicio add constraint nota_ejercicio_texto_largo check (char_length(texto) <= 2000) not valid;

alter table ejercicio_fuerza add constraint ejercicio_fuerza_nombre_largo check (char_length(nombre) <= 150) not valid;
alter table ejercicio_fuerza add constraint ejercicio_fuerza_bloque_largo check (char_length(bloque) <= 100) not valid;
alter table ejercicio_fuerza add constraint ejercicio_fuerza_link_largo   check (char_length(link) <= 2048) not valid;

alter table plan_fisico add constraint plan_fisico_nombre_archivo_largo check (char_length(nombre_archivo) <= 255) not valid;

alter table ejercicio_asignado add constraint ejercicio_asignado_bloque_largo         check (char_length(bloque) <= 100) not valid;
alter table ejercicio_asignado add constraint ejercicio_asignado_nombre_original_largo check (char_length(nombre_original) <= 200) not valid;
alter table ejercicio_asignado add constraint ejercicio_asignado_reps_largo           check (char_length(reps) <= 100) not valid;
alter table ejercicio_asignado add constraint ejercicio_asignado_carga_sugerida_largo check (char_length(carga_sugerida) <= 100) not valid;
alter table ejercicio_asignado add constraint ejercicio_asignado_pausa_largo          check (char_length(pausa) <= 100) not valid;
alter table ejercicio_asignado add constraint ejercicio_asignado_notas_largo          check (char_length(notas) <= 1000) not valid;

alter table paso_fuerza add constraint paso_fuerza_nombre_largo check (char_length(nombre) <= 150) not valid;

alter table material add constraint material_detalle_largo check (char_length(detalle) <= 120) not valid;


/* =====================================================================
   2. RPC de escritura: sin acceso anónimo
   ===================================================================== */

revoke execute on function importar_partido(jsonb)         from public, anon;
revoke execute on function alta_jugador_manual(jsonb)      from public, anon;
revoke execute on function guardar_sesion_medicion(jsonb)  from public, anon;
revoke execute on function guardar_recurso(jsonb)          from public, anon;
revoke execute on function guardar_metas_plantel(jsonb)    from public, anon;
revoke execute on function importar_plan_fisico(jsonb)     from public, anon;

grant execute on function importar_partido(jsonb)         to authenticated;
grant execute on function alta_jugador_manual(jsonb)      to authenticated;
grant execute on function guardar_sesion_medicion(jsonb)  to authenticated;
grant execute on function guardar_recurso(jsonb)          to authenticated;
grant execute on function guardar_metas_plantel(jsonb)    to authenticated;
grant execute on function importar_plan_fisico(jsonb)     to authenticated;
