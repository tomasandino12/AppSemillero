import { obtenerPerfilesDelClub, obtenerUsuarioActual, guardarMiNombre } from '../data/repositorio.js';
import { normalizarNombre } from '../data/cuenta.js';
import { abrirHoja, cerrarHoja } from './componentes/hoja.js';
import { toast } from './nav.js';
import { obtenerCuenta, setNombreDeCuenta } from './sesion.js';
import { sincronizarChrome } from './main.js';
import { $ } from './dom.js';
import { textoDeError } from './errores.js';

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
 * Sin esto la autoría es un UUID. Desde 0019 el nombre vive en los metadatos
 * de Auth y se lee con nombres_del_club, que sólo responde a los del club.
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
  return Boolean(obtenerCuenta()?.nombre);
}

/**
 * Las cuentas nuevas ya entran con nombre (se pide al registrarse, ver
 * main.js). Esto queda para las anteriores a 0019 que todavía no lo cargaron:
 * se pide en la misma hoja donde el profe está por cargar su primer ejercicio
 * o su primera nota, y también se puede cargar desde Mi perfil.
 *
 * Devuelve true si al terminar hay nombre; false si no se pudo (usuario no
 * identificado) o si canceló. Todo camino que devuelve false ya avisó por
 * toast acá adentro: quien llama sólo necesita cortar sin abrir nada más.
 */
export function asegurarNombre(clubId) {
  if (tengoNombre()) return Promise.resolve(true);

  if (usuarioActual == null) {
    // Sin usuario identificado (obtenerUsuarioActual() falló, o directamente
    // no hay sesión) no hay a quién guardarle el nombre. Mejor avisar acá que
    // abrir una hoja para un guardado condenado.
    toast('No se pudo identificar tu usuario. Cerrá sesión y volvé a entrar.');
    return Promise.resolve(false);
  }

  return new Promise((resolver) => {
    abrirHoja({
      titulo: '¿Cómo te llamás?',
      cuerpo: `
        <div class="p">Se muestra al lado de los ejercicios y las notas que cargues, para que los demás profes sepan de quién es cada cosa. Después lo podés cambiar desde Mi perfil.</div>
        <div class="campo">
          <label for="in-nombre-perfil">Nombre y apellido</label>
          <input id="in-nombre-perfil" type="text" autocomplete="name" spellcheck="false" maxlength="80">
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
      const nombre = normalizarNombre($('in-nombre-perfil').value);
      if (!nombre) {
        $('perfil-aviso').innerHTML = `<div class="al"><div class="tx">Escribí tu nombre.</div></div>`;
        return;
      }
      boton.disabled = true;
      boton.textContent = 'Guardando...';
      try {
        await guardarMiNombre(nombre);
      } catch (e) {
        $('perfil-aviso').innerHTML = `<div class="al"><div class="tx">${
          textoDeError(e, 'No se pudo guardar tu nombre.')
        }</div></div>`;
        boton.disabled = false;
        boton.textContent = 'Guardar';
        return;
      }
      perfiles[usuarioActual] = nombre;
      setNombreDeCuenta(nombre);
      // Las iniciales de la cabecera salen del nombre.
      sincronizarChrome();
      cerrarHoja();
      finalizar(true);
    };

    $('btn-guardar-perfil').addEventListener('click', guardar);
    $('in-nombre-perfil').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
  });
}
