import { limpiarNombre, clavearNombre } from '../../parser/parserCabb.js';
import {
  obtenerJugadoresDelClub, aprobarSolicitud, rechazarSolicitud, revocarCuentaJugador, jugadorTieneCuenta,
} from '../../data/repositorio.js';
import { fichaExistente } from '../../data/solicitudJugador.js';
import { LIMITE } from '../../data/limites.js';
import { html } from '../html.js';
import { toast, formatearFechaCorta } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { mensajeAlGuardar } from '../errores.js';
import { $ } from '../dom.js';

/**
 * Aprobar la solicitud de un chico desde PLANTEL, y quitarle el acceso desde su
 * ficha. Quien decide qué ficha es cuál es siempre el profe: el sistema no
 * compara nombres para vincular. Lo primero que se ofrece es CREAR la ficha,
 * porque es el caso normal (un chico que entra en marzo no tiene ni un partido
 * cargado); elegir una ficha que ya existe es el otro camino.
 */

const REGLAS = [
  [/JUGADOR_YA_TIENE_CUENTA/, 'Esa ficha ya tiene una cuenta vinculada.'],
  [/CUENTA_YA_VINCULADA/, 'Esa cuenta ya está vinculada a otra ficha.'],
  [/SOLICITUD_NO_ENCONTRADA/, 'Esa solicitud ya no está pendiente: la resolvió otro profe o no es de tu categoría.'],
  [/ES_DEL_CUERPO_TECNICO/, 'Esa cuenta ya es del cuerpo técnico: no se la puede vincular a una ficha de jugador. Rechazá la solicitud.'],
  [/FICHA_FUERA_DEL_PLANTEL/, 'Esa ficha no está en esta categoría.'],
];

const aviso = (texto) => html`<div class="al"><div class="tx">${texto}</div></div>`;
const fechaDe = (s) => formatearFechaCorta(s.creadoEn.slice(0, 10));

/**
 * ctx: { club, plantel, jugadores (los del plantel), alCambiar } — alCambiar
 * vuelve a dibujar PLANTEL después de resolver una solicitud.
 */
export function abrirSolicitudes(ctx, solicitudes) {
  abrirHoja({
    titulo: 'Pidieron entrar',
    cuerpo: html`
      <div class="p">Chicos que pidieron acceso a ${ctx.plantel.categoria}. Al aprobar, ven sus recursos, su plan y su progreso: nada de los demás.</div>
      ${solicitudes.map((s) => html`
        <button class="jug" data-solicitud="${s.id}">
          <div style="flex:1;text-align:left">
            <div class="nom">${s.nombre ?? 'Sin nombre'}</div>
            <div class="det">Pidió el ${fechaDe(s)}</div>
          </div>
          <div class="der">›</div>
        </button>
      `)}
    `,
  });
  $('hoja').querySelectorAll('[data-solicitud]').forEach((b) => {
    b.addEventListener('click', () => {
      const solicitud = solicitudes.find((s) => s.id === b.dataset.solicitud);
      if (solicitud) abrirDetalle(ctx, solicitud, solicitudes);
    });
  });
}

function abrirDetalle(ctx, s, solicitudes) {
  const { plantel, jugadores } = ctx;
  abrirHoja({
    titulo: s.nombre ?? 'Solicitud',
    cuerpo: html`
      <div class="p">Pidió entrar a ${plantel.categoria} el ${fechaDe(s)}. Escribió ese nombre al crear su cuenta.</div>

      <div class="eyebrow">Es un chico nuevo</div>
      <div class="campo">
        <label for="in-sol-nombre">Nombre de la ficha</label>
        <input id="in-sol-nombre" type="text" maxlength="${LIMITE.nombrePersona}" autocomplete="off" spellcheck="false" value="${s.nombre ?? ''}">
        <div class="ayuda">Como en la CABB: Apellido, Nombre. Si lo dejás como lo escribió, cuando llegue una planilla el import te la va a sugerir para que la confirmes.</div>
      </div>
      <div id="sol-aviso"></div>
      <button class="btn" id="btn-sol-crear">Crear la ficha y darle acceso</button>

      ${jugadores.length ? html`
        <div class="eyebrow">O ya está en la lista de ${plantel.categoria}</div>
        ${jugadores.map((j) => html`
          <button class="jug" data-ficha="${j.id}">
            <div style="flex:1;text-align:left"><div class="nom">${j.nombreLimpio}</div></div>
            <div class="der">Es él ›</div>
          </button>
        `)}` : ''}

      <button class="btn sec" id="btn-sol-rechazar">Rechazar</button>
      <button class="btn sec" id="btn-sol-volver">Volver</button>
    `,
  });

  $('btn-sol-volver').addEventListener('click', () => abrirSolicitudes(ctx, solicitudes));
  $('btn-sol-crear').addEventListener('click', () => crearFicha(ctx, s, ''));
  $('btn-sol-rechazar').addEventListener('click', () => rechazar(ctx, s));
  $('hoja').querySelectorAll('[data-ficha]').forEach((b) => {
    b.addEventListener('click', () => vincular(ctx, s, b.dataset.ficha));
  });
}

