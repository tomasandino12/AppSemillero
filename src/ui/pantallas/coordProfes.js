import {
  obtenerPlantelesDelClub, obtenerCatalogoDeCategorias, obtenerTemporadasDelClub,
  obtenerMiembrosDelClub, obtenerAsignacionesDelClub, obtenerUsuariosPendientes,
  obtenerUsuarioActual, asignarPlanteles, cerrarAsignacion,
} from '../../data/repositorio.js';
import { armarProfes } from '../../data/coordinacion.js';
import { obtenerClubActual } from '../sesion.js';
import { escaparHtml, esErrorDeRed, toast, formatearFechaCorta } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';

const $ = (id) => document.getElementById(id);
const contenedor = () => $('coord-profes-contenido');

/**
 * Quién tiene acceso a qué, y el único lugar desde donde se cambia.
 *
 * Todo lo que se ve acá lo garantiza la base, no esta pantalla: un entrenador
 * que llegara hasta acá no podría leer pendientes ni asignar nada (0017).
 * La pantalla sólo evita ofrecer lo que la base va a rechazar — por ejemplo,
 * que el coordinador se asigne a sí mismo.
 */

let vista = null;

function mensajeDeError(e) {
  if (esErrorDeRed(e)) return 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.';
  const texto = e?.message ?? '';
  if (/SIN_CATEGORIAS/.test(texto)) return 'Marcá al menos una categoría.';
  if (/NO_ES_ENTRENADOR/.test(texto)) return 'Esa cuenta es de coordinación. Para que además entrene, hay que dárselo desde la base.';
  if (/NO_SE_PUDO_CERRAR|row-level security|permission denied|42501/i.test(texto)) return 'No tenés permiso para hacer eso.';
  return 'No se pudo guardar. Probá de nuevo.';
}

/* ---------- bloques ---------- */

function pendientesHtml(pendientes) {
  if (!pendientes.length) return '<div class="p">No hay cuentas esperando acceso.</div>';
  return pendientes.map((u) => `
    <div class="jug-fila">
      <div style="flex:1;min-width:0">
        <div class="nom">${escaparHtml(u.nombre || u.email)}</div>
        <div class="det">${u.nombre ? `${escaparHtml(u.email)} · ` : ''}Se registró el ${escaparHtml(formatearFechaCorta(u.registradoEn.slice(0, 10)))}</div>
      </div>
      <button class="btn chico" data-habilitar="${u.userId}">Habilitar</button>
    </div>
  `).join('');
}

function sinProfeHtml(sinProfe) {
  if (!sinProfe.length) return '<div class="p">Todas las categorías de la temporada tienen al menos un profe.</div>';
  return sinProfe.map((p) => `
    <div class="jug-fila">
      <div class="nom">${escaparHtml(p.categoria)}</div>
      <button class="btn sec chico" data-asignar-plantel="${p.id}">Asignar</button>
    </div>
  `).join('');
}

function profeHtml(p) {
  const roles = [p.esEntrenador && 'Entrenador', p.esCoordinador && 'Coordinación'].filter(Boolean).join(' · ');
  // El propio coordinador no se edita desde acá (la base lo rechaza), y a un
  // coordinador puro no se le asignan categorías (NO_ES_ENTRENADOR).
  const editable = p.esEntrenador && !p.esUnoMismo;
  const categorias = p.categorias.map((c) => `
    <div class="profe-cat">
      <div style="flex:1;min-width:0">
        <span class="nom">${escaparHtml(c.etiqueta)}</span>
        ${c.origen === 'migracion' ? '<div class="det">Asignada al activar el panel — confirmá que corresponde</div>' : ''}
      </div>
      ${editable ? `<button class="btn sec chico" data-quitar="${c.asignacionId}" data-profe="${p.userId}">Quitar</button>` : ''}
    </div>
  `).join('');
  return `
    <div class="profe">
      <div class="nom">${escaparHtml(p.etiqueta)}${p.esUnoMismo ? ' <span class="det">(vos)</span>' : ''}</div>
      <div class="det">${roles}${p.etiqueta !== p.email ? ` · ${escaparHtml(p.email)}` : ''}</div>
      ${categorias || (p.esEntrenador ? '<span class="chip sin">Sin categorías</span>' : '')}
      ${editable ? `<button class="btn sec chico" data-asignar-a="${p.userId}">Asignar categorías</button>` : ''}
    </div>
  `;
}

/* ---------- hojas ---------- */

