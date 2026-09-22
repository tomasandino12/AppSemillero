-- Jugadas: la pizarra táctica animada del club.
-- Ver docs/superpowers/specs/2026-09-21-jugadas-design.md (Modelo de datos y
-- Seguridad).
--
-- Una jugada es un JSON en `datos`: la forma (fichas, pasos, acciones) la
-- valida src/data/jugadas.js. La base sólo impone lo que cuesta caro si se
-- saltea: el tamaño (cada lectura manda la jugada entera) y el largo de las
-- notas. No hay datos de menores: una jugada no nombra a ningún chico.
--
-- Lee y escribe el cuerpo técnico, con el mismo criterio que `ejercicio`
-- después de 0027. El jugador no tiene grants sobre ninguna de las dos tablas:
-- ve lo que le asignaron a su plantel por mis_jugadas(), como mis_recursos()
-- de 0030.

do $$
begin
  if to_regprocedure('public.mi_jugador()') is null then
    raise exception '0035 necesita 0030 aplicada (no existe mi_jugador()).';
  end if;
end $$;


/* =====================================================================
   1. Largo de las notas de cada paso
   ===================================================================== */

-- Un check no puede tener una subconsulta, así que el recorrido de los pasos
-- va en una función inmutable. Si `pasos` no es un arreglo devuelve true: la
-- forma la valida el cliente, y acá sólo importa que ninguna nota se pase.
-- El 300 es LIMITE.notaPaso de src/data/limites.js
-- (tests/contratoJugada.test.js compara los dos).
create function jugada_notas_validas(p_datos jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select coalesce(bool_and(char_length(coalesce(p.paso->>'nota', '')) <= 300), true)
  from jsonb_array_elements(
    case when jsonb_typeof(p_datos->'pasos') = 'array' then p_datos->'pasos' else '[]'::jsonb end
  ) as p(paso);
$fn$;

-- No lee ninguna tabla: otorgarla no expone nada, y el check la necesita
-- ejecutable por quien inserta.
revoke execute on function jugada_notas_validas(jsonb) from public, anon;
grant execute on function jugada_notas_validas(jsonb) to authenticated;


/* =====================================================================
   2. Tablas
   ===================================================================== */

create table jugada (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  nombre text not null check (char_length(nombre) <= 150),
  -- Lista cerrada, la misma que TIPOS_JUGADA de src/data/jugadas.js. Sirve
  -- para filtrar la biblioteca; sumar uno pasa por una migración.
  tipo text not null check (tipo in ('ataque', 'presion', 'defensa', 'lateral', 'otro')),
  datos jsonb not null,
  -- Sin actualizado_por: sólo el autor edita (policies de abajo), así que
  -- siempre sería igual a creado_por.
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- Para las FKs compuestas de jugada_plantel: una asignación no puede cruzar
  -- de club.
  unique (club_id, id),
  constraint jugada_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint jugada_datos_objeto check (jsonb_typeof(datos) = 'object'),
  -- Mismo número que TOPES.bytes. Se mide sobre el texto de jsonb, que lleva
  -- un espacio después de cada ':' y ',': un poco más que JSON.stringify.
  constraint jugada_datos_tamano check (octet_length(datos::text) <= 65536),
  constraint jugada_notas_largo check (public.jugada_notas_validas(datos))
);

create index jugada_club_id_idx on jugada(club_id);

-- A qué planteles se le mostró una jugada. Asignar una jugada ajena no la
-- modifica: la fila es de quien asigna, no del autor.
create table jugada_plantel (
  club_id uuid not null references club(id),
  jugada_id uuid not null,
  plantel_id uuid not null,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  primary key (jugada_id, plantel_id),
  -- Borrar la jugada la saca de todos los planteles: la asignación no tiene
  -- sentido sin ella.
  foreign key (club_id, jugada_id) references jugada (club_id, id) on delete cascade,
  foreign key (club_id, plantel_id) references plantel (club_id, id)
);

create index jugada_plantel_plantel_id_idx on jugada_plantel(plantel_id);


/* =====================================================================
   3. Sellado
   ===================================================================== */

-- La autoría y las fechas las pone el servidor. Los grants ya no dejan que el
-- cliente mande esas columnas; el trigger lo asegura igual si algún día se
-- amplía un grant (mismo razonamiento que sellar_error_cliente, 0031).
create function sellar_jugada()
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
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
  end if;
  new.actualizado_en := now();
  return new;
end;
$fn$;

create trigger jugada_sellar
  before insert or update on jugada
  for each row execute function sellar_jugada();

create function sellar_jugada_plantel()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.creado_por := auth.uid();
  new.creado_en := now();
  return new;
end;
$fn$;

create trigger jugada_plantel_sellar
  before insert on jugada_plantel
  for each row execute function sellar_jugada_plantel();


/* =====================================================================
   4. RLS
   ===================================================================== */

alter table jugada enable row level security;
alter table jugada_plantel enable row level security;

-- La biblioteca es del club: la ve todo el cuerpo técnico, no sólo el autor.
-- Coordinación sin rol de entrenador no la ve (como ejercicio, 0027).
create policy jugada_leer on jugada
  for select using (es_entrenador_de(jugada.club_id));

create policy jugada_crear on jugada
  for insert with check (
    jugada.creado_por = auth.uid()
    and es_entrenador_de(jugada.club_id));

-- Sólo el autor la cambia o la borra. Quien quiera otra versión la duplica.
create policy jugada_editar_lo_propio on jugada
  for update
  using (jugada.creado_por = auth.uid() and es_entrenador_de(jugada.club_id))
  with check (jugada.creado_por = auth.uid() and es_entrenador_de(jugada.club_id));

create policy jugada_borrar_lo_propio on jugada
  for delete using (jugada.creado_por = auth.uid() and es_entrenador_de(jugada.club_id));

create policy jugada_plantel_leer on jugada_plantel
  for select using (es_entrenador_de(jugada_plantel.club_id));

-- Asigna y desasigna quien tiene el plantel a cargo, sea o no el autor. Las
-- FKs compuestas ya obligan a que jugada y plantel sean del mismo club.
create policy jugada_plantel_asignar on jugada_plantel
  for insert with check (puede_escribir_plantel(jugada_plantel.plantel_id));

create policy jugada_plantel_quitar on jugada_plantel
  for delete using (puede_escribir_plantel(jugada_plantel.plantel_id));

-- Supabase concede ALL por defecto sobre tablas nuevas (ver 0017): se revoca
-- todo y se concede lo mínimo, por columna. Una asignación no se edita: se
-- borra y se vuelve a crear.
revoke all on jugada from anon, authenticated;
grant select, delete on jugada to authenticated;
grant insert (club_id, nombre, tipo, datos) on jugada to authenticated;
grant update (nombre, tipo, datos) on jugada to authenticated;

revoke all on jugada_plantel from anon, authenticated;
grant select, delete on jugada_plantel to authenticated;
grant insert (club_id, jugada_id, plantel_id) on jugada_plantel to authenticated;


/* =====================================================================
   5. mis_jugadas(): lo que ve el jugador
   ===================================================================== */

-- Las jugadas asignadas a los planteles donde tiene pertenencia vigente, sin
-- repetir si está en dos planteles con la misma jugada. Nunca el autor: al
-- jugador no le sirve y es un dato de otra persona.
create function mis_jugadas()
returns table (jugada_id uuid, nombre text, tipo text, datos jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_jugador uuid := public.mi_jugador();
begin
  if v_jugador is null then
    return;
  end if;

  return query
    select j.id, j.nombre, j.tipo, j.datos
    from public.jugada j
    where exists (
      select 1
      from public.jugada_plantel jp
      join public.pertenencia pe on pe.plantel_id = jp.plantel_id
      where jp.jugada_id = j.id
        and pe.jugador_id = v_jugador
        and pe.hasta is null
    )
    order by j.tipo, j.nombre;
end;
$fn$;

-- Postgres le da EXECUTE a PUBLIC por defecto y Supabase a anon aparte. Un
-- profe que la llama recibe cero filas: no tiene cuenta de jugador.
revoke execute on function mis_jugadas() from public, anon;
grant execute on function mis_jugadas() to authenticated;


comment on table jugada is
  'Jugada de la pizarra táctica: JSON validado en src/data/jugadas.js. La lee el cuerpo técnico del club, la edita sólo el autor. v0035.';
comment on table jugada_plantel is
  'Qué jugadas se le muestran a cada plantel. La escribe quien tiene el plantel a cargo; el jugador la lee por mis_jugadas(). v0035.';
