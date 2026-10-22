import { TIPOS_AGENDA, idCalendario, claveValida } from './agenda.js';
import { aniosDeCategoria, textoAnios } from './categorias.js';

/**
 * Lo que muestra la página pública del básquet y no sale de la base: los
 * calendarios, las categorías con sus horarios, la sede, el contacto, el alias
 * para transferir, la foto y los sponsors. Vive acá y no en el HTML para que
 * cambiar uno sea tocar una línea (guía en docs/COORDINACION.md).
 *
 * Lo que el club todavía no pasó va en null o en una lista vacía: esa parte de
 * la página no se muestra. Nunca un "Próximamente" ni un botón a ningún lado.
 *
 * Los calendarios son públicos: cualquiera con el ID ve todos los eventos. Por
 * eso nunca nombres de jugadores en los eventos.
 */
export const PORTAL = Object.freeze({
  // Newell's Old Boys (semilla 0004). El id de un club no es secreto: la función
  // pública formularios_publicos(club) sólo devuelve lo que la coordinación
  // dejó activo en la página.
  clubId: '20000000-0000-0000-0000-000000000001',

  // La temporada que se anuncia: de ella salen los años de cada categoría y el
  // "la inscripción 2027 todavía no abrió". PENDIENTE: confirmar con Tomás.
  temporada: 2027,

  // El calendario del portal lo arma la página con los eventos de Google
  // Calendar. UN calendario público, y el tipo de cada evento lo dice el color
  // que se le pone en Google (TIPO_POR_COLOR en agenda.js: Tomate = partido,
  // Banana = evento, Pavo real = charla, Albahaca = entrenamiento). Sin color,
  // toma `tipo`. `clave`: API key de Google, restringida al dominio del portal
  // y a la Calendar API (pasos en docs/COORDINACION.md). Sin clave o sin ID, la
  // sección no se ve.
  agenda: Object.freeze({
    // Pública a propósito: la usa el navegador. Restringida en Google Cloud al
    // sitio app-semillero.vercel.app y sólo a la Calendar API (proyecto
    // "Portal básquet", cuenta Comisión Básquet, 20/10/2026).
    clave: 'AIzaSyBPZ8Sq8ho4kv-5x1mfm4bs7y40l9P7IK4',
    calendarios: Object.freeze([
      // "Básquet NOB · Agenda (PÚBLICO)", creado el 20/10 aparte del principal
      // de la cuenta (comisionbasquetnob@gmail.com), que es privado y tiene lo
      // interno de la subcomisión.
      Object.freeze({ tipo: 'evento', titulo: 'Agenda del básquet', id: '84aad29a932a6c72cce8f11e5fb488b747d200bb45b842df1dc4260aa7f8e42b@group.calendar.google.com' }),
    ]),
  }),

  // Las categorías que ofrece el club. Los años NO van acá: salen de la
  // temporada con la misma regla que categoriza a un chico (categorias.js).
  // `grupo`: ESCUELITA, U9, U11, U13, U15, U17, U21 o MAYORES. `nombre`
  // opcional (para que MAYORES diga "Primera"). `horario` opcional: días y hora.
  // Horarios: descripción del formulario "Quiero jugar en Newell's" (temporada
  // 2026). Newell's no tiene Escuelita ni femeninos de inferiores: la única
  // femenina es Primera. Las dos Primeras no figuran en ningún formulario y van
  // sin horario hasta que el club lo pase. `detalle` opcional: un texto que
  // pase el club sobre esa categoría (se muestra en /categorias). Sin él, nada.
  categorias: Object.freeze([
    Object.freeze({ grupo: 'U9', rama: 'Mixto', horario: 'Mar 18 a 19 h (Estadio Cubierto) · Jue 18 a 19 h (Playón Deportivo)' }),
    Object.freeze({ grupo: 'U11', rama: 'Mixto', horario: 'Mar 19 a 20 h (Estadio Cubierto) · Jue 19 a 20 h (Playón Deportivo)' }),
    Object.freeze({ grupo: 'U13', rama: 'Mixto', horario: 'Lun y Vie 18 a 19 h (Estadio Cubierto) · Mié 18 a 19 h (Microestadio)' }),
    Object.freeze({ grupo: 'U15', rama: 'Masculino', horario: 'Lun y Vie 18 a 19 h (Estadio Cubierto) · Mié 18 a 19 h (Microestadio)' }),
    Object.freeze({ grupo: 'U17', rama: 'Masculino', horario: 'Lun y Vie 19 a 20 h (Estadio Cubierto) · Mié 19 a 20 h (Microestadio)' }),
    Object.freeze({ grupo: 'U21', rama: 'Masculino', horario: 'Lun y Vie 20 a 21 h (Estadio Cubierto) · Mié 20 a 21 h (Microestadio)' }),
    Object.freeze({ grupo: 'MAYORES', nombre: 'Primera', rama: 'Masculino', horario: null }),
    Object.freeze({ grupo: 'MAYORES', nombre: 'Primera', rama: 'Femenino', horario: null }),
  ]),

  // Dónde se entrena. Sin calle ni número en ningún formulario: el mapa es una
  // búsqueda de Google Maps. Si el club pasa el link de "Compartir", va ese.
  sede: Object.freeze({
    nombre: 'Estadio Cubierto "Claudio Newell"',
    direccion: 'Parque de la Independencia, Rosario',
    // Los tres lugares que aparecen en los horarios de las categorías.
    lugares: Object.freeze(['Estadio Cubierto "Claudio Newell"', 'Microestadio', 'Playón Deportivo']),
    mapa: 'https://www.google.com/maps/search/?api=1&query=Estadio+Cubierto+Claudio+Newell+Rosario',
    // Lo que busca el mapa embebido (sólo se carga si la persona lo toca).
    // PENDIENTE: que Tomás confirme que el punto cae en el estadio.
    buscar: 'Estadio Cubierto Claudio Newell, Rosario',
  }),

  // WhatsApp del coordinador (confirmado por Tomás, 20/10): el botón "Ayuda" de
  // arriba y el "¿Dudas?" de abajo. wa.me lleva el 9 de los celulares argentinos.
  contacto: 'https://wa.me/5493413709161',

  // Alias para transferir, en la tarjeta del comprobante con un botón Copiar.
  // PENDIENTE: confirmar que es el de las cuotas (hubo varios) y el titular.
  alias: Object.freeze({ alias: 'pagosbasquetnob', titular: null }),

  // Foto del club. Sólo fotos con la autorización de imagen firmada por las
  // familias de todos los chicos que se reconozcan. El archivo va en
  // public/portal/ (jpg o webp, ~1200 px de ancho).
  // PENDIENTE: { src: '/public/portal/club.jpg', alt: 'qué se ve en la foto', epigrafe?: '…' }.
  foto: null,

  // Video de fondo del hero del inicio: { src, poster, alt } con archivos de
  // public/portal/ (ver heroVideoValido). Sin video, el hero queda rojo y negro.
  // PENDIENTE: por ahora es un placeholder, el video del hero del sitio oficial
  // del club (newellsoldboys.com.ar). Reemplazarlo por material propio, o tener
  // el OK del club por escrito, antes de publicar (docs/SEGURIDAD-LANZAMIENTO.md).
  heroVideo: Object.freeze({
    src: '/public/portal/hero-placeholder.mp4',
    poster: '/public/portal/hero-placeholder.jpg',
    alt: 'Vista del estadio con la hinchada y una bandera enorme',
  }),

  // Logos de sponsors y colaboradores, para la sección "Sumate como sponsor".
  // Cada uno: { nombre, logo: '/public/sponsors/archivo.png', enlace?: 'https://…' }.
  // El archivo va en public/sponsors/ (png, jpg, webp o svg). Un archivo que no
  // existe o una ruta de otro lado, no se muestra: ver sponsorsValidos().
  sponsors: Object.freeze([]),

  // Respaldo de los formularios: lo que se muestra si la base no responde. La
  // lista de verdad la carga la coordinación desde su panel. Vacío a propósito
  // mientras la inscripción nueva no esté publicada: mejor la tarjeta cerrada
  // que mandar a un formulario viejo.
  formularios: Object.freeze([]),
});

