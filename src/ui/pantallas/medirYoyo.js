import { obtenerJugadoresDelPlantel, guardarSesionMedicion } from '../../data/repositorio.js';
import { prepararPayloadYoyo } from '../../data/prepararPayloadMedicion.js';
import {
  TABLA_YYET1, cronograma, posicionEn, segundosAlPitido, metrosDe, nivelYIda, validarIdas,
} from '../../data/yoyo.js';
import { obtenerClubActual, obtenerPlantelActivo, obtenerCuenta } from '../sesion.js';
import { toast, formatearFechaCorta } from '../nav.js';
import { claveBorrador, guardarBorrador, leerBorrador, borrarBorrador } from '../borradorMedicion.js';
import { ir } from '../main.js';
import { $ } from '../dom.js';
import { html } from '../html.js';
import { avisoDeError, mensajeAlGuardar } from '../errores.js';
import { abrirHoja, cerrarHoja } from '../componentes/hoja.js';
import { crearPitidosYoyo, CUENTA_S } from '../componentes/pitidosYoyo.js';
import { botonProtocolo } from '../componentes/protocoloYoyo.js';

const contenedor = () => $('yoyo-contenido');

const TIEMPO_TOTAL_S = cronograma().at(-1).t;
const miles = new Intl.NumberFormat('es-AR');

let jugadores = [];
// 'preparar' (quién corre) → 'curso' (los pitidos) → 'resumen' (corregir y guardar)
let fase = 'preparar';
let fecha = null;
// Se genera con el borrador y se reutiliza en cada reintento: la RPC lo usa
// para no duplicar la sesión (ver medirBateria.js).
let sesionId = null;
let corren = new Set();
// Resultado por jugador: { ausente: true } | { idas: n }. Lo que se guarda.
let valores = {};
// Sólo durante la prueba: { [jugadorId]: { estado: 'activo' | 'aviso' | 'out', idas } }.
let estados = {};
let pila = [];
let pitidos = null;
let cuadro = null;

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clave() {
  return claveBorrador(obtenerCuenta()?.id, obtenerClubActual().id, obtenerPlantelActivo().id, 'yoyo');
}

function persistir() {
  guardarBorrador(clave(), { fecha, valores, sesionId });
}

const nombreDe = (id) => jugadores.find((j) => j.id === id)?.nombreLimpio ?? '';

/* ---------- 1. preparar: quién corre ---------- */

function renderPreparar() {
  contenedor().innerHTML = html`
    <div class="pad">
      <div class="eyebrow">Yo-Yo · ${formatearFechaCorta(fecha)}</div>
      <div class="campo">
        <label for="yoyo-fecha">Fecha</label>
        <input type="date" id="yoyo-fecha" value="${fecha}" max="${hoyLocal()}">
      </div>
      <div class="salto-acciones" id="yoyo-protocolo"></div>
      <div class="eyebrow">Quién corre <span class="der mono" id="yoyo-cuantos">${corren.size} de ${jugadores.length}</span></div>
      <div class="p">Los que no marques quedan como ausentes. Mejor de 8 a 10 por tanda, para poder mirarlos a todos.</div>
      <div class="lista-2col">
        ${jugadores.map((j) => html`
          <button type="button" class="yoyo-elegir" data-elegir="${j.id}" aria-pressed="${corren.has(j.id) ? 'true' : 'false'}">
            <span class="nom">${j.nombreLimpio}</span>
            <span class="chip ${corren.has(j.id) ? 'sube' : 'sin'}">${corren.has(j.id) ? 'Corre' : 'No corre'}</span>
          </button>
        `)}
      </div>
      <div id="yoyo-aviso"></div>
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-yoyo-empezar" ${corren.size ? '' : 'disabled'}>Empezar</button></div>
  `;
  $('yoyo-protocolo').prepend(botonProtocolo());
  $('yoyo-fecha').addEventListener('change', (e) => {
    if (e.target.value) fecha = e.target.value;
    renderPreparar();
  });
  contenedor().querySelectorAll('[data-elegir]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.elegir;
      if (corren.has(id)) corren.delete(id);
      else corren.add(id);
      renderPreparar();
    });
  });
  $('btn-yoyo-empezar').addEventListener('click', empezar);
}

/* ---------- 2. en curso: los pitidos y los toques ---------- */

