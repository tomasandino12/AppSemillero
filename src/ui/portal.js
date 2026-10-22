import { html } from './html.js';
import { $ } from './dom.js';
import { eventosDelMes } from '../data/repositorio.js';
import {
  PORTAL, enlaceFormulario, enlaceContacto, sponsorsValidos, calendariosActivos, categoriasDelPortal,
  categoriasDelAnio, categoriasConDetalle, sedeValida, paginaDeAncla, aliasValido, fotoValida,
} from '../data/portal.js';
import { temporadaComoAnio } from '../data/categorias.js';
import { accionesPrincipales } from '../data/formulariosPortal.js';
import {
  eventosPorDia, proximosEventos, semanasDelMes, mesVecino, hoyEnRosario, tituloMes, fechaLarga,
  TIPOS_AGENDA, NOMBRE_TIPO, enlaceAgregarGoogle, textoIcs, enlacesSuscripcion, partesDeFecha, cuandoEs,
} from '../data/agenda.js';
import { destinoDeAuth } from '../data/entradaAuth.js';
import { iniciarMarco, esconderBarraMientrasSeVea } from './portalMarco.js';
import { iniciarUltimasNoticias } from './portalNoticias.js';
import { heroVideoValido } from '../data/heroVideo.js';
import { htmlFondoHero, iniciarVideoHero } from './portalHeroVideo.js';

/*
 * Portal "Básquet Newell's": la página pública que se reparte a las familias
 * (public/portal.html). Quien más la usa es un padre que entra a hacer en cinco
 * minutos lo que le dijeron: inscribir o mandar un comprobante. Por eso esas
 * dos acciones son las protagonistas de la banda de arriba, con el alias para
 * copiar a mano; lo demás va más abajo, y el coordinador aparece UNA vez, al
 * final de las preguntas frecuentes.
 *
 * De la base lee sólo la lista de formularios activos, por la función anónima
 * formularios_publicos (0058): nada de jugadores ni de familias, que están del
 * otro lado del login, en /app. Los eventos los pide a Google Calendar; el
 * resto sale de src/data/portal.js.
 */

const ABRE = '↗';

/** Los íconos de los atajos y de las acciones: trazos simples en currentColor, decorativos. */
const ICONO = {
  jugar: html`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18"/></svg>`,
  comprobante: html`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/></svg>`,
  inscribir: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 14h6M9 17h4"/></svg>`,
  empresa: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>`,
  lugar: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`,
  mano: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L4.3 14a1.5 1.5 0 0 1 2.4-1.8L8 14"/></svg>`,
};

const botonExterno = (url, texto, clase = 'btn') => html`<a class="${clase}" href="${url}" target="_blank" rel="noopener">${texto} <span aria-hidden="true">${ABRE}</span></a>`;

/**
 * El botón de algo cuyo formulario todavía no está activo: se ve, pero no se
 * toca, y dice cuándo se habilita. Así nunca falta el botón ni hay uno que no
 * lleva a ningún lado. `aria-disabled` además de `disabled` para que el lector
 * de pantalla lo anuncie.
 */
const botonCerrado = (texto, clase = 'btn') => html`<button type="button" class="${clase}" disabled aria-disabled="true">${texto}</button>`;

const abierto = (f) => Boolean(f && enlaceFormulario(f.enlace));

/**
 * Una de las dos tarjetas de arriba: ícono, título y una línea; toda la
 * tarjeta es el botón. Sin formulario activo se ve igual de maciza, con la
 * línea que dice cuándo se habilita y un "Pronto" en lugar de la flecha.
 */
function accion({ clase, icono, titulo, detalle, url, cerrado }) {
  const cuerpo = html`<i>${ICONO[icono]}</i><span><b>${titulo}</b><small>${url ? detalle : cerrado}</small></span>`;
  if (!url) return html`<div class="portal-accion ${clase} apagada" aria-disabled="true">${cuerpo}<em>Pronto</em></div>`;
  return html`<a class="portal-accion ${clase}" href="${url}" target="_blank" rel="noopener">${cuerpo}<em aria-hidden="true">${ABRE}</em></a>`;
}

/**
 * El hero: el título de la página y,
 * abajo, las dos acciones protagonistas. La primera es "Inscribir a mi hijo
 * o hija" si el formulario de inscripción está activo (destino inscripcion,
 * 0062) y, si no, "Quiero jugar en Newell's" (destino consultas, 0061). La
 * segunda, "Enviar comprobante" (destino comprobante), con el alias pegado
 * abajo. Son independientes: alguien se puede inscribir sin pagar nada.
 */