/** Las páginas del portal, en el orden de la navegación (encabezado y pie). */
export const PAGINAS_PORTAL = Object.freeze([
  Object.freeze({ href: '/', texto: 'Inicio' }),
  Object.freeze({ href: '/noticias', texto: 'Noticias' }),
  Object.freeze({ href: '/categorias', texto: 'Categorías' }),
  Object.freeze({ href: '/calendario', texto: 'Calendario' }),
  Object.freeze({ href: '/ayuda', texto: 'Ayuda' }),
]);

// Los links de cuando el portal era una sola página siguen dando vueltas por
// WhatsApp (el "Ayuda" de arriba, el atajo a Categorías). Map y no objeto:
// así "#constructor" no encuentra nada heredado.
const PAGINA_DE_ANCLA = new Map([['#ayuda', '/ayuda'], ['#categorias', '/categorias'], ['#calendario', '/calendario']]);

/**
 * A qué página nueva lleva un ancla vieja de "/". Cualquier otra cosa da null,
 * en particular el #access_token de la vuelta de un login (eso lo resuelve
 * portalEntrada.js, que manda a /app).
 */
export function paginaDeAncla(hash) {
  return PAGINA_DE_ANCLA.get(hash) ?? null;
}

const ARCHIVO_DE_PAGINA = /^\/public\/(portal|noticias|categorias|calendario|ayuda)\.html$/;

