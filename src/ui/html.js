/*
 * Plantilla de HTML que escapa sola. Todo lo que se interpola en html`...` se
 * escapa, salvo otro fragmento de html`...` o algo marcado con crudo(). Así
 * "acordarse de escapar" deja de ser trabajo de cada pantalla: el olvido, que
 * en una app con datos de menores es un agujero de seguridad, deja de ser el
 * camino fácil.
 *
 *   contenedor.innerHTML = html`<span class="nom">${jugador.nombre}</span>`;
 *
 * El resultado se asigna a innerHTML tal cual (se convierte a texto solo).
 * Las listas se unen sin separador: ${filas.map((f) => html`<li>${f}</li>`)}.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

class Html {
  constructor(texto) {
    this.texto = texto;
  }

  toString() {
    return this.texto;
  }
}

function escapar(valor) {
  if (valor instanceof Html) return valor.texto;
  if (Array.isArray(valor)) return valor.map(escapar).join('');
  // false vacío: `${hayAviso && html`...`}` no debe escribir la palabra "false".
  if (valor == null || valor === false) return '';
  return String(valor).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Marca un string como HTML ya seguro (por ejemplo, el de un componente propio). */
export function crudo(texto) {
  return new Html(String(texto));
}

export function html(partes, ...valores) {
  return new Html(partes.reduce((s, parte, i) => s + escapar(valores[i - 1]) + parte));
}
