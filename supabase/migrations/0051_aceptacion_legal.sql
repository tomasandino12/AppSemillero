-- Constancia de que cada cuenta aceptó los Términos y la Política de
-- privacidad (public/legal/). Spec:
-- docs/superpowers/specs/2026-09-26-privacidad-y-legales-design.md
--
-- 1. Es una constancia, no un permiso. Ninguna policy de otra tabla la mira:
--    la app no deja pasar a quien no aceptó (entrarConSesion en
--    src/ui/main.js), pero lo que cada uno puede ver lo sigue decidiendo RLS
--    como siempre. Por eso no vive en user_metadata: ahí la edita el propio
--    usuario y no queda registro de cuándo.
-- 2. Una fila por cuenta y versión. `version` es la fecha del texto
--    (VERSION_LEGAL en src/data/legal.js): cuando cambia, todos vuelven a
--    aceptar y queda la historia de qué aceptó cada uno y cuándo.
-- 3. Sólo insert y select de lo propio. Sin update ni delete: una constancia
--    que el interesado puede editar no prueba nada. Si se borra la cuenta, se
--    van sus filas (on delete cascade): el derecho de supresión alcanza
--    también a esto.
-- 4. Nadie gana nada insertando una versión inventada: sólo se saltea a sí
--    mismo la pantalla de aceptar, que es lo mismo que tildar el checkbox.

create table aceptacion_legal (
  id uuid primary key default gen_random_uuid(),
  version date not null,
  usuario uuid not null default auth.uid() references auth.users(id) on delete cascade,
  aceptado_en timestamptz not null default now(),
  unique (usuario, version)
);

-- Autoría y fecha las pone el servidor aunque el insert las nombre: el grant
-- de abajo no concede esas columnas, y el trigger lo cubre igual.
create function sellar_aceptacion_legal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.usuario := auth.uid();
  new.aceptado_en := now();
  return new;
end;
$$;

create trigger aceptacion_legal_sellar
  before insert on aceptacion_legal
  for each row execute function sellar_aceptacion_legal();


/* ---------- RLS ---------- */

alter table aceptacion_legal enable row level security;

create policy aceptacion_legal_propia_ver on aceptacion_legal
  for select using (usuario = auth.uid());

create policy aceptacion_legal_propia_agrega on aceptacion_legal
  for insert with check (usuario = auth.uid());

-- Supabase concede ALL por defecto sobre tablas nuevas (ver 0017).
revoke all on aceptacion_legal from anon, authenticated;
grant select (version, aceptado_en) on aceptacion_legal to authenticated;
grant insert (version) on aceptacion_legal to authenticated;

comment on table aceptacion_legal is
  'Constancia de aceptación de Términos y Política de privacidad, por cuenta y versión. Sólo insert y select de lo propio. v0051.';
comment on column aceptacion_legal.version is
  'Fecha del texto aceptado: VERSION_LEGAL de src/data/legal.js.';
