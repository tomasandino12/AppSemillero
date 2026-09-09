-- Autorización por plantel: catálogo de categorías, asignación de entrenadores
-- y separación de lectura y escritura.
--
-- El problema que arregla: hasta acá la autorización vivía sólo en
-- miembro_club (user_id, club_id, rol), así que cualquiera con una fila ahí
-- veía TODOS los planteles del club. En un club hay un profe por categoría y
-- cada uno tiene que ver lo suyo. Además hace falta un coordinador que vea la
-- foto completa para controlar el trabajo, pero que no tome decisiones
-- técnicas.
--
-- Ver docs/superpowers/specs/2026-09-09-autorizacion-por-plantel-design.md.


/* =====================================================================
   1. Catálogo de categorías
   ===================================================================== */

-- Tabla y no un enum de Postgres: un enum obliga a una migración cada vez que
-- alguien quiere agregar una categoría, y al replicar a otros clubes cada uno
-- tiene su propia grilla. La tabla da la misma lista cerrada en la UI sin
-- clavar el esquema.
create table categoria (
  codigo text primary key,
  nombre text not null,
  -- De 10 en 10 para poder intercalar una categoría sin renumerar el resto.
  orden integer not null unique
);

comment on table categoria is
  'Catálogo de categorías. El codigo es interno: el matcheo contra los títulos '
  'de la CABB lo sigue haciendo plantel.codigo_cabb, que no se toca.';

insert into categoria (codigo, nombre, orden) values
  ('U13M',  'Sub-13 Masculino',  10),
  ('U15M',  'Sub-15 Masculino',  20),
  ('U17M',  'Sub-17 Masculino',  30),
  ('U21M',  'Sub-21 Masculino',  40),
  ('MAY_M', 'Mayores Masculino', 50),
  ('MAY_F', 'Mayores Femenino',  60);

-- No es una tabla de dominio: no lleva club_id y la lista es la misma para
-- todos. Igual va con RLS activo — con RLS encendido y sin policy no la lee
-- nadie, y sin RLS queda expuesta sin barrera. Lectura para cualquier
-- autenticado, sin escritura: agregar una categoría es un acto administrativo.
alter table categoria enable row level security;

create policy categoria_lectura on categoria
  for select
  to authenticated
  using (true);

-- Postgres exige AMBAS cosas, el GRANT de tabla y la policy (ver 0006).
grant select on categoria to authenticated;


/* =====================================================================
   2. plantel apunta al catálogo
   ===================================================================== */

alter table plantel add column categoria_codigo text;

update plantel set categoria_codigo = categoria;

-- Antes de apretar nada: si algún plantel no mapea contra el catálogo, la
-- migración aborta entera. Un plantel cuya categoría no existe en el catálogo
-- es un dato que se perdería en silencio, y una migración a medias en
-- producción es peor que no haberla corrido.
do $$
declare
  huerfanos integer;
begin
  select count(*) into huerfanos
  from plantel p
  where p.categoria_codigo is null
     or not exists (select 1 from categoria c where c.codigo = p.categoria_codigo);

  if huerfanos > 0 then
    raise exception
      'Hay % plantel(es) cuya categoria no está en el catálogo. Migración abortada.', huerfanos;
  end if;
end $$;

alter table plantel alter column categoria_codigo set not null;

alter table plantel add constraint plantel_categoria_fk
  foreign key (categoria_codigo) references categoria (codigo);

-- La columna vieja se conserva a propósito: unique(club_id, temporada_id,
-- categoria) cuelga de ella y la UI la lee en chips, títulos y toasts.
-- Dropearla obligaría a tocar src/ui en esta misma tanda. Sacarla es una tarea
-- posterior, junto con ese cambio de UI.
comment on column plantel.categoria is
  'Columna espejo. La fuente de verdad pasó a ser categoria_codigo (0016).';

/* =====================================================================
   3. Los dos roles, y la asignación de un entrenador a un plantel
   ===================================================================== */

