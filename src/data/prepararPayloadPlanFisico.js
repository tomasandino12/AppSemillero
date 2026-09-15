// Mismo criterio de normalización que usa el parser para buscar en la
// biblioteca, y de la misma fuente: si cambia, cambia en los dos lados a la vez.
import { clavearNombre } from '../parser/parserCabb.js';

/**
 * Puro: sin red, sin cliente de base, sin generar ids. Toma lo que devolvió
 * parsearPlanFisico, la biblioteca de fuerza del club y las decisiones del
 * profe, y arma el payload exacto que espera importar_plan_fisico
 * (0021_rpc_importar_plan_fisico.sql).
 *
 * Dos pasos, en este orden:
 * 1. La biblioteca del ARCHIVO (la hoja "Ejercicios") se reconcilia contra la
 *    del club por nombre normalizado. Lo que ya está se reusa; lo que no, se
 *    crea. Sin esto, el profe tendría que dar de alta a mano ejercicios que el
 *    archivo ya traía con nombre y link.
 * 2. Cada ejercicio de sesión se resuelve solo si su nombre normalizado
 *    coincide exacto en la hoja del archivo o en la biblioteca del club (ver
 *    resolucionAutomatica). El resto, con las decisiones, que son por nombre
 *    normalizado y no por ocurrencia: resolver "Press Plano" una vez resuelve
 *    sus 6 apariciones.
 *
 * `decisiones.porClave[nombreClave]` es
 *   { tipo: 'existente', ejercicioId } | { tipo: 'nueva', nombre, bloque, link }
 * y su ausencia significa pendiente, que es un estado válido.
 *
 * La única coincidencia automática es exacta sobre el nombre normalizado: acá
 * no hay parecidos ni sugerencias. Lo que no coincide lo decide el profe.
 *
 * Nunca lanza: devuelve `{ error, payload, resumen }` con `error` en null si
 * salió bien, y `payload` en null si no.
 */
export function prepararPayloadPlanFisico(resultadoParser, bibliotecaDelClub, decisiones, contexto) {
  try {
    return armar(resultadoParser, bibliotecaDelClub, decisiones, contexto);
  } catch (e) {
    return fallar(`[ERROR_INTERNO] ${e?.message ?? e}`);
  }
}

const fallar = (mensaje) => ({ error: mensaje, payload: null, resumen: null });

const texto = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);

const CAMPOS_DE_CONTEXTO = ['clubId', 'plantelId', 'hashArchivo'];

