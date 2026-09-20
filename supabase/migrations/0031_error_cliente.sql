-- Dónde caen los errores que nadie atrapó en el teléfono de un profe.
-- No hay spec en docs/superpowers/specs/: el porqué está en el módulo que arma
-- el registro, src/data/errorDeCliente.js, y en el commit "capturar los errores
-- que nadie atrapa".
--
-- Esta tabla es rara comparada con las demás y conviene decir por qué:
--
-- 1. No es dato del club, es diagnóstico. No la lee nadie desde la app: no hay
--    policy de select ni grant de select. Se lee desde el dashboard de
--    Supabase, con la service role, que saltea RLS. Un registro de errores es
--    de los lugares más fáciles para filtrar datos de un chico sin querer
--    —Postgres escribe el valor adentro del texto del error, "Key
--    (nombre_clave)=(Juan Perez) already exists"—, así que cuanta menos gente
--    lo lea, mejor. El cliente ya depura el texto antes de mandarlo, pero la
--    depuración es una red, no una garantía.
-- 2. Sólo insert. Sin update y sin delete: un log que el que lo genera puede
--    editar o borrar no sirve para nada. Se limpia desde el dashboard.
-- 3. Sólo escribe quien está autenticado. Un error en la landing, antes de
--    entrar, queda sólo en la consola: dejar insertar a `anon` sería un
--    endpoint de escritura abierto a internet, y no vale lo que aporta.
-- 4. `club_id` es opcional. El error puede pasar antes de que la app sepa a
--    qué club pertenece la cuenta (o con una cuenta sin club todavía). NULL es
--    "no se sabe", como siempre en este proyecto.

create table error_cliente (
  id uuid primary key default gen_random_uuid(),
  -- Sirve para triage ("son todos del mismo club"), no para autorización.
  -- Nullable a propósito: ver el punto 3 de arriba.
  club_id uuid references club(id),
  -- Ya depurado y recortado por el cliente. Los largos son los de LARGO en
  -- src/data/errorDeCliente.js y los compara tests/contratoErrorCliente.test.js.
  mensaje text not null check (char_length(mensaje) <= 500),
  stack text check (char_length(stack) <= 2000),
  -- Id de la pantalla visible cuando se rompió, o '' si no había ninguna.
  pantalla text not null default '' check (char_length(pantalla) <= 60),
  -- navigator.userAgent. Sin él no se puede distinguir "se rompe siempre" de
  -- "se rompe en el Android viejo del profe de U13".
  agente text not null default '' check (char_length(agente) <= 300),
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now()
);

-- Se lee por lo último que pasó, nunca por id.
create index error_cliente_creado_en_idx on error_cliente (creado_en desc);

-- No hay actualizado_por: la fila no se toca nunca (no hay policy de update).
-- El sellado igual va, porque el default de una columna sólo corre si el
-- insert no la nombra, y acá no se le concede la columna al cliente: con las
-- dos cosas, la autoría es del servidor pase lo que pase.
create function sellar_error_cliente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.creado_por := auth.uid();
  new.creado_en := now();
  return new;
end;
$$;

create trigger error_cliente_sellar
  before insert on error_cliente
  for each row execute function sellar_error_cliente();


/* ---------- RLS ---------- */

alter table error_cliente enable row level security;

-- Quien llama, ¿es de este club? Vale tanto para el staff (miembro_club) como
-- para un jugador con cuenta vigente (cuenta_jugador, 0029). Hace falta que
-- sea security definer porque un jugador NO puede leer su propia fila de
-- cuenta_jugador: esa policy (cuenta_jugador_ver) es para el staff que ve el
-- plantel. Devuelve un booleano sobre el propio que llama y nada más, así que
-- se puede otorgar a authenticated sin abrir nada.
create function pertenece_al_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.miembro_club m
    where m.club_id = p_club_id and m.user_id = auth.uid()
  ) or exists (
    select 1 from public.cuenta_jugador c
    where c.club_id = p_club_id and c.user_id = auth.uid() and c.hasta is null
  );
$fn$;

revoke execute on function pertenece_al_club(uuid) from public, anon;
grant execute on function pertenece_al_club(uuid) to authenticated;

-- Única policy de la tabla: cualquiera que esté autenticado deja el registro
-- de lo que se le rompió. El club, si lo manda, tiene que ser uno al que
-- pertenece, o se guarda sin club. Sin esto, cualquier usuario podría ensuciar
-- el diagnóstico de otro club.
create policy error_cliente_propio_agrega on error_cliente
  for insert with check (
    creado_por = auth.uid()
    and (club_id is null or pertenece_al_club(club_id)));

-- Supabase concede ALL por defecto sobre tablas nuevas (ver 0017). Acá lo
-- mínimo es todavía más chico que de costumbre: insert de cinco columnas y
-- nada más. Ni select: la app escribe en esta tabla y no la vuelve a mirar.
revoke all on error_cliente from anon, authenticated;
grant insert (club_id, mensaje, stack, pantalla, agente) on error_cliente to authenticated;

comment on table error_cliente is
  'Errores no atrapados del cliente, ya depurados. Sólo insert desde la app; se lee y se limpia desde el dashboard. v0031.';
comment on column error_cliente.mensaje is
  'Texto del error depurado en el cliente (src/data/errorDeCliente.js): sin valores de constraint, mails ni números largos.';
