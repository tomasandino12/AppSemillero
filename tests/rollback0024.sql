-- Deshace 0024 en el Docker LOCAL: vuelve el paso del ejercicio a la escalera
-- de 0023. No se corre contra producción sin revisarlo.
--
-- Sólo tiene sentido con la tabla vacía: un paso (2 kg) no es una lista de
-- pesos, así que no hay forma de reconstruir la escalera de nadie. Si hay
-- filas, se frena.
--
-- Borra también la fila de schema_migrations para poder volver a aplicar 0024
-- con `npx supabase migration up`.
begin;

do $$
begin
  if exists (select 1 from public.paso_fuerza) then
    raise exception 'paso_fuerza tiene filas: un paso no se convierte en una lista de pesos';
  end if;
end;
$$;

-- La función que validaba listas crecientes, tal cual la creó 0023.
create or replace function pesos_validos(p numeric[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
     and cardinality(p) >= 1
     and array_position(p, null) is null
     and not exists (
       select 1
       from unnest(p) with ordinality as x(v, i)
       where v <= 0 or (i > 1 and v <= p[(i - 1)::int])
     );
$$;
revoke execute on function pesos_validos(numeric[]) from public, anon;

alter table paso_fuerza drop column paso;
alter table paso_fuerza add column pesos numeric[] not null check (public.pesos_validos(pesos));

alter table paso_fuerza rename constraint paso_fuerza_pkey to escalera_fuerza_pkey;
alter table paso_fuerza rename constraint paso_fuerza_club_id_clave_key to escalera_fuerza_club_id_clave_key;
alter table paso_fuerza rename constraint paso_fuerza_club_id_id_key to escalera_fuerza_club_id_id_key;
alter table paso_fuerza rename constraint paso_fuerza_club_id_fkey to escalera_fuerza_club_id_fkey;
alter table paso_fuerza rename constraint paso_fuerza_actualizado_por_fkey to escalera_fuerza_actualizado_por_fkey;

alter policy paso_fuerza_leer on paso_fuerza rename to escalera_fuerza_leer;
alter policy paso_fuerza_crear on paso_fuerza rename to escalera_fuerza_crear;
alter policy paso_fuerza_editar on paso_fuerza rename to escalera_fuerza_editar;

alter function sellar_paso_fuerza() rename to sellar_escalera_fuerza;
alter trigger paso_fuerza_sellar on paso_fuerza rename to escalera_fuerza_sellar;
alter index paso_fuerza_club_id_idx rename to escalera_fuerza_club_id_idx;

alter table paso_fuerza rename to escalera_fuerza;

grant update (pesos) on escalera_fuerza to authenticated;

comment on table escalera_fuerza is null;
comment on column movimiento_escalon.escalera_id is null;

delete from supabase_migrations.schema_migrations where version = '0024';
commit;
