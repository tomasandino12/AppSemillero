-- Endurecimiento de seguridad (auditoría Cyber Neo, 2026-09-18).
--
-- 1. Links: sólo http(s). escaparHtml() protege el atributo href pero no el
--    esquema, y un "javascript:" guardado se ejecuta al tocar el link con la
--    sesión del que lo toca. La regla es la misma de src/data/enlaces.js.
-- 2. Quién escribe qué. Regla del club: coordinación LEE lo mismo que hoy (el
--    panorama, la biblioteca, los recursos) pero sólo ESCRIBE asignaciones de
--    profes (0017) e inventario (0026). Lo que cargan los profes lo escriben
--    los entrenadores, y cada uno sólo lo suyo. Quedaban cuatro policies
--    `for all` de 0002/0009 y tres de 0015 que dejaban escribir a cualquier
--    miembro.
-- 3. anon no tiene nada que hacer con las tablas: la app no consulta nada sin
--    sesión.
--
-- Las lecturas no cambian para nadie: todas las policies de select quedan
-- como estaban o se recrean con la misma condición.


/* =====================================================================
   1. Links sólo http(s)
   ===================================================================== */

-- Espacios alrededor y cadenas vacías: se normalizan antes del CHECK. No
-- cambian qué abre el link.
update recurso          set enlace = nullif(btrim(enlace), '') where enlace is distinct from nullif(btrim(enlace), '');
update ejercicio        set enlace = nullif(btrim(enlace), '') where enlace is distinct from nullif(btrim(enlace), '');
update ejercicio_fuerza set link   = nullif(btrim(link), '')   where link   is distinct from nullif(btrim(link), '');

-- `not valid`: la regla vale ya para todo lo que se escriba de acá en más, y
-- una fila vieja que no la cumpla no aborta la migración. La app ya no dibuja
-- esos links (esEnlaceWeb), así que no hay nada que tocar a ciegas; abajo se
-- intenta validar y, si alguna falla, se avisa cuántas son.
alter table recurso
  add constraint recurso_enlace_web
  check (enlace is null or enlace ~* '^https?://') not valid;
alter table ejercicio
  add constraint ejercicio_enlace_web
  check (enlace is null or enlace ~* '^https?://') not valid;
alter table ejercicio_fuerza
  add constraint ejercicio_fuerza_link_web
  check (link is null or link ~* '^https?://') not valid;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('recurso', 'recurso_enlace_web', 'enlace'),
    ('ejercicio', 'ejercicio_enlace_web', 'enlace'),
    ('ejercicio_fuerza', 'ejercicio_fuerza_link_web', 'link')) as t(tabla, restriccion, columna)
  loop
    begin
      execute format('alter table public.%I validate constraint %I', r.tabla, r.restriccion);
    exception when check_violation then
      raise notice '0027: %.% tiene filas que no empiezan con http(s)://. La app no las muestra. Revisarlas con: select id, % from public.% where % !~* ''^https?://'';',
        r.tabla, r.columna, r.columna, r.tabla, r.columna;
    end;
  end loop;
end $$;


/* =====================================================================
   2. club y temporada: sólo lectura desde la app
   ===================================================================== */

-- Se siembran y se editan por SQL, como plantel (0016). Nadie los escribe
-- desde la app; antes cualquier miembro podía renombrar el club o cambiar
-- las temporadas.
drop policy club_miembros on club;
create policy club_leer on club
  for select using (exists (
    select 1 from miembro_club m where m.club_id = club.id and m.user_id = auth.uid()));

drop policy temporada_miembros on temporada;
create policy temporada_leer on temporada
  for select using (exists (
    select 1 from miembro_club m where m.club_id = temporada.club_id and m.user_id = auth.uid()));

revoke all on club, temporada from anon, authenticated;
grant select on club, temporada to authenticated;


/* =====================================================================
   3. importacion: la crea un entrenador y no se toca más
   ===================================================================== */

-- La lectura sigue siendo de cualquier miembro. Editarla permitía cambiar
-- hash_archivo y esquivar la defensa contra reimportar el mismo archivo.
drop policy importacion_miembros on importacion;
create policy importacion_leer on importacion
  for select using (exists (
    select 1 from miembro_club m where m.club_id = importacion.club_id and m.user_id = auth.uid()));
create policy importacion_crear on importacion
  for insert with check (es_entrenador_de(importacion.club_id));

