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
 * 2. Los que el parser no pudo referenciar se resuelven con las decisiones,
 *    que son por nombre normalizado y no por ocurrencia: resolver "Press
 *    Plano" una vez resuelve sus 6 apariciones.
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
  const idPorClave = new Map();
  const idsDelClub = new Set();
  for (const f of bibliotecaDelClub) {
    const clave = texto(f?.clave);
    const id = texto(f?.id);
    if (clave === null || id === null) continue;
    idsDelClub.add(id);
    if (!idPorClave.has(clave)) idPorClave.set(clave, id);
  }

  // Paso 1: la biblioteca del archivo. Lo que ya está en el club se reusa; lo
  // que no, va como alta. Una clave repetida en la hoja es una sola entrada:
  // dos filas con el mismo nombre normalizado son el mismo ejercicio, y la RPC
  // rechazaría el duplicado (EJERCICIO_DUPLICADO).
  const nuevosPorClave = new Map();
  for (const entrada of Array.isArray(resultadoParser.biblioteca) ? resultadoParser.biblioteca : []) {
    const clave = texto(entrada?.clave);
    if (clave === null || idPorClave.has(clave) || nuevosPorClave.has(clave)) continue;
    nuevosPorClave.set(clave, {
      clave,
      nombre: entrada.nombre ?? null,
      bloque: entrada.bloque ?? null,
      link: entrada.link ?? null,
    });
  }

  const porClave = decisiones?.porClave ?? {};
  if (typeof porClave !== 'object' || porClave === null || Array.isArray(porClave)) {
    return fallar('las decisiones tienen que venir en decisiones.porClave, por nombre normalizado');
  }

  // Paso 2: las decisiones, una vez por nombre y no por aparición.
  const resueltasPorDecision = new Map();
  for (const s of sesiones) {
    for (const e of s.ejercicios) {
      if (referenciaDeArchivo(e, idPorClave, nuevosPorClave) !== null) continue;
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
      const deArchivo = referenciaDeArchivo(e, idPorClave, nuevosPorClave);
      const clave = claveDe(e);
      const resuelto = deArchivo
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

// El nombre normalizado con el que el ejercicio se busca en la biblioteca. El
// parser ya lo trae; si no, se calcula con el mismo criterio.
function claveDe(ejercicio) {
  return texto(ejercicio?.nombreClave) ?? texto(clavearNombre(ejercicio?.nombreOriginal ?? ''));
}

// Lo que el parser ya resolvió contra la hoja "Ejercicios" del archivo. Si el
// parser dejó la referencia en null —no coincidía, o el nombre estaba repetido
// en la hoja y era ambiguo— acá tampoco se adivina: lo decide el profe.
function referenciaDeArchivo(ejercicio, idPorClave, nuevosPorClave) {
  const clave = texto(ejercicio?.referencia?.clave);
  if (clave === null) return null;
  const id = idPorClave.get(clave);
  if (id !== undefined) return { ejercicioFuerzaId: id, claveNueva: null };
  if (nuevosPorClave.has(clave)) return { ejercicioFuerzaId: null, claveNueva: clave };
  return null;
}