async function resolver(ctx, boton, textoEnCurso, accion, mensajeOk) {
  if (boton.disabled) return;
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = textoEnCurso;
  try {
    await accion();
  } catch (e) {
    boton.disabled = false;
    boton.textContent = textoOriginal;
    return e;
  }
  cerrarHoja();
  toast(mensajeOk);
  await ctx.alCambiar();
  return null;
}

async function crearFicha(ctx, s, desambiguador) {
  const nombreLimpio = limpiarNombre($('in-sol-nombre').value);
  const nombreClave = clavearNombre(nombreLimpio);
  if (!nombreClave) {
    $('sol-aviso').innerHTML = aviso('Escribí el nombre de la ficha.');
    return;
  }
  const payload = { solicitudId: s.id, nombreClave, nombreLimpio };
  if (desambiguador) payload.desambiguador = desambiguador;
  const error = await resolver(ctx, $('btn-sol-crear'), 'Creando…',
    () => aprobarSolicitud(payload), `${nombreLimpio} ya puede entrar`);
  if (!error) return;
  if (error?.message === 'JUGADOR_YA_EXISTE') {
    await ofrecerFichaExistente(ctx, s, nombreClave);
    return;
  }
  $('sol-aviso').innerHTML = aviso(mensajeAlGuardar(error, { reglas: REGLAS, generico: 'No se pudo aprobar. Probá de nuevo.' }));
}

/**
 * Crear la ficha chocó con una que ya existe en el club. En vez del error crudo,
 * se ofrece la salida correcta: es la misma persona (vincular) u otra con el
 * mismo nombre (crear con un dato que las distinga, el `desambiguador`).
 */
async function ofrecerFichaExistente(ctx, s, nombreClave) {
  let existente = null;
  try {
    existente = fichaExistente(await obtenerJugadoresDelClub(ctx.club.id), nombreClave, ctx.plantel.id);
  } catch {
    // Sin la lista se muestran igual las dos salidas: el aviso alcanza para elegir.
  }
  const categoria = ctx.plantel.categoria;
  $('sol-aviso').innerHTML = html`
    <div class="al ok"><div class="tx">
      <b>Ya hay una ficha con ese nombre en el club.</b>
      ${existente && !existente.enPlantel
        ? html`<div class="mt">${existente.jugador.nombreLimpio} está cargado en otra categoría. Si es la misma persona, sumala primero a ${categoria} (PLANTEL › Agregar jugador a mano, con ese nombre) y volvé a aprobar.</div>`
        : html`<div class="mt">Si es la misma persona, vinculala. Si es otra con el mismo nombre, creá la ficha con un dato que las distinga.</div>`}
    </div></div>
    ${existente?.enPlantel && html`<button class="btn" id="btn-sol-misma">Es la misma persona: darle acceso a ${existente.jugador.nombreLimpio}</button>`}
    <div class="campo">
      <label for="in-sol-desamb">Es otra persona: un dato que la distinga</label>
      <input id="in-sol-desamb" type="text" maxlength="${LIMITE.desambiguador}" autocomplete="off" spellcheck="false" placeholder="Por ejemplo, el año de nacimiento">
    </div>
    <button class="btn sec" id="btn-sol-otra">Crear la ficha con ese dato</button>
  `;
  $('btn-sol-misma')?.addEventListener('click', () => vincular(ctx, s, existente.jugador.id));
  $('btn-sol-otra').addEventListener('click', () => {
    const dato = $('in-sol-desamb').value.trim();
    if (!dato) {
      $('in-sol-desamb').focus();
      return;
    }
    crearFicha(ctx, s, dato);
  });
}

