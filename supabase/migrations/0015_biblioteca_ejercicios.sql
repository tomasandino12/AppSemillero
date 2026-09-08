-- Etapa 5: biblioteca de ejercicios del club.
--
-- Lo que esto resuelve, dicho por un entrenador del club: "me acuerdo que
-- salió mal y por qué, pero no queda registrado", y sobre si los otros profes
-- saben qué ejercicios usa, "no, no tienen idea". El valor está en compartir y
-- en registrar qué pasó al usar algo, no en archivar para buscar.

-- El nombre del entrenador, para poder mostrar autoría.
--
-- Tabla propia y no una columna en miembro_club: la policy de miembro_club es
-- `user_id = auth.uid()`, o sea que un profe no puede leer NI SIQUIERA la fila
-- de membresía de otro. Agregarle un nombre no habría alcanzado, y ampliar esa
-- policy es tocar la seguridad de una tabla existente que es restrictiva a
-- propósito.
create table perfil_entrenador (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  user_id uuid not null references auth.users(id),
  nombre text not null,
  creado_en timestamptz not null default now(),
  unique (club_id, user_id)
);

create table ejercicio (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  titulo text not null,
  -- SIN check a propósito: la lista de temas vive en src/data/temas.js y tiene
  -- que poder editarse sin una migración. Un check la ataría a una migración
  -- cada vez que alguien quiera agregar "transición". Se valida en la app.
  tema text not null,
  -- Todo lo demás opcional: el que carga no es el que recibe el beneficio, y
  -- una función que pide esfuerzo hoy a cambio de un beneficio ajeno y futuro
  -- se abandona rápido. Dos campos obligatorios, ni uno más.
  --
  -- Texto libre y no números: "6 a 12 jugadores" es la respuesta real de un
  -- profe. `categorias` tampoco es FK a plantel — el entrenador entrevistado
  -- trabaja premini, mini y sub-13, que hoy no existen como planteles.
  descripcion text,
  enlace text,
  material text,
  jugadores text,
  categorias text,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- Target de la FK compuesta de nota_ejercicio.
  unique (club_id, id)
);

create table nota_ejercicio (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  ejercicio_id uuid not null,
  texto text not null,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  -- FK compuesta: club_id tiene que coincidir con el del ejercicio, no sólo
  -- existir (ver el comentario de plantel en 0001).
  foreign key (club_id, ejercicio_id) references ejercicio (club_id, id) on delete cascade
);

create index perfil_entrenador_club_id_idx on perfil_entrenador(club_id);
create index ejercicio_club_id_idx on ejercicio(club_id);
create index ejercicio_tema_idx on ejercicio(tema);
create index nota_ejercicio_club_id_idx on nota_ejercicio(club_id);
create index nota_ejercicio_ejercicio_id_idx on nota_ejercicio(ejercicio_id);

alter table perfil_entrenador enable row level security;
alter table ejercicio enable row level security;
alter table nota_ejercicio enable row level security;

-- Perfil: todos los del club se leen entre sí — sin eso la autoría no se puede
-- mostrar, que es el punto. Pero cada uno escribe SÓLO el suyo.
create policy perfil_entrenador_leer on perfil_entrenador
  for select
  using (exists (select 1 from miembro_club m where m.club_id = perfil_entrenador.club_id and m.user_id = auth.uid()));

create policy perfil_entrenador_propio on perfil_entrenador
  for all
  using (user_id = auth.uid() and exists (select 1 from miembro_club m where m.club_id = perfil_entrenador.club_id and m.user_id = auth.uid()))
  with check (user_id = auth.uid() and exists (select 1 from miembro_club m where m.club_id = perfil_entrenador.club_id and m.user_id = auth.uid()));

-- Ejercicios y notas: los ve y los crea cualquiera del club, pero editar y
-- borrar es sólo de quien lo cargó. Va en la base y no en la UI: una guarda de
-- interfaz no es una garantía.
create policy ejercicio_leer on ejercicio
  for select
  using (exists (select 1 from miembro_club m where m.club_id = ejercicio.club_id and m.user_id = auth.uid()));

create policy ejercicio_crear on ejercicio
  for insert
  with check (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = ejercicio.club_id and m.user_id = auth.uid()));

create policy ejercicio_editar_lo_propio on ejercicio
  for update
  using (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = ejercicio.club_id and m.user_id = auth.uid()))
  with check (creado_por = auth.uid());

create policy ejercicio_borrar_lo_propio on ejercicio
  for delete
  using (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = ejercicio.club_id and m.user_id = auth.uid()));

create policy nota_leer on nota_ejercicio
  for select
  using (exists (select 1 from miembro_club m where m.club_id = nota_ejercicio.club_id and m.user_id = auth.uid()));

create policy nota_crear on nota_ejercicio
  for insert
  with check (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = nota_ejercicio.club_id and m.user_id = auth.uid()));

create policy nota_borrar_lo_propio on nota_ejercicio
  for delete
  using (creado_por = auth.uid() and exists (select 1 from miembro_club m where m.club_id = nota_ejercicio.club_id and m.user_id = auth.uid()));

-- Postgres exige el GRANT de tabla ADEMÁS de la policy de RLS (ver 0006).
grant select, insert, update, delete on
  perfil_entrenador,
  ejercicio,
  nota_ejercicio
to authenticated;