function armar(resultadoParser, bibliotecaDelClub, decisiones, contexto) {
  if (!resultadoParser || typeof resultadoParser !== 'object') {
    return fallar('no hay nada para importar: el parser no devolvió un resultado');
  }

  const errores = Array.isArray(resultadoParser.errores) ? resultadoParser.errores : [];
  if (errores.length > 0) {
    return fallar(
      `el archivo tiene ${errores.length} error(es) y no se puede importar: `
      + errores.map((e) => e?.mensaje ?? String(e)).join(' / '));
  }

  const ctx = contexto && typeof contexto === 'object' ? contexto : {};
  const faltan = CAMPOS_DE_CONTEXTO.filter((c) => texto(ctx[c]) === null);
  if (faltan.length > 0) return fallar(`falta ${faltan.join(', ')} para armar el import`);

  const sesiones = resultadoParser.sesiones;
  if (!Array.isArray(sesiones) || sesiones.length === 0) {
    return fallar('el plan no trae ninguna sesión: un import vacío es un bug, no un estado');
  }
  const sinFecha = sesiones.filter((s) => texto(s?.fecha) === null).length;
  if (sinFecha > 0) {
    return fallar(
      `${sinFecha} sesión(es) sin fecha: el archivo tiene que decir el año, no se supone`);
  }
  if (sesiones.some((s) => !Array.isArray(s.ejercicios))) {
    return fallar('hay sesiones sin lista de ejercicios: el resultado del parser está incompleto');
  }

  if (!Array.isArray(bibliotecaDelClub)) {
    return fallar('falta la biblioteca de fuerza del club para reconciliar la del archivo');
  }
  // Paso 1: la biblioteca del archivo contra la del club.
  const { idPorClave, idsDelClub, nuevosPorClave } = indexarBibliotecas(resultadoParser, bibliotecaDelClub);

  const porClave = decisiones?.porClave ?? {};
  if (typeof porClave !== 'object' || porClave === null || Array.isArray(porClave)) {
    return fallar('las decisiones tienen que venir en decisiones.porClave, por nombre normalizado');
  }

  // Paso 2: lo que no se resolvió solo va por las decisiones, una vez por
  // nombre y no por aparición.
  const resueltasPorDecision = new Map();
  for (const s of sesiones) {
    for (const e of s.ejercicios) {
      if (resolucionAutomatica(e, idPorClave, nuevosPorClave) !== null) continue;
      const clave = claveDe(e);
      if (clave === null || resueltasPorDecision.has(clave)) continue;
      const decision = porClave[clave];
      if (decision === undefined || decision === null) continue;   // pendiente: es válido

      if (decision.tipo === 'existente') {
        const id = texto(decision.ejercicioId);
        if (id === null || !idsDelClub.has(id)) {
          return fallar(`la decisión para "${clave}" apunta a un ejercicio que no está en la biblioteca del club (${decision.ejercicioId})`);
        }
        resueltasPorDecision.set(clave, { ejercicioFuerzaId: id, claveNueva: null });
        continue;
      }

      if (decision.tipo === 'nueva') {
        const nombre = texto(decision.nombre);
        if (nombre === null) return fallar(`el alta nueva para "${clave}" no tiene nombre`);
        const claveNueva = clavearNombre(nombre);
        if (idPorClave.has(claveNueva)) {
          return fallar(`"${nombre}" ya está en la biblioteca del club: hay que elegir la existente, no crear un duplicado`);
        }
        if (!nuevosPorClave.has(claveNueva)) {
          nuevosPorClave.set(claveNueva, {
            clave: claveNueva,
            nombre,
            bloque: decision.bloque ?? null,
            link: decision.link ?? null,
          });
        }
        resueltasPorDecision.set(clave, { ejercicioFuerzaId: null, claveNueva });
        continue;
      }

      return fallar(`la decisión para "${clave}" no es "existente" ni "nueva"`);
    }
  }

  let pendientes = 0;
  let ejercicios = 0;
  const sesionesPayload = sesiones.map((s) => ({
    fecha: s.fecha,
    ejercicios: s.ejercicios.map((e) => {
      const automatica = resolucionAutomatica(e, idPorClave, nuevosPorClave);
      const clave = claveDe(e);
      const resuelto = automatica
        ?? (clave === null ? null : resueltasPorDecision.get(clave))
        ?? { ejercicioFuerzaId: null, claveNueva: null };
      ejercicios += 1;
      if (resuelto.ejercicioFuerzaId === null && resuelto.claveNueva === null) pendientes += 1;
      // escalonKg no está acá a propósito: el manejo de peso es por jugador y
      // esta etapa no lo toca (la RPC tampoco lo escribiría).
      return {
        orden: e?.orden ?? null,
        bloque: e?.bloque ?? null,
        nombreOriginal: e?.nombreOriginal ?? null,
        series: e?.series ?? null,
        reps: e?.reps ?? null,
        cargaSugerida: e?.cargaSugerida ?? null,
        pausa: e?.pausa ?? null,
        notas: e?.notas ?? null,
        ejercicioFuerzaId: resuelto.ejercicioFuerzaId,
        claveNueva: resuelto.claveNueva,
      };
    }),
  }));

  const ejerciciosNuevos = [...nuevosPorClave.values()];

  return {
    error: null,
    payload: {
      clubId: ctx.clubId,
      plantelId: ctx.plantelId,
      nombreArchivo: texto(ctx.nombreArchivo),
      hashArchivo: ctx.hashArchivo,
      advertencias: Array.isArray(resultadoParser.advertencias) ? resultadoParser.advertencias : [],
      ejerciciosNuevos,
      sesiones: sesionesPayload,
    },
    resumen: {
      sesiones: sesionesPayload.length,
      ejercicios,
      pendientes,
      ejerciciosNuevos: ejerciciosNuevos.length,
    },
  };
}