revoke all on importacion from anon, authenticated;
grant select on importacion to authenticated;
grant insert (club_id, hash_archivo, id_partido_cabb, nombre_archivo, advertencias) on importacion to authenticated;


/* =====================================================================
   4. recurso: lo crea un entrenador, a su nombre, y no se toca más
   ===================================================================== */

-- La app no edita ni borra recursos. Borrar uno borraba en cascada a quién
-- se le mandó (envio_recurso), que es justo la memoria que la app guarda.
drop policy recurso_miembros on recurso;
create policy recurso_leer on recurso
  for select using (exists (
    select 1 from miembro_club m where m.club_id = recurso.club_id and m.user_id = auth.uid()));
create policy recurso_crear on recurso
  for insert with check (
    es_entrenador_de(recurso.club_id)
    and recurso.creado_por = auth.uid());

-- creado_por no va en el grant: toma su default, auth.uid().
revoke all on recurso from anon, authenticated;
grant select on recurso to authenticated;
grant insert (club_id, titulo, descripcion, enlace) on recurso to authenticated;


/* =====================================================================
   5. Biblioteca: escriben los entrenadores, cada uno lo suyo
   ===================================================================== */

-- Antes cualquier miembro creaba ejercicios y notas, y el with check de
-- editar no volvía a mirar el club: quien cargó un ejercicio podía moverlo a
-- otro club cambiándole el club_id.
drop policy ejercicio_crear on ejercicio;
drop policy ejercicio_editar_lo_propio on ejercicio;
drop policy ejercicio_borrar_lo_propio on ejercicio;

create policy ejercicio_crear on ejercicio
  for insert with check (
    ejercicio.creado_por = auth.uid()
    and es_entrenador_de(ejercicio.club_id));
create policy ejercicio_editar_lo_propio on ejercicio
  for update
  using (ejercicio.creado_por = auth.uid() and es_entrenador_de(ejercicio.club_id))
  with check (ejercicio.creado_por = auth.uid() and es_entrenador_de(ejercicio.club_id));
create policy ejercicio_borrar_lo_propio on ejercicio
  for delete using (ejercicio.creado_por = auth.uid() and es_entrenador_de(ejercicio.club_id));

-- Por columna: ni club_id ni creado_por se mandan en un update.
revoke all on ejercicio from anon, authenticated;
grant select, delete on ejercicio to authenticated;
grant insert (club_id, titulo, tema, descripcion, enlace, material, jugadores, categorias) on ejercicio to authenticated;
grant update (titulo, tema, descripcion, enlace, material, jugadores, categorias, actualizado_en) on ejercicio to authenticated;

drop policy nota_crear on nota_ejercicio;
drop policy nota_borrar_lo_propio on nota_ejercicio;
create policy nota_crear on nota_ejercicio
  for insert with check (
    nota_ejercicio.creado_por = auth.uid()
    and es_entrenador_de(nota_ejercicio.club_id));
create policy nota_borrar_lo_propio on nota_ejercicio
  for delete using (nota_ejercicio.creado_por = auth.uid() and es_entrenador_de(nota_ejercicio.club_id));

-- Las notas no se editan (no hay policy de update): se borra y se escribe otra.
revoke all on nota_ejercicio from anon, authenticated;
grant select, delete on nota_ejercicio to authenticated;
grant insert (club_id, ejercicio_id, texto) on nota_ejercicio to authenticated;

-- Desde 0019 el nombre vive en los metadatos de Auth y la app no lee ni
-- escribe esta tabla. Queda de sólo lectura para no perder los datos.
drop policy perfil_entrenador_propio on perfil_entrenador;
revoke all on perfil_entrenador from anon, authenticated;
grant select on perfil_entrenador to authenticated;


/* =====================================================================
   6. anon y privilegios que no pasan por RLS
   ===================================================================== */

-- Supabase le da ALL a anon y authenticated sobre cada tabla nueva de public
-- (ver 0017). TRUNCATE no pasa por RLS; hoy PostgREST no lo expone, pero no
-- hay por qué tenerlo concedido. Con anon, nada: la app sin sesión no consulta
-- tablas.
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Y lo mismo para lo que creen las migraciones que vengan.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- 0016 revocó sólo "from public", y Supabase se lo concede a anon aparte.
revoke execute on function puede_ver_plantel(uuid) from anon;
revoke execute on function puede_escribir_plantel(uuid) from anon;
revoke execute on function jugadores_del_club_para_dedup(uuid) from anon;
