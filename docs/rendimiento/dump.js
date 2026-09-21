// Herramienta de verificación (no va a git: .claude/worktrees/ está ignorado).
// Vuelca los estilos computados de todos los elementos y los compara contra una base guardada.
(() => {
  const PROPS = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color',
    'border-left-color', 'outline-color', 'font-family', 'font-size', 'font-weight', 'letter-spacing',
    'padding', 'margin', 'border-radius', 'box-shadow', 'transition-property', 'transition-duration',
    'transition-timing-function', 'opacity', 'width', 'height', 'gap', 'fill', 'stroke'];
  const PSEUDO = ['::before', '::after'];
  window.dumpEstilos = () => {
    const out = {};
    let i = 0;
    for (const el of document.querySelectorAll('body *')) {
      const clave = `${i++}:${el.tagName}.${String(el.className?.baseVal ?? el.className).slice(0, 40)}`;
      const cs = getComputedStyle(el);
      out[clave] = PROPS.map((p) => cs.getPropertyValue(p)).join('|');
      for (const ps of PSEUDO) {
        const pc = getComputedStyle(el, ps);
        if (pc.content !== 'none' && pc.content !== 'normal') {
          out[clave + ps] = PROPS.map((p) => pc.getPropertyValue(p)).join('|');
        }
      }
    }
    return out;
  };
  window.guardarBase = (clave) => {
    const d = window.dumpEstilos();
    localStorage.setItem('base_' + clave, JSON.stringify(d));
    return Object.keys(d).length;
  };
  window.compararBase = (clave) => {
    const base = JSON.parse(localStorage.getItem('base_' + clave) ?? 'null');
    if (!base) return 'sin base';
    const ahora = window.dumpEstilos();
    const dif = [];
    for (const k of new Set([...Object.keys(base), ...Object.keys(ahora)])) {
      if (base[k] === ahora[k]) continue;
      const a = (base[k] ?? '').split('|'), b = (ahora[k] ?? '').split('|');
      const props = PROPS.filter((p, j) => a[j] !== b[j]).map((p) => `${p}: ${a[PROPS.indexOf(p)]} -> ${b[PROPS.indexOf(p)]}`);
      dif.push(`${k} :: ${props.join(' ; ') || 'elemento distinto'}`);
    }
    return { elementos: Object.keys(ahora).length, diferencias: dif.length, muestra: dif.slice(0, 12) };
  };
})();