export function htmlHeroe({ inscripcion = null, consultas = null, comprobante = null, temporada = null, alias = null } = {}) {
  const { primera: p, comprobante: c } = accionesPrincipales({ inscripcion, consultas, comprobante });
  const primera = p.tipo === 'inscribir'
    ? accion({ clase: 'principal', icono: 'inscribir', titulo: 'Inscribir a mi hijo o hija', url: p.url, detalle: `Inscripción${temporada ? ` ${temporada}` : ''} abierta: formulario de Google` })
    : accion({ clase: 'principal', icono: 'jugar', titulo: 'Quiero jugar en Newell\'s', url: p.url,
      detalle: 'Dejá tus datos y te contactamos para venir a probar', cerrado: 'Se habilita cuando abra el formulario' });
  return html`<div class="portal-heroe-ey">Formativas · Rosario${temporada ? html` · Temporada ${temporada}` : ''}</div>
    <h1><span>Básquet</span> <em>formativo</em> <span>de Newell's</span></h1>
    <p class="portal-heroe-bajada">Inscripción, pagos, calendario y todo lo del básquet del club, en un solo lugar.</p>
    <div class="portal-acciones">
      ${primera}
      <div class="portal-pago">
        ${accion({ clase: 'pago', icono: 'comprobante', titulo: 'Enviar comprobante', url: c.url,
          detalle: 'Subí la foto de la transferencia', cerrado: 'Se habilita cuando haya algo para pagar' })}
        ${htmlAlias(alias)}
      </div>
    </div>`;
}

/** El alias para transferir, con un botón para copiarlo. Sin un alias válido, nada. */
export function htmlAlias(alias) {
  const a = aliasValido(alias);
  if (!a) return html``;
  return html`<div class="portal-alias">
    <div><small>Alias para transferir</small><b>${a.alias}</b>${a.titular && html`<span>${a.titular}</span>`}</div>
    <button type="button" class="portal-copiar" data-copiar="${a.alias}">Copiar</button>
  </div>`;
}

/** Si la base no respondió se muestra una copia: mejor eso que nada, pero que se note. */
export function htmlAvisoRespaldo() {
  return html`<p class="portal-aviso">No pudimos actualizar la lista de formularios; te mostramos la última que conocemos.</p>`;
}

/**
 * La banda roja de debajo del calendario: el aviso por mail de los eventos de
 * recaudación del club. Es el formulario con destino recaudacion (0063), aparte
 * del de colaborar: quien quiere comprar una pizza no es una empresa que quiere
 * asociarse. Su planilla de respuestas vive en Google. Los partidos y charlas
 * no van por mail: para eso está el "Seguilo" del calendario.
 */
export function htmlRecaudacion(formulario) {
  const url = formulario ? enlaceFormulario(formulario.enlace) : null;
  return html`<img class="portal-banda-escudo" src="/public/escudo.png" alt="" width="44" height="44">
    <h2 id="t-recaudacion">Enterate de los eventos de recaudación del club</h2>
    <div class="portal-banda-ej">Pizzas, rifas, comidas…</div>
    <p>Dejanos tu mail y te avisamos cuando haya uno.</p>
    ${url ? botonExterno(url, 'Quiero que me avisen', 'portal-banda-btn') : botonCerrado('Se habilita cuando abra el formulario', 'portal-banda-btn')}`;
}

/**
 * "Sumate al básquet de Newell's": el formulario con destino colaboradores
 * (0061). Es para dos cosas: una empresa o comercio que quiere asociarse con
 * el básquet, o alguien que quiere dar una mano en los eventos. Lo que deja
 * queda en la planilla de Google de "Quiero colaborar", no en Semillero.
 */
export function htmlColaborar(formulario) {
  const url = formulario ? enlaceFormulario(formulario.enlace) : null;
  return html`<ul class="portal-formas">
      <li><i>${ICONO.empresa}</i><span><b>Tengo una empresa o un comercio</b>Asociate con el básquet de Newell's y acompañá a las formativas.</span></li>
      <li><i>${ICONO.mano}</i><span><b>Quiero dar una mano</b>En los eventos del club: hacer el pollo, armar, servir, ayudar a organizar.</span></li>
    </ul>
    ${url ? botonExterno(url, 'Quiero colaborar') : botonCerrado('Se habilita cuando abra el formulario')}`;
}

/** La franja de logos de sponsors. Sin ninguno válido no devuelve nada. */
export function htmlLogos(sponsors) {
  const lista = sponsorsValidos(sponsors);
  if (!lista.length) return html``;
  return html`<ul class="portal-logos-lista">${lista.map((s) => {
    const imagen = html`<img src="${s.logo}" alt="${s.nombre}" loading="lazy">`;
    return html`<li>${s.enlace ? html`<a href="${s.enlace}" target="_blank" rel="noopener">${imagen}</a>` : imagen}</li>`;
  })}</ul>`;
}

/**
 * Los otros formularios (sin destino): una tarjeta por formulario, con su
 * línea de para qué es y qué tener a mano. Uno con un enlace que no es de
 * Google Forms no se muestra. Sin ninguno, nada: la sección se oculta.
 */
export function htmlFormularios(formularios) {
  const validos = (formularios ?? []).filter((f) => enlaceFormulario(f.enlace));
  return html`${validos.map(({ titulo, texto, enlace }) => html`<div class="portal-tarjeta">
    <div class="t">${titulo}</div>
    <div class="d">${texto}</div>
    ${botonExterno(enlaceFormulario(enlace), 'Abrir el formulario')}
  </div>`)}`;
}

