import { obtenerPerfilesDelClub, obtenerUsuarioActual, guardarPerfilPropio } from '../data/repositorio.js';
import { abrirHoja, cerrarHoja } from './componentes/hoja.js';
import { esErrorDeRed, toast } from './nav.js';

const $ = (id) => document.getElementById(id);

let perfiles = {};
let usuarioActual = null;
// true si la última lectura de obtenerPerfilesDelClub falló. Sin esto,
// nombreDe() no puede distinguir "este profe nunca cargó su nombre" (dato
// real, ya leído) de "no sabemos, la lectura se cortó" (dato ausente): las
// dos se mostraban igual como "Otro entrenador", afirmando algo que en
// realidad no se sabe.
let perfilesFallaron = false;

/**
 * Trae los nombres de todos los del club y el id del usuario autenticado.
 *
 * Sin esto la autoría es un UUID. La policy de `perfil_entrenador` (0015) deja
 * que los del club se lean entre sí justamente para que "quién lo cargó"
 * signifique algo; `miembro_club` no serviría, porque su policy sólo deja ver
 * la fila propia.
 */
export async function cargarPerfiles(clubId) {
  perfilesFallaron = false;
  const [perfilesLeidos, usuarioLeido] = await Promise.all([
    obtenerPerfilesDelClub(clubId).catch(() => {
      perfilesFallaron = true;
      return null;
    }),
    obtenerUsuarioActual().catch(() => null),
  ]);
  perfiles = perfilesLeidos ?? {};
  usuarioActual = usuarioLeido;
}

export function esMio(userId) {
  return usuarioActual != null && userId === usuarioActual;
}

/**
 * 'Vos' para lo propio; el nombre del otro; un guión si la última lectura de
 * perfiles falló (no lo sabemos: no es lo mismo que "no cargó nombre"); y el
 * genérico sólo cuando sí se pudo leer y ese profe nunca cargó el suyo.
 */
export function nombreDe(userId) {
  if (esMio(userId)) return 'Vos';
  if (typeof perfiles[userId] === 'string' && perfiles[userId].length > 0) return perfiles[userId];
  return perfilesFallaron ? '—' : 'Otro entrenador';
}

export function tengoNombre() {
  return usuarioActual != null && typeof perfiles[usuarioActual] === 'string' && perfiles[usuarioActual].length > 0;
}

/**
 * Se pide una sola vez, en la misma hoja donde el profe está por cargar su
 * primer ejercicio o su primera nota. Sin pantalla de configuración y sin un
 * ítem nuevo en la navegación: pedir el nombre no vale una pantalla propia.
 *
 * Devuelve true si al terminar hay nombre; false si no se pudo (usuario no
 * identificado) o si canceló. Todo camino que devuelve false ya avisó por
 * toast acá adentro: quien llama sólo necesita cortar sin abrir nada más.
 */
export function asegurarNombre(clubId) {
  if (tengoNombre()) return Promise.resolve(true);

  if (usuarioActual == null) {
    // guardarPerfilPropio necesita un user_id real: sin usuario identificado
    // (obtenerUsuarioActual() falló, o directamente no hay sesión) no hay a
    // quién asociarle el nombre, y la policy de 0015 va a rechazar el upsert
    // igual. Mejor avisar acá que abrir una hoja para un guardado condenado.
    toast('No se pudo identificar tu usuario. Cerrá sesión y volvé a entrar.');
    return Promise.resolve(false);
  }

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

    // hoja.js registra un keydown global para Escape que llama a
    // cerrarHoja() directo (ver iniciarHoja() en hoja.js): no dispara ningún
    // evento propio y no pasa por el velo ni por ningún botón de acá. Sin un
    // listener propio de Escape, esa salida deja la promesa colgada para
    // siempre y el await de quien llamó a asegurarNombre() no vuelve nunca.
    // "Ahora no" es la salida visible para quien no usa el teclado; el
    // listener de abajo cierra el agujero de Escape. finalizar() desregistra
    // los tres (Escape, velo y a sí misma) apenas se resuelve por cualquiera
    // de los caminos, para no dejar un listener global escuchando Escapes de
    // otras pantallas.
    const alEscape = (e) => { if (e.key === 'Escape') finalizar(false); };
    const alVelo = () => finalizar(false);
    function finalizar(resultado) {
      document.removeEventListener('keydown', alEscape);
      $('velo').removeEventListener('click', alVelo);
      // Cancelar (Escape, velo o "Ahora no") no deja ningún rastro visible
      // más que este toast: sin él, el profe no entiende por qué no pasó
      // nada. El camino de éxito no lo necesita: guardar() ya cierra la hoja
      // y quien llamó a asegurarNombre() sigue con su propio flujo (que va a
      // mostrar su propio toast de éxito más adelante).
      if (!resultado) toast('No se guardó nada: sin tu nombre no se sabe de quién es cada cosa que cargues.');
      resolver(resultado);
    }
    // No usamos { once: true } acá: queremos que se desregistre al detectar
    // Escape, no después de la primera tecla. La limpieza la hace finalizar()
    // llamando a removeEventListener() explícitamente.
    document.addEventListener('keydown', alEscape);
    $('velo').addEventListener('click', alVelo, { once: true });

    $('btn-nombre-ahora-no').addEventListener('click', () => {
      cerrarHoja();
      finalizar(false);
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
      finalizar(true);
    };

    $('btn-guardar-perfil').addEventListener('click', guardar);
    $('in-nombre-perfil').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
  });
}
