import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  htmlFormularios, htmlAvisoRespaldo, htmlLogos, htmlHeroe, htmlAlias, htmlBuscador, htmlCategoriaDelAnio, htmlProximo,
  htmlRecaudacion, htmlColaborar, htmlContacto, htmlAyuda, htmlCalendario, htmlFoto, htmlSede, diaInicial, htmlSuscripcion,
} from '../src/ui/portal.js';
import { PAGINAS_PORTAL } from '../src/data/portal.js';
import { eventoDesdeGoogle, eventosPorDia, proximosEventos } from '../src/data/agenda.js';

/**
 * portal.html es HTML escrito a mano y no hay navegador en los tests: se lee
 * como texto, como en landing.test.js. Se atan las promesas del diseño "D"
 * (plan 2026-10-20-portal-rediseno) que se rompen sin que nada avise.
 */
const pagina = readFileSync('public/portal.html', 'utf8');
const portal = readFileSync('src/ui/portal.js', 'utf8');
const seccion = (id) => pagina.match(new RegExp(`<section [^>]*id="${id}"[\\s\\S]*?</section>`))?.[0] ?? '';

test('el inicio es el resumen de todo: hero, banda, noticias, lo que viene, categorías, sede, recaudación, colaborar, formularios, dudas, club y sponsors', () => {
  const orden = ['heroe', 'banda', 'noticias', 'proximo', 'categorias', 'sede', 'recaudacion', 'colaborar', 'formularios', 'dudas', 'club', 'sponsors'];
  const posiciones = orden.map((id) => pagina.search(new RegExp(`<section [^>]*id="${id}"`)));
  assert.ok(posiciones.every((p) => p > 0), `faltan secciones: ${posiciones}`);
  assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, 'las secciones están desordenadas');
  assert.match(seccion('heroe'), /<h1>/, 'el h1 de la página está en la banda');
  assert.doesNotMatch(pagina, /portal-atajos|id="portal-calendario"|portal-todas/, 'atajos, grilla y lista plegada tienen página propia');
});

test('las secciones que dependen de datos arrancan ocultas; la banda, recaudación, colaborar y dudas se ven siempre', () => {
  for (const id of ['noticias', 'proximo', 'categorias', 'sede', 'formularios', 'club', 'sponsors']) {
    assert.match(seccion(id).split('>')[0], /\bhidden\b/, `#${id} tiene que arrancar oculta`);
  }
  for (const id of ['heroe', 'banda', 'recaudacion', 'colaborar', 'dudas']) {
    // aria-hidden (la banda decorativa) no es el atributo hidden.
    assert.doesNotMatch(seccion(id).split('>')[0], /(?<!aria-)\bhidden\b/, `#${id} se ve siempre`);
  }
});

test('la cinta del inicio lista lo que ofrece el portal dos veces (la copia, aria-hidden) y corre sin tocar más que transform', () => {
  const cinta = seccion('banda');
  assert.match(cinta.split('>')[0], /aria-label="[^"]+"/, 'tiene nombre para el lector de pantalla');
  const listas = [...cinta.matchAll(/<ul( aria-hidden="true")?>([\s\S]*?)<\/ul>/g)];
  assert.equal(listas.length, 2, 'la lista va dos veces para que el loop no se note');
  assert.equal(listas[0][1], undefined, 'la primera la lee el lector de pantalla');
  assert.equal(listas[1][1], ' aria-hidden="true"', 'la copia no se lee dos veces');
  assert.equal(listas[0][2], listas[1][2], 'las dos son iguales');
  assert.ok((listas[0][2].match(/<li>/g) ?? []).length >= 5);
  for (const [, , cuerpo] of listas) {
    for (const id of cuerpo.matchAll(/<use href="#([^"]+)"/g)) assert.match(pagina, new RegExp(`<symbol id="${id[1]}"`), `falta el ícono ${id[1]}`);
  }
  const css = readFileSync('public/css/portal.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const reglas = css.split('}').filter((r) => r.includes('portal-cinta'));
  assert.ok(reglas.length > 0, 'falta el estilo de la cinta');
  assert.ok(reglas.every((r) => !/transition/.test(r)), 'la cinta corre por animation, sin transition');
  assert.match(css, /@keyframes cinta\s*\{\s*from\s*\{\s*transform:[^}]*\}\s*\}/, 'el keyframe sólo mueve transform y sólo define from');
});