-- Sin esta constraint un 'Entrenador' con mayúscula entra igual, no matchea
-- ninguna policy, y el síntoma —esa cuenta no ve nada— aparece lejos de su
-- causa. Las dos filas que existen hoy ya cumplen.
alter table miembro_club add constraint miembro_club_rol_valido
  check (rol in ('entrenador','coordinador'));

-- Se asigna a un PLANTEL, no a una categoría: un profe puede tener U15M una
-- temporada y U17M la siguiente. Asignar a categoría arrastraría el acceso
-- entre temporadas; asignar a plantel hace que caduque con la temporada, que
-- es el comportamiento correcto cuando se trata de datos de menores. El costo
-- asumido es reasignar cada temporada.
create table asignacion_plantel (
  id uuid primary key default gen_random_uuid(),
  -- miembro_club tiene PK compuesta (user_id, club_id): no existe un
  -- miembro_club.id al que apuntar.
  miembro_club_user_id uuid not null,
  miembro_club_club_id uuid not null,
  plantel_id uuid not null,
  creado_en timestamptz not null default now(),
  unique (miembro_club_user_id, miembro_club_club_id, plantel_id),
  foreign key (miembro_club_user_id, miembro_club_club_id)
    references miembro_club (user_id, club_id) on delete cascade,
  -- FK compuesta: además de que el plantel exista, obliga a que su club sea el
  -- mismo de la membresía. Un plantel_id suelto no podría garantizarlo, y RLS
  -- no aplica a los chequeos de FK (mismo criterio que el resto del esquema).
  foreign key (miembro_club_club_id, plantel_id)
    references plantel (club_id, id) on delete cascade
);

-- Lo consultan las dos funciones helper en cada chequeo de policy.
create index asignacion_plantel_usuario_idx
  on asignacion_plantel (miembro_club_user_id, miembro_club_club_id);

alter table asignacion_plantel enable row level security;

-- Un usuario ve únicamente sus propias asignaciones, y NO hay policy de
-- insert/update/delete para el cliente autenticado. Misma decisión que
-- miembro_club y por el mismo motivo: la app maneja datos de menores y quién
-- entra a qué categoría lo decide una persona, no un formulario.
create policy asignacion_propia on asignacion_plantel
  for select
  using (miembro_club_user_id = auth.uid());

-- Sólo select, a diferencia del grant amplio de 0006: acá ni siquiera se
-- concede el privilegio de tabla para escribir.
grant select on asignacion_plantel to authenticated;

/* =====================================================================
   4. Los dos ejes: ver y escribir
   ===================================================================== */

-- Las dos funciones son security definer, no invoker, y es obligatorio: se
-- llaman DESDE las policies de las tablas de dominio y consultan plantel,
-- miembro_club y asignacion_plantel. Como invoker, la consulta a plantel
-- quedaría sujeta a la policy de plantel, que a su vez llama a esta función:
-- recursión infinita. Definer corta el ciclo.
--
-- set search_path = '' y todo calificado con public./auth. para que no se
-- pueda secuestrar la resolución de nombres desde el search_path del que
-- llama, que es el agujero clásico de las funciones definer.

-- El coordinador ve todo su club sin necesidad de asignaciones: necesita la
-- foto completa para controlar cómo va el trabajo.
create function puede_ver_plantel(p_plantel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.plantel pl
    join public.miembro_club m on m.club_id = pl.club_id
    where pl.id = p_plantel_id
      and m.user_id = auth.uid()
      and (
        m.rol = 'coordinador'
        or exists (
          select 1
          from public.asignacion_plantel a
          where a.miembro_club_user_id = m.user_id
            and a.miembro_club_club_id = m.club_id
            and a.plantel_id = pl.id
        )
      )
  );
$fn$;

