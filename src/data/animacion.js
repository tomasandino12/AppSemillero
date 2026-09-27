/**
 * Valor de un contador animado entre `desde` y `hasta` cuando pasó la fracción
 * `t` (0 a 1) del tiempo total. Frena al llegar (easing de salida, como
 * --ease-salida en CSS) y devuelve siempre enteros: una cifra de "cm" que
 * muestra decimales mientras cuenta se ve rota. `t` fuera de rango o no
 * numérico se queda en los extremos, así el último cuadro cae siempre en `hasta`.
 */
export function valorContado(desde, hasta, t) {
  const tt = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const avance = 1 - (1 - tt) ** 3;
  return Math.round(desde + (hasta - desde) * avance);
}