function empezar() {
  estados = Object.fromEntries([...corren].map((id) => [id, { estado: 'activo', idas: null }]));
  pila = [];
  pitidos = crearPitidosYoyo({
    alAviso: (texto) => {
      const aviso = $('yoyo-aviso');
      if (aviso) aviso.innerHTML = html`<div class="al"><div class="tx">${texto}</div></div>`;
    },
  });
  // El toque de Empezar es el gesto que habilita el audio.
  if (!pitidos.empezar()) {
    $('yoyo-aviso').innerHTML = html`<div class="al"><div class="tx">Este celular no puede reproducir los pitidos. Probá con otro navegador.</div></div>`;
    pitidos = null;
    return;
  }
  fase = 'curso';
  renderCurso();
  animar();
}

function claseYEtiqueta(id) {
  const { estado, idas } = estados[id];
  if (estado === 'aviso') return { clase: 'aviso', etiqueta: '1º aviso' };
  if (estado === 'out') return { clase: 'out', etiqueta: `Afuera · ${nivelYIda(idas)}` };
  return { clase: '', etiqueta: 'Corriendo' };
}

function tarjetaCorredor(id) {
  const { clase, etiqueta } = claseYEtiqueta(id);
  const enAviso = estados[id].estado === 'aviso';
  return html`
    <div class="yoyo-jug ${clase}">
      <button type="button" class="yoyo-toque" data-toque="${id}" ${estados[id].estado === 'out' ? 'disabled' : ''}>
        <span class="nom">${nombreDe(id)}</span>
        <span class="etq">${etiqueta}</span>
      </button>
      ${enAviso && html`<button type="button" class="btn sec chico" data-llego="${id}">Llegó</button>`}
    </div>
  `;
}

function pintarGrilla() {
  $('yoyo-grilla').innerHTML = html`${[...corren].map(tarjetaCorredor)}`.toString();
  $('yoyo-grilla').querySelectorAll('[data-toque]').forEach((b) => b.addEventListener('click', () => tocar(b.dataset.toque)));
  $('yoyo-grilla').querySelectorAll('[data-llego]').forEach((b) => b.addEventListener('click', () => llego(b.dataset.llego)));
  const quedan = Object.values(estados).filter((e) => e.estado !== 'out').length;
  $('yoyo-activos').textContent = `${quedan} ${quedan === 1 ? 'activo' : 'activos'}`;
  $('btn-yoyo-deshacer').disabled = !pila.length;
}

function renderCurso() {
  contenedor().innerHTML = html`
    <div class="pad">
      <div class="yoyo-cab">
        <div class="yoyo-nivel" data-y="nivel" role="timer">Empieza en ${CUENTA_S}</div>
        <div class="yoyo-datos">
          <span class="mono" data-y="vel"></span>
          <span class="mono" data-y="bip"></span>
        </div>
      </div>
      <div class="p">Tocá a un jugador cuando no llegue a la línea con el pitido: la primera vez es un aviso, la segunda lo saca. <span class="mono" id="yoyo-activos"></span></div>
      <div id="yoyo-aviso"></div>
      <div class="yoyo-grilla" id="yoyo-grilla"></div>
    </div>
    <div class="pie-fijo yoyo-pie">
      <button class="btn sec" id="btn-yoyo-deshacer" disabled>Deshacer</button>
      <button class="btn" id="btn-yoyo-terminar">Terminar test</button>
    </div>
  `;
  pintarGrilla();
  $('btn-yoyo-deshacer').addEventListener('click', deshacer);
  $('btn-yoyo-terminar').addEventListener('click', terminar);
}

function tocar(id) {
  const t = pitidos?.tiempoActual();
  // Durante la cuenta todavía no hay idas: no hay nada que anotar.
  if (t == null || t < 0) return;
  const antes = { ...estados[id] };
  if (antes.estado === 'activo') estados[id] = { estado: 'aviso', idas: null };
  else if (antes.estado === 'aviso') estados[id] = { estado: 'out', idas: posicionEn(t).idasCompletas };
  else return;
  pila.push({ id, antes });
  pintarGrilla();
  if (Object.values(estados).every((e) => e.estado === 'out')) terminar();
}

function llego(id) {
  pila.push({ id, antes: { ...estados[id] } });
  estados[id] = { estado: 'activo', idas: null };
  pintarGrilla();
}

function deshacer() {
  const ultimo = pila.pop();
  if (!ultimo) return;
  estados[ultimo.id] = ultimo.antes;
  pintarGrilla();
}