-- El coordinador NUNCA escribe, ni siquiera en lo que ve. Qué se entrena, qué
-- recursos se mandan y qué metas se fijan es del cuerpo técnico; el
-- coordinador controla, no decide. Por eso este es un eje separado del de
-- lectura y no el mismo permiso con otro nombre.
create function puede_escribir_plantel(p_plantel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.plantel pl
    join public.miembro_club m
      on m.club_id = pl.club_id
    join public.asignacion_plantel a
      on a.miembro_club_user_id = m.user_id
     and a.miembro_club_club_id = m.club_id
     and a.plantel_id = pl.id
    where pl.id = p_plantel_id
      and m.user_id = auth.uid()
      and m.rol = 'entrenador'
  );
$fn$;

revoke execute on function puede_ver_plantel(uuid) from public;
revoke execute on function puede_escribir_plantel(uuid) from public;
grant execute on function puede_ver_plantel(uuid) to authenticated;
grant execute on function puede_escribir_plantel(uuid) to authenticated;

/* =====================================================================
   5. La excepción: el dedup del import
   ===================================================================== */

-- Con jugador scopeado por pertenencia (más abajo), el dedup del import
-- dejaría de ver a un chico citado desde otra categoría y crearía un
-- DUPLICADO, rompiendo la trazabilidad de por vida que es la tesis del
-- producto. Esta función es la única excepción a ese scope.
--
-- Es una función y no una policy más amplia justamente para que la excepción
-- sea acotada y auditable: expone cuatro campos y nada más. Ni fecha de
-- nacimiento, ni estadísticas, ni mediciones.
--
-- planteles_visibles va FILTRADO por puede_ver_plantel: quien llama aprende
-- que el chico existe en el club y si está en un plantel suyo; NO aprende en
-- qué otras categorías está.
create function jugadores_del_club_para_dedup(p_club_id uuid)
returns table (
  id uuid,
  nombre_clave text,
  nombre_limpio text,
  planteles_visibles uuid[]
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  -- Sin este chequeo la función sería un agujero abierto: security definer
  -- saltea RLS por definición, así que cualquiera podría pedir el padrón de
  -- un club ajeno pasando su uuid.
  if not exists (
    select 1 from public.miembro_club m
    where m.club_id = p_club_id and m.user_id = auth.uid()
  ) then
    raise exception 'No sos miembro de ese club.' using errcode = '42501';
  end if;

  return query
    select
      j.id,
      j.nombre_clave,
      j.nombre_limpio,
      coalesce(
        array_agg(p.plantel_id) filter (where p.plantel_id is not null),
        '{}'::uuid[]
      )
    from public.jugador j
    left join public.pertenencia p
      on p.jugador_id = j.id
     and p.hasta is null
     and public.puede_ver_plantel(p.plantel_id)
    where j.club_id = p_club_id
    group by j.id, j.nombre_clave, j.nombre_limpio;
end;
$fn$;

revoke execute on function jugadores_del_club_para_dedup(uuid) from public;
grant execute on function jugadores_del_club_para_dedup(uuid) to authenticated;


/* =====================================================================
   6. Policies: se reemplaza "miembro del club" por los dos ejes
   =====================================================================

   OJO con las columnas de la tabla externa dentro de los subqueries: escribir
   "where pe.jugador_id = jugador_id" resuelve el lado derecho contra el
   alcance INTERNO (pe.jugador_id = pe.jugador_id, siempre verdadero) y abre la
   tabla entera sin que nada falle. Por eso todas las referencias a la tabla
   externa van calificadas con su nombre.

   NO se tocan: club_miembros, temporada_miembros, importacion_miembros,
   recurso_miembros, miembro_club_propio, ni las siete de 0015. importacion
   porque se inserta ANTES que el partido y no tiene plantel contra el cual
   chequear (y no lleva datos de menores); la biblioteca porque el beneficio
   que justifica que un profe cargue un ejercicio es que quede para todos.
   ===================================================================== */

drop policy plantel_miembros on plantel;
drop policy jugador_miembros on jugador;
drop policy pertenencia_miembros on pertenencia;
drop policy partido_miembros on partido;
drop policy estadistica_miembros on estadistica_jugador_partido;
drop policy sesion_medicion_miembros on sesion_medicion;
drop policy medicion_tiro_miembros on medicion_tiro;
drop policy medicion_velocidad_miembros on medicion_velocidad;
drop policy medicion_corporal_miembros on medicion_corporal;
drop policy envio_recurso_miembros on envio_recurso;
drop policy meta_zona_miembros on meta_zona;


-- ---- plantel: sólo lectura ----
-- Sin scopearlo, el selector de categorías sigue mostrando todas. No lleva
-- policies de escritura: nada en la app crea planteles, se siembran por SQL.
create policy plantel_ver on plantel
  for select using (puede_ver_plantel(plantel.id));


-- ---- las cuatro que tienen plantel_id directo ----

create policy pertenencia_ver on pertenencia
  for select using (puede_ver_plantel(pertenencia.plantel_id));
create policy pertenencia_crear on pertenencia
  for insert with check (puede_escribir_plantel(pertenencia.plantel_id));
create policy pertenencia_editar on pertenencia
  for update using (puede_escribir_plantel(pertenencia.plantel_id))
          with check (puede_escribir_plantel(pertenencia.plantel_id));
create policy pertenencia_borrar on pertenencia
  for delete using (puede_escribir_plantel(pertenencia.plantel_id));

create policy partido_ver on partido
  for select using (puede_ver_plantel(partido.plantel_id));
create policy partido_crear on partido
  for insert with check (puede_escribir_plantel(partido.plantel_id));
create policy partido_editar on partido
  for update using (puede_escribir_plantel(partido.plantel_id))
          with check (puede_escribir_plantel(partido.plantel_id));
create policy partido_borrar on partido
  for delete using (puede_escribir_plantel(partido.plantel_id));

create policy sesion_medicion_ver on sesion_medicion
  for select using (puede_ver_plantel(sesion_medicion.plantel_id));
create policy sesion_medicion_crear on sesion_medicion
  for insert with check (puede_escribir_plantel(sesion_medicion.plantel_id));
create policy sesion_medicion_editar on sesion_medicion
  for update using (puede_escribir_plantel(sesion_medicion.plantel_id))
          with check (puede_escribir_plantel(sesion_medicion.plantel_id));
create policy sesion_medicion_borrar on sesion_medicion
  for delete using (puede_escribir_plantel(sesion_medicion.plantel_id));

create policy meta_zona_ver on meta_zona
  for select using (puede_ver_plantel(meta_zona.plantel_id));
create policy meta_zona_crear on meta_zona
  for insert with check (puede_escribir_plantel(meta_zona.plantel_id));
create policy meta_zona_editar on meta_zona
  for update using (puede_escribir_plantel(meta_zona.plantel_id))
          with check (puede_escribir_plantel(meta_zona.plantel_id));
create policy meta_zona_borrar on meta_zona
  for delete using (puede_escribir_plantel(meta_zona.plantel_id));


-- ---- las que llegan al plantel por una tabla intermedia ----

create policy estadistica_ver on estadistica_jugador_partido
  for select using (exists (
    select 1 from partido p
    where p.id = estadistica_jugador_partido.partido_id
      and puede_ver_plantel(p.plantel_id)));
create policy estadistica_crear on estadistica_jugador_partido
  for insert with check (exists (
    select 1 from partido p
    where p.id = estadistica_jugador_partido.partido_id
      and puede_escribir_plantel(p.plantel_id)));
create policy estadistica_editar on estadistica_jugador_partido
  for update using (exists (
    select 1 from partido p
    where p.id = estadistica_jugador_partido.partido_id
      and puede_escribir_plantel(p.plantel_id)))
          with check (exists (
    select 1 from partido p
    where p.id = estadistica_jugador_partido.partido_id
      and puede_escribir_plantel(p.plantel_id)));
create policy estadistica_borrar on estadistica_jugador_partido
  for delete using (exists (
    select 1 from partido p
    where p.id = estadistica_jugador_partido.partido_id
      and puede_escribir_plantel(p.plantel_id)));

create policy medicion_tiro_ver on medicion_tiro
  for select using (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_tiro.sesion_id and puede_ver_plantel(s.plantel_id)));
