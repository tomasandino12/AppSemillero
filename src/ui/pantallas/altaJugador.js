import { limpiarNombre, clavearNombre } from '../../parser/parserCabb.js';
import { obtenerJugadoresDelClub, altaJugadorManual, crearPertenencia } from '../../data/repositorio.js';
import { obtenerClubActual, obtenerPlantelActivo } from '../sesion.js';
import { escaparHtml, toast, esErrorDeRed } from '../nav.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { ir } from '../main.js';
import { $ } from '../dom.js';
import { LIMITE } from '../../data/limites.js';
import { textoDeError } from '../errores.js';

function hoyLocal() {
  // Fecha local, no UTC: después de las 21:00 en Argentina, toISOString() ya
  // devuelve el día siguiente.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function abrirAltaManual() {
  const plantel = obtenerPlantelActivo();
  if (!plantel) return;
  abrirHoja({
    titulo: 'Agregar jugador',
    cuerpo: `
      <div class="campo">
        <label for="in-nombre-jugador">Nombre</label>
        <input id="in-nombre-jugador" type="text" maxlength="${LIMITE.nombrePersona}" autocomplete="off" spellcheck="false">
        <div class="ayuda">Como en la CABB: Apellido, Nombre. El orden importa para que un import futuro lo reconozca en vez de duplicarlo.</div>
      </div>
      <div id="alta-aviso"></div>
      <button class="btn" id="btn-alta-confirmar">Agregar a ${escaparHtml(plantel.categoria)}</button>
    `,
  });
  $('in-nombre-jugador').focus();
  $('btn-alta-confirmar').addEventListener('click', confirmarAlta);
  $('in-nombre-jugador').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmarAlta();
  });
}

async function confirmarAlta() {
  const boton = $('btn-alta-confirmar');
  // Guarda acá, no sólo en el keydown: click (que el navegador ya frena solo
  // con boton.disabled) y Enter son dos entradas al mismo flujo, y esta es la
  // única que cubre a las dos contra un doble submit con la RPC en vuelo.
  if (boton.disabled) return;

  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  const aviso = $('alta-aviso');
  const crudo = $('in-nombre-jugador').value;

  const nombreLimpio = limpiarNombre(crudo);
  const nombreClave = clavearNombre(nombreLimpio);
  if (!nombreClave) {
    aviso.innerHTML = `<div class="al"><div class="tx">Escribí un nombre.</div></div>`;
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Agregando...';
  aviso.innerHTML = '';

  // Chequeo previo contra el club entero: si ya existe, se ofrece sumarlo a
  // esta categoría en vez de crear un duplicado. Es el mismo caso del chico
  // de U17 citado a U21, por la otra puerta. La RPC igual lo bloquea con
  // JUGADOR_YA_EXISTE, así que esto es sólo para dar el mensaje bueno.
  let existentes = [];
  try {
    existentes = await obtenerJugadoresDelClub(club.id);
  } catch (e) {
    aviso.innerHTML = `<div class="al"><div class="tx">${esErrorDeRed(e) ? 'Sin conexión. Revisá tu wifi/datos.' : 'No se pudo verificar si el jugador ya existe.'}</div></div>`;
    boton.disabled = false;
    boton.textContent = `Agregar a ${plantel.categoria}`;
    return;
  }

  const yaExiste = existentes.find((j) => j.nombreClave === nombreClave);
  if (yaExiste) {
    if (yaExiste.plantelesActuales.includes(plantel.id)) {
      aviso.innerHTML = `<div class="al ok"><div class="tx"><b>${escaparHtml(yaExiste.nombreLimpio)}</b> ya está en ${escaparHtml(plantel.categoria)}.</div></div>`;
      boton.disabled = false;
      boton.textContent = `Agregar a ${plantel.categoria}`;
      return;
    }
    mostrarOfertaDeSumar(yaExiste);
    return;
  }

  try {
    await altaJugadorManual({
      clubId: club.id,
      nombreClave,
      nombreLimpio,
      plantelId: plantel.id,
      temporadaId: plantel.temporadaId,
      desde: hoyLocal(),
    });
  } catch (e) {
    if (e?.message === 'JUGADOR_YA_EXISTE') {
      aviso.innerHTML = `<div class="al"><div class="tx">Ese nombre ya existe en el club. Cerrá y volvé a abrir para ver la opción de sumarlo a esta categoría.</div></div>`;
    } else {
      aviso.innerHTML = `<div class="al"><div class="tx">${textoDeError(e, 'No se pudo agregar el jugador.')}</div></div>`;
    }
    boton.disabled = false;
    boton.textContent = `Agregar a ${plantel.categoria}`;
    return;
  }

  cerrarHoja();
  toast(`${nombreLimpio} agregado a ${plantel.categoria}`);
  await ir('p-plantel');
}

function mostrarOfertaDeSumar(jugador) {
  const plantel = obtenerPlantelActivo();
  const boton = $('btn-alta-confirmar');
  boton.style.display = 'none';
  $('alta-aviso').innerHTML = `
    <div class="al ok">
      <div class="tx">
        <b>${escaparHtml(jugador.nombreLimpio)}</b> ya está cargado en el club, en otra categoría.
        <div class="mt">Se lo suma también a ${escaparHtml(plantel.categoria)}, sin crear un perfil nuevo.</div>
      </div>
    </div>
    <button class="btn" id="btn-sumar-categoria">Sumarlo a ${escaparHtml(plantel.categoria)}</button>
  `;
  $('btn-sumar-categoria').addEventListener('click', async () => {
    const b = $('btn-sumar-categoria');
    b.disabled = true;
    b.textContent = 'Sumando...';
    try {
      // Una sola fila: llamada simple, no necesita RPC (spec, Decisión 4).
      await crearPertenencia({
        clubId: obtenerClubActual().id,
        jugadorId: jugador.id,
        plantelId: plantel.id,
        temporadaId: plantel.temporadaId,
        desde: hoyLocal(),
      });
    } catch (e) {
      $('alta-aviso').insertAdjacentHTML('beforeend', `<div class="al"><div class="tx">${textoDeError(e, 'No se pudo sumar a la categoría.')}</div></div>`);
      b.disabled = false;
      b.textContent = `Sumarlo a ${plantel.categoria}`;
      return;
    }
    cerrarHoja();
    toast(`${jugador.nombreLimpio} sumado a ${plantel.categoria}`);
    await ir('p-plantel');
  });
}
