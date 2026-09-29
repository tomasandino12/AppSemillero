/*
 * Pizarra de un ejercicio (modo `ejercicio` del mismo pizarrón de jugadas).
 * Lógica pura, sin DOM ni red.
 *
 * Una jugada es UNA secuencia con cinco numerados y una pelota. Un ejercicio
 * es una repetición cíclica: hay filas en vez de jugadores fijos, puede haber
 * varias pelotas y termina con una rotación que arma la repetición siguiente.
 * El JSON es el de la jugada (`cancha`, `fichas`, `pasos`) más `modo`,
 * `pelotas` (el dueño inicial de cada pelota, en vez del `pelota` único) y
 * `rotacion`.
 *
 * jugadas.js despacha acá `validarJugada` y `estadoAlInicioDelPaso` cuando
 * `modo === 'ejercicio'`; el resto de sus funciones (mover, ajustar, pasos,
 * notas) sirven para los dos porque terminan validando con `validarJugada`.
 * Por eso este módulo NO importa jugadas.js (sería un ciclo).
 */

import { LIMITE } from './limites.js';
import { limitesDe } from './geometriaCancha.js';

export const TOPES_EJERCICIO = {
  fichas: 16, pelotas: 6, pasos: 30, accionesPorPaso: 16, rotacion: 16, bytes: 65536,
};
export const FILA = { min: 2, max: 9 };

/** Las acciones de la barra del modo ejercicio: las de la jugada más el rebote. */
export const TIPOS_ACCION_EJERCICIO = ['corte', 'dribbling', 'pase', 'cortina', 'tiro', 'handoff', 'rebote'];
const TIPOS_ACCION_VALIDOS = [...TIPOS_ACCION_EJERCICIO, 'ajuste'];

const CANCHAS = ['media', 'entera'];
const TIPOS_FICHA = ['ataque', 'defensa', 'cono', 'fila', 'entrenador'];
// Quién puede tener una pelota. En una fila, "el primero" es el que la tiene.
const PUEDEN_TENER_PELOTA = ['ataque', 'fila', 'entrenador'];
const DE_MOVIMIENTO = ['corte', 'dribbling', 'cortina', 'ajuste'];
// Las que sólo puede hacer quien tiene una pelota.
const CON_PELOTA = ['dribbling', 'pase', 'tiro', 'handoff'];
const DE_ENTREGA = ['pase', 'handoff'];
// El número de un atacante o defensor es una ayuda para nombrarlo en las indicaciones.
const AMBITO_NUMERO = { min: 1, max: 5 };

export const esEjercicio = (datos) => datos?.modo === 'ejercicio';

export function ejercicioVacio(cancha = 'media') {
  return {
    modo: 'ejercicio', cancha, fichas: [], pelotas: [], pasos: [], rotacion: [],
  };
}

const esNumero = (n) => typeof n === 'number' && Number.isFinite(n);
const enRango = (p, l) => Boolean(p) && esNumero(p.x) && esNumero(p.y)
  && p.x >= l.minX && p.x <= l.maxX && p.y >= l.minY && p.y <= l.maxY;
const largoEnCaracteres = (texto) => [...texto].length;

/**
 * Quién tiene cada pelota después de un paso. `duenos[i]` es la ficha que
 * tiene la pelota i, o null si está suelta (después de un tiro). Todo pasa a
 * la vez: quién la tenía se mira al empezar el paso, no acción por acción.
 * No valida; la usan `validarEjercicio` y `estadoAlInicioEjercicio`.
 */
function pelotasTrasElPaso(duenos, acciones) {
  const nuevos = [...duenos];
  const sueltas = duenos.flatMap((d, i) => (d === null ? [i] : []));
  let proximaSuelta = 0;
  for (const a of acciones) {
    if (DE_ENTREGA.includes(a.tipo)) {
      const i = duenos.indexOf(a.ficha);
      if (i >= 0) nuevos[i] = a.a;
    } else if (a.tipo === 'tiro') {
      const i = duenos.indexOf(a.ficha);
      if (i >= 0) nuevos[i] = null;
    } else if (a.tipo === 'rebote') {
      const i = sueltas[proximaSuelta];
      proximaSuelta += 1;
      if (i !== undefined) nuevos[i] = a.ficha;
    }
  }
  return nuevos;
}