create policy medicion_tiro_crear on medicion_tiro
  for insert with check (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_tiro.sesion_id and puede_escribir_plantel(s.plantel_id)));
create policy medicion_tiro_editar on medicion_tiro
  for update using (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_tiro.sesion_id and puede_escribir_plantel(s.plantel_id)))
          with check (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_tiro.sesion_id and puede_escribir_plantel(s.plantel_id)));
create policy medicion_tiro_borrar on medicion_tiro
  for delete using (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_tiro.sesion_id and puede_escribir_plantel(s.plantel_id)));

create policy medicion_velocidad_ver on medicion_velocidad
  for select using (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_velocidad.sesion_id and puede_ver_plantel(s.plantel_id)));
create policy medicion_velocidad_crear on medicion_velocidad
  for insert with check (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_velocidad.sesion_id and puede_escribir_plantel(s.plantel_id)));
create policy medicion_velocidad_editar on medicion_velocidad
  for update using (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_velocidad.sesion_id and puede_escribir_plantel(s.plantel_id)))
          with check (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_velocidad.sesion_id and puede_escribir_plantel(s.plantel_id)));
create policy medicion_velocidad_borrar on medicion_velocidad
  for delete using (exists (
    select 1 from sesion_medicion s
    where s.id = medicion_velocidad.sesion_id and puede_escribir_plantel(s.plantel_id)));