test('la sede de Ayuda muestra nombre, dirección y Cómo llegar; sin sede, nada', () => {
  const sede = { nombre: 'Estadio <Cubierto>', direccion: 'Parque', mapa: 'https://maps.app.goo.gl/abc' };
  const out = htmlContacto({ sede }).toString();
  assert.match(out, /<b>Estadio &lt;Cubierto&gt;<\/b>/);
  assert.match(out, /Cómo llegar/);
  assert.doesNotMatch(out, /portal-alias/);
  assert.equal(htmlContacto({ sede: null }).toString(), '');
  assert.match(portal, /mostrar\('sede', htmlSede\(PORTAL\.sede\)\)/, 'el inicio pinta la sede (con el mapa a pedido) con los datos de PORTAL.sede');
});

test('cada resumen lleva a su página', () => {
  assert.match(seccion('noticias'), /<a class="portal-ver" href="\/noticias">Ver todas →<\/a>/);
  assert.match(seccion('proximo'), /<a class="portal-ver" href="\/calendario">Ver el calendario completo →<\/a>/);
  assert.match(seccion('categorias'), /<a class="portal-ver" href="\/categorias">Ver todas las categorías →<\/a>/);
  assert.match(seccion('dudas'), /<a class="btn sec" href="\/ayuda">Ver la ayuda<\/a>/);
});

test('un link viejo (/#ayuda) redirige antes de pintar nada', () => {
  const desde = portal.indexOf('export async function iniciarPortal(');
  const cuerpo = portal.slice(desde, portal.indexOf('\n}\n', desde));
  const redirige = cuerpo.indexOf('paginaDeAncla(window.location.hash)');
  assert.ok(redirige > 0 && redirige < cuerpo.indexOf('mostrar('), 'la redirección va primero');
  assert.match(cuerpo, /window\.location\.replace\(pagina\)/);
});

test('ni la página ni su código dicen "Próximamente"', () => {
  assert.doesNotMatch(pagina, /Próximamente/i);
  assert.doesNotMatch(portal, /Próximamente/i);
});

