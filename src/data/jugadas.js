/*
 * Modelo de una jugada (pizarra táctica). Lógica pura, sin DOM ni red.
 *
 * La jugada es un JSON (`jugada.datos`). Sólo el paso 0 guarda posiciones: la
 * posición de cada ficha en el paso k se deriva de aplicar los pasos
 * anteriores, así que no puede quedar inconsistente con el recorrido.
 * La base sólo impone tamaño y largo de notas; el resto de las reglas se
 * validan acá.
 */

import { LIMITE } from './limites.js';

export const TIPOS_JUGADA = [
  { clave: 'ataque', etiqueta: 'Ataque' },
  { clave: 'presion', etiqueta: 'Presión' },
  { clave: 'defensa', etiqueta: 'Defensa' },
  { clave: 'lateral', etiqueta: 'Salida de lateral' },
  { clave: 'otro', etiqueta: 'Otro' },
];

export const TIPOS_ACCION = ['corte', 'dribbling', 'pase', 'cortina', 'tiro', 'handoff'];
// 'ajuste' no es una herramienta de la barra (no entra en TIPOS_ACCION): es el
// arrastre libre de "Seleccionar" en un paso >0, invisible en la cancha.
const TIPOS_ACCION_VALIDOS = [...TIPOS_ACCION, 'ajuste'];

/** El nombre para mostrar. Si el tipo no está en la lista devuelve el valor crudo. */
export function etiquetaDeTipo(tipo) {
  return TIPOS_JUGADA.find((t) => t.clave === tipo)?.etiqueta ?? String(tipo ?? '');
}

/** En Presión/Defensa "nosotros" somos el triángulo (defensa); en el resto, el círculo (ataque). */
export function nosotrosDefiende(tipoJugada) {
  return tipoJugada === 'presion' || tipoJugada === 'defensa';
}

const CANCHAS = ['media', 'entera'];
const TIPOS_FICHA = ['ataque', 'defensa', 'cono'];
// Acciones que desplazan a la ficha hasta `hasta`.
const DE_MOVIMIENTO = ['corte', 'dribbling', 'cortina', 'ajuste'];
// Acciones que sólo puede hacer quien tiene la pelota.
const CON_PELOTA = ['dribbling', 'pase', 'tiro', 'handoff'];
// Acciones que le entregan la pelota a otra ficha (`a`).
const DE_ENTREGA = ['pase', 'handoff'];

/** El tope de bytes es el mismo `check` de la base (tests/contratoJugada.test.js). */
export const TOPES = { fichas: 12, pasos: 30, accionesPorPaso: 10, bytes: 65536 };

const AMBITO_NUMERO = { min: 1, max: 5 };

export function jugadaVacia(cancha = 'media') {
  return { cancha, fichas: [], pelota: null, pasos: [] };
}

/** Editar necesita espacio: se mide el lado corto para que la tablet vertical también entre. */
export function pantallaAptaParaEditar(ancho, alto) {
  return Math.min(ancho, alto) >= 600;
}

export function duplicarDatos(datos) {
  return structuredClone(datos);
}

const esPunto = (p) => Boolean(p) && [p.x, p.y].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1);
const largoEnCaracteres = (texto) => [...texto].length;

