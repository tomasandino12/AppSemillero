-- Salto vertical por video (CMJ y Abalakov).
-- Ver docs/superpowers/specs/2026-09-23-evaluacion-salto-design.md y
-- docs/evaluaciones-fisicas/FUNDAMENTO.md.
--
-- Se guarda el dato crudo (tiempo de vuelo y fps de captura), nunca la
-- altura ni la potencia: las fórmulas viven sólo en src/data/salto.js, así
-- una corrección recalcula todo el histórico sin tocar la base. El video
-- nunca llega acá.
--
-- Los rangos están también en JS (salto.js, antropometria.js):
-- tests/contratoSalto.test.js compara los dos lados.


/* ---------- sesion_medicion: el tipo 'salto' y qué test se tomó ---------- */

-- Una sesión es de UN test: CMJ y Abalakov no se comparan entre sí (el
-- Abalakov suma los brazos), así que mezclarlos en una sesión obligaría a
-- guardar el test en cada fila.
alter table sesion_medicion drop constraint sesion_medicion_tipo_check;
alter table sesion_medicion add constraint sesion_medicion_tipo_check
  check (tipo in ('tiro', 'velocidad', 'salto'));

alter table sesion_medicion
  add column test_salto text check (test_salto in ('cmj', 'abalakov')),
  add constraint sesion_medicion_test_salto_solo_en_salto
    check ((tipo = 'salto') = (test_salto is not null));

-- sesion_medicion conserva el grant de tabla (0009): alcanza para la columna nueva.


/* ---------- medicion_salto ---------- */

create table medicion_salto (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  sesion_id uuid not null,
  jugador_id uuid not null,
  intento smallint not null check (intento between 1 and 3),
  -- NULL = el chico estuvo en la sesión pero no saltó (ausente), NUNCA 0,
  -- igual que medicion_tiro.anotados. Centésimas de ms: a 240 fps un cuadro
  -- son 4,17 ms, y redondear a ms enteros correría la altura sin motivo.
  tiempo_vuelo_ms numeric(6,2) check (tiempo_vuelo_ms is null or tiempo_vuelo_ms between 100 and 1000),
  -- Con cuántos fps se filmó: dice qué tan fino es el dato (±1 cuadro son
  -- ±1 cm a 240 fps y ±2 cm a 120). Debajo de 120 no se mide.
  fps_captura numeric(6,2) check (fps_captura is null or fps_captura between 120 and 960),
  creado_por uuid default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  constraint medicion_salto_fps_con_tiempo check ((tiempo_vuelo_ms is null) = (fps_captura is null)),
  -- Un ausente es una sola fila, la del intento 1.
  constraint medicion_salto_ausente_una_fila check (tiempo_vuelo_ms is not null or intento = 1),
  unique (sesion_id, jugador_id, intento),
  -- FKs compuestas: el club de la sesión y del jugador tiene que ser el de la fila (0009).
  foreign key (club_id, sesion_id) references sesion_medicion (club_id, id) on delete cascade,
  foreign key (club_id, jugador_id) references jugador (club_id, id)
);

create index medicion_salto_club_id_idx on medicion_salto(club_id);
create index medicion_salto_jugador_id_idx on medicion_salto(jugador_id);

-- La autoría y la fecha las pone el servidor. Sin sesión (SQL del
-- dashboard) se respeta el autor que se mande, como en 0039.
create function sellar_medicion_salto()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.creado_en := now();
  new.creado_por := coalesce(auth.uid(), new.creado_por);
  return new;
end;
$fn$;

create trigger medicion_salto_sellar
  before insert on medicion_salto
  for each row execute function sellar_medicion_salto();

revoke execute on function sellar_medicion_salto() from public, anon, authenticated;


/* ---------- RLS: por el plantel de la sesión, como medicion_velocidad (0016) ---------- */

alter table medicion_salto enable row level security;

create policy medicion_salto_ver on medicion_salto
  for select using (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_salto.sesion_id and puede_ver_plantel(s.plantel_id)));

create policy medicion_salto_crear on medicion_salto
  for insert with check (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_salto.sesion_id and s.tipo = 'salto'
      and puede_escribir_plantel(s.plantel_id)));

-- Sin update ni delete: la app nunca corrige un intento suelto (se vuelve a
-- medir), y una sesión borrada por SQL se lleva sus filas por el cascade.
-- Supabase concede ALL por defecto sobre tablas nuevas (0017): se revoca todo
-- y se concede lo mínimo. El insert lo hace guardar_sesion_medicion (0044),
-- que es security invoker: corre con estos permisos y esta RLS.
revoke all on medicion_salto from anon, authenticated;
grant select on medicion_salto to authenticated;
grant insert (club_id, sesion_id, jugador_id, intento, tiempo_vuelo_ms, fps_captura) on medicion_salto to authenticated;

comment on table medicion_salto is
  'Intentos de salto (CMJ/Abalakov) por video: tiempo de vuelo crudo y fps de captura. La altura y la potencia se calculan en src/data/salto.js. v0043.';
comment on column medicion_salto.tiempo_vuelo_ms is
  'Cuadros entre despegue y aterrizaje / fps de captura, en ms. NULL = ausente (fila única, intento 1).';


/* ---------- medicion_corporal: largo de pierna para la potencia (Samozino) ---------- */

-- L0: trocánter mayor → punta del pie, pierna extendida y tobillo en flexión
-- plantar. hpush: trocánter → piso, en cuclillas con la rodilla a 90°.
-- Nullable e independientes de altura y peso, como esas dos (0012). Medio
-- centímetro importa: la distancia de empuje (L0 − hpush) ronda los 40 cm.
alter table medicion_corporal
  add column pierna_cm numeric(4,1) check (pierna_cm is null or pierna_cm between 60 and 130),
  add column pierna_flexionada_cm numeric(4,1)
    check (pierna_flexionada_cm is null or pierna_flexionada_cm between 30 and 110),
  add constraint medicion_corporal_pierna_flexionada_menor
    check (pierna_cm is null or pierna_flexionada_cm is null or pierna_flexionada_cm < pierna_cm);

-- medicion_corporal tiene grant de tabla (0012): cubre las columnas nuevas.

comment on column medicion_corporal.pierna_cm is
  'L0 (Samozino): trocánter mayor a punta del pie, pierna extendida. cm. v0043.';
comment on column medicion_corporal.pierna_flexionada_cm is
  'hpush (Samozino): trocánter mayor al piso, en cuclillas con rodilla a 90°. cm. v0043.';
