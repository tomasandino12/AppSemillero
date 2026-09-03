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
