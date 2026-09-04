export function mostrarPantalla(id) {
  document.querySelectorAll('.pant').forEach((p) => p.classList.toggle('on', p.id === id));
  const cuerpo = document.getElementById('cuerpo');
  if (cuerpo) cuerpo.scrollTop = 0;
}

let temporizadorToast = null;
export function toast(mensaje) {
  const el = document.getElementById('toast');
  document.getElementById('toast-tx').textContent = mensaje;
  el.classList.add('on');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => el.classList.remove('on'), 2800);
}

export function esErrorDeRed(e) {
  return e instanceof TypeError || /fetch|network|conexi[oó]n/i.test(e?.message ?? '');
}

export function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Un porcentaje SIEMPRE con sus intentos al lado, y la marca de muestra
 * chica cuando corresponde. `p` es lo que devuelve porcentaje() de
 * estadisticas.js: o null, o {pct, anotados, intentos, muestraChica}.
 *
 * Es el único lugar donde se convierte un porcentaje en texto, así que la
 * regla "ningún porcentaje sin su denominador" no depende de que cada
 * pantalla se acuerde.
 */
export function textoPorcentaje(p) {
  if (p == null) return '<span class="sin">sin datos</span>';
  const marca = p.muestraChica ? '<span class="poco-tag">pocos datos</span>' : '';
  return `<span class="${p.muestraChica ? 'poco' : ''}">${p.pct}% · ${p.anotados}/${p.intentos}</span>${marca}`;
}

/** 'YYYY-MM-DD' → 'DD/MM'. A mano: new Date('2026-05-01') es UTC y se corre un día. */
export function formatearFechaCorta(iso) {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}