async function vincular(ctx, s, jugadorId) {
  const boton = $('hoja').querySelector(`[data-ficha="${jugadorId}"]`) ?? $('btn-sol-misma');
  const error = await resolver(ctx, boton, 'Vinculando…', () => aprobarSolicitud({ solicitudId: s.id, jugadorId }), 'Listo: ya puede entrar');
  if (error) {
    $('sol-aviso').innerHTML = aviso(mensajeAlGuardar(error, { reglas: REGLAS, generico: 'No se pudo aprobar. Probá de nuevo.' }));
  }
}

async function rechazar(ctx, s) {
  const error = await resolver(ctx, $('btn-sol-rechazar'), 'Rechazando…', () => rechazarSolicitud(s.id), 'Solicitud rechazada');
  if (error) {
    $('sol-aviso').innerHTML = aviso(mensajeAlGuardar(error, { reglas: REGLAS, generico: 'No se pudo rechazar. Probá de nuevo.' }));
  }
}

/* ---------- Quitar el acceso, desde la ficha del jugador ---------- */

/**
 * "Tiene acceso" y el botón para quitarlo, en la ficha. Quitarlo es cerrar la
 * cuenta, no borrarla: el chico deja de ver todo y queda escrito quién le dio y
 * quién le sacó el acceso. Si la consulta falla no se dibuja nada: es un
 * agregado, la ficha no tiene que romperse por esto.
 */
export async function renderAccesoDeJugador(jugador) {
  const contenedor = $('ficha-acceso');
  if (!contenedor) return;
  let tieneCuenta = false;
  try {
    tieneCuenta = await jugadorTieneCuenta(jugador.id);
  } catch {
    return;
  }
  if (!tieneCuenta) {
    contenedor.innerHTML = '';
    return;
  }
  contenedor.innerHTML = html`
    <div class="eyebrow">Acceso a la app</div>
    <div class="p">${jugador.nombreLimpio} tiene una cuenta propia, de sólo lectura: ve sus recursos, su plan y su progreso.</div>
    <button class="btn sec" id="btn-quitar-acceso">Quitarle el acceso</button>
  `;
  $('btn-quitar-acceso').addEventListener('click', () => confirmarQuitarAcceso(jugador));
}

function confirmarQuitarAcceso(jugador) {
  abrirHoja({
    titulo: 'Quitarle el acceso',
    cuerpo: html`
      <div class="p">${jugador.nombreLimpio} deja de ver sus datos en la app. No se borra nada, y queda registrado quién le dio y quién le quitó el acceso. Si más adelante vuelve a pedirlo, se lo podés aprobar de nuevo.</div>
      <div id="quitar-aviso"></div>
      <button class="btn" id="btn-quitar-confirmar">Quitarle el acceso</button>
      <button class="btn sec" id="btn-quitar-cancelar">Cancelar</button>
    `,
  });
  $('btn-quitar-cancelar').addEventListener('click', cerrarHoja);
  $('btn-quitar-confirmar').addEventListener('click', async () => {
    const boton = $('btn-quitar-confirmar');
    if (boton.disabled) return;
    boton.disabled = true;
    boton.textContent = 'Quitando…';
    try {
      await revocarCuentaJugador(jugador.id);
    } catch (e) {
      $('quitar-aviso').innerHTML = aviso(mensajeAlGuardar(e, {
        reglas: [[/SIN_CUENTA_VIGENTE/, 'Ese chico ya no tiene una cuenta con acceso.']],
        generico: 'No se pudo quitar el acceso. Probá de nuevo.',
      }));
      boton.disabled = false;
      boton.textContent = 'Quitarle el acceso';
      return;
    }
    cerrarHoja();
    toast('Acceso quitado');
    await renderAccesoDeJugador(jugador);
  });
}
