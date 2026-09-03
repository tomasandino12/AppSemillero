-- Etapa 3: columnas de medición antropométrica en jugador.
--
-- NULL significa "no medido", nunca cero — mismo principio que rige todas
-- las estadísticas del proyecto (ver ESQUEMA.md y PARSER.md): un jugador que
-- no fue medido y un jugador que pesa cero no son lo mismo.
--
-- Los datos salen de estudios médicos de principio de año y se cargan
-- aparte. Esta etapa sólo define dónde viven y los muestra como "sin medir".
alter table jugador
  add column talla_cm integer,
  add column peso_kg numeric(5,2),
  add column fecha_medicion date;
