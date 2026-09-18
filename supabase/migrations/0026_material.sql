-- Inventario de material físico del club.
-- Ver docs/superpowers/specs/2026-09-18-inventario-material-design.md.
--
-- Es la primera tabla de DATOS del club que escribe sólo el coordinador. La
-- regla no es nueva: miembro_club y asignacion_plantel ya la tienen (0017), y
-- es_coordinador_de ya se usa en with check de escritura. No hace falta otra
-- función de permisos.

create table material (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  -- Lista cerrada: el tipo decide reglas (si lleva peso, si se combina) y el
  -- cruce futuro con los ejercicios busca por tipo. Sumar uno es una decisión
  -- de diseño, así que pasa por una migración. 'otro' es para lo que no está.
  tipo text not null check (tipo in (
    'mancuerna', 'disco', 'barra', 'pesa_rusa', 'balon_medicinal',
    'pelota', 'cono', 'soga', 'escalerita', 'banda',
    'otro')),
  -- Kg de UNA unidad, nunca del par. numeric como paso_fuerza.paso: 1,25 es
  -- un disco real y el cruce futuro compara números del mismo tipo.
  peso_kg numeric check (peso_kg > 0),
  -- En los tipos fijos, lo que distingue dos filas del mismo tipo ("N° 7",
  -- "EZ", "roja, fuerte"); vacío si no hace falta. En 'otro', el nombre. not
  -- null para que el índice único no tome dos vacíos como distintos.
  detalle text not null default '',
  -- Unidades sueltas. Lo que ya no se tiene se borra: una fila dice que hay.
  cantidad integer not null check (cantidad > 0),
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid not null default auth.uid() references auth.users(id),
  actualizado_en timestamptz not null default now(),
  -- Con peso: obligatorio. Sin peso: prohibido. Otro: opcional.
  constraint material_peso_obligatorio check (
    tipo not in ('mancuerna', 'disco', 'barra', 'pesa_rusa', 'balon_medicinal')
    or peso_kg is not null),
  constraint material_sin_peso check (
    tipo not in ('pelota', 'cono', 'soga', 'escalerita', 'banda')
    or peso_kg is null),
  constraint material_otro_con_nombre check (tipo <> 'otro' or detalle <> ''),
  constraint material_detalle_recortado check (detalle = btrim(detalle))
);

-- Una fila por variante: la segunda carga de "mancuerna 10 kg" es editar la
-- primera. nulls not distinct (PG 15+): dos conos sin peso chocan en vez de
-- pasar porque null <> null. lower(): "EZ" y "ez" son la misma barra.
create unique index material_unico
  on material (club_id, tipo, peso_kg, lower(detalle)) nulls not distinct;
create index material_club_id_idx on material(club_id);

-- Quién hizo el último cambio y cuándo. El default sólo actúa en el insert;
-- el trigger cubre también el update. Mismo patrón que paso_fuerza.
create function sellar_material()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger material_sellar
  before insert or update on material
  for each row execute function sellar_material();


/* ---------- RLS ---------- */

alter table material enable row level security;

-- Sin datos de ningún chico: lo lee cualquier miembro del club, como
-- paso_fuerza. El sentido es que el profe sepa qué hay antes de armar una
-- rutina.
create policy material_leer on material
  for select using (exists (
    select 1 from miembro_club m
    where m.club_id = material.club_id and m.user_id = auth.uid()));

-- Escribe el rol coordinador, tenga o no además el de entrenador. Sin la
-- exclusión "a sí mismo" de asignacion_plantel: acá no hay acceso que ganar.
create policy material_coordinador_agrega on material
  for insert with check (es_coordinador_de(material.club_id));

create policy material_coordinador_edita on material
  for update using (es_coordinador_de(material.club_id))
  with check (es_coordinador_de(material.club_id));

create policy material_coordinador_quita on material
  for delete using (es_coordinador_de(material.club_id));

-- Supabase concede ALL por defecto sobre tablas nuevas (ver 0017): se revoca
-- todo y se concede lo mínimo, por columna. El cliente no manda autoría ni
-- fechas, y no cambia el tipo ni el club de una fila.
revoke all on material from anon, authenticated;
grant select, delete on material to authenticated;
grant insert (club_id, tipo, peso_kg, detalle, cantidad) on material to authenticated;
grant update (peso_kg, detalle, cantidad) on material to authenticated;

comment on table material is
  'Inventario de material del club: una fila por variante, con cantidad en unidades sueltas. Lee el club, escribe coordinación. v0026.';
comment on column material.peso_kg is
  'Kg de una unidad. Obligatorio en mancuerna, disco, barra, pesa_rusa, balon_medicinal; nulo en los sin peso; opcional en otro.';
