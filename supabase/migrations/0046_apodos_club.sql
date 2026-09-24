/*
  0046 — apodos del club

  Dos o tres palabras clave del club ("Leproso", "NOB") que la app muestra en
  la etiqueta "Metodología <apodo>" de las guías. Viven en la base y no en el
  código porque la app es multi-club. null quiere decir "no tiene": la app cae
  a club.nombre.

  Los límites (1 a 3 apodos, de hasta 20 caracteres) se repiten en
  src/data/metodologia.js; tests/contratoApodos.test.js los compara.

  No hay grants nuevos: club sigue siendo de sólo lectura para authenticated
  (0027). Los apodos se cargan por SQL.
*/

create or replace function apodos_validos(p_apodos text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_ndims(p_apodos) = 1, false)
     and array_length(p_apodos, 1) between 1 and 3
     and not exists (
       select 1 from unnest(p_apodos) as a
       where a is null
          or btrim(a) <> a
          or a = ''
          or char_length(a) > 20
     );
$$;

revoke execute on function apodos_validos(text[]) from public, anon;
grant  execute on function apodos_validos(text[]) to authenticated;

alter table club add column apodos text[];

alter table club add constraint club_apodos_validos
  check (apodos is null or apodos_validos(apodos));

-- Piloto: Newell's Old Boys (id de 0004).
update club set apodos = '{Leproso,NOB}'
where id = '20000000-0000-0000-0000-000000000001';
