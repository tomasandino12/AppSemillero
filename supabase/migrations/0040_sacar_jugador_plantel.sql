-- Sacar un jugador del plantel sin borrar nada (auditoría 2026-09-22, #9):
-- hoy se podía sumar un jugador a un plantel (alta manual o import) pero no
-- había forma de deshacerlo si se cargó mal — ni un jugador de prueba, ni un
-- chico que se va del club a mitad de año.
--
-- Mismo mecanismo que asignacion_plantel (0017): `pertenencia` ya tiene grant
-- de update completo desde 0006, así que no hace falta una RPC nueva. El
-- cliente manda cualquier valor de `hasta` para pedir el cierre; el trigger
-- lo ignora y sella la fecha de hoy (hora de Argentina, como el resto de la
-- app) y quién lo sacó. Una pertenencia ya cerrada no se vuelve a tocar por
-- acá, y un update que no venga a cerrar (sin `hasta`) se rechaza — así el
-- grant amplio de la tabla no sirve para tocar `jugador_id`/`plantel_id`/
-- `desde` de arriba.
--
-- No borra la ficha del jugador ni su historia (mediciones, partidos,
-- cargas): sólo dice que ya no está vigente en ese plantel. Si vuelve, el
-- alta manual ya sabe ofrecer sumarlo de nuevo en vez de duplicarlo.

alter table pertenencia
  add column cerrado_por uuid references auth.users(id);

alter table pertenencia
  add constraint pertenencia_cierre_con_autor check ((hasta is null) = (cerrado_por is null));

create function sellar_cierre_pertenencia()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if old.hasta is not null then
    raise exception 'PERTENENCIA_YA_CERRADA' using errcode = 'P0001';
  end if;
  if new.hasta is null then
    raise exception 'SOLO_SE_PUEDE_CERRAR' using errcode = 'P0001';
  end if;
  new := old;
  new.hasta := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  new.cerrado_por := auth.uid();
  return new;
end;
$fn$;

create trigger pertenencia_sellar_cierre
  before update on pertenencia
  for each row execute function sellar_cierre_pertenencia();

revoke execute on function sellar_cierre_pertenencia() from public, anon, authenticated;

comment on column pertenencia.cerrado_por is
  'Quién sacó al jugador del plantel (lo sella el trigger pertenencia_sellar_cierre). NULL mientras la pertenencia está vigente.';