function animar() {
  const t = pitidos?.tiempoActual();
  if (t == null || fase !== 'curso') return;
  const nivel = document.querySelector('[data-y="nivel"]');
  // Si el profe salió de la pantalla (la sección queda oculta, no borrada), los
  // pitidos no pueden seguir sonando solos.
  if (!nivel || contenedor().offsetParent === null) {
    pitidos?.detener();
    pitidos = null;
    cuadro = null;
    return;
  }
  if (t < 0) {
    nivel.textContent = `Empieza en ${Math.ceil(-t)}`;
  } else {
    const p = posicionEn(t);
    const al = segundosAlPitido(t);
    nivel.textContent = `Nivel ${p.nivel} · Ida ${p.ida}`;
    document.querySelector('[data-y="vel"]').textContent = `${String(TABLA_YYET1[p.nivel - 1].kmh).replace('.', ',')} km/h`;
    document.querySelector('[data-y="bip"]').textContent = al == null ? '' : `Pitido en ${al.toFixed(1).replace('.', ',')} s`;
    if (t > TIEMPO_TOTAL_S) {
      terminar();
      return;
    }
  }
  cuadro = requestAnimationFrame(animar);
}

function terminar() {
  if (cuadro) cancelAnimationFrame(cuadro);
  cuadro = null;
  const t = pitidos?.tiempoActual() ?? null;
  pitidos?.detener();
  pitidos = null;
  if (t == null || t < 0) {
    // Cancelado durante la cuenta: no se corrió nada.
    fase = 'preparar';
    renderPreparar();
    return;
  }
  const idasAlFinal = posicionEn(t).idasCompletas;
  valores = {};
  for (const j of jugadores) {
    if (!corren.has(j.id)) valores[j.id] = { ausente: true };
    else valores[j.id] = { idas: estados[j.id].estado === 'out' ? estados[j.id].idas : idasAlFinal };
  }
  persistir();
  fase = 'resumen';
  renderResumen();
}

/* ---------- 3. resumen: corregir y guardar ---------- */

function filaResumen(j) {
  const v = valores[j.id];
  if (v?.ausente) {
    return html`
      <div class="tarj yoyo-res ausente">
        <div class="sprint-cab"><div class="nom">${j.nombreLimpio}</div><span class="chip sin">No corrió</span></div>
        <button type="button" class="btn sec chico" data-corregir="${j.id}">Corregir</button>
      </div>
    `;
  }
  return html`
    <div class="tarj yoyo-res">
      <div class="sprint-cab"><div class="nom">${j.nombreLimpio}</div><button type="button" class="btn sec chico" data-corregir="${j.id}">Corregir</button></div>
      <div class="yoyo-res-datos">
        <div><span class="etq">Nivel</span><span class="cifra-clave chica">${nivelYIda(v.idas)}</span></div>
        <div><span class="etq">Distancia total</span><span class="cifra-clave chica">${miles.format(metrosDe(v.idas))}<span class="u">m</span></span></div>
      </div>
    </div>
  `;
}

function renderResumen() {
  const ordenados = [...jugadores].sort((a, b) => (valores[b.id]?.idas ?? -1) - (valores[a.id]?.idas ?? -1)
    || a.nombreLimpio.localeCompare(b.nombreLimpio));
  contenedor().innerHTML = html`
    <div class="pad">
      <div class="eyebrow">Resumen Yo-Yo · ${formatearFechaCorta(fecha)}</div>
      <div class="p">Revisá los resultados y corregí lo que haga falta antes de guardar.</div>
      ${ordenados.map(filaResumen)}
      <div id="yoyo-aviso"></div>
      <button type="button" class="btn sec chico" id="btn-yoyo-repetir">Repetir la prueba</button>
    </div>
    <div class="pie-fijo"><button class="btn" id="btn-guardar-yoyo">Guardar la sesión</button></div>
  `;
  contenedor().querySelectorAll('[data-corregir]').forEach((b) => b.addEventListener('click', () => corregir(b.dataset.corregir)));
  $('btn-yoyo-repetir').addEventListener('click', () => {
    if (!window.confirm('Se descartan estos resultados y se vuelve a empezar. ¿Seguro?')) return;
    borrarBorrador(clave());
    valores = {};
    fase = 'preparar';
    renderPreparar();
  });
  $('btn-guardar-yoyo').addEventListener('click', guardarSesion);
}

