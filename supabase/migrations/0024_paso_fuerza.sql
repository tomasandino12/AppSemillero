-- Etapa 7, corrección de diseño: el escalón es un paso fijo por ejercicio, no
-- una lista de pesos válidos.
--
-- 0023 modelaba una "escalera": la lista entera de pesos de un ejercicio, con
-- cada chico parado en uno de esos valores. El profe no trabaja así: define
-- cuánto sube o baja por vez (2 kg, por ejemplo) y mueve a cada chico desde el
-- peso que tiene hoy. Sin lista no hay mínimo, ni máximo, ni el estado "fuera
-- de la escalera", que deja de existir.
--
-- Qué NO cambia: `movimiento_escalon` —los kg absolutos, quién y cuándo, con su
-- `orden`— y la vista `escalon_actual`. La columna
-- `movimiento_escalon.escalera_id` conserva su nombre a propósito: cambia el
-- nombre de la tabla a la que apunta, no la historia ya escrita.
--
-- "Escalón" es la palabra que usa el profe y la que muestra la pantalla; en la
-- base y en el código el nombre es `paso`, porque acá el dato es cuánto se
-- mueve, no dónde está parado.

-- Al 2026-09-16 la tabla está vacía en producción y en local. Si alguien cargó
-- una escalera mientras tanto, esto se frena: de una lista de pesos no se
-- deduce un escalón sin decidir por el profe.
do $$
begin
  if exists (select 1 from public.escalera_fuerza) then
    raise exception 'escalera_fuerza tiene filas: hay que decidir el escalón de cada ejercicio antes de migrar';
  end if;
end;
$$;


/* ---------- la tabla pasa a ser el paso del ejercicio ---------- */

alter table escalera_fuerza rename to paso_fuerza;

alter index escalera_fuerza_club_id_idx rename to paso_fuerza_club_id_idx;
alter trigger escalera_fuerza_sellar on paso_fuerza rename to paso_fuerza_sellar;
alter function sellar_escalera_fuerza() rename to sellar_paso_fuerza;

alter policy escalera_fuerza_leer on paso_fuerza rename to paso_fuerza_leer;
alter policy escalera_fuerza_crear on paso_fuerza rename to paso_fuerza_crear;
alter policy escalera_fuerza_editar on paso_fuerza rename to paso_fuerza_editar;

-- Los nombres automáticos de 0023 seguirían diciendo "escalera" en una tabla
-- que ya no lo es; el renombrado es sólo cosmético y no toca datos.
alter table paso_fuerza rename constraint escalera_fuerza_pkey to paso_fuerza_pkey;
alter table paso_fuerza rename constraint escalera_fuerza_club_id_clave_key to paso_fuerza_club_id_clave_key;
alter table paso_fuerza rename constraint escalera_fuerza_club_id_id_key to paso_fuerza_club_id_id_key;
alter table paso_fuerza rename constraint escalera_fuerza_club_id_fkey to paso_fuerza_club_id_fkey;
alter table paso_fuerza rename constraint escalera_fuerza_actualizado_por_fkey to paso_fuerza_actualizado_por_fkey;

-- Un solo número en vez de la lista. Sigue siendo numeric porque 2,5 kg es un
-- escalón real, y sigue siendo del club y no de la categoría. Al soltar la
-- columna se van con ella su check y el grant de columna de 0023.
--
-- Admite nulo a propósito: `movimiento_escalon.escalera_id` es not null, así que
-- para anotarle el peso a un chico tiene que existir la fila del ejercicio. Un
-- paso nulo es esa fila sin escalón todavía definido; entonces se escribe el
-- peso a mano y no hay + ni −.
alter table paso_fuerza drop column pesos;
alter table paso_fuerza add column paso numeric check (paso > 0);

-- Sólo existía para validar que la lista fuera creciente.
drop function pesos_validos(numeric[]);

-- Lo editable sigue siendo el dato, nunca la identidad del ejercicio.
grant update (paso) on paso_fuerza to authenticated;

comment on table paso_fuerza is
  'Cuánto sube o baja un ejercicio por vez (el "escalón" del profe): un número por ejercicio, para todo el club. v0024.';
comment on column paso_fuerza.paso is
  'Kg que suma + y resta −; nulo mientras el profe no lo definió. No hay lista de pesos válidos: el peso de cada chico vive en movimiento_escalon.';
comment on column movimiento_escalon.escalera_id is
  'Apunta a paso_fuerza. Se llamaba así en 0023 y no se renombra: la historia de movimientos no se reescribe (v0024).';