/** El selector de año del "¿En qué categoría juega?": − y + alrededor del año, y el lugar del resultado al lado. */
export function htmlBuscador(anio, { min, max }) {
  return html`<div class="portal-anio-caja">
      <span class="portal-anio-et" id="portal-anio-et">Año de nacimiento</span>
      <div class="portal-anio" role="group" aria-labelledby="portal-anio-et">
        <button type="button" data-anio="-1" aria-label="Un año antes"${anio <= min && html` disabled`}>−</button>
        <output id="portal-anio">${anio}</output>
        <button type="button" data-anio="1" aria-label="Un año después"${anio >= max && html` disabled`}>+</button>
      </div>
    </div>
    <div class="portal-cat-resultado" id="portal-cat-res" aria-live="polite"></div>`;
}

/**
 * Lo que le toca a quien nació en `anio`: la categoría, sus años y su
 * horario. Puede ser más de una (las dos Primeras). Sin ninguna (más chico
 * que la U9), lo dice y manda a las preguntas frecuentes.
 */
export function htmlCategoriaDelAnio(anio, categorias) {
  if (!categorias.length) {
    return html`<p class="portal-cat-nada">Para chicos nacidos en ${anio} todavía no hay categoría. <a href="/ayuda">¿Dudas? Mirá las preguntas frecuentes</a>.</p>`;
  }
  return html`${categorias.map(({ nombre, rama, anios, horario, href }) => html`<div class="portal-cat-res">
    <div class="portal-cat-nombre"><b>${nombre}</b>${rama && html`<span>${rama}</span>`}<small>Nacidos ${anios}</small></div>
    ${horario
      ? html`<ul class="portal-cat-hora">${horario.split(' · ').map((h) => html`<li>${h}</li>`)}</ul>`
      : html`<p class="portal-cat-sin">Horario a confirmar.</p>`}
    ${href && html`<a class="portal-cat-ir" href="${href}">Ver horarios y sede de ${nombre}</a>`}
  </div>`)}`;
}

/** Los atajos a cada categoría de /categorias. Con menos de dos no vale la fila. */
export function htmlIndiceCategorias(categorias) {
  if (categorias.length < 2) return html``;
  return html`${categorias.map((c) => html`<a href="#${c.ancla}">${c.rotulo}</a>`)}`;
}

/**
 * Una categoría entera en /categorias: años, cada horario (día, hora y lugar,
 * como los pasó el club) y la sede. Sin horario, "a confirmar": nunca uno
 * inventado. El detalle, sólo si el club lo pasó.
 */
export function htmlCategoriaDetalle({ rotulo, rama, anios, horario, detalle, ancla }, sede) {
  const s = sedeValida(sede);
  return html`<section class="portal-cat-sec" id="${ancla}" aria-labelledby="t-${ancla}">
    ${rama && html`<div class="portal-st">${rama}</div>`}
    <h2 id="t-${ancla}">${rotulo}</h2>
    <dl class="portal-cat-datos">
      <div><dt>Nacidos</dt><dd>${anios}</dd></div>
      <div><dt>Entrenamientos</dt><dd>${horario
        ? html`<ul>${horario.split(' · ').map((h) => html`<li>${h}</li>`)}</ul>`
        : html`<span class="portal-cat-confirmar">Horario a confirmar.</span>`}</dd></div>
      ${s && html`<div><dt>Dónde</dt><dd>${s.nombre}${s.mapa && html` · <a href="${s.mapa}" target="_blank" rel="noopener">Cómo llegar</a>`}</dd></div>`}
    </dl>
    ${detalle && html`<p class="portal-cat-detalle">${detalle}</p>`}
  </section>`;
}

/**
 * Las preguntas frecuentes, en acordeón: lo que un padre pregunta antes de
 * escribirle al coordinador. Las respuestas cambian con lo que hay abierto
 * (inscripción, "Quiero jugar") para no mandar a un botón apagado. Al final,
 * la ÚNICA vez que aparece el WhatsApp del coordinador en la página.
 */
