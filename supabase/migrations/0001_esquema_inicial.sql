-- Etapa 2A: esquema inicial.
--
-- Decisión de la Etapa 2A (no reabrir): TODA tabla de dominio lleva club_id,
-- incluso donde sería derivable por join (pertenencia vía jugador o plantel;
-- estadistica_jugador_partido vía partido). Esto es lo que permite que cada
-- política RLS en 0002_rls.sql sea el mismo patrón simple, sin joins profundos.
--
-- gen_random_uuid() es built-in desde PostgreSQL 13; pgcrypto se habilita
-- igual como red de seguridad para versiones más viejas de Postgres.
create extension if not exists pgcrypto;

create table club (
  id uuid primary key default gen_random_uuid(),
  nombre text not null
);

create table temporada (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  nombre text not null,
  unique (club_id, nombre)
);

create table plantel (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  temporada_id uuid not null references temporada(id),
  categoria text not null,
  -- Sugerencia de mapeo desde el título del parser (p.ej. "U21M"). Nunca se
  -- asigna sola: si no matchea, el import pregunta (Etapa 2B).
  codigo_cabb text,
  unique (club_id, temporada_id, categoria)
);

-- Un jugador es único por club, NUNCA por categoría/plantel — evita que un
-- citado de una categoría a otra genere un perfil duplicado y rompa la
-- trazabilidad de por vida que es la razón de ser de la app.
create table jugador (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  nombre_clave text not null,
  nombre_limpio text not null,
  desambiguador text not null default '',
  unique (club_id, nombre_clave, desambiguador)
);

create table pertenencia (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  jugador_id uuid not null references jugador(id),
  plantel_id uuid not null references plantel(id),
  temporada_id uuid not null references temporada(id),
  desde date not null,
  hasta date
);

-- Único mecanismo de autenticación/permisos: el entrenador. Los jugadores no
-- tienen cuenta en v1. La asignación de membresías es un acto administrativo
-- (ver 0002_rls.sql): no hay política de INSERT para el cliente autenticado.
create table miembro_club (
  user_id uuid not null references auth.users(id),
  club_id uuid not null references club(id),
  rol text not null,
  primary key (user_id, club_id)
);

create table importacion (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  hash_archivo text not null,
  id_partido_cabb text,
  nombre_archivo text not null,
  advertencias jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now(),
  -- Defensa principal contra reimportar el mismo archivo (sobrevive el
  -- renombrado, p.ej. un archivo reenviado por WhatsApp).
  unique (club_id, hash_archivo)
);

create table partido (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  plantel_id uuid not null references plantel(id),
  importacion_id uuid not null unique references importacion(id),
  -- El archivo de la CABB no trae fecha: la carga el entrenador en el import.
  fecha date not null,
  condicion_propia text not null check (condicion_propia in ('local', 'visitante')),
  -- Del rival sólo se guarda el nombre y el resultado — nunca sus jugadores.
  rival_nombre text,
  puntos_propios integer,
  puntos_rival integer,
  creado_en timestamptz not null default now()
);

create table estadistica_jugador_partido (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  partido_id uuid not null references partido(id) on delete cascade,
  jugador_id uuid not null references jugador(id),
  -- El número de camiseta va SOLO acá, nunca en jugador: cambia entre partidos.
  numero text,
  -- Nombre crudo del archivo para esta fila, para auditar contra el original.
  nombre_crudo text not null,
  min_segundos integer,
  pts integer,
  dos_anotados integer,
  dos_intentados integer,
  dos_porcentaje integer,
  tres_anotados integer,
  tres_intentados integer,
  tres_porcentaje integer,
  libres_anotados integer,
  libres_intentados integer,
  libres_porcentaje integer,
  reb_def integer,
  reb_of integer,
  reb_tot integer,
  ast integer,
  rec integer,
  per integer,
  tap_cometidos integer,
  tap_recibidos integer,
  fal_cometidas integer,
  fal_recibidas integer,
  val integer,
  mas_menos integer,
  creado_en timestamptz not null default now(),
  unique (partido_id, jugador_id)
);

-- Índices de apoyo: club_id es la columna que toda política RLS de 0002_rls.sql
-- usa para el join contra miembro_club; jugador_id/partido_id son los patrones
-- de lectura más comunes (historial de un jugador, planilla de un partido).
create index temporada_club_id_idx on temporada(club_id);
create index plantel_club_id_idx on plantel(club_id);
create index jugador_club_id_idx on jugador(club_id);
create index pertenencia_club_id_idx on pertenencia(club_id);
create index pertenencia_jugador_id_idx on pertenencia(jugador_id);
create index importacion_club_id_idx on importacion(club_id);
create index partido_club_id_idx on partido(club_id);
create index estadistica_club_id_idx on estadistica_jugador_partido(club_id);
create index estadistica_partido_id_idx on estadistica_jugador_partido(partido_id);