/** Devuelve `{ ok, errores }`; nunca lanza, aunque `datos` sea cualquier cosa. */
export function validarJugada(datos) {
  const errores = [];
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    return { ok: false, errores: ['La jugada no tiene el formato esperado.'] };
  }

  if (!CANCHAS.includes(datos.cancha)) errores.push('La cancha tiene que ser media o entera.');

  const fichas = Array.isArray(datos.fichas) ? datos.fichas : null;
  const pasos = Array.isArray(datos.pasos) ? datos.pasos : null;
  if (!fichas) errores.push('Faltan las fichas.');
  if (!pasos) errores.push('Faltan los pasos.');
  if (!fichas || !pasos) return { ok: false, errores };

  if (fichas.length > TOPES.fichas) errores.push(`Máximo ${TOPES.fichas} fichas por jugada.`);
  if (pasos.length > TOPES.pasos) errores.push(`Máximo ${TOPES.pasos} pasos por jugada.`);

  const porId = new Map();
  const numerosAtaque = new Set();
  for (const f of fichas) {
    if (!f || typeof f.id !== 'string' || !f.id) { errores.push('Hay una ficha sin identificador.'); continue; }
    if (porId.has(f.id)) { errores.push(`La ficha ${f.id} está repetida.`); continue; }
    porId.set(f.id, f);
    if (!TIPOS_FICHA.includes(f.tipo)) errores.push(`La ficha ${f.id} tiene un tipo desconocido.`);
    if (!esPunto(f)) errores.push(`La ficha ${f.id} está fuera de la cancha.`);
    if (f.tipo === 'ataque' || (f.tipo === 'defensa' && f.numero != null)) {
      const n = f.numero;
      if (!Number.isInteger(n) || n < AMBITO_NUMERO.min || n > AMBITO_NUMERO.max) {
        errores.push(`El número de la ficha ${f.id} tiene que ser del ${AMBITO_NUMERO.min} al ${AMBITO_NUMERO.max}.`);
      } else if (f.tipo === 'ataque') {
        if (numerosAtaque.has(n)) errores.push(`Hay dos atacantes con el número ${n}.`);
        numerosAtaque.add(n);
      }
    }
  }

  let conPelota = null;
  if (datos.pelota != null) {
    const f = porId.get(datos.pelota);
    if (!f) errores.push('La pelota es de una ficha que no existe.');
    else if (f.tipo !== 'ataque') errores.push('Sólo un atacante puede tener la pelota.');
    else conPelota = f.id;
  }

  pasos.forEach((paso, i) => {
    const n = i + 1;
    const acciones = Array.isArray(paso?.acciones) ? paso.acciones : null;
    if (!acciones) { errores.push(`El paso ${n} no tiene acciones.`); return; }
    if (acciones.length > TOPES.accionesPorPaso) errores.push(`Máximo ${TOPES.accionesPorPaso} acciones por paso (paso ${n}).`);

    const nota = paso.nota ?? '';
    if (typeof nota !== 'string') errores.push(`La nota del paso ${n} tiene que ser texto.`);
    else if (largoEnCaracteres(nota) > LIMITE.notaPaso) errores.push(`La nota del paso ${n} supera los ${LIMITE.notaPaso} caracteres.`);

    const seMovieron = new Set();
    let conPelotaDespues = conPelota;
    let usoPelota = false;
    for (const a of acciones) {
      if (!a || !TIPOS_ACCION_VALIDOS.includes(a.tipo)) { errores.push(`Hay una acción desconocida en el paso ${n}.`); continue; }
      const ficha = porId.get(a.ficha);
      if (!ficha) { errores.push(`Una acción del paso ${n} es de una ficha que no existe.`); continue; }

      if (DE_MOVIMIENTO.includes(a.tipo)) {
        if (!esPunto(a.hasta)) errores.push(`El destino de ${a.tipo} en el paso ${n} está fuera de la cancha.`);
        if (seMovieron.has(a.ficha)) errores.push(`La ficha ${a.ficha} se mueve dos veces en el paso ${n}.`);
        seMovieron.add(a.ficha);
      }
      if (a.control != null && !esPunto(a.control)) errores.push(`El punto de control de ${a.tipo} en el paso ${n} está fuera de la cancha.`);

      if (CON_PELOTA.includes(a.tipo)) {
        if (a.ficha !== conPelota) errores.push(`En el paso ${n}, ${a.tipo} lo hace ${a.ficha}, que no tiene la pelota.`);
        // Todo pasa a la vez: dos acciones con la pelota en un paso no tienen sentido.
        else if (usoPelota) errores.push(`En el paso ${n} la pelota se usa dos veces.`);
        usoPelota = true;
      }
      if (DE_ENTREGA.includes(a.tipo)) {
        const receptor = porId.get(a.a);
        if (a.a === a.ficha) errores.push(`En el paso ${n}, ${a.ficha} se ${a.tipo === 'pase' ? 'pasa' : 'entrega'} la pelota a sí mismo.`);
        else if (!receptor) errores.push(`El receptor de ${a.tipo} en el paso ${n} no existe.`);
        else if (receptor.tipo !== 'ataque') errores.push(`En el paso ${n}, sólo un atacante puede recibir la pelota.`);
        else conPelotaDespues = receptor.id;
      }
      if (a.tipo === 'tiro') conPelotaDespues = null;
    }
    conPelota = conPelotaDespues;
  });

  if (new TextEncoder().encode(JSON.stringify(datos)).length > TOPES.bytes) {
    errores.push('La jugada es demasiado grande.');
  }

  return { ok: errores.length === 0, errores };
}