function abrirElegirCategorias({ titulo, texto, planteles, textoBoton, alConfirmar }) {
  if (!planteles.length) {
    toast('No quedan categorías de esta temporada para asignar.');
    return;
  }
  abrirHoja({
    titulo,
    cuerpo: `
      <div class="p">${texto}</div>
      <div id="casillas">
        ${planteles.map((p) => `
          <button class="jug-fila casilla" data-plantel="${p.id}" aria-pressed="false">
            <span class="nom">${escaparHtml(p.categoria)}</span>
            <span class="chk"></span>
          </button>
        `).join('')}
      </div>
      <div class="acciones">
        <button class="btn" id="btn-confirmar-asignacion" disabled>${escaparHtml(textoBoton)}</button>
        <button class="btn sec" id="btn-cancelar-asignacion">Cancelar</button>
      </div>
    `,
  });

  const elegidos = new Set();
  document.querySelectorAll('#casillas [data-plantel]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const id = boton.dataset.plantel;
      if (elegidos.has(id)) elegidos.delete(id); else elegidos.add(id);
      const marcado = elegidos.has(id);
      boton.setAttribute('aria-pressed', String(marcado));
      const chk = boton.querySelector('.chk');
      chk.classList.toggle('on', marcado);
      chk.textContent = marcado ? '✓' : '';
      $('btn-confirmar-asignacion').disabled = elegidos.size === 0;
    });
  });
  $('btn-cancelar-asignacion').addEventListener('click', () => cerrarHoja());
  $('btn-confirmar-asignacion').addEventListener('click', async () => {
    const boton = $('btn-confirmar-asignacion');
    if (boton.disabled) return;
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    try {
      await alConfirmar([...elegidos]);
      cerrarHoja();
      await renderProfes();
    } catch (e) {
      toast(mensajeDeError(e));
      boton.disabled = false;
      boton.textContent = textoBoton;
    }
  });
}

function abrirHabilitar(pendiente) {
  const club = obtenerClubActual();
  const quien = pendiente.nombre || pendiente.email;
  abrirElegirCategorias({
    titulo: 'Habilitar',
    texto: `${escaparHtml(quien)} va a poder entrar como entrenador y ver sólo las categorías que marques. La biblioteca de ejercicios la ve entera.`,
    planteles: vista.plantelesDeLaTemporada,
    textoBoton: 'Habilitar y asignar',
    alConfirmar: async (plantelIds) => {
      const r = await asignarPlanteles({ userId: pendiente.userId, clubId: club.id, plantelIds });
      toast(`Listo: ${quien} ya puede entrar, con ${r.asignadas} categoría${r.asignadas === 1 ? '' : 's'}.`);
    },
  });
}

function abrirAsignarA(profe) {
  const club = obtenerClubActual();
  const yaTiene = new Set(profe.categorias.map((c) => c.plantelId));
  abrirElegirCategorias({
    titulo: `Asignar a ${profe.etiqueta}`,
    texto: 'Marcá las categorías que suma. Las que ya tiene no aparecen.',
    planteles: vista.plantelesDeLaTemporada.filter((p) => !yaTiene.has(p.id)),
    textoBoton: 'Asignar',
    alConfirmar: async (plantelIds) => {
      await asignarPlanteles({ userId: profe.userId, clubId: club.id, plantelIds });
      toast('Listo.');
    },
  });
}

function abrirElegirProfe(plantel) {
  const club = obtenerClubActual();
  const candidatos = vista.profes.filter((p) => p.esEntrenador && !p.esUnoMismo);
  if (!candidatos.length) {
    toast('Todavía no hay entrenadores habilitados. Habilitá a alguien desde Esperando acceso.');
    return;
  }
  abrirHoja({
    titulo: `Asignar ${plantel.categoria}`,
    cuerpo: `
      <div class="p">¿Quién queda a cargo de ${escaparHtml(plantel.categoria)}?</div>
      <div id="candidatos">
        ${candidatos.map((p) => `
          <button class="jug-fila casilla" data-candidato="${p.userId}"><span class="nom">${escaparHtml(p.etiqueta)}</span></button>
        `).join('')}
      </div>
      <div class="acciones"><button class="btn sec" id="btn-cancelar-asignacion">Cancelar</button></div>
    `,
  });
  $('btn-cancelar-asignacion').addEventListener('click', () => cerrarHoja());
  const botones = document.querySelectorAll('#candidatos [data-candidato]');
  botones.forEach((boton) => {
    boton.addEventListener('click', async () => {
      if (boton.disabled) return;
      botones.forEach((b) => { b.disabled = true; });
      try {
        await asignarPlanteles({ userId: boton.dataset.candidato, clubId: club.id, plantelIds: [plantel.id] });
        cerrarHoja();
        toast('Listo.');
        await renderProfes();
      } catch (e) {
        toast(mensajeDeError(e));
        botones.forEach((b) => { b.disabled = false; });
      }
    });
  });
}