/** Devuelve `{ ok, errores }`; nunca lanza, aunque `datos` sea cualquier cosa. */
export function validarEjercicio(datos) {
  const errores = [];
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    return { ok: false, errores: ['La pizarra no tiene el formato esperado.'] };
  }
  if (datos.modo !== 'ejercicio') errores.push('La pizarra no es de un ejercicio.');
  if (!CANCHAS.includes(datos.cancha)) errores.push('La cancha tiene que ser media o entera.');

  const fichas = Array.isArray(datos.fichas) ? datos.fichas : null;
  const pasos = Array.isArray(datos.pasos) ? datos.pasos : null;
  const pelotas = Array.isArray(datos.pelotas) ? datos.pelotas : null;
  const rotacion = datos.rotacion == null ? [] : datos.rotacion;
  if (!fichas) errores.push('Faltan las fichas.');
  if (!pasos) errores.push('Faltan los pasos.');
  if (!pelotas) errores.push('Faltan las pelotas.');
  if (!Array.isArray(rotacion)) errores.push('La rotación no tiene el formato esperado.');
  if (!fichas || !pasos || !pelotas || !Array.isArray(rotacion)) return { ok: false, errores };

  if (fichas.length > TOPES_EJERCICIO.fichas) errores.push(`Máximo ${TOPES_EJERCICIO.fichas} fichas por ejercicio.`);
  if (pasos.length > TOPES_EJERCICIO.pasos) errores.push(`Máximo ${TOPES_EJERCICIO.pasos} pasos por ejercicio.`);
  if (pelotas.length > TOPES_EJERCICIO.pelotas) errores.push(`Máximo ${TOPES_EJERCICIO.pelotas} pelotas por ejercicio.`);
  if (rotacion.length > TOPES_EJERCICIO.rotacion) errores.push(`Máximo ${TOPES_EJERCICIO.rotacion} movimientos de rotación.`);

  const esPunto = (p) => enRango(p, limitesDe(datos.cancha));
  const porId = new Map();
  const numerosAtaque = new Set();
  for (const f of fichas) {
    if (!f || typeof f.id !== 'string' || !f.id) { errores.push('Hay una ficha sin identificador.'); continue; }
    if (porId.has(f.id)) { errores.push(`La ficha ${f.id} está repetida.`); continue; }
    porId.set(f.id, f);
    if (!TIPOS_FICHA.includes(f.tipo)) errores.push(`La ficha ${f.id} tiene un tipo desconocido.`);
    if (!esPunto(f)) errores.push(`La ficha ${f.id} está fuera de la cancha.`);
    if ((f.tipo === 'ataque' || f.tipo === 'defensa') && f.numero != null) {
      const n = f.numero;
      if (!Number.isInteger(n) || n < AMBITO_NUMERO.min || n > AMBITO_NUMERO.max) {
        errores.push(`El número de la ficha ${f.id} tiene que ser del ${AMBITO_NUMERO.min} al ${AMBITO_NUMERO.max}.`);
      } else if (f.tipo === 'ataque') {
        if (numerosAtaque.has(n)) errores.push(`Hay dos atacantes con el número ${n}.`);
        numerosAtaque.add(n);
      }
    }
    if (f.tipo === 'fila' && (!Number.isInteger(f.cantidad) || f.cantidad < FILA.min || f.cantidad > FILA.max)) {
      errores.push(`Una fila tiene que ser de ${FILA.min} a ${FILA.max} chicos.`);
    }
  }

  const conPelotaInicial = new Set();
  let duenos = pelotas.map((id) => {
    const f = porId.get(id);
    if (!f) { errores.push('Una pelota es de una ficha que no existe.'); return null; }
    if (!PUEDEN_TENER_PELOTA.includes(f.tipo)) errores.push('Sólo un atacante, una fila o el entrenador pueden tener la pelota.');
    if (conPelotaInicial.has(id)) errores.push(`La ficha ${id} no puede arrancar con dos pelotas.`);
    conPelotaInicial.add(id);
    return id;
  });

  pasos.forEach((paso, i) => {
    const n = i + 1;
    const acciones = Array.isArray(paso?.acciones) ? paso.acciones : null;
    if (!acciones) { errores.push(`El paso ${n} no tiene acciones.`); return; }
    if (acciones.length > TOPES_EJERCICIO.accionesPorPaso) errores.push(`Máximo ${TOPES_EJERCICIO.accionesPorPaso} acciones por paso (paso ${n}).`);

    const nota = paso.nota ?? '';
    if (typeof nota !== 'string') errores.push(`La nota del paso ${n} tiene que ser texto.`);
    else if (largoEnCaracteres(nota) > LIMITE.notaPaso) errores.push(`La nota del paso ${n} supera los ${LIMITE.notaPaso} caracteres.`);

    const seMovieron = new Set();
    const conPelota = new Set(); // quién usó SU pelota en este paso
    const salen = new Set(); // quién se saca la pelota de encima (pase, entrega o tiro)
    const reciben = new Set();
    const sueltas = duenos.filter((d) => d === null).length;
    let rebotes = 0;
    const validas = [];
    for (const a of acciones) {
      if (!a || !TIPOS_ACCION_VALIDOS.includes(a.tipo)) { errores.push(`Hay una acción desconocida en el paso ${n}.`); continue; }
      const ficha = porId.get(a.ficha);
      if (!ficha) { errores.push(`Una acción del paso ${n} es de una ficha que no existe.`); continue; }
      validas.push(a);

      if (DE_MOVIMIENTO.includes(a.tipo)) {
        if (!esPunto(a.hasta)) errores.push(`El destino de ${a.tipo} en el paso ${n} está fuera de la cancha.`);
        if (seMovieron.has(a.ficha)) errores.push(`La ficha ${a.ficha} se mueve dos veces en el paso ${n}.`);
        seMovieron.add(a.ficha);
      }
      if (a.control != null && !esPunto(a.control)) errores.push(`El punto de control de ${a.tipo} en el paso ${n} está fuera de la cancha.`);

      if (CON_PELOTA.includes(a.tipo)) {
        if (!duenos.includes(a.ficha)) errores.push(`En el paso ${n}, ${a.tipo} lo hace ${a.ficha}, que no tiene una pelota.`);
        else if (conPelota.has(a.ficha)) errores.push(`En el paso ${n} la pelota de ${a.ficha} se usa dos veces.`);
        conPelota.add(a.ficha);
      }
      if (a.tipo === 'pase' || a.tipo === 'handoff' || a.tipo === 'tiro') salen.add(a.ficha);
      if (DE_ENTREGA.includes(a.tipo)) {
        const receptor = porId.get(a.a);
        if (a.a === a.ficha) errores.push(`En el paso ${n}, ${a.ficha} se ${a.tipo === 'pase' ? 'pasa' : 'entrega'} la pelota a sí mismo.`);
        else if (!receptor) errores.push(`El receptor de ${a.tipo} en el paso ${n} no existe.`);
        else if (!PUEDEN_TENER_PELOTA.includes(receptor.tipo)) errores.push(`En el paso ${n}, sólo un atacante, una fila o el entrenador pueden recibir la pelota.`);
        else if (reciben.has(receptor.id)) errores.push(`En el paso ${n}, ${receptor.id} recibe dos pelotas.`);
        else reciben.add(receptor.id);
      }
      if (a.tipo === 'rebote') {
        rebotes += 1;
        if (rebotes > sueltas) errores.push(`En el paso ${n} hay un rebote sin una pelota suelta: primero tiene que haber un tiro en un paso anterior.`);
        else if (!PUEDEN_TENER_PELOTA.includes(ficha.tipo)) errores.push(`En el paso ${n}, sólo un atacante, una fila o el entrenador pueden agarrar el rebote.`);
        else if (reciben.has(ficha.id)) errores.push(`En el paso ${n}, ${ficha.id} recibe dos pelotas.`);
        else reciben.add(ficha.id);
      }
    }
    // Quien recibe una pelota no puede quedarse con la que ya tenía; si la suelta en el mismo paso, sí (estrella de pases).
    for (const id of reciben) {
      if (duenos.includes(id) && !salen.has(id)) errores.push(`En el paso ${n}, ${id} recibe una pelota y ya tiene otra.`);
    }
    duenos = pelotasTrasElPaso(duenos, validas);
  });

  const yaRotan = new Set();
  rotacion.forEach((r, i) => {
    const n = i + 1;
    if (!r || !porId.has(r.ficha)) { errores.push(`El movimiento de rotación ${n} es de una ficha que no existe.`); return; }
    if (yaRotan.has(r.ficha)) errores.push(`La ficha ${r.ficha} rota dos veces.`);
    yaRotan.add(r.ficha);
    if (!esPunto(r.a)) errores.push(`El destino de la rotación ${n} está fuera de la cancha.`);
  });

  if (new TextEncoder().encode(JSON.stringify(datos)).length > TOPES_EJERCICIO.bytes) {
    errores.push('La pizarra es demasiado grande.');
  }
  return { ok: errores.length === 0, errores };
}