/* ---------- lo que la pantalla le muestra al profe ---------- */

/**
 * Los nombres que quedan para el profe: los que no se resolvieron solos ni
 * contra la hoja del archivo ni contra la biblioteca del club. No sale de
 * `sinMatchear` del parser, que sólo sabe del archivo y listaría nombres que
 * el club ya tiene.
 *
 * Uno por nombre normalizado, en el orden en que aparece por primera vez en el
 * archivo: [{ nombreClave, nombresOriginales, apariciones }]. Nunca lanza; con
 * una entrada inválida devuelve [].
 */
export function nombresPorResolver(resultadoParser, bibliotecaDelClub) {
  try {
    const sesiones = Array.isArray(resultadoParser?.sesiones) ? resultadoParser.sesiones : [];
    const { idPorClave, nuevosPorClave } = indexarBibliotecas(resultadoParser, bibliotecaDelClub);
    const porClave = new Map();
    for (const s of sesiones) {
      for (const e of Array.isArray(s?.ejercicios) ? s.ejercicios : []) {
        if (resolucionAutomatica(e, idPorClave, nuevosPorClave) !== null) continue;
        const clave = claveDe(e);
        if (clave === null) continue;
        if (!porClave.has(clave)) porClave.set(clave, { nombreClave: clave, nombresOriginales: [], apariciones: 0 });
        const n = porClave.get(clave);
        n.apariciones += 1;
        const original = typeof e.nombreOriginal === 'string' ? e.nombreOriginal.trim() : '';
        if (original && !n.nombresOriginales.includes(original)) n.nombresOriginales.push(original);
      }
    }
    return [...porClave.values()];
  } catch {
    return [];
  }
}

/**
 * Lo que el buscador ofrece para resolver un nombre: la biblioteca del club
 * (con id), las altas que trae la hoja del archivo y las que ya decidió el
 * profe (sin id todavía: entran recién con el import). Una entrada por clave,
 * y si está en el club gana esa. Orden alfabético.
 *
 * El filtro por texto lo hace la pantalla sobre esta lista, a pedido del profe:
 * acá no se sugiere ni se ordena por parecido.
 */
