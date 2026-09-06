-- Etapa 4 (post-revisión): fecha de nacimiento e histórico de altura y peso.
--
-- Corrige un defecto de 0007_mediciones_jugador.sql: esa migración puso
-- talla_cm, peso_kg y fecha_medicion en la propia tabla jugador, o sea UNA
-- sola medición por persona. Cada medición nueva pisaba la anterior, así que
-- era imposible distinguir "mejoró" de "creció" al comparar generaciones —
-- justo la pregunta que la app existe para responder. Se reemplaza por un
-- histórico: una fila por jugador por fecha de medición.

-- La fecha de nacimiento va en jugador porque es un atributo inmutable de la
-- persona. En pertenencia se duplicaría una vez por categoría (un chico
-- citado de U17 a U21 tiene dos pertenencias vigentes a la vez) y las copias
-- podrían contradecirse.
--
-- Nullable: los jugadores ya cargados salieron de planillas de la CABB, que
-- no traen fecha de nacimiento.
--
-- No entra en ningún unique: la identidad del jugador sigue siendo
-- (club_id, nombre_clave, desambiguador), intacta desde 0001.
alter table jugador add column fecha_nacimiento date;

-- Tabla propia, y no colgada de sesion_medicion (0009), porque esa tabla está
-- scopeada a un plantel y la altura pertenece a la persona, no a la
-- categoría: un chico con pertenencia vigente en U17 y U21 quedaría
-- registrado arbitrariamente bajo una de las dos. Además esto se mide en
-- revisiones médicas cada tanto, no en una sesión de cancha con el plantel
-- entero como la batería de tiro.
create table medicion_corporal (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  jugador_id uuid not null,
  fecha_medicion date not null,
  -- Independientes y nullable: se puede pesar a alguien sin medirlo, o al
  -- revés. NULL es "no se midió", nunca cero — mismo principio que rige todo
  -- el proyecto (ver ESQUEMA.md).
  altura_cm integer check (altura_cm is null or altura_cm between 120 and 230),
  peso_kg numeric(5,2) check (peso_kg is null or peso_kg between 25 and 150),
  creado_en timestamptz not null default now(),
  -- Nullable, a diferencia de recurso.creado_por: las filas que esta misma
  -- migración copia desde jugador no tienen autor conocido, y no hay usuario
  -- autenticado mientras corre una migración.
  creado_por uuid default auth.uid() references auth.users(id),
  unique (jugador_id, fecha_medicion),
  -- FK compuesta: club_id tiene que coincidir con el del jugador, no sólo
  -- existir (ver el comentario de plantel en 0001).
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);

create index medicion_corporal_club_id_idx on medicion_corporal(club_id);
create index medicion_corporal_jugador_id_idx on medicion_corporal(jugador_id);

-- Rescate de lo que hubiera quedado cargado a mano en las columnas de 0007.
-- Sólo entran las filas con fecha: un valor sin fecha no se puede ubicar en
-- una línea de tiempo, e inventarle una fecha sería peor que perderlo.
insert into medicion_corporal (club_id, jugador_id, fecha_medicion, altura_cm, peso_kg)
select club_id, id, fecha_medicion, talla_cm, peso_kg
from jugador
where fecha_medicion is not null
  and (talla_cm is not null or peso_kg is not null);

alter table jugador
  drop column talla_cm,
  drop column peso_kg,
  drop column fecha_medicion;

-- RLS: mismo patrón de membresía de club que 0002_rls.sql y 0009.
alter table medicion_corporal enable row level security;

create policy medicion_corporal_miembros on medicion_corporal
  for all
  using (exists (select 1 from miembro_club m where m.club_id = medicion_corporal.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = medicion_corporal.club_id and m.user_id = auth.uid()));

-- Postgres exige el GRANT de tabla ADEMÁS de la policy de RLS (ver 0006).
grant select, insert, update, delete on medicion_corporal to authenticated;
