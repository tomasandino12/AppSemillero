-- Variaciones de un ejercicio de la biblioteca: cómo subirle la complejidad.
-- Ver C:\Users\PC\.claude\plans\vi-que-los-profes-quiet-island.md (Fase 1).
--
-- Lo pidieron los profes: la progresión ("después le metés un defensor",
-- "ahora sólo con mano débil") hoy queda en la cabeza de cada uno o perdida
-- adentro de la descripción. Como las notas, cualquier entrenador del club le
-- suma una variación a cualquier ejercicio —el valor es compartir lo que cada
-- uno sabe— y cada uno edita y borra sólo las suyas.
--
-- No hay datos de menores: una variación describe un ejercicio, no a un chico.

create table variacion_ejercicio (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  ejercicio_id uuid not null,
  -- Un nivel que elige cada autor, y no un orden que se reordena: si varios
  -- profes suman variaciones, reordenar las de otro pediría permisos
  -- cruzados. Los empates se ordenan por fecha. El rango es NIVEL de
  -- src/data/variaciones.js (tests/contratoVariacion.test.js).
  nivel smallint not null check (nivel between 1 and 5),
  -- Qué se cambia (oposición, espacio, tiempo...). SIN check a propósito,
  -- igual que ejercicio.tema: la lista vive en src/data/variaciones.js y tiene
  -- que poder editarse sin una migración. Opcional.
  eje text check (char_length(eje) <= 100),
  titulo text not null check (char_length(titulo) <= 150),
  descripcion text check (char_length(descripcion) <= 2000),
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint variacion_titulo_no_vacio check (btrim(titulo) <> ''),
  -- FK compuesta: el club tiene que ser el del ejercicio, no sólo existir.
  -- Si el autor borra el ejercicio, se van sus variaciones (como las notas).
  foreign key (club_id, ejercicio_id) references ejercicio (club_id, id) on delete cascade
);

create index variacion_ejercicio_club_id_idx on variacion_ejercicio(club_id);
create index variacion_ejercicio_ejercicio_id_idx on variacion_ejercicio(ejercicio_id);

-- La autoría y las fechas las pone el servidor. Los grants ya no dejan que el
-- cliente mande esas columnas; el trigger lo asegura igual si algún día se
-- amplía un grant (mismo razonamiento que sellar_jugada, 0035). En un update
-- tampoco se puede mudar la variación a otro ejercicio.
create function sellar_variacion_ejercicio()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.creado_en := now();
  else
    new.club_id := old.club_id;
    new.ejercicio_id := old.ejercicio_id;
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
  end if;
  new.actualizado_en := now();
  return new;
end;
$fn$;

create trigger variacion_ejercicio_sellar
  before insert or update on variacion_ejercicio
  for each row execute function sellar_variacion_ejercicio();


/* ---------- RLS ---------- */

alter table variacion_ejercicio enable row level security;

-- Lee y escribe el cuerpo técnico, con el mismo criterio que jugada (0035).
-- El jugador no ve ejercicios.
create policy variacion_leer on variacion_ejercicio
  for select using (es_entrenador_de(variacion_ejercicio.club_id));

create policy variacion_crear on variacion_ejercicio
  for insert with check (
    variacion_ejercicio.creado_por = auth.uid()
    and es_entrenador_de(variacion_ejercicio.club_id));

create policy variacion_editar_lo_propio on variacion_ejercicio
  for update
  using (variacion_ejercicio.creado_por = auth.uid() and es_entrenador_de(variacion_ejercicio.club_id))
  with check (variacion_ejercicio.creado_por = auth.uid() and es_entrenador_de(variacion_ejercicio.club_id));

create policy variacion_borrar_lo_propio on variacion_ejercicio
  for delete using (variacion_ejercicio.creado_por = auth.uid() and es_entrenador_de(variacion_ejercicio.club_id));

-- Supabase concede ALL por defecto sobre tablas nuevas: se revoca todo y se
-- concede lo mínimo, por columna. Ni autoría, ni fechas, ni club, ni
-- ejercicio en un update.
revoke all on variacion_ejercicio from anon, authenticated;
grant select, delete on variacion_ejercicio to authenticated;
grant insert (club_id, ejercicio_id, nivel, eje, titulo, descripcion) on variacion_ejercicio to authenticated;
grant update (nivel, eje, titulo, descripcion) on variacion_ejercicio to authenticated;

comment on table variacion_ejercicio is
  'Variaciones de un ejercicio de la biblioteca para subirle la complejidad. Leen y suman los entrenadores del club; cada uno edita y borra las suyas. v0052.';
comment on column variacion_ejercicio.nivel is
  'De 1 a 5, lo elige quien la carga. A igual nivel se ordena por creado_en.';
