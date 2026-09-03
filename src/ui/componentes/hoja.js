const $ = (id) => document.getElementById(id);

/** Bottom sheet en celular; diálogo centrado a partir de 1024px (layout.css). */
export function abrirHoja({ titulo, cuerpo }) {
  const hoja = $('hoja');
  hoja.innerHTML = `
    <div class="asa"></div>
    <h2 id="hoja-titulo">${titulo}</h2>
    <div class="pad">${cuerpo}</div>
  `;
  $('velo').classList.add('on');
  hoja.classList.add('on');
}

export function cerrarHoja() {
  $('velo').classList.remove('on');
  $('hoja').classList.remove('on');
}

export function iniciarHoja() {
  $('velo').addEventListener('click', cerrarHoja);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarHoja();
  });
}
