import { LIMITE } from './limites.js';
import { enlaceFormulario } from './portal.js';

/*
 * Lógica pura de los formularios del portal que carga la coordinación (spec
 * 2026-10-18-portal-v2-design.md §3): validar lo que escribe, y subir o bajar
 * un formulario en la lista. Sin red, sin DOM.
 *
 * Lo que sale de acá termina en una tarjeta de la página pública, que ve
 * cualquiera. Por eso el enlace sólo pasa si es de Google Forms (la base lo
 * vuelve a exigir con un check), y el texto no es un campo libre sin límite.
 */

/**
 * Los destinos especiales de un formulario (0061; 0062 suma inscripción y comprobante; 0063, recaudación). Las claves son las del
 * check de la base: tests/contratoDestinoFormulario.test.js las compara. Un
 * formulario sin destino es "común" y va en la lista.
 */
export const DESTINOS = Object.freeze([
  Object.freeze({ clave: 'consultas', rotulo: 'Quiero jugar en Newell\'s (botón de arriba con la inscripción cerrada; QR)', chip: 'Quiero jugar' }),
  Object.freeze({ clave: 'colaboradores', rotulo: 'Sumate al básquet de Newell\'s (empresas y quien quiere dar una mano)', chip: 'Colaborar' }),
  // 0062: los dos botones grandes de arriba del portal.
  Object.freeze({ clave: 'inscripcion', rotulo: 'Inscripción (botón grande de arriba)', chip: 'Inscripción' }),
  Object.freeze({ clave: 'comprobante', rotulo: 'Comprobante de pago (botón grande de arriba)', chip: 'Comprobante' }),
  // 0063: el aviso por mail de pizzas, rifas y comidas, debajo del calendario. Es otro formulario que el de sponsors.
  Object.freeze({ clave: 'recaudacion', rotulo: 'Eventos de recaudación (banda roja debajo del calendario)', chip: 'Recaudación' }),
]);

export const MENSAJE_ENLACE_FORMULARIO = 'El enlace tiene que ser de Google Forms (empieza con https://docs.google.com/forms o https://forms.gle).';

const recortar = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Lo que escribió la coordinación → el formulario a guardar, o el primer
 * error. El texto es obligatorio a propósito: es la línea que le dice a la
 * familia para qué es y qué tiene que tener a mano antes de abrirlo.
 */
export function validarFormulario({ titulo, texto, enlace, destino } = {}) {
  const t = recortar(titulo);
  if (!t) return { error: 'Escribí el título del formulario.', formulario: null };
  if (t.length > LIMITE.titulo) return { error: `El título es muy largo: hasta ${LIMITE.titulo} letras.`, formulario: null };

  const x = recortar(texto);
  if (!x) return { error: 'Contá para qué es y qué tienen que tener a mano las familias.', formulario: null };
  if (x.length > LIMITE.textoFormulario) {
    return { error: `El texto es muy largo: hasta ${LIMITE.textoFormulario} letras.`, formulario: null };
  }

  const e = recortar(enlace);
  if (e.length > LIMITE.enlace || !enlaceFormulario(e)) return { error: MENSAJE_ENLACE_FORMULARIO, formulario: null };

  // Vacío o ausente = común. Cualquier otra cosa tiene que ser un destino de la app:
  // la base también lo exige (check de 0061), pero acá se dice en claro.
  const d = destino ?? '';
  if (d !== '' && !DESTINOS.some((x) => x.clave === d)) return { error: 'Elegí cómo se muestra el formulario.', formulario: null };

  return { error: null, formulario: { titulo: t, texto: x, enlace: e, destino: d === '' ? null : d } };
}

/**
 * Aparta de la lista los dos formularios con destino y deja el resto, en el
 * mismo orden, como comunes. La base garantiza uno por destino; si alguna vez
 * llegaran dos, gana el primero y el otro pasa a la lista en vez de perderse.
 */
export function separarFormularios(lista) {
  const r = { consultas: null, colaboradores: null, inscripcion: null, comprobante: null, recaudacion: null, comunes: [] };
  for (const f of lista) {
    const destino = DESTINOS.some((d) => d.clave === f.destino) ? f.destino : null;
    if (destino && !r[destino]) r[destino] = f;
    else r.comunes.push(f);
  }
  return r;
}

/**
 * Qué muestran los dos botones principales del portal: las tarjetas del hero
 * del inicio y la barra de acciones de cada página. Con la inscripción
 * activa (destino inscripcion, 0062), el primero es "Inscribir"; si no,
 * "Quiero jugar" (destino consultas, 0061). El comprobante va aparte: alguien
 * se puede inscribir sin pagar nada. Un enlace que no es de Google Forms
 * cuenta como cerrado: nunca un botón a cualquier lado.
 */