/** Hoja para corregir las idas de un jugador, o marcarlo ausente. */
function corregir(id) {
  const actual = valores[id]?.idas ?? null;
  abrirHoja({
    titulo: nombreDe(id),
    cuerpo: html`
      <div class="campo">
        <label for="yoyo-idas">Idas completas</label>
        <input id="yoyo-idas" inputmode="numeric" autocomplete="off" maxlength="3" value="${actual ?? ''}">
        <div class="ayuda">Cada ida son 20 m. De 0 a 223.</div>
      </div>
      <div id="yoyo-idas-error" role="alert"></div>
      <div class="acciones-bateria">
        <button type="button" class="btn sec" id="yoyo-idas-ausente">No corrió</button>
        <button type="button" class="btn" id="yoyo-idas-ok">Guardar</button>
      </div>
    `.toString(),
  });
  const campo = $('yoyo-idas');
  const aceptar = () => {
    const r = validarIdas(campo.value);
    if (!r.ok) {
      $('yoyo-idas-error').innerHTML = html`<div class="al"><div class="tx">${r.error}</div></div>`;
      return;
    }
    valores[id] = { idas: r.idas };
    cerrarHoja();
    persistir();
    renderResumen();
  };
  $('yoyo-idas-ok').addEventListener('click', aceptar);
  campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') aceptar(); });
  $('yoyo-idas-ausente').addEventListener('click', () => {
    valores[id] = { ausente: true };
    cerrarHoja();
    persistir();
    renderResumen();
  });
}

async function guardarSesion() {
  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  const boton = $('btn-guardar-yoyo');
  if (boton.disabled) return;

  const payload = prepararPayloadYoyo({
    sesionId, clubId: club.id, plantelId: plantel.id, fecha, valores,
  });
  if (!payload.mediciones.length) {
    $('yoyo-aviso').innerHTML = html`<div class="al"><div class="tx">Todavía no hay ningún resultado.</div></div>`;
    return;
  }

  // La clave se captura antes del await: si el profe cambia de categoría con
  // la llamada en vuelo, no se borra el borrador equivocado.
  const claveDeEstaSesion = clave();
  boton.disabled = true;
  boton.textContent = 'Guardando...';
  try {
    await guardarSesionMedicion(payload);
  } catch (err) {
    $('yoyo-aviso').innerHTML = html`<div class="al"><div class="tx">${mensajeAlGuardar(err, { generico: 'No se pudo guardar la sesión. Quedó en el celular para reintentar.' })}</div></div>`;
    boton.disabled = false;
    boton.textContent = 'Guardar la sesión';
    return;
  }
  borrarBorrador(claveDeEstaSesion);
  toast('Sesión guardada');
  await ir('p-medir');
}

export async function renderYoyo() {
  // Si se vuelve a la pantalla con una prueba en curso, se corta: los pitidos
  // no se pueden retomar a mitad.
  if (cuadro) cancelAnimationFrame(cuadro);
  cuadro = null;
  pitidos?.detener();
  pitidos = null;

  const club = obtenerClubActual();
  const plantel = obtenerPlantelActivo();
  if (!club || !plantel) {
    contenedor().innerHTML = html`<div class="pad"><div class="p">No hay una categoría seleccionada.</div></div>`;
    return;
  }
  contenedor().innerHTML = html`<div class="pad"><div class="p">Cargando plantel...</div></div>`;
  try {
    jugadores = await obtenerJugadoresDelPlantel(club.id, plantel.id);
  } catch (e) {
    contenedor().innerHTML = avisoDeError(e, 'No se pudo cargar el plantel.');
    return;
  }
  jugadores.sort((a, b) => a.nombreLimpio.localeCompare(b.nombreLimpio));
  if (!jugadores.length) {
    contenedor().innerHTML = html`<div class="pad"><div class="estado-vacio"><h2>${plantel.categoria} no tiene jugadores</h2><div class="p">Cargá el plantel antes de medir.</div></div></div>`;
    return;
  }
  const borrador = leerBorrador(clave());
  fecha = borrador?.fecha ?? hoyLocal();
  valores = borrador?.valores ?? {};
  sesionId = borrador?.sesionId ?? crypto.randomUUID();
  corren = new Set(jugadores.filter((j) => !valores[j.id]?.ausente).map((j) => j.id));
  // Un borrador es siempre una prueba terminada y sin guardar: se sigue en el resumen.
  fase = Object.keys(valores).length ? 'resumen' : 'preparar';
  if (fase === 'resumen') renderResumen();
  else renderPreparar();
}
