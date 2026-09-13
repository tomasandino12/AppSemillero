-- Etapa 6: plan físico (fuerza). Persiste el .xlsx que arma el profe de físico.
-- Ver docs/superpowers/specs/2026-09-12-import-plan-fisico-design.md.

-- Biblioteca de ejercicios de fuerza.
--
-- Tabla nueva y NO la `ejercicio` de 0015: esa es la biblioteca de básquet
-- (tema, material, jugadores, notas, autoría), su eje es `tema` y no `bloque`,
-- y su RLS deja editar sólo a quien creó la fila — que no sirve para un
-- catálogo que nace de importar un archivo.
create table ejercicio_fuerza (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  -- Nombre normalizado (clavearNombre: mayúsculas, sin acentos, espacios
  -- colapsados). Es lo que hace que el import del mes siguiente reconcilie
  -- solo contra lo que ya está cargado.
  clave text not null,
  nombre text not null,
  -- Sin check: la lista de bloques la manda el archivo del club, igual que
  -- `tema` en 0015. Un check obliga a una migración por cada bloque nuevo.
  bloque text,
  link text,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (club_id, clave),
  -- Target de la FK compuesta de ejercicio_asignado.
  unique (club_id, id)
);

-- Un archivo importado, para un plantel.
create table plan_fisico (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  plantel_id uuid not null,
  nombre_archivo text not null,
  -- SHA-256 de los bytes, igual que importacion (0001) y por el mismo motivo:
  -- sobrevive el renombrado (un archivo reenviado por WhatsApp).
  hash_archivo text not null,
  advertencias jsonb not null default '[]'::jsonb,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  -- Por PLANTEL y no por club: si dos categorías hacen la misma rutina, el
  -- profe sube el mismo archivo para las dos. Lo que hay que impedir es
  -- duplicar las sesiones de UNA categoría.
  unique (plantel_id, hash_archivo),
  unique (club_id, id),
  foreign key (club_id, plantel_id) references plantel (club_id, id)
);

-- Un día de entrenamiento. Sin dia_semana: se deriva de la fecha.
create table sesion_fisico (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  plan_id uuid not null,
  fecha date not null,
  unique (club_id, id),
  foreign key (club_id, plan_id) references plan_fisico (club_id, id) on delete cascade
);

-- Una línea de la rutina.
create table ejercicio_asignado (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  sesion_id uuid not null,
  -- NULL = pendiente de resolver, y es un estado válido. La FK compuesta es
  -- MATCH SIMPLE (el default): con la columna en NULL no chequea nada; con
  -- valor, obliga a que el club coincida.
  ejercicio_fuerza_id uuid,
  orden integer,
  bloque text,
  -- El texto exacto del archivo, como nombre_crudo en estadistica_*: permite
  -- auditar contra el original y es lo único que queda si nunca se resuelve.
  nombre_original text not null,
  series integer,
  -- text y no números: el archivo dice 5xL, 45'', Fallo-2, PC, Barra + Disc.
  -- Convertirlos sería fabricar una precisión que el dato no tiene.
  reps text,
  carga_sugerida text,
  pausa text,
  notas text,
  -- Siempre NULL en esta etapa: la RPC no la escribe. Además guarda UN valor
  -- por línea, o sea para todo el grupo; el escalón por jugador, cuando se
  -- destrabe, va a ser otra tabla.
  escalon_kg numeric,
  foreign key (club_id, sesion_id) references sesion_fisico (club_id, id) on delete cascade,
  foreign key (club_id, ejercicio_fuerza_id) references ejercicio_fuerza (club_id, id)
);

create index ejercicio_fuerza_club_id_idx on ejercicio_fuerza(club_id);
create index plan_fisico_club_id_idx on plan_fisico(club_id);
create index plan_fisico_plantel_id_idx on plan_fisico(plantel_id);
create index sesion_fisico_plan_id_idx on sesion_fisico(plan_id);
create index ejercicio_asignado_sesion_id_idx on ejercicio_asignado(sesion_id);
create index ejercicio_asignado_ejercicio_fuerza_id_idx on ejercicio_asignado(ejercicio_fuerza_id);


/* ---------- RLS ---------- */