/**
 * Quitar lleva confirmación y habilitar no: cortarle el acceso a alguien en
 * medio de su trabajo es lo que duele si fue un dedazo.
 */
function abrirQuitar(profe, categoria) {
  abrirHoja({
    titulo: `Quitar ${categoria.etiqueta}`,
    cuerpo: `
      <div class="p">${escaparHtml(profe.etiqueta)} deja de ver ${escaparHtml(categoria.etiqueta)} desde ahora.</div>
      <div class="p">Lo que cargó queda en el club, y la asignación queda registrada con su fecha de cierre.</div>
      <div class="acciones">
        <button class="btn" id="btn-confirmar-quitar">Quitar ${escaparHtml(categoria.etiqueta)}</button>
        <button class="btn sec" id="btn-cancelar-quitar">Cancelar</button>
      </div>
    `,
  });
  $('btn-cancelar-quitar').addEventListener('click', () => cerrarHoja());
  $('btn-confirmar-quitar').addEventListener('click', async () => {
    const boton = $('btn-confirmar-quitar');
    if (boton.disabled) return;
    boton.disabled = true;
    try {
      await cerrarAsignacion(categoria.asignacionId);
      cerrarHoja();
      toast(`Listo: ${profe.etiqueta} ya no ve ${categoria.etiqueta}.`);
      await renderProfes();
    } catch (e) {
      toast(mensajeDeError(e));
      boton.disabled = false;
    }
  });
}

/* ---------- pantalla ---------- */

export async function renderProfes() {
  const club = obtenerClubActual();
  if (!club) return;
  contenedor().innerHTML = '<div class="pad"><div class="p">Cargando...</div></div>';

  let notaCodigos = '';
  try {
    const [planteles, catalogo, temporadas, miembros, asignaciones, pendientes, usuarioActualId] = await Promise.all([
      obtenerPlantelesDelClub(club.id),
      obtenerCatalogoDeCategorias(),
      obtenerTemporadasDelClub(club.id),
      obtenerMiembrosDelClub(club.id),
      obtenerAsignacionesDelClub(club.id),
      obtenerUsuariosPendientes(),
      obtenerUsuarioActual(),
    ]);
    vista = armarProfes({ planteles, catalogo, temporadas, miembros, asignaciones, pendientes, usuarioActualId });

    // Los códigos de Mayores no se leen solos. Se aclaran una vez, acá arriba,
    // y no en cada lugar donde aparecen. Salen del catálogo, no escritos a mano.
    const mayores = catalogo.filter((c) => c.codigo.startsWith('MAY_')
      && vista.plantelesDeLaTemporada.some((p) => p.categoriaCodigo === c.codigo));
    if (mayores.length) {
      const verbo = mayores.length === 1 ? 'es' : 'son';
      notaCodigos = `${mayores.map((c) => c.codigo).join(' y ')} ${verbo} ${mayores.map((c) => c.nombre).join(' y ')}.`;
    }
  } catch (e) {
    const mensaje = esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo cargar la lista de profes.';
    contenedor().innerHTML = `<div class="pad"><div class="p">${mensaje}</div></div>`;
    return;
  }

  contenedor().innerHTML = `
    <div class="pad">
      ${notaCodigos ? `<div class="p nota-codigos">${escaparHtml(notaCodigos)}</div>` : ''}
      <div class="eyebrow">Esperando acceso <span class="der">${vista.pendientes.length}</span></div>
      ${pendientesHtml(vista.pendientes)}

      <div class="eyebrow">Categorías sin profe</div>
      ${sinProfeHtml(vista.sinProfe)}

      <div class="eyebrow">Profes del club</div>
      <div class="lista-2col">${vista.profes.map(profeHtml).join('')}</div>
    </div>
  `;

  contenedor().querySelectorAll('[data-habilitar]').forEach((b) => b.addEventListener('click', () => {
    abrirHabilitar(vista.pendientes.find((u) => u.userId === b.dataset.habilitar));
  }));
  contenedor().querySelectorAll('[data-asignar-plantel]').forEach((b) => b.addEventListener('click', () => {
    abrirElegirProfe(vista.sinProfe.find((p) => p.id === b.dataset.asignarPlantel));
  }));
  contenedor().querySelectorAll('[data-asignar-a]').forEach((b) => b.addEventListener('click', () => {
    abrirAsignarA(vista.profes.find((p) => p.userId === b.dataset.asignarA));
  }));
  contenedor().querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => {
    const profe = vista.profes.find((p) => p.userId === b.dataset.profe);
    abrirQuitar(profe, profe.categorias.find((c) => c.asignacionId === b.dataset.quitar));
  }));
}
