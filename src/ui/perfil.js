import { obtenerPerfilesDelClub, obtenerUsuarioActual, guardarPerfilPropio } from '../data/repositorio.js';
import { abrirHoja, cerrarHoja } from './componentes/hoja.js';
import { esErrorDeRed } from './nav.js';

const $ = (id) => document.getElementById(id);

let perfiles = {};
let usuarioActual = null;

/**
 * Trae los nombres de todos los del club y el id del usuario autenticado.
 *
 * Sin esto la autoría es un UUID. La policy de `perfil_entrenador` (0015) deja
 * que los del club se lean entre sí justamente para que "quién lo cargó"
 * signifique algo; `miembro_club` no serviría, porque su policy sólo deja ver
 * la fila propia.
 */
export async function cargarPerfiles(clubId) {
  [perfiles, usuarioActual] = await Promise.all([
    obtenerPerfilesDelClub(clubId).catch(() => ({})),
    obtenerUsuarioActual().catch(() => null),
  ]);
}

export function esMio(userId) {
  return usuarioActual != null && userId === usuarioActual;
}

/** 'Vos' para lo propio; el nombre del otro; y un genérico si nunca lo cargó. */
export function nombreDe(userId) {
  if (esMio(userId)) return 'Vos';
  return perfiles[userId] ?? 'Otro entrenador';
}

export function tengoNombre() {
  return usuarioActual != null && typeof perfiles[usuarioActual] === 'string' && perfiles[usuarioActual].length > 0;
}

/**
 * Se pide una sola vez, en la misma hoja donde el profe está por cargar su
 * primer ejercicio o su primera nota. Sin pantalla de configuración y sin un
 * ítem nuevo en la navegación: pedir el nombre no vale una pantalla propia.
 *
 * Devuelve true si al terminar hay nombre; false si canceló.
 */
export function asegurarNombre(clubId) {
  if (tengoNombre()) return Promise.resolve(true);

  return new Promise((resolver) => {
    abrirHoja({
      titulo: '¿Cómo te llamás?',
      cuerpo: `
        <div class="p">Se muestra al lado de los ejercicios y las notas que cargues, para que los demás profes sepan de quién es cada cosa. Se pide una sola vez.</div>
        <div class="campo">
          <label for="in-nombre-perfil">Tu nombre</label>
          <input id="in-nombre-perfil" type="text" autocomplete="name" spellcheck="false">
        </div>
        <div id="perfil-aviso"></div>
        <button class="btn" id="btn-guardar-perfil">Guardar</button>
        <button class="btn sec" id="btn-nombre-ahora-no">Ahora no</button>
      `,
    });
    $('in-nombre-perfil').focus();

    // hoja.js también cierra con Escape, no sólo con el velo o un botón. Sin
    // este botón, cerrar con Escape deja la promesa colgada para siempre y
    // el await de quien llamó a asegurarNombre() no vuelve nunca. No lo saques
    // por parecer redundante con el velo: cubre una salida que el velo no cubre.
    const cancelar = () => resolver(false);
    $('btn-nombre-ahora-no').addEventListener('click', () => {
      cerrarHoja();
      cancelar();
    });

    const guardar = async () => {
      const boton = $('btn-guardar-perfil');
      if (boton.disabled) return;
      const nombre = $('in-nombre-perfil').value.trim();
      if (!nombre) {
        $('perfil-aviso').innerHTML = `<div class="al"><div class="tx">Escribí tu nombre.</div></div>`;
        return;
      }
      boton.disabled = true;
      boton.textContent = 'Guardando...';
      try {
        await guardarPerfilPropio(clubId, usuarioActual, nombre);
      } catch (e) {
        $('perfil-aviso').innerHTML = `<div class="al"><div class="tx">${
          esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos e intentá de nuevo.' : 'No se pudo guardar tu nombre.'
        }</div></div>`;
        boton.disabled = false;
        boton.textContent = 'Guardar';
        return;
      }
      perfiles[usuarioActual] = nombre;
      cerrarHoja();
      resolver(true);
    };

    $('btn-guardar-perfil').addEventListener('click', guardar);
    $('in-nombre-perfil').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
    // Cerrar la hoja sin guardar cuenta como cancelar.
    $('velo').addEventListener('click', () => resolver(false), { once: true });
  });
}
