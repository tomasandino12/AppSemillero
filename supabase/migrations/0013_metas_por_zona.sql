-- Metas de tiro por zona, fijadas por el cuerpo técnico.
--
-- La app NUNCA afirma cuál es el porcentaje correcto para una categoría: no
-- existen normas confiables para estas edades y no se inventan. Eso está
-- decidido para todo el proyecto y no cambia.
--
-- Una meta que fija el entrenador es otra cosa, y es legítima: "vamos a
-- llegar a 30% desde el arco" es una decisión de entrenamiento. La app la
-- registra y la muestra rotulada como lo que es —la meta del cuerpo
-- técnico—, nunca como un estándar propio. Tampoco sugiere valores: el
-- número lo pone el profe.
--
-- Por plantel, no por club: un U17M y un U21M no comparten meta. `plantel`
-- ya es (club, temporada, categoría) por su unique de 0001, así que la clave
-- por plantel_id da meta por categoría Y por temporada sin columna extra —
-- mismo criterio que `partido`, que tampoco repite temporada_id.
create table meta_zona (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  plantel_id uuid not null,
  zona text not null check (zona in ('esq_izq','c45_izq','frontal','c45_der','esq_der','libres')),
  objetivo_pct integer not null check (objetivo_pct between 0 and 100),
  creado_en timestamptz not null default now(),
  -- Nullable por la misma razón que medicion_corporal.creado_por: no hay
  -- usuario autenticado si alguna vez se siembra una fila desde una migración.
  creado_por uuid default auth.uid() references auth.users(id),
  -- Una sola meta por zona por plantel. "Sin meta" es la ausencia de fila,
  -- nunca un cero: 0% es una meta válida (y rarísima), distinta de no tener.
  unique (plantel_id, zona),
  -- FK compuesta: club_id tiene que coincidir con el del plantel, no sólo
  -- existir (ver el comentario de plantel en 0001).
  foreign key (club_id, plantel_id) references plantel (club_id, id)
);

create index meta_zona_club_id_idx on meta_zona(club_id);
create index meta_zona_plantel_id_idx on meta_zona(plantel_id);

-- RLS: mismo patrón de membresía de club que 0002_rls.sql.
alter table meta_zona enable row level security;

create policy meta_zona_miembros on meta_zona
  for all
  using (exists (select 1 from miembro_club m where m.club_id = meta_zona.club_id and m.user_id = auth.uid()))
  with check (exists (select 1 from miembro_club m where m.club_id = meta_zona.club_id and m.user_id = auth.uid()));

-- Postgres exige el GRANT de tabla ADEMÁS de la policy de RLS (ver 0006).
grant select, insert, update, delete on meta_zona to authenticated;
