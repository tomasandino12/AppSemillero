/**
 * Franja de "datos de ejemplo". Obligatoria en toda pantalla que muestre
 * datos inventados (Etapa 3, Decisión 7): tiene que verse sin scrollear y
 * ser imposible de confundir con una alerta del negocio.
 */
export function bannerEjemplo() {
  return `
    <div class="banner-ejemplo" role="note">
      <span class="ico" aria-hidden="true">⚠</span>
      <span>Datos de ejemplo — no son datos reales del club</span>
    </div>
  `;
}
