-- "Metodología" es femenino: el apodo del piloto se muestra como "Metodología
-- Leprosa". 0046 ya está aplicada, por eso es una migración nueva.
update club set apodos = '{Leprosa,NOB}'
where id = '20000000-0000-0000-0000-000000000001'
  and apodos = '{Leproso,NOB}';
