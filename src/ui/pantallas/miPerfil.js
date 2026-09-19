import {
  obtenerPlantelesDelClub, obtenerMisPlantelesAsignados, obtenerCatalogoDeCategorias,
  obtenerTemporadasDelClub, guardarMiNombre,
} from '../../data/repositorio.js';
import { normalizarNombre, inicialesDeNombre, rolesLegibles } from '../../data/cuenta.js';
import { temporadaMasReciente } from '../../data/coordinacion.js';
import { obtenerCuenta, obtenerClubActual, obtenerRoles, setNombreDeCuenta } from '../sesion.js';
import { escaparHtml, esErrorDeRed, toast } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { sincronizarChrome, salir } from '../main.js';
import { $ } from '../dom.js';
import { textoDeError } from '../errores.js';

const contenedor = () => $('mi-perfil-contenido');

/**
 * Mi perfil: quién sos para la app. El nombre grande arriba, los datos abajo
 * y un botón para corregir el nombre. Sólo lo que a esta app le sirve: nombre,
 * mail, rol y categorías a cargo. Cerrar sesión vive acá (ver chrome.js).
 */

function nombreHtml(nombre) {
  return nombre ? escaparHtml(nombre) : '<span class="sin">Sin nombre cargado</span>';
}

/** Las categorías vigentes propias, en orden de catálogo; con año si no son de la temporada actual. */
async function categoriasHtml(club, roles) {
  if (!roles.esEntrenador) {
    return '<span class="sin">Coordinación no tiene categorías a cargo: ve el panorama de todas.</span>';
  }
  const [planteles, asignados, catalogo, temporadas] = await Promise.all([
    obtenerPlantelesDelClub(club.id),
    obtenerMisPlantelesAsignados(club.id),
    obtenerCatalogoDeCategorias(),
    obtenerTemporadasDelClub(club.id),
  ]);
  const orden = new Map(catalogo.map((c) => [c.codigo, c.orden]));
  const nombreTemporada = new Map(temporadas.map((t) => [t.id, t.nombre]));
  const actual = temporadaMasReciente(temporadas);
  const mias = planteles
    .filter((p) => asignados.has(p.id))
    .sort((a, b) => (orden.get(a.categoriaCodigo) ?? Infinity) - (orden.get(b.categoriaCodigo) ?? Infinity));
  if (!mias.length) {
    return '<span class="sin">Todavía no tenés categorías asignadas. Pedíselas al coordinador del club.</span>';
  }
  return `<div class="perfil-cats">${mias.map((p) => {
    const etiqueta = p.temporadaId === actual?.id ? p.categoria : `${p.categoria} ${nombreTemporada.get(p.temporadaId) ?? ''}`;
    return `<span class="chip">${escaparHtml(etiqueta.trim())}</span>`;
  }).join('')}</div>`;
}

function abrirEditarNombre() {
  const actual = obtenerCuenta()?.nombre ?? '';
  abrirHoja({
    titulo: 'Tu nombre',
    cuerpo: `
      <div class="p">Es lo que ven los demás profes y la coordinación.</div>
      <div class="campo">
        <label for="in-mi-nombre">Nombre y apellido</label>
        <input id="in-mi-nombre" type="text" autocomplete="name" spellcheck="false" maxlength="80" value="${escaparHtml(actual)}">
      </div>
      <div id="mi-nombre-aviso"></div>
      <div class="acciones">
        <button class="btn" id="btn-guardar-mi-nombre">Guardar</button>
        <button class="btn sec" id="btn-cancelar-mi-nombre">Cancelar</button>
      </div>
    `,
  });
  $('in-mi-nombre').focus();
  $('btn-cancelar-mi-nombre').addEventListener('click', () => cerrarHoja());

  const guardar = async () => {
    const boton = $('btn-guardar-mi-nombre');
    if (boton.disabled) return;
    const nombre = normalizarNombre($('in-mi-nombre').value);
    if (!nombre) {
      $('mi-nombre-aviso').innerHTML = '<div class="al"><div class="tx">Escribí tu nombre y apellido.</div></div>';
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Guardando...';
    try {
      await guardarMiNombre(nombre);
    } catch (e) {
      $('mi-nombre-aviso').innerHTML = `<div class="al"><div class="tx">${
        textoDeError(e, 'No se pudo guardar tu nombre.')
      }</div></div>`;
      boton.disabled = false;
      boton.textContent = 'Guardar';
      return;
    }
    setNombreDeCuenta(nombre);
    cerrarHoja();
    toast('Listo: tu nombre quedó guardado.');
    // Las iniciales de la cabecera salen del nombre.
    sincronizarChrome();
    await renderMiPerfil();
  };
  $('btn-guardar-mi-nombre').addEventListener('click', guardar);
  $('in-mi-nombre').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
}

export async function renderMiPerfil() {
  const cuenta = obtenerCuenta();
  const club = obtenerClubActual();
  const roles = obtenerRoles();
  if (!cuenta || !club) return;

  const iniciales = inicialesDeNombre(cuenta.nombre ?? '');
  contenedor().innerHTML = `
    <div class="pad">
      <section class="perfil-cab">
        <div class="perfil-avatar" aria-hidden="true">${iniciales ? escaparHtml(iniciales) : '?'}</div>
        <div class="perfil-id">
          <div class="perfil-roles">${rolesLegibles(roles).map((r) => `<span class="perfil-rol">${r}</span>`).join('')}</div>
          <h2 class="perfil-nombre">${nombreHtml(cuenta.nombre)}</h2>
          <div class="det">${escaparHtml(club.nombre)}</div>
        </div>
      </section>

      ${cuenta.nombre ? '' : '<div class="p">Cargá tu nombre: es lo que ven los demás profes y la coordinación. Mientras no esté, ven tu mail.</div>'}

      <section class="perfil-datos">
        <div class="perfil-fila">
          <div>
            <div class="k">Nombre</div>
            <div class="v">${nombreHtml(cuenta.nombre)}</div>
          </div>
          <button class="btn sec chico" id="btn-editar-nombre">${cuenta.nombre ? 'Editar' : 'Cargar'}</button>
        </div>
        <div class="perfil-fila">
          <div>
            <div class="k">Correo electrónico</div>
            <div class="v">${escaparHtml(cuenta.email ?? '—')}</div>
          </div>
        </div>
        <div class="perfil-fila">
          <div>
            <div class="k">Categorías a cargo</div>
            <div class="v" id="perfil-categorias"><span class="sin">Cargando...</span></div>
          </div>
        </div>
      </section>

      <button class="btn sec" id="btn-cerrar-sesion">Cerrar sesión</button>
    </div>
  `;
  $('btn-editar-nombre').addEventListener('click', abrirEditarNombre);
  $('btn-cerrar-sesion').addEventListener('click', () => salir());

  try {
    $('perfil-categorias').innerHTML = await categoriasHtml(club, roles);
  } catch (e) {
    const el = $('perfil-categorias');
    if (el) el.innerHTML = `<span class="sin">${esErrorDeRed(e) ? 'Sin conexión: no se pudieron cargar.' : 'No se pudieron cargar.'}</span>`;
  }
}
