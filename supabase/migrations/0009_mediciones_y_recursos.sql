-- Etapa 4: mediciones (batería de tiro y velocidad) y recursos.
--
-- Mismas convenciones que 0001_esquema_inicial.sql: toda tabla de dominio
-- lleva club_id, y las FKs son compuestas (club_id, x_id) para que Postgres
-- garantice que el club coincide, cosa que una FK de una sola columna no
-- puede verificar y que RLS no cubre (RLS no aplica a chequeos de FK).

create table sesion_medicion (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  plantel_id uuid not null,
  fecha date not null,
  tipo text not null check (tipo in ('tiro', 'velocidad')),
  creado_en timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, plantel_id) references plantel (club_id, id)
);

create table medicion_tiro (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  sesion_id uuid not null,
  jugador_id uuid not null,
  posicion text not null check (posicion in ('esq_izq','c45_izq','frontal','c45_der','esq_der','libres')),
  -- anotados NULL = el jugador estuvo pero no midió (ausente). NUNCA 0.
  -- 0 de 10 es un dato real y distinto. Un jugador al que la sesión nunca
  -- llegó no tiene fila: son tres estados y el esquema los distingue.
  anotados integer,
  intentos integer not null default 10 check (intentos > 0),
  check (anotados is null or (anotados >= 0 and anotados <= intentos)),
  unique (sesion_id, jugador_id, posicion),
  foreign key (club_id, sesion_id) references sesion_medicion (club_id, id) on delete cascade,
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);

create table medicion_velocidad (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  sesion_id uuid not null,
  jugador_id uuid not null,
  -- numeric(4,1): el máximo de un decimal queda impuesto por el tipo, no por
  -- una validación de la UI que alguien pueda saltear. Un cronómetro a mano
  -- tiene error humano de ~0.2s; guardar centésimas sería precisión falsa.
  segundos numeric(4,1) check (segundos is null or segundos > 0),
  unique (sesion_id, jugador_id),
  foreign key (club_id, sesion_id) references sesion_medicion (club_id, id) on delete cascade,
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);

create table recurso (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  titulo text not null,
  descripcion text not null,
  -- Nullable: un recurso puede ser sólo instrucciones, sin link.
  enlace text,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (club_id, id)
);

create table envio_recurso (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  recurso_id uuid not null,
  jugador_id uuid not null,
  fecha date not null,
  -- Reenviar a "todo el plantel" cuando la mitad ya lo tenía suma sólo a los
  -- que faltaban: la RPC usa on conflict do nothing sobre este unique.
  unique (recurso_id, jugador_id),
  foreign key (club_id, recurso_id) references recurso (club_id, id) on delete cascade,
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);

-- Índices: club_id es la columna que usa toda política RLS para el join
-- contra miembro_club; el resto son los patrones de lectura reales
-- (mediciones de una sesión, historial de un jugador, envíos de un recurso).
create index sesion_medicion_club_id_idx on sesion_medicion(club_id);
create index sesion_medicion_plantel_id_idx on sesion_medicion(plantel_id);
create index medicion_tiro_club_id_idx on medicion_tiro(club_id);
create index medicion_tiro_sesion_id_idx on medicion_tiro(sesion_id);
create index medicion_tiro_jugador_id_idx on medicion_tiro(jugador_id);
create index medicion_velocidad_club_id_idx on medicion_velocidad(club_id);
create index medicion_velocidad_sesion_id_idx on medicion_velocidad(sesion_id);
create index medicion_velocidad_jugador_id_idx on medicion_velocidad(jugador_id);
create index recurso_club_id_idx on recurso(club_id);
create index envio_recurso_club_id_idx on envio_recurso(club_id);
create index envio_recurso_recurso_id_idx on envio_recurso(recurso_id);
create index envio_recurso_jugador_id_idx on envio_recurso(jugador_id);

-- RLS: mismo patrón que 0002_rls.sql en las cinco tablas.
alter table sesion_medicion enable row level security;
alter table medicion_tiro enable row level security;
alter table medicion_velocidad enable row level security;
alter table recurso enable row level security;
alter table envio_recurso enable row level security;

create policy sesion_medicion_miembros on sesion_medicion
  for all
  using (exists (select 1 from miembro_club m where m.club_id = sesion_medicion.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = sesion_medicion.club_id and m.user_id = auth.uid()));

create policy medicion_tiro_miembros on medicion_tiro
  for all
  using (exists (select 1 from miembro_club m where m.club_id = medicion_tiro.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = medicion_tiro.club_id and m.user_id = auth.uid()));

create policy medicion_velocidad_miembros on medicion_velocidad
  for all
  using (exists (select 1 from miembro_club m where m.club_id = medicion_velocidad.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = medicion_velocidad.club_id and m.user_id = auth.uid()));

create policy recurso_miembros on recurso
  for all
  using (exists (select 1 from miembro_club m where m.club_id = recurso.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = recurso.club_id and m.user_id = auth.uid()));

create policy envio_recurso_miembros on envio_recurso
  for all
  using (exists (select 1 from miembro_club m where m.club_id = envio_recurso.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = envio_recurso.club_id and m.user_id = auth.uid()));

-- Postgres exige AMBAS cosas: el GRANT de tabla y una policy de RLS. Faltó
-- en 0002 y apareció en producción como 42501 (ver 0006_grants_authenticated.sql).
grant select, insert, update, delete on
  sesion_medicion,
  medicion_tiro,
  medicion_velocidad,
  recurso,
  envio_recurso
to authenticated;