export function htmlAyuda({ inscripcionAbierta = false, consultasAbierto = false, temporada = null, alias = null, sede = null, contacto = null } = {}) {
  const a = aliasValido(alias);
  const s = sedeValida(sede);
  const coordinador = enlaceContacto(contacto);
  const pregunta = (titulo, respuesta) => html`<details class="portal-faq"><summary>${titulo}</summary><div class="portal-faq-r">${respuesta}</div></details>`;
  const comoInscribir = inscripcionAbierta
    ? html`<p>Tocá <b>Inscribir a mi hijo o hija</b>: está arriba de todo en el inicio y en la barra de botones de cada página. Se abre un formulario de Google: completalo desde el celular. Tené a mano el DNI del chico o la chica y el tuyo.</p>`
    : html`<p>La inscripción${temporada ? html` ${temporada}` : ''} todavía no abrió. ${consultasAbierto
      ? html`Mientras tanto, tocá <b>Quiero jugar en Newell's</b> (en el inicio o en la barra de botones): dejás tus datos y te contactamos para que venga a probar.`
      : html`Cuando abra, el botón aparece en el inicio y en la barra de botones de cada página.`}</p>`;
  const alCoordinador = coordinador ? 'escribile al coordinador (el botón de acá abajo)' : 'escribile al coordinador';
  // Las preguntas van en la voz del padre y con sujeto: así las busca con la vista.
  return html`${pregunta('¿Cómo inscribo a mi hijo o hija?', comoInscribir)}
    ${pregunta('¿Cómo pago la cuota o mando el comprobante?', html`<p>${a ? html`Transferí al alias <b>${a.alias}</b> (con <b>Copiar</b>, en el inicio o acá abajo, lo pegás en tu banco). ` : ''}Después tocá <b>Enviar comprobante</b> y subí la foto o la captura de la transferencia. Si ese botón está apagado, es que ahora no hay nada para pagar.</p>`)}
    ${pregunta('Me pide iniciar sesión con Google, ¿qué hago?', html`<p>La inscripción y el comprobante la piden porque se suben fotos (los DNI, la transferencia). Si no tenés Gmail, creá una cuenta de Google con el mail que ya usás, sin abrir uno nuevo:</p>
      <ol class="portal-faq-pasos">
        <li>Entrá a <a href="https://accounts.google.com/signup" target="_blank" rel="noopener">accounts.google.com</a> y tocá <b>Crear cuenta</b> → <b>Para uso personal</b>.</li>
        <li>Tocá <b>Usar mi dirección de correo electrónico actual</b> y escribí tu mail de siempre.</li>
        <li>Pegá el código que te llega a ese mail y elegí una contraseña.</li>
      </ol>
      <p>Si no podés, ${alCoordinador} y te ayuda.</p>`)}
    ${pregunta('¿En qué categoría juega mi hijo o hija?', html`<p>Va por el año de nacimiento, como lo arma la CABB. En <a href="/categorias">¿En qué categoría juega?</a> elegís el año y te dice la categoría y los horarios.</p>`)}
    ${pregunta('Me equivoqué en un dato del formulario, ¿qué hago?', html`<p>Volvé a mandar el formulario con el dato bien: tomamos siempre el último que mandaste. Si te equivocaste en el DNI, ${alCoordinador.replace('escribile', 'avisale')}.</p>`)}
    ${pregunta('¿Dónde y cuándo entrena mi hijo o hija?', html`<p>Los días y los horarios dependen de la categoría: los ves en <a href="/categorias">¿En qué categoría juega?</a>.${s ? html` Se entrena en el <b>${s.nombre}</b>${s.direccion && html` (${s.direccion})`}.` : ''}</p>${s?.mapa && botonExterno(s.mapa, 'Cómo llegar', 'btn sec chico')}`)}
    ${coordinador && html`<div class="portal-faq-fin">
      <b>¿No encontraste tu respuesta?</b>
      <span>Escribile al coordinador y te ayuda.</span>
      ${botonExterno(coordinador, coordinador.startsWith('mailto:') ? 'Escribirle por mail' : 'Escribirle por WhatsApp')}
    </div>`}`;
}

/**
 * "Dónde se entrena": los lugares de los horarios, "Cómo llegar" y el mapa de
 * Google. El mapa NO se carga solo: hasta que la persona toca "Ver mapa" es un
 * cuadro propio, sin pedirle nada a Google (ni cookies) a quien no lo usa.
 */
export function htmlSede(sede) {
  const s = sedeValida(sede);
  if (!s) return html``;
  return html`<div class="portal-sede-txt">
      <p class="portal-sede-dir">Rosario. En cuál de los tres te toca lo dice el horario de tu categoría.</p>
      ${s.lugares.length > 0 && html`<ul class="portal-sede-lugares">${s.lugares.map((l) => html`<li>${l}</li>`)}</ul>`}
      ${s.mapa && botonExterno(s.mapa, 'Cómo llegar', 'btn sec chico')}
    </div>
    ${s.embed && html`<div class="portal-mapa" data-embed="${s.embed}" data-titulo="Mapa: ${s.nombre}">
      <button type="button" class="portal-mapa-ver"><i aria-hidden="true">${ICONO.lugar}</i><b>Ver mapa</b><small>Se abre el mapa de Google</small></button>
    </div>`}`;
}

/** Arma el iframe del mapa recién cuando la persona toca "Ver mapa". */
function iniciarMapa() {
  document.addEventListener('click', (ev) => {
    const caja = ev.target.closest('.portal-mapa-ver')?.parentElement;
    if (!caja) return;
    const iframe = document.createElement('iframe');
    iframe.src = caja.dataset.embed;
    iframe.title = caja.dataset.titulo;
    iframe.referrerPolicy = 'no-referrer';
    caja.replaceChildren(iframe);
    caja.classList.add('abierto');
  });
}

/**
 * La sede y el alias, abajo de las preguntas frecuentes de /ayuda. El
 * coordinador NO va acá: sale una sola vez, al final de htmlAyuda.
 */
export function htmlContacto({ sede = null, alias = null } = {}) {
  const s = sedeValida(sede);
  const a = htmlAlias(alias);
  if (!s && !a.toString()) return html``;
  return html`${s && html`<div class="portal-contacto-sede">
      <div class="portal-st">Dónde se entrena</div>
      <b>${s.nombre}</b>${s.direccion && html`<p>${s.direccion}</p>`}
      ${s.mapa && botonExterno(s.mapa, 'Cómo llegar', 'btn sec chico')}
    </div>`}${a}`;
}

export function htmlFoto(foto) {
  const f = fotoValida(foto);
  if (!f) return html``;
  return html`<figure class="portal-foto"><img src="${f.src}" alt="${f.alt}" loading="lazy">${f.epigrafe && html`<figcaption>${f.epigrafe}</figcaption>`}</figure>`;
}

/* ---------- Calendario ---------- */

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** La clave con la que el botón "iPhone" encuentra su evento: un torneo de varios días es uno solo. */
export const claveEvento = (e) => `${e.id}|${e.dia}`;

/**
 * Un evento de la lista, con "Agregar a mi calendario": Google abre el evento
 * armado (Android, compu); el botón del iPhone baja un .ics que el calendario
 * del celular ofrece agregar. `fecha`: para la lista de lo que viene.
 */
export function htmlEvento(e, fecha = null) {
  const cuando = e.hora ? `${e.hora} a ${e.horaFin}` : 'Todo el día';
  return html`<li class="portal-ev tipo-${e.tipo}">
    <small>${fecha ? fechaLarga(fecha) : NOMBRE_TIPO[e.tipo]} · ${cuando}</small>
    <b>${e.titulo}</b>${e.lugar && html`<span>${e.lugar}</span>`}
    <div class="portal-ev-agregar">Agregar a mi calendario:
      <a href="${enlaceAgregarGoogle(e)}" target="_blank" rel="noopener">Google</a>
      <button type="button" data-ics="${claveEvento(e)}">iPhone</button>
    </div>
  </li>`;
}

const UN_TIPO = { partido: 'Partido', evento: 'Evento', charla: 'Charla', entrenamiento: 'Entrenamiento' };

/**
 * "Lo que viene": el próximo evento, arriba del mes, como un tablero (fecha
 * grande, el color del tipo en el filete). Sin ninguno por delante, nada.
 * `proximo`: { fecha, evento } de proximosEventos.
 */
export function htmlProximo(proximo, hoy) {
  if (!proximo) return html``;
  const { fecha, evento: e } = proximo;
  const f = partesDeFecha(fecha);
  const cuando = cuandoEs(fecha, hoy);
  return html`<div class="portal-prox tipo-${e.tipo}">
    <div class="portal-prox-cab"><span>Lo que viene</span>${cuando && html`<b>${cuando}</b>`}</div>
    <div class="portal-prox-ev">
      <div class="portal-prox-fecha" aria-label="${fechaLarga(fecha)}"><small>${f.semana}</small><b>${f.dia}</b><small>${f.mes}</small></div>
      <div>
        <span class="portal-prox-tipo">${UN_TIPO[e.tipo]}</span>
        <div class="portal-prox-t">${e.titulo}</div>
        <div class="portal-prox-h">${e.hora ? `${e.hora} a ${e.horaFin}` : 'Todo el día'}${e.lugar && html` · ${e.lugar}`}</div>
        <div class="portal-ev-agregar">Agendar:
          <a href="${enlaceAgregarGoogle(e)}" target="_blank" rel="noopener">Google</a>
          <button type="button" data-ics="${claveEvento(e)}">iPhone</button>
        </div>
      </div>
    </div>
  </div>`;
}

/** Para tener el calendario entero en el celular, una vez, y que los eventos nuevos aparezcan solos. */
export function htmlSuscripcion(calendarios) {
  const enlaces = calendarios.map((c) => enlacesSuscripcion(c.id)).filter(Boolean);
  if (!enlaces.length) return html``;
  return html`<div class="portal-seguir">
    <b>¿Querés tener todo el calendario en tu celular?</b>
    <span>Seguilo una vez y los partidos y eventos nuevos te aparecen solos.</span>
    ${enlaces.map(({ google, ical }) => html`<div class="portal-seguir-bot">
      <a class="btn sec" href="${google}" target="_blank" rel="noopener">Android o compu</a>
      <a class="btn sec" href="${ical}">iPhone</a>
    </div>`)}
  </div>`;
}

/**
 * El calendario del mes: grilla de lunes a domingo con un puntito por evento
 * (color por tipo) y, abajo, lo del día elegido. Si ese día no hay nada, los
 * próximos que haya en el mes. La leyenda muestra sólo los tipos que hay en
 * el mes. `estado`: { anio, mes, elegido, hoy, porDia, fallidos, cargando }.
 */
export function htmlCalendario(estado, calendarios) {
  const { anio, mes, elegido, hoy, porDia, fallidos, cargando } = estado;
  const presentes = new Set([...porDia.values()].flat().map((e) => e.tipo));
  const tipos = TIPOS_AGENDA.filter((t) => presentes.has(t));
  const delDia = porDia.get(elegido) ?? [];
  const proximos = delDia.length ? [] : proximosEventos(porDia, elegido > hoy ? elegido : hoy, 3);

  const celda = ({ fecha, dia, delMes }) => {
    const eventos = porDia.get(fecha) ?? [];
    const clases = ['portal-dia', !delMes && 'fuera', fecha === hoy && 'hoy', fecha === elegido && 'elegido'].filter(Boolean).join(' ');
    const etiqueta = `${fechaLarga(fecha)}${eventos.length ? `, ${eventos.length === 1 ? '1 evento' : `${eventos.length} eventos`}` : ''}`;
    return html`<button type="button" class="${clases}" data-dia="${fecha}" aria-label="${etiqueta}" aria-pressed="${fecha === elegido ? 'true' : 'false'}">
      <span>${dia}</span>${eventos.length > 0 && html`<span class="portal-puntos">${eventos.slice(0, 3).map((e) => html`<i class="tipo-${e.tipo}"></i>`)}</span>`}
    </button>`;
  };

  return html`<div class="portal-cal${cargando ? ' cargando' : ''}">
    <div class="portal-cal-cab">
      <b aria-live="polite">${tituloMes(anio, mes)}</b>
      <span>
        <button type="button" class="portal-cal-nav" data-mes="-1" aria-label="Mes anterior">‹</button>
        <button type="button" class="portal-cal-nav" data-mes="1" aria-label="Mes siguiente">›</button>
      </span>
    </div>
    ${tipos.length > 1 && html`<ul class="portal-ley">${tipos.map((t) => html`<li class="tipo-${t}">${NOMBRE_TIPO[t]}</li>`)}</ul>`}
    <div class="portal-grilla" role="group" aria-label="Días de ${tituloMes(anio, mes)}">
      ${DIAS_SEMANA.map((d) => html`<span class="portal-dn" aria-hidden="true">${d}</span>`)}
      ${semanasDelMes(anio, mes).flat().map(celda)}
    </div>
    <div class="portal-cal-dia">
      ${fallidos > 0 && html`<p class="portal-aviso">No pudimos traer una parte del calendario. Probá de nuevo en un rato.</p>`}
      <div class="portal-cal-t">${fechaLarga(elegido)}</div>
      ${delDia.length
        ? html`<ul class="portal-evs">${delDia.map((e) => htmlEvento(e))}</ul>`
        : html`<p class="portal-cal-nada">${cargando ? 'Cargando…' : 'No hay nada cargado para este día.'}</p>
          ${proximos.length > 0 && html`<div class="portal-cal-t">Lo que viene</div><ul class="portal-evs">${proximos.map(({ fecha, evento }) => htmlEvento(evento, fecha))}</ul>`}`}
      ${htmlSuscripcion(calendarios)}
    </div>
  </div>`;
}

/** El día que se elige al abrir un mes: hoy si es de ese mes; si no, el primero con algo, o el 1. */
export function diaInicial(anio, mes, hoy, porDia) {
  const prefijo = `${anio}-${String(mes).padStart(2, '0')}`;
  if (hoy.startsWith(prefijo)) return hoy;
  const conAlgo = [...porDia.keys()].filter((f) => f.startsWith(prefijo)).sort()[0];
  return conAlgo ?? `${prefijo}-01`;
}

/**
 * Baja el .ics del evento. En el iPhone, Safari lo abre con "Agregar al
 * calendario"; en otros celulares queda en Descargas y se abre desde ahí.
 */
function bajarIcs(evento) {
  const url = URL.createObjectURL(new Blob([textoIcs(evento)], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'evento-basquet-newells.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Los eventos de Google por mes, con caché: los comparten la grilla y "Lo que viene". */
export function crearAgenda(calendarios) {
  const cache = new Map();
  async function traer(anio, mes) {
    const clave = `${anio}-${mes}`;
    if (!cache.has(clave)) {
      const { eventos, fallidos } = await eventosDelMes(calendarios, PORTAL.agenda.clave, anio, mes);
      cache.set(clave, { porDia: eventosPorDia(eventos), fallidos });
    }
    return cache.get(clave);
  }
  return {
    calendarios,
    traer,
    yaTraido: (anio, mes) => cache.has(`${anio}-${mes}`),
    // El botón "iPhone" busca su evento en todos los meses ya traídos: "Lo que viene" puede ser de otro mes que la grilla.
    eventos: () => [...cache.values()].flatMap((c) => [...c.porDia.values()].flat()),
  };
}

/**
 * "Lo que viene": el próximo desde hoy. Si en lo que queda del mes no hay
 * nada, lo busca en el mes siguiente (a fin de mes, el próximo partido suele
 * caer ahí). Devuelve si encontró algo, para mostrar u ocultar su sección.
 */
export async function mostrarProximo(agenda) {
  const hoy = hoyEnRosario();
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  let [proximo] = proximosEventos((await agenda.traer(anio, mes)).porDia, hoy, 1);
  if (!proximo) {
    const sig = mesVecino(anio, mes, 1);
    [proximo] = proximosEventos((await agenda.traer(sig.anio, sig.mes)).porDia, hoy, 1);
  }
  const contenido = htmlProximo(proximo, hoy).toString();
  $('portal-proximo').innerHTML = contenido;
  return Boolean(contenido);
}

/** El botón "iPhone" de cualquier evento de la sección baja su .ics. */
export function cablearIcs(seccion, agenda) {
  seccion.addEventListener('click', (ev) => {
    const ics = ev.target.closest('[data-ics]');
    if (!ics) return;
    const evento = agenda.eventos().find((e) => claveEvento(e) === ics.dataset.ics);
    if (evento) bajarIcs(evento);
  });
}

/** La grilla del mes: elegir un día y pasar de mes. */
export function iniciarCalendario(agenda) {
  const hoy = hoyEnRosario();
  const estado = { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)), elegido: hoy, hoy, porDia: new Map(), fallidos: 0, cargando: true };
  const pintar = () => { $('portal-calendario').innerHTML = htmlCalendario(estado, agenda.calendarios); };

  async function cargar(anio, mes) {
    const yaEsta = agenda.yaTraido(anio, mes);
    Object.assign(estado, { anio, mes, cargando: !yaEsta });
    if (!yaEsta) {
      estado.porDia = new Map();
      estado.elegido = diaInicial(anio, mes, hoy, estado.porDia);
      pintar();
    }
    const datos = await agenda.traer(anio, mes);
    // Si mientras tanto la persona pasó a otro mes, este resultado queda guardado y no se pinta.
    if (estado.anio !== anio || estado.mes !== mes) return;
    Object.assign(estado, datos, { cargando: false });
    estado.elegido = diaInicial(anio, mes, hoy, estado.porDia);
    pintar();
  }

  $('portal-calendario').addEventListener('click', (ev) => {
    const dia = ev.target.closest('[data-dia]');
    if (dia) {
      estado.elegido = dia.dataset.dia;
      pintar();
      return;
    }
    const nav = ev.target.closest('[data-mes]');
    if (nav) {
      const { anio, mes } = mesVecino(estado.anio, estado.mes, Number(nav.dataset.mes));
      cargar(anio, mes);
    }
  });
  return cargar(estado.anio, estado.mes);
}

/* ---------- ¿En qué categoría juega? ---------- */

/**
 * Arranca en un año de U13 (el del medio de las formativas) y deja moverse de
 * a uno. Los topes cubren de Primera a unos años más chicos que la U9, para
 * que quien busca a un nene de 4 vea que todavía no hay categoría.
 */
function iniciarBuscador(temporada, hrefDe = null) {
  const rango = { min: temporada - 30, max: temporada - 4 };
  let anio = temporada - 13;
  const buscador = $('portal-buscador');
  buscador.innerHTML = htmlBuscador(anio, rango);
  // Para el link "Ver horarios y sede": el ancla sale de la lista completa,
  // así las dos Primeras llevan cada una a la suya.
  const detalle = categoriasConDetalle(PORTAL.categorias, PORTAL.temporada);
  const conEnlace = (cats) => cats.map((c) => {
    const d = detalle.find((x) => x.nombre === c.nombre && x.rama === c.rama);
    return { ...c, href: d && hrefDe ? hrefDe(d) : null };
  });
  // Se cambian el año, los topes y el resultado, no el selector entero: así el
  // foco queda en el botón y el resultado (aria-live) se anuncia al cambiar.
  const pintar = () => {
    $('portal-anio').textContent = anio;
    buscador.querySelector('[data-anio="-1"]').disabled = anio <= rango.min;
    buscador.querySelector('[data-anio="1"]').disabled = anio >= rango.max;
    $('portal-cat-res').innerHTML = htmlCategoriaDelAnio(anio, conEnlace(categoriasDelAnio(PORTAL.categorias, temporada, anio)));
  };
  buscador.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-anio]');
    if (!b) return;
    anio = Math.min(rango.max, Math.max(rango.min, anio + Number(b.dataset.anio)));
    pintar();
  });
  pintar();
}

/* ---------- Armado de la página ---------- */

function mostrar(id, contenido, contenedor = `portal-${id}`) {
  const texto = contenido.toString();
  $(contenedor).innerHTML = texto;
  $(id).hidden = !texto.trim();
}

/** /ayuda: las preguntas (que cambian con lo que esté abierto) y la sede con el alias. */
export async function iniciarPaginaAyuda() {
  const pintar = ({ inscripcion = null, consultas = null } = {}) => {
    $('portal-ayuda-lista').innerHTML = htmlAyuda({
      inscripcionAbierta: abierto(inscripcion), consultasAbierto: abierto(consultas),
      temporada: PORTAL.temporada, alias: PORTAL.alias, sede: PORTAL.sede, contacto: PORTAL.contacto,
    });
  };
  // Hasta que responda la base, las respuestas suponen todo cerrado: nunca mandan a un botón apagado.
  pintar();
  mostrar('contacto', htmlContacto({ sede: PORTAL.sede, alias: PORTAL.alias }));
  const datos = await iniciarMarco();
  if (datos) pintar(datos);
}

/** /categorias: el buscador, los atajos y una sección por categoría. */
export async function iniciarPaginaCategorias() {
  const temporada = temporadaComoAnio(PORTAL.temporada);
  const categorias = temporada ? categoriasConDetalle(PORTAL.categorias, PORTAL.temporada) : [];
  if (temporada) $('t-categorias-temp').textContent = ` ${temporada}`;
  $('buscar').hidden = !categorias.length;
  if (categorias.length) {
    iniciarBuscador(temporada, (c) => `#${c.ancla}`);
    $('portal-cat-indice').innerHTML = htmlIndiceCategorias(categorias);
    mostrar('detalle', html`${categorias.map((c) => htmlCategoriaDetalle(c, PORTAL.sede))}`, 'portal-cat-detalle');
    // Si se llegó con /categorias#u13, la sección recién existe ahora: el navegador ya no va a bajar solo.
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }
  await iniciarMarco();
}

