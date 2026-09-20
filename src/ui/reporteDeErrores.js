import { registroDeError } from '../data/errorDeCliente.js';
import { toast } from './nav.js';

/*
 * Los errores que nadie atrapó. Hasta acá, una excepción adentro de un render
 * o una promesa rechazada sin catch no se veían en ningún lado: la pantalla
 * quedaba a medio dibujar y el profe pensaba que la app "se tildó". El único
 * que se enteraba era quien tuviera la consola abierta, o sea nadie.
 *
 * Dos cosas, entonces: avisarle a quien está usando la app, y dejar el
 * registro (`alCapturar`) para poder mirarlo después.
 */

/**
 * Tope de reportes por carga de página. Un error adentro de un bucle de
 * render dispara cientos en un segundo: sin tope, el aviso tapa la pantalla y
 * —cuando esto escriba en la base— cada falla se multiplicaría por cien.
 * Los primeros son los que sirven; el resto es la misma historia.
 */
const TOPE = 10;
/** Un aviso cada tanto, por el mismo motivo. */
const ESPERA_ENTRE_AVISOS = 5000;

const AVISO = 'Algo falló. Si se repite, contale al coordinador.';

export function iniciarReporteDeErrores({ pantallaActual = () => '', alCapturar } = {}) {
  let reportados = 0;
  let ultimoAviso = 0;

  function manejar(error) {
    if (reportados >= TOPE) return;
    reportados += 1;

    const ahora = Date.now();
    if (ahora - ultimoAviso > ESPERA_ENTRE_AVISOS) {
      ultimoAviso = ahora;
      toast(AVISO);
    }

    // Todo lo de acá abajo corre adentro del manejador de errores: si algo
    // tira, el navegador vuelve a entrar por la misma puerta y no para más.
    try {
      const registro = registroDeError(error, {
        pantalla: pantallaActual() ?? '',
        agente: navigator.userAgent,
      });
      // En la consola queda el error de verdad, sin depurar: quien la tenga
      // abierta está en su propia máquina. Lo depurado es lo que se guarda.
      console.error('[error no atrapado]', error);
      alCapturar?.(registro);
    } catch {
      // Ni siquiera se pudo armar el registro. Se pierde y se sigue: el aviso
      // al usuario ya salió, que es lo que no podía faltar.
    }
  }

  window.addEventListener('error', (e) => manejar(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => manejar(e.reason));
}
