// Errores no atrapados del cliente (0031).
// Se importa a través de src/data/repositorio.js (fachada).
import { obtenerCliente } from '../cliente.js';

/**
 * Guarda un registro ya armado y depurado por src/data/errorDeCliente.js.
 *
 * No devuelve nada y no tira nunca: la llama el manejador global de errores,
 * así que un fallo acá —justo el caso de "se cayó la red", que es cuando más
 * se rompe todo— volvería a entrar por la misma puerta y no pararía más. Si no
 * se pudo guardar, se pierde el registro y ya; el aviso al usuario y la
 * consola no dependen de esto.
 *
 * La tabla no tiene select para el cliente, así que el insert va sin `select()`.
 *
 * @param {{mensaje: string, stack: string|null, pantalla: string, agente: string}} registro
 * @param {string|null} clubId - Null si la app todavía no sabe el club.
 */
export async function guardarErrorDeCliente(registro, clubId = null) {
  try {
    const supabase = obtenerCliente();
    await supabase.from('error_cliente').insert({
      club_id: clubId,
      mensaje: registro.mensaje,
      stack: registro.stack,
      pantalla: registro.pantalla,
      agente: registro.agente,
    });
  } catch {
    // Ver el comentario de arriba: acá no se propaga nada.
  }
}
