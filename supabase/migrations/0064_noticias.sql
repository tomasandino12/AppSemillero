-- Noticias del portal del básquet, con fotos.
-- Spec: docs/superpowers/specs/2026-10-21-portal-multipagina-design.md (Noticias).
--
-- La coordinación escribe, publica, despublica y borra noticias desde el
-- panel. El portal (/ y /noticias) las lee sin sesión por dos funciones
-- security definer que devuelven sólo las publicadas: anon no recibe nada
-- sobre la tabla (mismo criterio que 0058).
--
-- Las fotos van al bucket público `noticias` de Storage, en
-- <club_id>/<noticia_id>/<uuid>.(webp|jpg). El navegador las achica antes de
-- subirlas (src/data/noticias.js). Suben, ven y borran sólo los coordinadores
-- del club de la carpeta. Una noticia con fotos exige la autorización de
-- imagen: en un club formativo, las fotos son de menores.
--
-- Sí se borra (a diferencia de formulario_portal): una noticia con un error o
-- una foto que no tenía que estar se tiene que poder sacar del todo.

/* ---------- Validación de las fotos (la usa un check) ---------- */

-- `fotos` es un array de hasta 6 objetos con exactamente `ruta` y `alt`. La
-- ruta tiene que ser de la carpeta de ESTA noticia de ESTE club: así una fila
-- no puede apuntar a la foto de otra noticia ni de otro club. El alt es qué se
-- ve en la foto (obligatorio, recortado, hasta 150). CASE y no AND: SQL no
-- garantiza el orden de evaluación, y jsonb_array_length de algo que no es un
-- array tira error en vez de dar false.
create function fotos_de_noticia_validas(p_fotos jsonb, p_club uuid, p_noticia uuid)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select case
    when p_fotos is null or jsonb_typeof(p_fotos) <> 'array' then false
    when jsonb_array_length(p_fotos) <= 6 then not exists (
      select 1 from jsonb_array_elements(p_fotos) as f
      where case
        when jsonb_typeof(f) <> 'object' then true
        else (select count(*) from jsonb_object_keys(f)) <> 2
          or coalesce(f ->> 'ruta', '') !~ ('^' || p_club::text || '/' || p_noticia::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$')
          or char_length(btrim(coalesce(f ->> 'alt', ''))) not between 1 and 150
          or (f ->> 'alt') <> btrim(f ->> 'alt')
      end
    )
    else false
  end;
$fn$;

revoke execute on function fotos_de_noticia_validas(jsonb, uuid, uuid) from public, anon;
grant execute on function fotos_de_noticia_validas(jsonb, uuid, uuid) to authenticated;

/* ---------- Tabla ---------- */

create table noticia (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references club(id),
  titulo text not null check (char_length(titulo) <= 120),
  -- La línea de la tarjeta.
  resumen text not null check (char_length(resumen) <= 200),
  -- Texto plano; los párrafos van separados por una línea en blanco. Sin HTML:
  -- la página lo escapa todo.
  cuerpo text not null check (char_length(cuerpo) <= 8000),
  etiqueta text not null,
  fotos jsonb not null default '[]'::jsonb,
  autorizacion_imagen boolean not null default false,
  publicada boolean not null default false,
  -- La fecha que se muestra: la de la primera publicación (la pone el trigger).
  publicada_en timestamptz,
  creado_por uuid not null default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid not null default auth.uid() references auth.users(id),
  actualizado_en timestamptz not null default now(),
  constraint noticia_titulo_recortado check (titulo = btrim(titulo) and titulo <> ''),
  constraint noticia_resumen_recortado check (resumen = btrim(resumen) and resumen <> ''),
  constraint noticia_cuerpo_recortado check (cuerpo = btrim(cuerpo) and cuerpo <> ''),
  constraint noticia_etiqueta check (etiqueta in ('club', 'partidos', 'eventos', 'inscripcion')),
  constraint noticia_fotos_validas check (fotos_de_noticia_validas(fotos, club_id, id)),
  constraint noticia_fotos_autorizadas check (fotos = '[]'::jsonb or autorizacion_imagen)
);

create index noticia_club_publicada_idx on noticia (club_id, publicada_en desc) where publicada;

-- Autoría del último cambio, como en 0026/0058. Además, la fecha de la
-- noticia es la de su primera publicación: despublicarla para corregir algo y
-- volver a publicarla no la sube arriba de todo.
create function sellar_noticia()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_en := now();
  if new.publicada and new.publicada_en is null then
    new.publicada_en := now();
  end if;
  return new;
end;
$fn$;

create trigger noticia_sellar
  before insert or update on noticia
  for each row execute function sellar_noticia();

revoke execute on function sellar_noticia() from public, anon, authenticated;

/* ---------- RLS ---------- */

alter table noticia enable row level security;

create policy noticia_coordinador_lee on noticia
  for select using (es_coordinador_de(noticia.club_id));

create policy noticia_coordinador_agrega on noticia
  for insert with check (es_coordinador_de(noticia.club_id));

create policy noticia_coordinador_edita on noticia
  for update using (es_coordinador_de(noticia.club_id))
  with check (es_coordinador_de(noticia.club_id));

create policy noticia_coordinador_borra on noticia
  for delete using (es_coordinador_de(noticia.club_id));

-- Supabase concede ALL por defecto (ver 0017 y 0027): se revoca todo y se
-- concede lo mínimo, por columna. El id lo genera el cliente (las fotos se
-- suben a la carpeta de la noticia antes de crear la fila). El cliente no
-- manda autoría ni fechas, y no cambia el club de una fila.
revoke all on noticia from anon, authenticated;
grant select on noticia to authenticated;
grant insert (id, club_id, titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen, publicada) on noticia to authenticated;
grant update (titulo, resumen, cuerpo, etiqueta, fotos, autorizacion_imagen, publicada) on noticia to authenticated;
grant delete on noticia to authenticated;

/* ---------- Lectura pública ---------- */

-- Las tarjetas: publicadas del club, de la más nueva a la más vieja, de a
-- páginas (`p_antes` = la fecha de la última que ya se mostró). Sólo la
-- primera foto. El tope corta un pedido absurdo, no uno real.
create function noticias_publicas(p_club uuid, p_limite integer default 12, p_antes timestamptz default null)
returns table (id uuid, titulo text, resumen text, etiqueta text, foto jsonb, publicada_en timestamptz)
language sql
stable
security definer
set search_path = ''
as $fn$
  select n.id, n.titulo, n.resumen, n.etiqueta, n.fotos -> 0, n.publicada_en
  from public.noticia n
  where n.club_id = p_club and n.publicada
    and (p_antes is null or n.publicada_en < p_antes)
  order by n.publicada_en desc, n.id
  limit least(greatest(coalesce(p_limite, 12), 1), 24);
$fn$;

-- Una noticia entera, sólo si está publicada.
create function noticia_publica(p_club uuid, p_id uuid)
returns table (id uuid, titulo text, resumen text, cuerpo text, etiqueta text, fotos jsonb, publicada_en timestamptz)
language sql
stable
security definer
set search_path = ''
as $fn$
  select n.id, n.titulo, n.resumen, n.cuerpo, n.etiqueta, n.fotos, n.publicada_en
  from public.noticia n
  where n.club_id = p_club and n.id = p_id and n.publicada;
$fn$;

revoke execute on function noticias_publicas(uuid, integer, timestamptz) from public;
grant execute on function noticias_publicas(uuid, integer, timestamptz) to anon, authenticated;
revoke execute on function noticia_publica(uuid, uuid) from public;
grant execute on function noticia_publica(uuid, uuid) to anon, authenticated;

/* ---------- Fotos: bucket público y quién escribe ---------- */

-- Público para leer: el portal las muestra sin sesión, por su URL. El límite y
-- los tipos los hace cumplir Storage aunque el cliente se saltee el achicado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('noticias', 'noticias', true, 1048576, array['image/webp', 'image/jpeg']);

-- El club dueño de una ruta del bucket (su primera carpeta), o null si la
-- ruta no empieza con un uuid. Sin esto, un nombre raro haría fallar el
-- cast dentro de la policy en vez de simplemente no autorizar.
create function club_de_ruta_noticia(p_ruta text)
returns uuid
language sql
immutable
set search_path = ''
as $fn$
  select case
    when p_ruta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then split_part(p_ruta, '/', 1)::uuid
  end;
$fn$;

revoke execute on function club_de_ruta_noticia(text) from public, anon;
grant execute on function club_de_ruta_noticia(text) to authenticated;

-- Sin policy de update: una foto no se reemplaza, se borra y se sube otra.
-- La de select hace falta para borrar por la API de Storage (lee antes de borrar).
create policy noticias_fotos_coordinador_sube on storage.objects for insert to authenticated
  with check (bucket_id = 'noticias' and public.es_coordinador_de(public.club_de_ruta_noticia(name)));

create policy noticias_fotos_coordinador_ve on storage.objects for select to authenticated
  using (bucket_id = 'noticias' and public.es_coordinador_de(public.club_de_ruta_noticia(name)));

create policy noticias_fotos_coordinador_borra on storage.objects for delete to authenticated
  using (bucket_id = 'noticias' and public.es_coordinador_de(public.club_de_ruta_noticia(name)));

comment on table noticia is
  'Noticias del portal público. Escribe y borra coordinación; lo público sale por noticias_publicas() y noticia_publica(). Fotos en el bucket noticias, con autorización de imagen obligatoria. v0064.';
comment on function noticias_publicas(uuid, integer, timestamptz) is
  'Tarjetas de las noticias publicadas de un club, de la más nueva a la más vieja, de a páginas. Ejecutable por anon. v0064.';
comment on function noticia_publica(uuid, uuid) is
  'Una noticia publicada entera, o nada. Ejecutable por anon. v0064.';
