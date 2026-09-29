-- Pizarra de un ejercicio: el dibujo de cómo se arma (filas, pelotas, rebote,
-- rotación). Ver docs/superpowers/plans/2026-09-28-pizarra-ejercicio.md.
--
-- Vive en una columna del ejercicio, no en la tabla `jugada`: un ejercicio no
-- es una jugada de partido, y `jugada.tipo` tiene una lista cerrada. Como es
-- parte del ejercicio, la edita quien lo creó (la policy de 0015/0027 ya lo
-- garantiza: sólo agrego la columna al grant de update).
--
-- La forma del JSON la valida src/data/pizarraEjercicio.js. La base sólo
-- impone lo que cuesta caro si se saltea: que sea un objeto, el tamaño (cada
-- lectura del ejercicio manda la pizarra entera) y el largo de las notas.
-- No hay datos de menores: una pizarra no nombra a ningún chico.

alter table ejercicio
  add column pizarra jsonb,
  -- Los mismos topes que una jugada (TOPES.bytes de src/data/jugadas.js y
  -- LIMITE.notaPaso); tests/contratoPizarraEjercicio.test.js los compara.
  add constraint ejercicio_pizarra_objeto check (pizarra is null or jsonb_typeof(pizarra) = 'object'),
  add constraint ejercicio_pizarra_tamano check (pizarra is null or octet_length(pizarra::text) <= 65536),
  add constraint ejercicio_pizarra_notas check (pizarra is null or public.jugada_notas_validas(pizarra));

-- Se agrega al grant de update y no al de insert: el alta del ejercicio no
-- lleva pizarra, se dibuja después desde la ficha.
grant update (pizarra) on ejercicio to authenticated;

comment on column ejercicio.pizarra is
  'Dibujo del ejercicio (pizarra táctica en modo ejercicio: filas, varias pelotas, rebote, rotación). Nulo si no tiene. La forma la valida src/data/pizarraEjercicio.js. v0053.';