alter table ejercicio_fuerza enable row level security;
alter table plan_fisico enable row level security;
alter table sesion_fisico enable row level security;
alter table ejercicio_asignado enable row level security;

-- La biblioteca es del club, no de un plantel: el beneficio de cargarla es que
-- quede para todos (mismo criterio que `ejercicio` en 0015). Crear es sólo del
-- entrenador — el coordinador nunca escribe (0016). Desde 0017 el rol es
-- miembro_club.es_entrenador: la columna `rol` ya no existe.
create policy ejercicio_fuerza_leer on ejercicio_fuerza
  for select using (exists (
    select 1 from miembro_club m
    where m.club_id = ejercicio_fuerza.club_id and m.user_id = auth.uid()));
create policy ejercicio_fuerza_crear on ejercicio_fuerza
  for insert with check (exists (
    select 1 from miembro_club m
    where m.club_id = ejercicio_fuerza.club_id and m.user_id = auth.uid()
      and m.es_entrenador));

-- Por plantel, con las funciones de 0016 (cuerpo vigente de 0018): lee y
-- escribe sólo el entrenador con asignación vigente a ese plantel.
create policy plan_fisico_ver on plan_fisico
  for select using (puede_ver_plantel(plan_fisico.plantel_id));
create policy plan_fisico_crear on plan_fisico
  for insert with check (puede_escribir_plantel(plan_fisico.plantel_id));
create policy plan_fisico_borrar on plan_fisico
  for delete using (puede_escribir_plantel(plan_fisico.plantel_id));

create policy sesion_fisico_ver on sesion_fisico
  for select using (exists (
    select 1 from plan_fisico p
    where p.id = sesion_fisico.plan_id and puede_ver_plantel(p.plantel_id)));
create policy sesion_fisico_crear on sesion_fisico
  for insert with check (exists (
    select 1 from plan_fisico p
    where p.id = sesion_fisico.plan_id and puede_escribir_plantel(p.plantel_id)));
create policy sesion_fisico_borrar on sesion_fisico
  for delete using (exists (
    select 1 from plan_fisico p
    where p.id = sesion_fisico.plan_id and puede_escribir_plantel(p.plantel_id)));

-- update va aunque esta etapa no actualice nada: es lo que va a necesitar la
-- pantalla que resuelva los pendientes (spec, sección 8).
create policy ejercicio_asignado_ver on ejercicio_asignado
  for select using (exists (
    select 1 from sesion_fisico s join plan_fisico p on p.id = s.plan_id
    where s.id = ejercicio_asignado.sesion_id and puede_ver_plantel(p.plantel_id)));
create policy ejercicio_asignado_crear on ejercicio_asignado
  for insert with check (exists (
    select 1 from sesion_fisico s join plan_fisico p on p.id = s.plan_id
    where s.id = ejercicio_asignado.sesion_id and puede_escribir_plantel(p.plantel_id)));
create policy ejercicio_asignado_editar on ejercicio_asignado
  for update using (exists (
    select 1 from sesion_fisico s join plan_fisico p on p.id = s.plan_id
    where s.id = ejercicio_asignado.sesion_id and puede_escribir_plantel(p.plantel_id)))
  with check (exists (
    select 1 from sesion_fisico s join plan_fisico p on p.id = s.plan_id
    where s.id = ejercicio_asignado.sesion_id and puede_escribir_plantel(p.plantel_id)));
create policy ejercicio_asignado_borrar on ejercicio_asignado
  for delete using (exists (
    select 1 from sesion_fisico s join plan_fisico p on p.id = s.plan_id
    where s.id = ejercicio_asignado.sesion_id and puede_escribir_plantel(p.plantel_id)));

-- Postgres exige el GRANT además de la policy (ver 0006). Se otorga sólo lo
-- que alguna policy habilita. Primero se revoca todo: Supabase concede ALL por
-- defecto a anon y authenticated sobre las tablas nuevas de public (ver 0017),
-- así que sin el revoke el grant de abajo no restringiría nada.
revoke all on ejercicio_fuerza, plan_fisico, sesion_fisico, ejercicio_asignado from anon, authenticated;
grant select, insert on ejercicio_fuerza to authenticated;
grant select, insert, delete on plan_fisico, sesion_fisico to authenticated;
grant select, insert, update, delete on ejercicio_asignado to authenticated;