/** /calendario: la grilla, "Lo que viene" y suscribirse. */
export async function iniciarPaginaCalendario() {
  const marco = iniciarMarco();
  const calendarios = calendariosActivos(PORTAL.agenda);
  $('calendario').hidden = !calendarios.length;
  $('calendario-sin').hidden = calendarios.length > 0;
  if (calendarios.length) {
    const agenda = crearAgenda(calendarios);
    cablearIcs($('calendario'), agenda);
    iniciarCalendario(agenda).then(() => mostrarProximo(agenda));
  }
  await marco;
}

/** Lo del inicio que depende de los formularios. Sin argumentos, todo cerrado. */
function pintarFormularios({ inscripcion = null, comprobante = null, consultas = null, colaboradores = null, recaudacion = null } = {}) {
  $('portal-heroe').innerHTML = htmlHeroe({ inscripcion, consultas, comprobante, temporada: PORTAL.temporada, alias: PORTAL.alias });
  $('portal-recaudacion').innerHTML = htmlRecaudacion(recaudacion);
  $('portal-colaborar').innerHTML = htmlColaborar(colaboradores);
}

/** Con un video válido, el hero lo muestra a la derecha; sin uno, queda sólo el texto (el HTML arranca con la clase puesta para evitar el salto). */
function iniciarFondoDelHero() {
  const video = heroVideoValido(PORTAL.heroVideo);
  if (!video) {
    $('heroe').classList.remove('con-fondo');
    return;
  }
  const fondo = $('portal-heroe-fondo');
  fondo.innerHTML = htmlFondoHero(video);
  iniciarVideoHero(fondo);
}

