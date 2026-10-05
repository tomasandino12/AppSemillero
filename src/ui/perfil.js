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
    let resuelto = false;
    // Toda salida sin guardar (Escape, velo, "Ahora no" o Atrás del sistema)
    // pasa por cerrarHoja(), que avisa acá. Guardar resuelve ANTES de cerrar,
    // así este camino no lo toma por una cancelación.
    function finalizar(resultado) {
      if (resuelto) return;
      resuelto = true;
      // Cancelar no deja ningún rastro visible más que este toast: sin él, el
      // profe no entiende por qué no pasó nada. El éxito no lo necesita:
      // quien llamó sigue con su propio flujo y su propio toast.
      if (!resultado) toast('No se guardó nada: sin tu nombre no se sabe de quién es cada cosa que cargues.');
      resolver(resultado);
    }
    abrirHoja({
      alCerrar: () => finalizar(false),
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

    $('btn-nombre-ahora-no').addEventListener('click', cerrarHoja);

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
      finalizar(true);
      cerrarHoja();
    };

    $('btn-guardar-perfil').addEventListener('click', guardar);
    $('in-nombre-perfil').addEventListener('keydown', (e) => { if (e.key === 'Enter') guardar(); });
  });
}