export function accionesPrincipales({ inscripcion = null, consultas = null, comprobante = null } = {}) {
  const url = (f) => (f ? enlaceFormulario(f.enlace) : null);
  const ins = url(inscripcion);
  return {
    primera: ins ? { tipo: 'inscribir', url: ins } : { tipo: 'jugar', url: url(consultas) },
    comprobante: { url: url(comprobante) },
  };
}

/** El formulario que ya usa ese destino (salvo el que se está editando), o null. Sirve para avisar que se lo vamos a sacar. */
export function quienTieneElDestino(lista, destino, exceptoId = null) {
  if (!destino) return null;
  return lista.find((f) => f.destino === destino && f.id !== exceptoId) ?? null;
}

/** El enlace de Google Forms del formulario de consultas, o null si no hay uno vigente y válido (lo usa /consultas). */
export function enlaceDeConsultas(lista) {
  const f = lista.find((x) => x.destino === 'consultas');
  return f ? enlaceFormulario(f.enlace) : null;
}

/** Una copia ordenada por `orden`; a igual orden, por título, así el resultado no depende de cómo llegó la lista. */
export function ordenarFormularios(lista) {
  return [...lista].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.titulo ?? '').localeCompare(String(b.titulo ?? ''), 'es'));
}

/**
 * Sube o baja un formulario un lugar y deja los órdenes en 1..n sin huecos ni
 * repetidos (también arregla una lista que ya venía rota). Devuelve la lista
 * nueva y sólo los { id, orden } que cambiaron: es lo único que hay que
 * guardar en la base.
 *
 * Primero sube y último baja no cambian nada; un id que no existe tampoco.
 */
export function moverFormulario(lista, id, direccion) {
  const antes = ordenarFormularios(lista);
  const nueva = [...antes];
  const i = nueva.findIndex((f) => f.id === id);
  const j = direccion === 'subir' ? i - 1 : i + 1;
  if (i !== -1 && j >= 0 && j < nueva.length) [nueva[i], nueva[j]] = [nueva[j], nueva[i]];

  const resultado = nueva.map((f, k) => ({ ...f, orden: k + 1 }));
  const ordenNuevo = new Map(resultado.map((f) => [f.id, f.orden]));
  const cambios = antes.filter((f) => f.orden !== ordenNuevo.get(f.id)).map((f) => ({ id: f.id, orden: ordenNuevo.get(f.id) }));
  return { lista: resultado, cambios };
}

/** Fila de formulario_portal → objeto de dominio, para el panel de coordinación. */
export function formularioDesdeFila(f) {
  return {
    id: f.id,
    titulo: f.titulo,
    texto: f.texto,
    enlace: f.enlace,
    orden: f.orden,
    activo: f.activo,
    destino: f.destino ?? null,
    actualizadoPor: f.actualizado_por,
    actualizadoEn: f.actualizado_en,
  };
}

/** Lo único que devuelve formularios_publicos(): lo que ve cualquiera. */
export function formularioPublicoDesdeFila(f) {
  return { titulo: f.titulo, texto: f.texto, enlace: f.enlace, destino: f.destino ?? null };
}

/**
 * Qué mostrar en el portal: lo que devuelve la base, o el respaldo de
 * src/data/portal.js si la base no responde. Una lista VACÍA es vacía, no
 * respaldo: la coordinación pudo ocultarlos todos a propósito (por ejemplo,
 * cuando cierra la inscripción) y mostrarle a la familia uno que ya cerró
 * sería peor que decir que no hay ninguno.
 *
 * `leer` es la función que consulta la base (la inyecta la pantalla, así esto
 * se prueba sin red).
 *
 * @returns {Promise<{estado: 'base'|'vacio'|'respaldo', formularios: object[]}>}
 */
export async function resolverFormularios(leer, respaldo) {
  try {
    const formularios = await leer();
    return { estado: formularios.length ? 'base' : 'vacio', formularios };
  } catch {
    return { estado: 'respaldo', formularios: respaldo };
  }
}

/**
 * A dónde lleva /consultas, la dirección fija del QR impreso: al formulario de
 * consultas vigente. Nunca inventa un destino: sin formulario (o con un enlace
 * que no es de Google Forms) dice 'sin-formulario', y si la base falla, 'error'.
 * `leer` consulta la base (la inyecta la página, así esto se prueba sin red).
 *
 * @returns {Promise<{estado: 'redirigir', url: string} | {estado: 'sin-formulario'} | {estado: 'error'}>}
 */
export async function resolverConsultas(leer) {
  try {
    const url = enlaceDeConsultas(await leer());
    return url ? { estado: 'redirigir', url } : { estado: 'sin-formulario' };
  } catch {
    return { estado: 'error' };
  }
}