export function bibliotecaParaElegir(resultadoParser, bibliotecaDelClub, decisiones) {
  try {
    const porClave = new Map();
    for (const f of Array.isArray(bibliotecaDelClub) ? bibliotecaDelClub : []) {
      const clave = texto(f?.clave);
      const id = texto(f?.id);
      if (clave === null || id === null || porClave.has(clave)) continue;
      porClave.set(clave, { id, clave, nombre: f.nombre ?? clave, bloque: f.bloque ?? null, link: f.link ?? null });
    }
    const { nuevosPorClave } = indexarBibliotecas(resultadoParser, bibliotecaDelClub);
    for (const n of nuevosPorClave.values()) {
      if (!porClave.has(n.clave)) porClave.set(n.clave, { id: null, ...n, nombre: n.nombre ?? n.clave });
    }
    const elegidas = decisiones?.porClave && typeof decisiones.porClave === 'object' ? Object.values(decisiones.porClave) : [];
    for (const d of elegidas) {
      const nombre = d?.tipo === 'nueva' ? texto(d.nombre) : null;
      if (nombre === null) continue;
      const clave = clavearNombre(nombre);
      if (!porClave.has(clave)) porClave.set(clave, { id: null, clave, nombre, bloque: d.bloque ?? null, link: d.link ?? null });
    }
    return [...porClave.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  } catch {
    return [];
  }
}

/**
 * La decisión que corresponde a una opción de bibliotecaParaElegir. Una opción
 * sin id es un alta que todavía no está en la base: se expresa como "nueva"
 * con sus mismos datos, y prepararPayloadPlanFisico la reusa por clave en vez
 * de darla de alta dos veces.
 */
export function decisionDesdeOpcion(opcion) {
  if (opcion?.id) return { tipo: 'existente', ejercicioId: opcion.id };
  return { tipo: 'nueva', nombre: opcion?.nombre ?? null, bloque: opcion?.bloque ?? null, link: opcion?.link ?? null };
}

/* ---------- compartido ---------- */

// La biblioteca del club indexada por clave, y las altas que salen de la hoja
// del archivo. Lo que ya está en el club se reusa; lo que no, va como alta. Una
// clave repetida en la hoja es una sola entrada: dos filas con el mismo nombre
// normalizado son el mismo ejercicio, y la RPC rechazaría el duplicado
// (EJERCICIO_DUPLICADO).
function indexarBibliotecas(resultadoParser, bibliotecaDelClub) {
  const idPorClave = new Map();
  const idsDelClub = new Set();
  for (const f of Array.isArray(bibliotecaDelClub) ? bibliotecaDelClub : []) {
    const clave = texto(f?.clave);
    const id = texto(f?.id);
    if (clave === null || id === null) continue;
    idsDelClub.add(id);
    if (!idPorClave.has(clave)) idPorClave.set(clave, id);
  }
  const nuevosPorClave = new Map();
  for (const entrada of Array.isArray(resultadoParser?.biblioteca) ? resultadoParser.biblioteca : []) {
    const clave = texto(entrada?.clave);
    if (clave === null || idPorClave.has(clave) || nuevosPorClave.has(clave)) continue;
    nuevosPorClave.set(clave, {
      clave,
      nombre: entrada.nombre ?? null,
      bloque: entrada.bloque ?? null,
      link: entrada.link ?? null,
    });
  }
  return { idPorClave, idsDelClub, nuevosPorClave };
}

// El nombre normalizado con el que el ejercicio se busca en la biblioteca. El
// parser ya lo trae; si no, se calcula con el mismo criterio.
function claveDe(ejercicio) {
  return texto(ejercicio?.nombreClave) ?? texto(clavearNombre(ejercicio?.nombreOriginal ?? ''));
}

// Lo que se resuelve sin preguntarle a nadie, con un único criterio aplicado
// parejo a las dos fuentes: coincidencia exacta sobre el nombre normalizado.
//
// 1. Contra la hoja "Ejercicios" del archivo: es lo que ya resolvió el parser
//    (`referencia`), llevado a su id o a su alta nueva.
// 2. Contra la biblioteca del club: un nombre que la hoja del archivo no trae
//    puede estar igual en el club, cargado por un import anterior o a mano.
//    Que falte en una fuente no lo vuelve dudoso en la otra; exigirle al profe
//    que confirme a mano una coincidencia exacta sería tratar peor a la base
//    que al archivo.
//
// Lo que no coincide exacto en ninguna de las dos no se aproxima: lo decide el
// profe. En el club no hay ambigüedad posible, porque la clave es única por
// club (0020).
function resolucionAutomatica(ejercicio, idPorClave, nuevosPorClave) {
  const claveDeArchivo = texto(ejercicio?.referencia?.clave);
  if (claveDeArchivo !== null) {
    const id = idPorClave.get(claveDeArchivo);
    if (id !== undefined) return { ejercicioFuerzaId: id, claveNueva: null };
    if (nuevosPorClave.has(claveDeArchivo)) return { ejercicioFuerzaId: null, claveNueva: claveDeArchivo };
  }
  const clave = claveDe(ejercicio);
  const idEnElClub = clave === null ? undefined : idPorClave.get(clave);
  if (idEnElClub !== undefined) return { ejercicioFuerzaId: idEnElClub, claveNueva: null };
  return null;
}