/** El href de PAGINAS_PORTAL que corresponde a la ruta (limpia o el .html que sirve el rewrite), o null. */
export function paginaActual(ruta) {
  const r = String(ruta ?? '').replace(/(.)\/+$/, '$1');
  const m = r.match(ARCHIVO_DE_PAGINA);
  if (m) return m[1] === 'portal' ? '/' : `/${m[1]}`;
  return PAGINAS_PORTAL.some((p) => p.href === r) ? r : null;
}

/** Los calendarios que se pueden pedir: con un tipo conocido, un ID válido y la clave puesta. */
export function calendariosActivos(agenda) {
  if (!claveValida(agenda?.clave)) return [];
  return (agenda.calendarios ?? [])
    .filter((c) => TIPOS_AGENDA.includes(c?.tipo) && idCalendario(c.id))
    .map((c) => ({ tipo: c.tipo, titulo: String(c.titulo ?? '').trim() || c.tipo, id: idCalendario(c.id) }));
}

const NOMBRE_GRUPO = { ESCUELITA: 'Escuelita', MAYORES: 'Mayores' };
const texto = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * La lista de categorías del portal, con sus años de nacimiento para la
 * temporada. Una con un grupo que no existe se descarta: mejor una fila menos
 * que unos años inventados.
 */
export function categoriasDelPortal(lista, temporada) {
  return (Array.isArray(lista) ? lista : []).flatMap((c) => {
    const anios = aniosDeCategoria(c?.grupo, temporada);
    if (!anios) return [];
    return [{
      nombre: texto(c.nombre) || NOMBRE_GRUPO[c.grupo] || c.grupo,
      rama: texto(c.rama) || null,
      anios: textoAnios(anios),
      horario: texto(c.horario) || null,
    }];
  });
}

/**
 * "¿En qué categoría juega?": las categorías del portal que le tocan a quien
 * nació en `anio`, con la misma regla de la CABB que la lista. Puede ser más
 * de una (Primera masculino y femenino) o ninguna (más chico que la U9).
 */
export function categoriasDelAnio(lista, temporada, anio) {
  const leTocan = (Array.isArray(lista) ? lista : []).filter((c) => {
    const a = aniosDeCategoria(c?.grupo, temporada);
    return a && Number.isInteger(anio) && (a.viejo == null || anio >= a.viejo) && (a.nuevo == null || anio <= a.nuevo);
  });
  return categoriasDelPortal(leTocan, temporada);
}