/**
 * Posiciones y dueño de cada pelota justo antes de que empiece el paso k
 * (k = cantidad de pasos da el estado final). `pelotas[i]` es la ficha que
 * tiene la pelota i, o null si está suelta.
 */
export function estadoAlInicioEjercicio(datos, k) {
  const posiciones = new Map(datos.fichas.map((f) => [f.id, { x: f.x, y: f.y }]));
  let pelotas = [...datos.pelotas];
  for (const paso of datos.pasos.slice(0, k)) {
    for (const a of paso.acciones) {
      if (DE_MOVIMIENTO.includes(a.tipo)) posiciones.set(a.ficha, { x: a.hasta.x, y: a.hasta.y });
    }
    pelotas = pelotasTrasElPaso(pelotas, paso.acciones);
  }
  return { posiciones, pelotas };
}

/* ---------- Mutaciones: como las de jugadas.js, devuelven datos nuevos o lanzan con el motivo ---------- */

const copia = (datos) => structuredClone(datos);

function conValidacion(nuevos) {
  const { ok, errores } = validarEjercicio(nuevos);
  if (!ok) throw new Error(errores[0]);
  return nuevos;
}

/** Suma una ficha (con su id ya generado por quien llama); lanza si no valida (el tope de fichas, por ejemplo). */
export function agregarFichaEjercicio(datos, ficha) {
  const nuevos = copia(datos);
  nuevos.fichas.push(structuredClone(ficha));
  return conValidacion(nuevos);
}