-- ---- las que cuelgan del jugador, no del plantel ----
-- Un chico citado en dos categorías tiene dos pertenencias activas: con que
-- ALGUNA dé acceso alcanza. Es determinístico y no obliga a elegir una.

create policy corporal_ver on medicion_corporal
  for select using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = medicion_corporal.jugador_id and pe.hasta is null
      and puede_ver_plantel(pe.plantel_id)));
create policy corporal_crear on medicion_corporal
  for insert with check (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = medicion_corporal.jugador_id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)));
create policy corporal_editar on medicion_corporal
  for update using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = medicion_corporal.jugador_id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)))
          with check (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = medicion_corporal.jugador_id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)));
create policy corporal_borrar on medicion_corporal
  for delete using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = medicion_corporal.jugador_id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)));

create policy envio_ver on envio_recurso
  for select using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = envio_recurso.jugador_id and pe.hasta is null
      and puede_ver_plantel(pe.plantel_id)));
create policy envio_crear on envio_recurso
  for insert with check (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = envio_recurso.jugador_id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)));
create policy envio_editar on envio_recurso
  for update using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = envio_recurso.jugador_id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)))
          with check (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = envio_recurso.jugador_id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)));
create policy envio_borrar on envio_recurso
  for delete using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = envio_recurso.jugador_id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)));


-- ---- jugador, que tiene forma propia ----

create policy jugador_ver on jugador
  for select using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = jugador.id and pe.hasta is null
      and puede_ver_plantel(pe.plantel_id)));

-- El insert NO chequea plantel, y no es una concesión sino una imposibilidad:
-- en importar_partido el insert de jugador va ANTES del de pertenencia, así
-- que en ese momento no existe todavía un plantel contra el cual chequear.
-- alta_jugador_manual (0008) hace lo mismo.
--
-- Qué queda expuesto: un entrenador puede crear filas huérfanas de jugador en
-- SU club. No puede colgarlas de un plantel ajeno —lo bloquea la policy de
-- pertenencia— ni volver a leerlas si no caen en uno suyo.
create policy jugador_crear on jugador
  for insert with check (exists (
    select 1 from miembro_club m
    where m.club_id = jugador.club_id
      and m.user_id = auth.uid()
      and m.rol = 'entrenador'));

create policy jugador_editar on jugador
  for update using (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = jugador.id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)))
          with check (exists (
    select 1 from pertenencia pe
    where pe.jugador_id = jugador.id and pe.hasta is null
      and puede_escribir_plantel(pe.plantel_id)));

-- Sin policy de delete: hoy nada de la app borra jugadores, y un borrado
-- silencioso de un chico es justo lo contrario de la trazabilidad de por vida.