/** "Primera Femenino" → "primera-femenino": el ancla de una categoría en /categorias. */
export function slugCategoria(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Las categorías de /categorias: lo de categoriasDelPortal (mismo orden, mismo
 * filtro) más el rótulo, el ancla y el detalle que haya pasado el club. La rama
 * va en el rótulo y en el ancla sólo si dos categorías se llaman igual (las
 * dos Primeras): "U13" sola se entiende, "Primera" sola no.
 */
export function categoriasConDetalle(lista, temporada) {
  const crudas = (Array.isArray(lista) ? lista : []).filter((c) => aniosDeCategoria(c?.grupo, temporada));
  const base = categoriasDelPortal(crudas, temporada);
  const veces = new Map();
  for (const c of base) veces.set(c.nombre, (veces.get(c.nombre) ?? 0) + 1);
  return base.map((c, i) => {
    const rotulo = veces.get(c.nombre) > 1 && c.rama ? `${c.nombre} ${c.rama}` : c.nombre;
    return { ...c, rotulo, ancla: slugCategoria(rotulo), detalle: texto(crudas[i].detalle) || null };
  });
}

const MAPA = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps|maps\.google\.com)\/[^\s"<>]*$/;

/**
 * La sede si tiene nombre; el link al mapa sólo si es de Google Maps. `embed`
 * es la dirección del mapa para el iframe (www.google.com, lo único que deja
 * frame-src fuera de YouTube): la arma acá a partir de lo que se busca, así
 * nunca termina en un iframe una URL pegada a mano.
 */
export function sedeValida(sede) {
  const nombre = texto(sede?.nombre);
  if (!nombre) return null;
  const lugares = (Array.isArray(sede.lugares) ? sede.lugares : []).map(texto).filter(Boolean).slice(0, 6);
  const buscar = texto(sede.buscar).slice(0, 120);
  return {
    nombre,
    direccion: texto(sede.direccion) || null,
    lugares,
    mapa: MAPA.test(sede.mapa ?? '') ? sede.mapa : null,
    embed: buscar ? `https://www.google.com/maps?q=${encodeURIComponent(buscar)}&output=embed` : null,
  };
}

// Alias de CBU/CVU: de 6 a 20 letras, números, puntos o guiones.
const ALIAS = /^[A-Za-z0-9.-]{6,20}$/;

export function aliasValido(valor) {
  const alias = texto(valor?.alias);
  return ALIAS.test(alias) ? { alias, titular: texto(valor.titular) || null } : null;
}

// Sólo una foto propia de public/portal/: la CSP no deja cargar imágenes de otro sitio.
const RUTA_FOTO = /^\/public\/portal\/[\w-]+\.(?:jpe?g|webp)$/;

/** La foto si es un archivo propio y tiene texto alternativo (contar qué se ve, no quiénes son). */
export function fotoValida(foto) {
  const alt = texto(foto?.alt);
  if (!RUTA_FOTO.test(foto?.src ?? '') || !alt) return null;
  return { src: foto.src, alt, epigrafe: texto(foto.epigrafe) || null };
}

/**
 * Un Google Form por https, sin usuario ni puerto, y sin espacios, comillas ni
 * < > que rompan el atributo. Es el MISMO texto que el check
 * `formulario_portal_enlace_google` de 0058: tests/contratoFormularioPortal
 * compara los dos, así la página no muestra lo que la base rechazaría ni al
 * revés.
 */
export const PATRON_ENLACE_FORMULARIO = '^https://(docs\\.google\\.com/forms/|forms\\.gle/)[^\\s"<>]+$';
const ENLACE_FORMULARIO = new RegExp(PATRON_ENLACE_FORMULARIO);

/** El link al formulario si es un Google Form por https; si no, null. */
export function enlaceFormulario(valor) {
  if (typeof valor !== 'string' || !ENLACE_FORMULARIO.test(valor)) return null;
  try {
    new URL(valor);
  } catch {
    return null;
  }
  return valor;
}

/**
 * El enlace de contacto si es WhatsApp (https://wa.me/…) o un mail
 * (mailto:algo@dominio); si no, null. Termina en un <a href>, así que no
 * pasa cualquier esquema.
 */
export function enlaceContacto(valor) {
  if (typeof valor !== 'string') return null;
  if (/^mailto:[^\s@/?#]+@[^\s@/?#]+\.[^\s@/?#]+$/.test(valor)) return valor;
  let u;
  try {
    u = new URL(valor);
  } catch {
    return null;
  }
  return u.protocol === 'https:' && u.hostname === 'wa.me' && u.pathname.length > 1 ? valor : null;
}

// Sólo imágenes propias, de la carpeta de logos: el CSP de la app no deja cargar
// imágenes de otro sitio y un nombre de archivo raro no tiene que poder salirse de ella.
const RUTA_LOGO = /^\/public\/sponsors\/[\w-]+\.(?:png|jpe?g|webp|svg)$/;

/** De la lista de sponsors, los que se pueden mostrar: con nombre, con un logo propio y, si traen enlace, que sea https. */
export function sponsorsValidos(lista) {
  return (Array.isArray(lista) ? lista : []).filter((s) => typeof s?.nombre === 'string' && s.nombre.trim() !== ''
    && RUTA_LOGO.test(s.logo ?? '')
    && (s.enlace == null || /^https:\/\/[^\s"<>]+$/.test(s.enlace)));
}
