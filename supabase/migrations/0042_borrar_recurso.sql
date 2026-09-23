-- Un recurso se podía crear pero no borrar (auditoría 2026-09-22, seguimiento
-- de #9: "no tiene sentido poder crear algo que no se puede borrar"). Un
-- título mal escrito, un link roto o un video que ya no corresponde se
-- quedaban en la biblioteca para siempre.
--
-- Mismo criterio que la biblioteca de ejercicios (0015): sólo quien lo cargó
-- puede borrar lo suyo, y sólo mientras sigue siendo del club. `envio_recurso`
-- y `apertura_recurso` ya tenían `on delete cascade` desde que existen (0009 y
-- 0034) — el esquema esperaba este borrado, sólo faltaba la policy y el
-- grant. Borrar un recurso se lleva puesto a quién se le mandó y quién lo
-- abrió: es explícito en la confirmación de la pantalla, no en la base.

create policy recurso_borrar_lo_propio on recurso
  for delete
  using (creado_por = auth.uid() and exists (
    select 1 from miembro_club m where m.club_id = recurso.club_id and m.user_id = auth.uid()));

grant delete on recurso to authenticated;