/**
 * Posiciones y dueño de la pelota justo antes de que empiece el paso k
 * (k = cantidad de pasos da el estado final).
 */
export function estadoAlInicioDelPaso(datos, k) {
  const posiciones = new Map(datos.fichas.map((f) => [f.id, { x: f.x, y: f.y }]));
  let pelota = datos.pelota ?? null;
  for (const paso of datos.pasos.slice(0, k)) {
    for (const a of paso.acciones) {
      if (DE_MOVIMIENTO.includes(a.tipo)) posiciones.set(a.ficha, { x: a.hasta.x, y: a.hasta.y });
      else if (DE_ENTREGA.includes(a.tipo)) pelota = a.a;
      else if (a.tipo === 'tiro') pelota = null;
    }
  }
  return { posiciones, pelota };
}

/** Suma la acción al paso k sin tocar `datos`; si el resultado no valida, lanza con el motivo. */
export function aplicarAccion(datos, k, accion) {
  if (!Number.isInteger(k) || k < 0 || k >= datos.pasos.length) throw new Error('Ese paso no existe.');
  const nuevos = duplicarDatos(datos);
  nuevos.pasos[k].acciones.push(structuredClone(accion));
  const { ok, errores } = validarJugada(nuevos);
  if (!ok) throw new Error(errores[0]);
  return nuevos;
}

function conValidacion(nuevos) {
  const { ok, errores } = validarJugada(nuevos);
  if (!ok) throw new Error(errores[0]);
  return nuevos;
}

/** El número libre más bajo (1 a 5) entre las fichas de ese tipo; null si los cinco están usados. */
export function proximoNumeroLibre(datos, tipo) {
  const usados = new Set(datos.fichas.filter((f) => f.tipo === tipo && f.numero != null).map((f) => f.numero));
  for (let n = AMBITO_NUMERO.min; n <= AMBITO_NUMERO.max; n++) if (!usados.has(n)) return n;
  return null;
}

/** Agrega una ficha nueva (con su id ya generado por quien llama); lanza si no valida (tope de 12, por ejemplo). */
export function agregarFicha(datos, ficha) {
  const nuevos = duplicarDatos(datos);
  nuevos.fichas.push(structuredClone(ficha));
  return conValidacion(nuevos);
}

/** Saca una ficha y, con ella, toda acción de cualquier paso que la nombre: si no, quedarían apuntando a nada. */
export function quitarFicha(datos, fichaId) {
  const nuevos = duplicarDatos(datos);
  nuevos.fichas = nuevos.fichas.filter((f) => f.id !== fichaId);
  nuevos.pasos = nuevos.pasos.map((p) => ({ ...p, acciones: p.acciones.filter((a) => a.ficha !== fichaId && a.a !== fichaId) }));
  if (nuevos.pelota === fichaId) nuevos.pelota = null;
  return conValidacion(nuevos);
}

/** Sólo tiene sentido en el paso 0: es el único que guarda posiciones. */
export function moverFicha(datos, fichaId, x, y) {
  const nuevos = duplicarDatos(datos);
  const ficha = nuevos.fichas.find((f) => f.id === fichaId);
  if (!ficha) throw new Error('Esa ficha no existe.');
  ficha.x = x;
  ficha.y = y;
  return conValidacion(nuevos);
}