/** Saca una ficha y, con ella, toda acción, pelota y rotación que la nombre: si no, quedarían apuntando a nada. */
export function quitarFichaEjercicio(datos, fichaId) {
  const nuevos = copia(datos);
  nuevos.fichas = nuevos.fichas.filter((f) => f.id !== fichaId);
  nuevos.pelotas = nuevos.pelotas.filter((id) => id !== fichaId);
  nuevos.rotacion = (nuevos.rotacion ?? []).filter((r) => r.ficha !== fichaId);
  nuevos.pasos = nuevos.pasos.map((p) => ({ ...p, acciones: p.acciones.filter((a) => a.ficha !== fichaId && a.a !== fichaId) }));
  return conValidacion(nuevos);
}

/**
 * Le da una pelota a la ficha, o se la saca si ya la tenía (así también se
 * puede arrancar sin pelota). Hay una pelota por ficha; si un paso siguiente
 * depende de esa pelota, el cambio no valida y se avisa en vez de borrar esas
 * acciones por atrás.
 */
export function alternarPelota(datos, fichaId) {
  const nuevos = copia(datos);
  if (nuevos.pelotas.includes(fichaId)) {
    nuevos.pelotas = nuevos.pelotas.filter((id) => id !== fichaId);
  } else {
    if (!PUEDEN_TENER_PELOTA.includes(nuevos.fichas.find((f) => f.id === fichaId)?.tipo)) {
      throw new Error('Sólo un atacante, una fila o el entrenador pueden tener la pelota.');
    }
    nuevos.pelotas.push(fichaId);
  }
  return conValidacion(nuevos);
}

export function fijarCantidadDeFila(datos, fichaId, cantidad) {
  const nuevos = copia(datos);
  const ficha = nuevos.fichas.find((f) => f.id === fichaId);
  if (ficha?.tipo !== 'fila') throw new Error('Esa ficha no es una fila.');
  ficha.cantidad = cantidad;
  return conValidacion(nuevos);
}

/**
 * Qué hace cada ficha al terminar la repetición. Una ficha tiene un solo
 * destino: el nuevo reemplaza al anterior, en el mismo lugar de la lista para
 * que el índice del que se está arrastrando no cambie.
 */
export function fijarRotacion(datos, ficha, a) {
  const nuevos = copia(datos);
  nuevos.rotacion = nuevos.rotacion ?? [];
  const movimiento = { ficha, a: { x: a.x, y: a.y } };
  const i = nuevos.rotacion.findIndex((r) => r.ficha === ficha);
  if (i >= 0) nuevos.rotacion[i] = movimiento;
  else nuevos.rotacion.push(movimiento);
  return conValidacion(nuevos);
}

export function quitarRotacion(datos, indice) {
  const nuevos = copia(datos);
  if (!nuevos.rotacion?.[indice]) throw new Error('Esa rotación no existe.');
  nuevos.rotacion.splice(indice, 1);
  return conValidacion(nuevos);
}
