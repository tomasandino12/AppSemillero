/**
 * Espejo del historial del navegador para el botón Atrás del sistema.
 *
 * La pila interna de main.js (`pila`) y la hoja abierta siguen siendo la
 * fuente de verdad: acá sólo se mantiene el historial del navegador con tantas
 * entradas como "pasos hacia atrás" tenga la app, así Atrás en el celular
 * cierra la hoja o vuelve una pantalla en vez de sacar a la persona de la app.
 * Con profundidad 0 (pantalla inicial del modo) no hay entradas propias y
 * Atrás sale de la app como siempre.
 *
 * Recibe el objeto `history` para poder probarlo sin navegador.
 */
export function crearHistorial(historia) {
  // Entradas que el navegador tiene hoy encima de la base, y las que la app
  // quiere tener. Se reconcilian de a una operación por vez: `go()` es
  // asíncrono, y empujar una entrada mientras una retirada está en vuelo la
  // pisaría.
  let real = 0;
  let deseada = 0;
  let retiradaEnVuelo = false;

  function reconciliar() {
    if (retiradaEnVuelo) return;
    if (deseada > real) {
      while (real < deseada) {
        real += 1;
        historia.pushState({ n: real }, '');
      }
    } else if (deseada < real) {
      retiradaEnVuelo = true;
      const salto = deseada - real;
      real = deseada;
      historia.go(salto);
    }
  }

  return {
    /** La entrada actual pasa a ser la base: tras recargar quedan entradas viejas atrás. */
    iniciar() {
      historia.replaceState({ n: 0 }, '');
    },

    /** La app avisa cuántos pasos hacia atrás tiene (pantallas apiladas + hoja). */
    ajustar(profundidad) {
      deseada = profundidad;
      reconciliar();
    },

    /**
     * Llega un `popstate`. Devuelve cuántos pasos hacia atrás tiene que dar la
     * app: 0 si fue el eco de una retirada propia (o un avance que no
     * corresponde), y N si la persona tocó Atrás (N > 1 con el menú largo del
     * historial).
     */
    alPop(estado) {
      if (retiradaEnVuelo) {
        retiradaEnVuelo = false;
        reconciliar();
        return 0;
      }
      const destino = estado?.n ?? 0;
      if (destino >= real) {
        // Adelante (o una entrada vieja): el navegador ya se movió, así que se
        // lo anota y se lo reconcilia con lo que la app quiere.
        real = destino;
        reconciliar();
        return 0;
      }
      const pasos = real - destino;
      real = destino;
      return pasos;
    },
  };
}
