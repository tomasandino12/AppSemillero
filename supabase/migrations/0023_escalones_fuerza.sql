-- Etapa 7: escalones de peso por jugador.
-- Ver docs/superpowers/specs/2026-09-15-fisico-plan-y-escalones-design.md.

-- Pesos de una escalera: al menos uno, sin nulos, positivos, estrictamente
-- crecientes. Función aparte porque un CHECK no admite subconsultas.
create or replace function pesos_validos(p numeric[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
     and cardinality(p) >= 1
     and array_position(p, null) is null
     and not exists (
       select 1
       from unnest(p) with ordinality as x(v, i)
       -- ordinality es bigint y un subíndice de array tiene que ser integer.
       where v <= 0 or (i > 1 and v <= p[(i - 1)::int])
     );
$$;

-- Una escalera por ejercicio para todo el club. `clave` es clavearNombre del
-- nombre de la línea del plan: el mismo espacio de claves que ejercicio_fuerza,
-- pero tabla aparte porque video y escalera son independientes (spec, 4).
create table escalera_fuerza (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  clave text not null,
  -- Como lo escribió el archivo cuando se definió; sólo para mostrar.
  nombre text not null,
  -- numeric y no texto: los escribe el profe en la app, en kg, para que + y −
  -- tengan orden. Distinto de reps/carga/pausa del import, que copian el archivo.
  pesos numeric[] not null check (public.pesos_validos(pesos)),
  actualizado_por uuid not null default auth.uid() references auth.users(id),
  actualizado_en timestamptz not null default now(),
  unique (club_id, clave),
  unique (club_id, id)
);

create or replace function sellar_escalera_fuerza()
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

create trigger escalera_fuerza_sellar
  before insert or update on escalera_fuerza
  for each row execute function sellar_escalera_fuerza();

-- Dónde quedó un chico en una escalera, cada vez que el profe lo ubicó, subió o
-- bajó. Sólo se agrega: sin update ni delete. kg absolutos y no posición: si
-- la escalera cambia, la historia sigue diciendo lo mismo. No se valida contra
-- la escalera por la misma razón.
create table movimiento_escalon (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  jugador_id uuid not null,
  escalera_id uuid not null,
  kg numeric not null check (kg > 0),
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  -- Orden de llegada: define cuál es el último movimiento. creado_en no
  -- alcanza: now() es la hora de inicio de la transacción, así que dos
  -- movimientos de la misma transacción empatan, y una transacción que empezó
  -- antes puede terminar después.
  orden bigint generated always as identity,
  foreign key (club_id, jugador_id) references jugador (club_id, id),
  foreign key (club_id, escalera_id) references escalera_fuerza (club_id, id)
);

create index escalera_fuerza_club_id_idx on escalera_fuerza(club_id);
create index movimiento_escalon_ultimo_idx
  on movimiento_escalon (jugador_id, escalera_id, orden desc);
create index movimiento_escalon_escalera_id_idx on movimiento_escalon(escalera_id);

-- El escalón vigente = el último movimiento. security_invoker: la vista aplica
-- la RLS de movimiento_escalon con los permisos de quien consulta; sin esto
-- correría como su dueño y se saltearía las policies. Primera vista del esquema.
create view escalon_actual
with (security_invoker = true) as
  select distinct on (jugador_id, escalera_id)
    club_id, jugador_id, escalera_id, kg, creado_por, creado_en
  from movimiento_escalon
  order by jugador_id, escalera_id, orden desc;

-- escalon_kg (0020) guardaba un número por línea, para todo el grupo: no sirve
-- para una escalera por jugador. Nunca se escribió; si alguna fila tiene valor,
-- se frena para mirar antes de perderlo.
do $$
begin
  if exists (select 1 from public.ejercicio_asignado where escalon_kg is not null) then
    raise exception 'ejercicio_asignado.escalon_kg tiene valores: revisar antes de eliminar la columna';
  end if;
end;
$$;

alter table ejercicio_asignado drop column escalon_kg;


/* ---------- RLS ---------- */

alter table escalera_fuerza enable row level security;
alter table movimiento_escalon enable row level security;

-- La escalera es del club y no tiene datos de ningún chico: la lee cualquier
-- miembro y la escriben los entrenadores, igual que ejercicio_fuerza (0020).
create policy escalera_fuerza_leer on escalera_fuerza
  for select using (exists (
    select 1 from miembro_club m
    where m.club_id = escalera_fuerza.club_id and m.user_id = auth.uid()));
create policy escalera_fuerza_crear on escalera_fuerza
  for insert with check (exists (
    select 1 from miembro_club m
    where m.club_id = escalera_fuerza.club_id and m.user_id = auth.uid()
      and m.es_entrenador));
create policy escalera_fuerza_editar on escalera_fuerza
  for update using (exists (
    select 1 from miembro_club m
    where m.club_id = escalera_fuerza.club_id and m.user_id = auth.uid()
      and m.es_entrenador))
  with check (exists (
    select 1 from miembro_club m
    where m.club_id = escalera_fuerza.club_id and m.user_id = auth.uid()
      and m.es_entrenador));

-- El escalón de un chico es un dato individual: como medicion_corporal (0016),
-- por pertenencia vigente y plantel asignado. Las funciones de 0018 excluyen al
-- coordinador.
create policy movimiento_escalon_ver on movimiento_escalon
  for select using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = movimiento_escalon.jugador_id and pe.hasta is null
      and puede_ver_plantel(pe.plantel_id)));
create policy movimiento_escalon_crear on movimiento_escalon
  for insert with check (
    movimiento_escalon.creado_por = auth.uid()
    and exists (
      select 1 from pertenencia pe
      where pe.jugador_id = movimiento_escalon.jugador_id and pe.hasta is null
        and puede_escribir_plantel(pe.plantel_id)));

revoke all on escalera_fuerza, movimiento_escalon, escalon_actual from anon, authenticated;
grant select, insert on escalera_fuerza to authenticated;
grant update (pesos) on escalera_fuerza to authenticated;
grant select, insert on movimiento_escalon to authenticated;
grant select on escalon_actual to authenticated;
revoke execute on function pesos_validos(numeric[]) from public, anon;
revoke execute on function sellar_escalera_fuerza() from public, anon, authenticated;