test('el encabezado: la marca lleva al inicio, la navegación de las páginas y Semillero, con cómo instalarla', () => {
  const barra = pagina.match(/<header class="portal-barra">[\s\S]*?<\/header>/)[0];
  assert.match(barra, /<a class="portal-logo" href="\/">/);
  const nav = barra.match(/<nav class="portal-nav" aria-label="Páginas del básquet">([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual([...nav.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]), PAGINAS_PORTAL.map((p) => [p.href, p.texto]));
  const sem = barra.match(/<details class="portal-sem" id="semillero">[\s\S]*?<\/details>/)[0];
  assert.match(sem, /<summary[^>]*>Soy profe o jugador<\/summary>/);
  assert.match(sem, /<a class="btn" href="\/app">Entrar a Semillero<\/a>/);
  assert.match(sem, /Instalar app/);
  assert.match(sem, /Agregar a inicio/);
  assert.match(pagina, /<div class="portal-acc-barra" id="portal-acc-barra" hidden><\/div>/, 'la barra arranca oculta');
});

test('Ayuda es una página (/ayuda): el inicio no tiene la hoja ni la abre, y nada apunta a #ayuda', () => {
  assert.doesNotMatch(pagina, /<dialog/);
  assert.doesNotMatch(portal, /iniciarAyuda|showModal/);
  assert.doesNotMatch(portal, /href="#ayuda"|'#ayuda'/);
});

test('el coordinador aparece una sola vez: al final de las preguntas frecuentes', () => {
  assert.doesNotMatch(pagina.replace(/<!--[\s\S]*?-->/g, ''), /wa\.me|coordinador/i, 'el HTML no lo nombra: sale de htmlAyuda');
  assert.equal((portal.match(/enlaceContacto\(/g) ?? []).length, 1, 'sólo htmlAyuda arma el enlace al coordinador');
  const desde = portal.indexOf('export function htmlAyuda(');
  assert.ok(portal.indexOf('enlaceContacto(') > desde, 'y es el de htmlAyuda');
});

const importMapDe = (html) => html.replace(/\r\n/g, '\n').match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];

test('portal.html no tiene más script inline que el import map ni enlaza el manifest', () => {
  const inline = [...pagina.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !/type="importmap"/.test(m[1]));
  assert.deepEqual(inline.map((m) => m[0]), []);
  assert.doesNotMatch(pagina, /rel="manifest"/);
  assert.doesNotMatch(pagina, /serviceWorker/);
  assert.doesNotMatch(pagina, /<iframe/);
});

test('el import map del portal es idéntico, letra por letra, al de la app: el mismo hash de la CSP', () => {
  const app = readFileSync('public/index.html', 'utf8');
  assert.ok(importMapDe(pagina), 'el portal no tiene import map');
  assert.equal(importMapDe(pagina), importMapDe(app));
  assert.match(pagina, /<script src="\/public\/config\.js"><\/script>/);
  assert.ok(pagina.indexOf('importmap') < pagina.indexOf('type="module"'), 'el import map tiene que ir antes de los módulos');
});

test('el portal es mobile', () => {
  assert.match(pagina, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
});

test('portal.js sólo pide datos por el repositorio: ni repos/, ni cliente, ni Supabase, ni fetch', () => {
  for (const archivo of ['src/ui/portal.js', 'src/ui/portalArranque.js', 'src/ui/portalEntrada.js']) {
    const codigo = readFileSync(archivo, 'utf8');
    const imports = [...codigo.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(imports.filter((i) => /repos\/|cliente|supabase/.test(i)), [], archivo);
    assert.doesNotMatch(codigo, /\bfetch\s*\(/, archivo);
  }
  assert.match(portal, /from '\.\.\/data\/repositorio\.js'/);
  assert.doesNotMatch(readFileSync('src/ui/portalEntrada.js', 'utf8'), /repositorio/);
});

test('el inicio no pide nada si la URL es la vuelta de un login: esos links van a /app', () => {
  // El cliente de Supabase canjearía el ?code= o el #access_token en esta página.
  // La lectura de formularios la guarda el marco (tests/portalMarco.test.js).
  const desde = portal.indexOf('export async function iniciarPortal(');
  const cuerpo = portal.slice(desde, portal.indexOf('\n}\n', desde));
  const guarda = cuerpo.indexOf('destinoDeAuth(window.location.search, window.location.hash)');
  assert.ok(guarda > 0 && guarda < cuerpo.indexOf('crearAgenda('), 'la guarda va antes de pedir el calendario');
  assert.ok(cuerpo.indexOf('iniciarMarco()') < guarda, 'el marco arranca antes (completa el pie aunque no lea la base)');
});

// ---- El hero: el título de la página y las dos tarjetas protagonistas ----

const FORM = (texto, enlace = 'https://forms.gle/Abc1') => ({ titulo: 'x', texto, enlace });
const MALO = FORM('x', 'https://evil.com/forms/x');
const acciones = (out) => out.match(/class="portal-accion [^"]*"/g) ?? [];

test('el hero es el título de la página, no una pregunta', () => {
  const out = htmlHeroe({ temporada: 2027 }).toString();
  assert.match(out, /<div class="portal-heroe-ey">Formativas · Rosario · Temporada 2027<\/div>/);
  assert.match(out, /<h1><span>Básquet<\/span> <em>formativo<\/em> <span>de Newell's<\/span><\/h1>/);
  assert.match(out, /<p class="portal-heroe-bajada">/);
  assert.doesNotMatch(out, /¿Qué (necesitás|querés) hacer\?/);
});

test('inscripción abierta: "Inscribir a mi hijo o hija" y "Enviar comprobante" con el alias pegado', () => {
  const out = htmlHeroe({
    inscripcion: FORM('x'), consultas: FORM('y', 'https://forms.gle/Jug1'), comprobante: FORM('z', 'https://forms.gle/Com1'),
    temporada: 2027, alias: { alias: 'NOB.BASQUET', titular: 'Club <x>' },
  }).toString();
  assert.match(out, /<a class="portal-accion principal" href="https:\/\/forms\.gle\/Abc1" target="_blank" rel="noopener">[\s\S]*Inscribir a mi hijo o hija[\s\S]*Inscripción 2027 abierta/);
  assert.match(out, /<div class="portal-pago">\s*<a class="portal-accion pago" href="https:\/\/forms\.gle\/Com1"[\s\S]*Enviar comprobante[\s\S]*data-copiar="NOB\.BASQUET"[\s\S]*<\/div>/);
  assert.match(out, /Club &lt;x&gt;/);
  assert.doesNotMatch(out, /Jug1/, 'con la inscripción abierta, "Quiero jugar" no va arriba');
  assert.equal(acciones(out).length, 2, 'dos tarjetas, ni una más');
});

test('inscripción cerrada: la primera tarjeta es "Quiero jugar en Newell\'s" al formulario de consultas', () => {
  for (const inscripcion of [null, MALO]) {
    const out = htmlHeroe({ inscripcion, consultas: FORM('Para chicos <x>', 'https://forms.gle/Jug1') }).toString();
    assert.match(out, /<a class="portal-accion principal" href="https:\/\/forms\.gle\/Jug1"[\s\S]*Quiero jugar en Newell&#39;s/);
    assert.match(out, /Dejá tus datos y te contactamos para venir a probar/);
    assert.doesNotMatch(out, /Para chicos/, 'la línea del panel no va en la tarjeta');
  }
});

test('sin formularios: las dos tarjetas se ven macizas, con "Pronto" y cuándo se habilitan; ningún link', () => {
  const out = htmlHeroe({ consultas: MALO, comprobante: MALO }).toString();
  assert.match(out, /<div class="portal-accion principal apagada" aria-disabled="true">[\s\S]*Se habilita cuando abra el formulario[\s\S]*<em>Pronto<\/em>/);
  assert.match(out, /<div class="portal-accion pago apagada" aria-disabled="true">[\s\S]*Se habilita cuando haya algo para pagar[\s\S]*<em>Pronto<\/em>/);
  assert.doesNotMatch(out, /<a |evil/);
  assert.equal(acciones(out).length, 2);
});

test('alias: escapado y con botón para copiarlo; uno inválido no se muestra', () => {
  const out = htmlAlias({ alias: 'NOB.BASQUET', titular: 'Club <x>' }).toString();
  assert.match(out, /<b>NOB\.BASQUET<\/b>/);
  assert.match(out, /data-copiar="NOB\.BASQUET"/);
  assert.equal(htmlAlias({ alias: 'mal alias' }).toString(), '');
});

// ---- Calendario propio ----

const CALS = [{ tipo: 'partido', titulo: 'Partidos', id: 'p@x.y' }, { tipo: 'evento', titulo: 'Eventos', id: 'e@x.y' }];
const ev = (id, tipo, extra) => eventoDesdeGoogle({ id, ...extra }, tipo);
const porDia = eventosPorDia([
  ev('1', 'partido', { summary: 'U15 vs. <Náutico>', location: 'Microestadio', start: { dateTime: '2026-10-24T10:30:00-03:00' } }),
  ev('2', 'evento', { summary: 'Hamburgueseada', start: { date: '2026-10-24' } }),
  ev('3', 'partido', { summary: 'U17 visitante', start: { dateTime: '2026-10-31T16:00:00-03:00' } }),
]);
const estado = (extra) => ({ anio: 2026, mes: 10, elegido: '2026-10-24', hoy: '2026-10-20', porDia, fallidos: 0, cargando: false, ...extra });

test('calendario: grilla del mes con un puntito por evento y el día elegido marcado', () => {
  const out = htmlCalendario(estado(), CALS).toString();
  assert.match(out, /Octubre 2026/);
  assert.equal((out.match(/data-dia="/g) ?? []).length, 35);
  const dia24 = out.match(/<button [^>]*data-dia="2026-10-24"[\s\S]*?<\/button>/)[0];
  assert.match(dia24, /aria-pressed="true"/);
  assert.match(dia24, /aria-label="Sábado 24 de octubre, 2 eventos"/);
  assert.equal((dia24.match(/<i class="tipo-/g) ?? []).length, 2);
  assert.match(out, /class="portal-dia hoy" data-dia="2026-10-20"/);
  assert.match(out, /<li class="tipo-partido">Partidos<\/li><li class="tipo-evento">Eventos<\/li>/);
});

test('calendario: lo del día elegido, escapado, los de todo el día primero', () => {
  const out = htmlCalendario(estado(), CALS).toString();
  const dia = out.slice(out.indexOf('portal-cal-dia'));
  assert.ok(dia.indexOf('Hamburgueseada') < dia.indexOf('U15'), 'todo el día va primero');
  assert.match(dia, /Partidos · 10:30/);
  assert.match(dia, /Eventos · Todo el día/);
  assert.match(dia, /U15 vs\. &lt;Náutico&gt;/);
  assert.doesNotMatch(out, /<Náutico>/);
});

test('calendario: un día sin nada muestra lo que viene; si falló un calendario, lo avisa', () => {
  const out = htmlCalendario(estado({ elegido: '2026-10-21', fallidos: 1 }), CALS).toString();
  assert.match(out, /No hay nada cargado para este día/);
  assert.match(out, /Lo que viene/);
  assert.match(out, /U17 visitante/);
  assert.match(out, /No pudimos traer una parte del calendario/);
});

test('"Lo que viene": fecha grande, tipo, título escapado, hora y lugar, y para agendarlo', () => {
  const [prox] = proximosEventos(porDia, '2026-10-23', 1);
  const out = htmlProximo(prox, '2026-10-23').toString();
  assert.match(out, /<div class="portal-prox tipo-evento">/, 'el de todo el día va primero');
  assert.match(out, /<small>sáb<\/small><b>24<\/b><small>oct<\/small>/);
  assert.match(out, /<b>Mañana<\/b>/);
  assert.match(out, /Hamburgueseada/);
  assert.match(out, /Todo el día/);
  assert.match(out, /data-ics="2\|2026-10-24"/);
  const partido = htmlProximo(proximosEventos(porDia, '2026-10-25', 1)[0], '2026-10-25').toString();
  assert.match(partido, /<span class="portal-prox-tipo">Partido<\/span>/);
  assert.match(partido, /16:00 a /);
  assert.doesNotMatch(partido, /Mañana|Hoy/);
  assert.match(htmlProximo({ fecha: '2026-10-24', evento: porDia.get('2026-10-24')[1] }, '2026-10-24').toString(), /U15 vs\. &lt;Náutico&gt;[\s\S]*Microestadio/);
  assert.equal(htmlProximo(undefined, '2026-10-20').toString(), '');
});

test('"Lo que viene" busca en el mes siguiente si en lo que queda del mes no hay nada', () => {
  const desde = portal.indexOf('async function mostrarProximo(agenda)');
  const cuerpo = portal.slice(desde, portal.indexOf('\n}\n', desde));
  assert.match(cuerpo, /mesVecino\(anio, mes, 1\)/);
  assert.match(cuerpo, /Number\(hoy\.slice/, 'sale del mes de hoy, no del que muestra la grilla');
  assert.match(portal, /iniciarCalendario\(agenda\)\.then\(\(\) => mostrarProximo\(agenda\)\)/);
});

test('día inicial: hoy si es del mes; si no, el primero con algo, o el 1', () => {
  assert.equal(diaInicial(2026, 10, '2026-10-20', porDia), '2026-10-20');
  assert.equal(diaInicial(2026, 10, '2026-09-30', porDia), '2026-10-24');
  assert.equal(diaInicial(2026, 11, '2026-10-20', porDia), '2026-11-01');
});

// ---- Categorías, sede, foto, contacto: sin datos, nada ----

test('sin datos, cada parte no devuelve nada (la sección queda oculta)', () => {
  assert.equal(htmlFoto(null).toString(), '');
  assert.equal(htmlFormularios([]).toString(), '');
});

test('buscador: − y + alrededor del año, apagados en los topes, y el resultado se anuncia', () => {
  const out = htmlBuscador(2014, { min: 1997, max: 2023 }).toString();
  assert.match(out, /<button type="button" data-anio="-1" aria-label="Un año antes">−<\/button>/);
  assert.match(out, /<output id="portal-anio">2014<\/output>/);
  assert.match(out, /<div class="portal-cat-resultado" id="portal-cat-res" aria-live="polite">/);
  assert.match(htmlBuscador(1997, { min: 1997, max: 2023 }).toString(), /data-anio="-1" aria-label="Un año antes" disabled/);
  assert.match(htmlBuscador(2023, { min: 1997, max: 2023 }).toString(), /data-anio="1" aria-label="Un año después" disabled/);
});

test('categoría del año: el nombre, sus años y su horario; sin horario, lo dice; escapado', () => {
  const out = htmlCategoriaDelAnio(2014, [{ nombre: 'U13', rama: 'Mixto', anios: '2014 y 2015', horario: 'Lun <18 h> · Mié 18 h' }]).toString();
  assert.match(out, /<b>U13<\/b><span>Mixto<\/span><small>Nacidos 2014 y 2015<\/small>/);
  assert.match(out, /<li>Lun &lt;18 h&gt;<\/li><li>Mié 18 h<\/li>/);
  const primeras = htmlCategoriaDelAnio(1990, [
    { nombre: 'Primera', rama: 'Masculino', anios: '2005 y antes', horario: null },
    { nombre: 'Primera', rama: 'Femenino', anios: '2005 y antes', horario: null },
  ]).toString();
  assert.equal((primeras.match(/class="portal-cat-res"/g) ?? []).length, 2);
  assert.match(primeras, /Horario a confirmar\./);
  assert.doesNotMatch(primeras, /coordinador/);
});

test('categoría del año: sin ninguna, lo dice y manda a las preguntas frecuentes, no al coordinador', () => {
  const out = htmlCategoriaDelAnio(2021, []).toString();
  assert.match(out, /Para chicos nacidos en 2021 todavía no hay categoría\./);
  assert.match(out, /<a href="\/ayuda">/);
  assert.doesNotMatch(out, /wa\.me|coordinador/);
});

test('dónde se entrena: los tres lugares, "Cómo llegar" y el mapa SIN cargar hasta tocar "Ver mapa"', () => {
  const out = htmlSede({
    nombre: 'Estadio <x>', direccion: 'Parque de la Independencia, Rosario', lugares: ['Estadio Cubierto "Claudio Newell"', 'Microestadio', 'Playón Deportivo'],
    mapa: 'https://maps.app.goo.gl/abc', buscar: 'Estadio Cubierto Claudio Newell, Rosario',
  }).toString();
  assert.match(out, /<li>Estadio Cubierto &quot;Claudio Newell&quot;<\/li><li>Microestadio<\/li><li>Playón Deportivo<\/li>/);
  assert.match(out, /href="https:\/\/maps\.app\.goo\.gl\/abc"[^>]*>Cómo llegar/);
  assert.match(out, /<div class="portal-mapa" data-embed="https:\/\/www\.google\.com\/maps\?q=[^"]+&amp;output=embed" data-titulo="Mapa: Estadio &lt;x&gt;">/);
  assert.match(out, /<button type="button" class="portal-mapa-ver">[\s\S]*Ver mapa/);
  assert.doesNotMatch(out, /<iframe/, 'el iframe no está hasta que se toca');
  assert.equal(htmlSede(null).toString(), '');
  // El iframe lo arma el clic, y sólo con la dirección que armó sedeValida.
  const desde = portal.indexOf('function iniciarMapa()');
  const cuerpo = portal.slice(desde, portal.indexOf('\n}\n', desde));
  assert.match(cuerpo, /closest\('\.portal-mapa-ver'\)/);
  assert.match(cuerpo, /createElement\('iframe'\)/);
  assert.match(cuerpo, /iframe\.src = caja\.dataset\.embed/);
});
test('foto con su alt', () => {
  assert.match(htmlFoto({ src: '/public/portal/club.jpg', alt: 'La cancha' }).toString(), /<img src="\/public\/portal\/club\.jpg" alt="La cancha" loading="lazy">/);
});

// ---- Otros formularios ----

test('cada formulario muestra su línea de ayuda y abre en otra pestaña; uno con enlace inválido no aparece', () => {
  const out = htmlFormularios([
    { titulo: 'Rifa <b>', texto: 'Subí el comprobante <i>acá</i>', enlace: 'https://forms.gle/AbC123' },
    { titulo: 'Malo', texto: 'y', enlace: 'https://evil.com/forms/x' },
  ]).toString();
  assert.match(out, /Subí el comprobante &lt;i&gt;acá&lt;\/i&gt;/);
  assert.match(out, /<a [^>]*href="https:\/\/forms\.gle\/AbC123" target="_blank" rel="noopener"/);
  assert.doesNotMatch(out, /<b>|<i>|Malo|evil/);
  assert.match(htmlAvisoRespaldo().toString(), /no pudimos actualizar/i);
});

test('el portal aparta los formularios con lugar propio: no aparecen dos veces', () => {
  assert.match(portal, /const \{ estado, inscripcion, comprobante, consultas, colaboradores, recaudacion, comunes \} = datos;/);
  assert.match(portal, /htmlHeroe\(\{ inscripcion, consultas, comprobante,/);
  assert.match(portal, /htmlColaborar\(colaboradores\)/);
  assert.match(portal, /htmlRecaudacion\(recaudacion\)/);
  assert.match(portal, /htmlFormularios\(comunes\)/);
});

// ---- Recaudación: banda roja con su propio formulario (destino recaudacion, 0063) ----

test('htmlRecaudacion: grande "Enterate…", chico los ejemplos, y sin formulario el botón apagado', () => {
  const abierta = htmlRecaudacion(FORM('x', 'https://forms.gle/Rec1')).toString();
  assert.match(abierta, /<img class="portal-banda-escudo" src="\/public\/escudo\.png" alt=""/);
  assert.match(abierta, /<h2 id="t-recaudacion">Enterate de los eventos de recaudación del club<\/h2>/);
  assert.match(abierta, /<div class="portal-banda-ej">Pizzas, rifas, comidas…<\/div>/);
  assert.match(abierta, /<a class="portal-banda-btn" href="https:\/\/forms\.gle\/Rec1" target="_blank" rel="noopener">Quiero que me avisen/);
  for (const f of [null, MALO]) {
    const cerrada = htmlRecaudacion(f).toString();
    assert.match(cerrada, /<button type="button" class="portal-banda-btn" disabled aria-disabled="true">Se habilita cuando abra el formulario<\/button>/);
    assert.doesNotMatch(cerrada, /<a |evil/);
  }
});

// ---- Colaborar: empresas que se asocian o quien da una mano (destino colaboradores) ----

test('htmlColaborar: las dos formas (empresa, dar una mano) y el botón; no promete avisos de eventos', () => {
  const out = htmlColaborar(FORM('x', 'https://forms.gle/Col1')).toString();
  assert.match(out, /Tengo una empresa o un comercio/);
  assert.match(out, /Quiero dar una mano/);
  assert.match(out, /hacer el pollo/);
  assert.match(out, /<a class="btn" href="https:\/\/forms\.gle\/Col1" target="_blank" rel="noopener">Quiero colaborar/);
  assert.doesNotMatch(out, /te avisamos/i);
  assert.match(htmlColaborar(null).toString(), /<button type="button" class="btn" disabled aria-disabled="true">Se habilita cuando abra el formulario<\/button>/);
});

// ---- Preguntas frecuentes ----

test('ayuda: seis preguntas en acordeón y, al final, el único botón al coordinador', () => {
  const out = htmlAyuda({ temporada: 2027, alias: { alias: 'NOB.BASQUET' }, sede: { nombre: 'Microestadio', mapa: 'https://maps.app.goo.gl/abc' }, contacto: 'https://wa.me/5493410000000' }).toString();
  assert.equal((out.match(/<details class="portal-faq"><summary>/g) ?? []).length, 6);
  const preguntas = [...out.matchAll(/<summary>([^<]*)<\/summary>/g)].map((m) => m[1]);
  assert.deepEqual(preguntas, [
    '¿Cómo inscribo a mi hijo o hija?',
    '¿Cómo pago la cuota o mando el comprobante?',
    'Me pide iniciar sesión con Google, ¿qué hago?',
    '¿En qué categoría juega mi hijo o hija?',
    'Me equivoqué en un dato del formulario, ¿qué hago?',
    '¿Dónde y cuándo entrena mi hijo o hija?',
  ]);
  assert.match(out, /<b>NOB\.BASQUET<\/b>/);
  assert.match(out, /Microestadio/);
  assert.match(out, /href="https:\/\/maps\.app\.goo\.gl\/abc"/);
  assert.match(out, /¿No encontraste tu respuesta\?[\s\S]*<a class="btn" href="https:\/\/wa\.me\/5493410000000" target="_blank" rel="noopener">Escribirle por WhatsApp/);
  assert.equal((out.match(/wa\.me/g) ?? []).length, 1);
});

test('ayuda: el login de Google, desde donde se traba el padre: por qué lo pide, cuenta con su mail en 3 pasos, y si no, el coordinador', () => {
  const out = htmlAyuda({ contacto: 'https://wa.me/5493410000000' }).toString();
  const r = out.match(/Me pide iniciar sesión con Google[\s\S]*?<\/details>/)[0];
  assert.match(r, /La inscripción y el comprobante la piden porque se suben fotos/);
  assert.match(r, /sin abrir uno nuevo/);
  assert.equal((r.match(/<li>/g) ?? []).length, 3);
  assert.match(r, /<a href="https:\/\/accounts\.google\.com\/signup" target="_blank" rel="noopener">/);
  assert.match(r, /Usar mi dirección de correo electrónico actual/);
  assert.match(r, /Si no podés, escribile al coordinador \(el botón de acá abajo\)/);
});

test('ayuda: "me equivoqué en un dato" es volver a mandarlo (el Tablero toma la última respuesta por DNI); el DNI, al coordinador', () => {
  const r = htmlAyuda({ contacto: 'https://wa.me/5493410000000' }).toString().match(/Me equivoqué en un dato[\s\S]*?<\/details>/)[0];
  assert.match(r, /Volvé a mandar el formulario con el dato bien: tomamos siempre el último que mandaste\./);
  assert.match(r, /Si te equivocaste en el DNI, avisale al coordinador \(el botón de acá abajo\)\./);
  assert.match(htmlAyuda({}).toString(), /Si te equivocaste en el DNI, avisale al coordinador\./, 'sin contacto, no promete un botón');
});

test('ayuda: "¿cómo inscribo?" no manda a un botón apagado', () => {
  assert.match(htmlAyuda({ inscripcionAbierta: true }).toString(), /Tocá <b>Inscribir a mi hijo o hija<\/b>/);
  assert.match(htmlAyuda({ consultasAbierto: true, temporada: 2027 }).toString(), /La inscripción 2027 todavía no abrió\. Mientras tanto, tocá <b>Quiero jugar en Newell's<\/b>/);
  assert.match(htmlAyuda({}).toString(), /Cuando abra, el botón aparece en el inicio y en la barra de botones/);
  assert.doesNotMatch(htmlAyuda({ contacto: 'javascript:alert(1)' }).toString(), /javascript|No encontraste/);
});

test('htmlLogos: sin sponsors no muestra nada; con sponsors, una imagen con su nombre, escapado', () => {
  assert.equal(htmlLogos([]).toString(), '');
  const out = htmlLogos([
    { nombre: 'Ferretería <Sur>', logo: '/public/sponsors/ferreteria-sur.png', enlace: 'https://ferreteriasur.example/' },
    { nombre: 'Panadería', logo: '/public/sponsors/panaderia.svg' },
    { nombre: 'Ajeno', logo: 'https://cdn.evil.com/x.png' },
  ]).toString();
  assert.match(out, /<img src="\/public\/sponsors\/ferreteria-sur\.png" alt="Ferretería &lt;Sur&gt;" loading="lazy">/);
  assert.match(out, /<a href="https:\/\/ferreteriasur\.example\/" target="_blank" rel="noopener"><img /);
  assert.match(out, /<li><img src="\/public\/sponsors\/panaderia\.svg" alt="Panadería" loading="lazy"><\/li>/);
  assert.equal((out.match(/<img /g) ?? []).length, 2);
});

// ---- Un solo calendario con colores, y "Agregar a mi calendario" ----

test('cada evento ofrece agregarlo: link a Google y botón que baja el .ics', () => {
  const out = htmlCalendario(estado(), CALS).toString();
  const evento = out.match(/<li class="portal-ev tipo-partido">[\s\S]*?<\/li>/)[0];
  assert.match(evento, /<a href="https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE[^"]*" target="_blank" rel="noopener">Google<\/a>/);
  assert.match(evento, /<button type="button" data-ics="1\|2026-10-24">iPhone<\/button>/);
  assert.match(evento, /Partidos · 10:30 a 11:30/);
});

test('la leyenda muestra sólo los tipos que hay en el mes', () => {
  const soloPartidos = eventosPorDia([ev('9', 'partido', { summary: 'x', start: { date: '2026-10-02' } }), ev('8', 'charla', { summary: 'y', colorId: '7', start: { date: '2026-10-03' } })]);
  const out = htmlCalendario(estado({ porDia: soloPartidos }), CALS).toString();
  assert.match(out, /<li class="tipo-partido">Partidos<\/li><li class="tipo-charla">Charlas<\/li><\/ul>/);
  assert.doesNotMatch(out, /tipo-evento">Eventos/);
});

test('seguir el calendario: Android/compu e iPhone; sin ID válido, nada', () => {
  const out = htmlSuscripcion([{ tipo: 'evento', id: 'abc@group.calendar.google.com' }]).toString();
  assert.match(out, /href="https:\/\/calendar\.google\.com\/calendar\/render\?cid=abc%40group\.calendar\.google\.com"/);
  assert.match(out, /href="webcal:\/\/calendar\.google\.com\/calendar\/ical\/abc%40group\.calendar\.google\.com\/public\/basic\.ics"/);
  assert.equal(htmlSuscripcion([{ tipo: 'evento', id: 'roto' }]).toString(), '');
  assert.match(htmlCalendario(estado(), CALS).toString(), /Querés tener todo el calendario en tu celular/);
});

test('un link viejo también redirige si el inicio ya estaba abierto (cambio de hash sin recarga)', () => {
  const desde = portal.indexOf('export async function iniciarPortal(');
  const cuerpo = portal.slice(desde, portal.indexOf('\n}\n', desde));
  assert.match(cuerpo, /addEventListener\('hashchange'/);
});