export async function iniciarPortal() {
  // Un link viejo de cuando todo era una página (/#ayuda, /#categorias, /#calendario) va a su página nueva.
  const pagina = paginaDeAncla(window.location.hash);
  if (pagina) {
    window.location.replace(pagina);
    return;
  }
  // Pasar de "/" a "/#ayuda" en la misma pestaña es sólo un cambio de hash: no recarga, hay que escucharlo.
  window.addEventListener('hashchange', () => {
    const destino = paginaDeAncla(window.location.hash);
    if (destino) window.location.replace(destino);
  });

  const temporada = temporadaComoAnio(PORTAL.temporada);
  const categorias = categoriasDelPortal(PORTAL.categorias, PORTAL.temporada);
  $('categorias').hidden = !(temporada && categorias.length);
  if (temporada) $('t-categorias-temp').textContent = ` ${temporada}`;
  if (temporada && categorias.length) iniciarBuscador(temporada, (c) => `/categorias#${c.ancla}`);
  mostrar('sede', htmlSede(PORTAL.sede));
  iniciarMapa();
  mostrar('club', htmlFoto(PORTAL.foto), 'portal-foto');
  mostrar('sponsors', htmlLogos(PORTAL.sponsors), 'portal-logos');

  // Hasta que responda la base, todo cerrado: nunca un botón a un formulario que quizá ya no está.
  pintarFormularios();
  esconderBarraMientrasSeVea($('portal-heroe'));
  const marco = iniciarMarco();

  // Si la URL es la vuelta de un login, portalEntrada.js ya está mandando a la
  // persona a /app: acá no se pide nada más (el marco tampoco lee la base).
  if (destinoDeAuth(window.location.search, window.location.hash)) return;

  iniciarFondoDelHero();
  const calendarios = calendariosActivos(PORTAL.agenda);
  if (calendarios.length) {
    const agenda = crearAgenda(calendarios);
    cablearIcs($('proximo'), agenda);
    mostrarProximo(agenda).then((hay) => { $('proximo').hidden = !hay; }, () => {});
  }
  iniciarUltimasNoticias();

  const datos = await marco;
  if (!datos) return;
  // Los que tienen lugar propio (la banda, recaudación, colaborar) no se repiten en "Otros formularios".
  const { estado, inscripcion, comprobante, consultas, colaboradores, recaudacion, comunes } = datos;
  pintarFormularios({ inscripcion, comprobante, consultas, colaboradores, recaudacion });

  const lista = htmlFormularios(comunes);
  mostrar('formularios', lista.toString() ? html`${estado === 'respaldo' && htmlAvisoRespaldo()}${lista}` : lista);
}