/**
 * Arrastre libre de una ficha en cualquier paso: decide dónde termina el
 * paso para esa ficha. En el paso 0 delega en moverFicha (ahí se guarda la
 * posición base). En un paso >0: si la ficha ya tiene una acción que la
 * mueve (corte/dribbling/cortina, o un `ajuste` anterior — DE_MOVIMIENTO las
 * incluye a las cuatro), le cambia el destino y conserva todo lo demás (el
 * `control` de la curva, por ejemplo); si no tenía ninguna, crea un `ajuste`
 * invisible. Así nunca tira "se mueve dos veces": es la MISMA acción la que
 * se corrige, no una nueva que compita con la que ya había.
 */
export function ajustarFicha(datos, k, fichaId, x, y) {
  if (k === 0) return moverFicha(datos, fichaId, x, y);
  if (!Number.isInteger(k) || k < 0 || k >= datos.pasos.length) throw new Error('Ese paso no existe.');
  const nuevos = duplicarDatos(datos);
  const acciones = nuevos.pasos[k].acciones;
  const existente = acciones.find((a) => a.ficha === fichaId && DE_MOVIMIENTO.includes(a.tipo));
  if (existente) existente.hasta = { x, y };
  else acciones.push({ tipo: 'ajuste', ficha: fichaId, hasta: { x, y } });
  return conValidacion(nuevos);
}

export function quitarAccion(datos, k, indice) {
  if (!Number.isInteger(k) || k < 0 || k >= datos.pasos.length) throw new Error('Ese paso no existe.');
  const nuevos = duplicarDatos(datos);
  nuevos.pasos[k].acciones.splice(indice, 1);
  return conValidacion(nuevos);
}

/** El punto de control de una acción ya cargada: la curva del trazo. null la vuelve recta. */
export function fijarControlDeAccion(datos, k, indice, control) {
  if (!Number.isInteger(k) || k < 0 || k >= datos.pasos.length) throw new Error('Ese paso no existe.');
  const nuevos = duplicarDatos(datos);
  const accion = nuevos.pasos[k].acciones[indice];
  if (!accion) throw new Error('Esa acción no existe.');
  accion.control = control;
  return conValidacion(nuevos);
}

export function agregarPaso(datos) {
  const nuevos = duplicarDatos(datos);
  nuevos.pasos.push({ acciones: [], nota: '' });
  return conValidacion(nuevos);
}

export function quitarPaso(datos, k) {
  if (!Number.isInteger(k) || k < 0 || k >= datos.pasos.length) throw new Error('Ese paso no existe.');
  const nuevos = duplicarDatos(datos);
  nuevos.pasos.splice(k, 1);
  return conValidacion(nuevos);
}

export function fijarNotaDePaso(datos, k, nota) {
  if (!Number.isInteger(k) || k < 0 || k >= datos.pasos.length) throw new Error('Ese paso no existe.');
  const nuevos = duplicarDatos(datos);
  nuevos.pasos[k].nota = nota;
  return conValidacion(nuevos);
}

const LARGO_TITULO_PASO = 40;

/** El número (1-based) y el título de un paso para la lista del panel: la primera línea de su nota, recortada. */
export function resumenDePaso(paso, indice) {
  const numero = indice + 1;
  const primeraLinea = (paso?.nota ?? '').split('\n')[0].trim();
  if (!primeraLinea) return { numero, titulo: indice === 0 ? 'Formación inicial' : 'Sin indicaciones' };
  const titulo = primeraLinea.length > LARGO_TITULO_PASO ? `${primeraLinea.slice(0, LARGO_TITULO_PASO)}…` : primeraLinea;
  return { numero, titulo };
}

/** Qué planteles hay que sumar y sacar para que `actuales` termine igual a `deseados`. */
export function diferenciaDeAsignacion(actuales, deseados) {
  const actualesSet = new Set(actuales);
  const deseadosSet = new Set(deseados);
  return {
    altas: deseados.filter((id) => !actualesSet.has(id)),
    bajas: actuales.filter((id) => !deseadosSet.has(id)),
  };
}
